import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codestarconnections from 'aws-cdk-lib/aws-codestarconnections';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';

export interface PipelineConstructProps {
  readonly ecsServices: Map<string, ecs.FargateService>;
  readonly ecrRepositories: Map<string, ecr.IRepository>;
  readonly frontendBucket: s3.IBucket;
  readonly frontendDistribution: cloudfront.IDistribution;
}

export class PipelineConstruct extends Construct {
  public readonly artifactBucket: s3.Bucket;
  public readonly pipeline: codepipeline.Pipeline;

  constructor(scope: Construct, id: string, props: PipelineConstructProps) {
    super(scope, id);

    // S3 Bucket for Pipeline Artifacts
    this.artifactBucket = new s3.Bucket(this, 'PipelineArtifactBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Create GitHub Connection via AWS CodeStar Connections
    const connection = new codestarconnections.CfnConnection(this, 'GitHubConnection', {
      connectionName: 'GitHubConnection',
      providerType: 'GitHub',
    });

    const sourceOutput = new codepipeline.Artifact('SourceOutput');

    // CodePipeline definition
    this.pipeline = new codepipeline.Pipeline(this, 'ContainerizedMicroservicesPipeline', {
      pipelineName: 'microservices-pipeline',
      artifactBucket: this.artifactBucket,
      restartExecutionOnUpdate: true,
    });

    // Source Stage
    this.pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeStarConnectionsSourceAction({
          actionName: 'GitHubSource',
          owner: 'HazemElnagar',
          repo: 'Containerized-Microservices-with-ECS-Fargate-and-Service-Discovery',
          branch: 'main',
          connectionArn: connection.attrConnectionArn,
          output: sourceOutput,
        }),
      ],
    });

    const buildActions: codepipeline_actions.CodeBuildAction[] = [];
    const deployActions: codepipeline_actions.EcsDeployAction[] = [];

    props.ecsServices.forEach((ecsService, serviceName) => {
      const repository = props.ecrRepositories.get(serviceName);
      if (!repository) return;

      const buildProject = new codebuild.PipelineProject(this, `${serviceName}BuildProject`, {
        projectName: `${serviceName}-build`,
        environment: {
          buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
          privileged: true, // Required to build Docker images
        },
        environmentVariables: {
          ECR_REPOSITORY_URI: { value: repository.repositoryUri },
          SERVICE_NAME: { value: serviceName },
        },
        buildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          phases: {
            pre_build: {
              commands: [
                'echo Logging in to Amazon ECR...',
                'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ECR_REPOSITORY_URI',
              ],
            },
            build: {
              commands: [
                'echo Build started on `date`',
                'echo Building the Docker image...',
                'docker build -t $ECR_REPOSITORY_URI:latest -f microservices/$SERVICE_NAME/Dockerfile microservices/$SERVICE_NAME',
                'docker tag $ECR_REPOSITORY_URI:latest $ECR_REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION',
              ],
            },
            post_build: {
              commands: [
                'echo Build completed on `date`',
                'echo Pushing the Docker image...',
                'docker push $ECR_REPOSITORY_URI:latest',
                'docker push $ECR_REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION',
                'echo Writing image definitions file...',
                'printf \'[{"name":"%sContainer","imageUri":"%s"}]\' "$SERVICE_NAME" "$ECR_REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION" > imagedefinitions.json',
              ],
            },
          },
          artifacts: {
            files: ['imagedefinitions.json'],
          },
        }),
      });

      repository.grantPullPush(buildProject);
      buildProject.addToRolePolicy(new iam.PolicyStatement({
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      }));

      const buildOutput = new codepipeline.Artifact(`${serviceName}BuildOutput`);

      buildActions.push(
        new codepipeline_actions.CodeBuildAction({
          actionName: `Build_${serviceName}`,
          project: buildProject,
          input: sourceOutput,
          outputs: [buildOutput],
        })
      );

      deployActions.push(
        new codepipeline_actions.EcsDeployAction({
          actionName: `Deploy_${serviceName}`,
          service: ecsService,
          input: buildOutput,
        })
      );
    });

    // Frontend Build & Deploy Project
    const frontendBuildProject = new codebuild.PipelineProject(this, 'FrontendBuildProject', {
      projectName: 'frontend-build',
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
      },
      environmentVariables: {
        BUCKET_NAME: { value: props.frontendBucket.bucketName },
        DISTRIBUTION_ID: { value: props.frontendDistribution.distributionId },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [
              'cd frontend',
              'npm ci',
            ],
          },
          build: {
            commands: [
              'npm run build',
            ],
          },
          post_build: {
            commands: [
              'echo Syncing files to S3...',
              'aws s3 sync dist/frontend/browser s3://$BUCKET_NAME --delete',
              'echo Invalidating CloudFront cache...',
              'aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"',
            ],
          },
        },
      }),
    });

    props.frontendBucket.grantReadWrite(frontendBuildProject);
    frontendBuildProject.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudfront:CreateInvalidation'],
      resources: ['*'],
    }));

    buildActions.push(
      new codepipeline_actions.CodeBuildAction({
        actionName: 'Build_Frontend',
        project: frontendBuildProject,
        input: sourceOutput,
      })
    );

    this.pipeline.addStage({
      stageName: 'Build',
      actions: buildActions,
    });

    this.pipeline.addStage({
      stageName: 'Deploy',
      actions: deployActions,
    });
  }
}
