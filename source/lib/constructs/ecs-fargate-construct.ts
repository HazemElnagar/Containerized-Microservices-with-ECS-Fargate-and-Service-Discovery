import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import * as imagedeploy from 'cdk-docker-image-deployment';

export interface EcsServiceDefinition {
  readonly serviceName: string;
  readonly repository: ecr.IRepository;
  readonly cpu?: number;
  readonly memoryLimitMiB?: number;
  readonly desiredCount?: number;
  readonly environment?: { [key: string]: string };
  readonly secrets?: { [key: string]: ecs.Secret };
  readonly targetGroup?: elbv2.ApplicationTargetGroup;
}

export interface EcsFargateConstructProps {
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly cloudMapNamespace: servicediscovery.IPrivateDnsNamespace;
  readonly dbSecret: secretsmanager.ISecret;
  readonly apiSecret: secretsmanager.ISecret;
  readonly redisEndpoint: string;
}

export class EcsFargateConstruct extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly services: Map<string, ecs.FargateService> = new Map();
  public readonly taskExecutionRole: iam.Role;
  public readonly taskRole: iam.Role;
  private readonly securityGroup: ec2.ISecurityGroup;
  private readonly cloudMapNamespace: servicediscovery.IPrivateDnsNamespace;

  constructor(scope: Construct, id: string, props: EcsFargateConstructProps) {
    super(scope, id);

    this.securityGroup = props.securityGroup;
    this.cloudMapNamespace = props.cloudMapNamespace;

    // ECS Cluster
    this.cluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc: props.vpc,
      clusterName: 'microservices-fargate-cluster',
      containerInsights: true,
    });

    // IAM Execution Role (used by ECS agent to pull ECR images & fetch Secrets)
    this.taskExecutionRole = new iam.Role(this, 'EcsTaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // IAM Task Role (used by container application logic at runtime, e.g., X-Ray, AWS SDKs)
    this.taskRole = new iam.Role(this, 'EcsTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'),
      ],
    });

    // Grant secrets read access
    props.dbSecret.grantRead(this.taskExecutionRole);
    props.apiSecret.grantRead(this.taskExecutionRole);
  }

  /**
   * Helper method to create a Fargate Microservice Task Definition and Service.
   */
  public createMicroservice(def: EcsServiceDefinition): ecs.FargateService {
    const taskDefinition = new ecs.FargateTaskDefinition(this, `${def.serviceName}TaskDef`, {
      cpu: def.cpu ?? 256,
      memoryLimitMiB: def.memoryLimitMiB ?? 512,
      executionRole: this.taskExecutionRole,
      taskRole: this.taskRole,
    });

    // Build and deploy Docker image to custom ECR repository during stack synthesis/deployment
    const imageDeployment = new imagedeploy.DockerImageDeployment(this, `${def.serviceName}ImageDeploy`, {
      source: imagedeploy.Source.directory(path.join(__dirname, `../../../microservices/${def.serviceName}`)),
      destination: imagedeploy.Destination.ecr(def.repository, {
        tag: 'latest',
      }),
    });

    // Primary Application Container
    const container = taskDefinition.addContainer(`${def.serviceName}Container`, {
      image: ecs.ContainerImage.fromEcrRepository(def.repository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: def.serviceName }),
      environment: {
        SERVICE_NAME: def.serviceName,
        PORT: '3000',
        NODE_ENV: 'production',
        AWS_XRAY_CONTEXT_MISSING: 'IGNORE_ERROR',
        ...def.environment,
      },
      secrets: def.secrets,
    });

    container.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    // AWS X-Ray Daemon Sidecar Container
    const xrayContainer = taskDefinition.addContainer(`${def.serviceName}XRaySidecar`, {
      image: ecs.ContainerImage.fromRegistry('amazon/aws-xray-daemon:latest'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: `${def.serviceName}-xray` }),
      cpu: 32,
      memoryLimitMiB: 64,
      essential: false,
    });

    xrayContainer.addPortMappings({
      containerPort: 2000,
      protocol: ecs.Protocol.UDP,
    });

    // Create Fargate Service with Cloud Map Service Discovery
    const fargateService = new ecs.FargateService(this, `${def.serviceName}Service`, {
      cluster: this.cluster,
      taskDefinition: taskDefinition,
      desiredCount: def.desiredCount ?? 2,
      securityGroups: [this.securityGroup], // uses shared ECS security group
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      cloudMapOptions: {
        name: def.serviceName,
        cloudMapNamespace: this.cloudMapNamespace,
        dnsRecordType: servicediscovery.DnsRecordType.A,
        dnsTtl: cdk.Duration.seconds(60),
      },
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS, // Native ECS Blue/Green deployment controller
      },
    });

    if (def.targetGroup) {
      fargateService.attachToApplicationTargetGroup(def.targetGroup);
    }

    // Ensure the service creation waits until the Docker image is deployed to ECR
    fargateService.node.addDependency(imageDeployment);

    this.services.set(def.serviceName, fargateService);
    return fargateService;
  }
}
