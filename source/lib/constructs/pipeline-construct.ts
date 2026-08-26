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
      pipelineType: codepipeline.PipelineType.V2,
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
                'echo Checking for changes in microservices/$SERVICE_NAME/...',
                'export PREV_COMMIT=$(git rev-parse HEAD~1 2>/dev/null || git rev-list --max-parents=0 HEAD) && export CHANGED_FILES=$(git diff --name-only $PREV_COMMIT HEAD) && if echo "$CHANGED_FILES" | grep -q "^microservices/$SERVICE_NAME/"; then export SHOULD_BUILD=true; else export SHOULD_BUILD=false; fi && echo "SHOULD_BUILD=$SHOULD_BUILD"',
              ],
            },
            build: {
              commands: [
                'if [ "$SHOULD_BUILD" = "true" ]; then echo "Build started on $(date)" && echo "Building the Docker image..." && docker build -t $ECR_REPOSITORY_URI:latest -f microservices/$SERVICE_NAME/Dockerfile microservices/$SERVICE_NAME && docker tag $ECR_REPOSITORY_URI:latest $ECR_REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION; else echo "No changes detected in microservices/$SERVICE_NAME/. Skipping build."; fi',
              ],
            },
            post_build: {
              commands: [
                'if [ "$SHOULD_BUILD" = "true" ]; then echo "Build completed on $(date)" && echo "Pushing the Docker image..." && docker push $ECR_REPOSITORY_URI:latest && docker push $ECR_REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION && export IMAGE_URI="$ECR_REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION"; else echo "Using existing latest image from ECR..." && export IMAGE_URI="$ECR_REPOSITORY_URI:latest"; fi && echo Writing image definitions file... && printf \'[{"name":"%sContainer","imageUri":"%s"}]\' "$SERVICE_NAME" "$IMAGE_URI" > imagedefinitions.json && cat imagedefinitions.json',
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
          pre_build: {
            commands: [
              'echo Checking for changes in frontend/ or frontend-construct...',
              'export PREV_COMMIT=$(git rev-parse HEAD~1 2>/dev/null || git rev-list --max-parents=0 HEAD) && export CHANGED_FILES=$(git diff --name-only $PREV_COMMIT HEAD) && if echo "$CHANGED_FILES" | grep -qE "^(frontend/|source/lib/constructs/frontend-construct\.ts)"; then export SHOULD_BUILD=true; else export SHOULD_BUILD=false; fi && echo "SHOULD_BUILD=$SHOULD_BUILD"',
            ],
          },
          install: {
            commands: [
              'if [ "$SHOULD_BUILD" = "true" ]; then cd frontend && npm ci; else echo "Skipping frontend install."; fi',
            ],
          },
          build: {
            commands: [
              'if [ "$SHOULD_BUILD" = "true" ]; then cd frontend && npm run build; else echo "Skipping frontend build."; fi',
            ],
          },
            post_build: {
              commands: [
                'if [ "$SHOULD_BUILD" = "true" ]; then echo "Syncing files to S3..." && aws s3 sync frontend/dist/frontend/browser s3://$BUCKET_NAME --delete && echo "Invalidating CloudFront cache..." && aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"; else echo "No frontend changes detected. Skipping S3 sync and CloudFront invalidation."; fi',
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
