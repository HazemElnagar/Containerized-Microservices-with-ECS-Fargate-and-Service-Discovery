import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';

import { NetworkConstruct } from './constructs/network-construct';
import { EcrConstruct } from './constructs/ecr-construct';
import { SecretsConstruct } from './constructs/secrets-construct';
import { RedisConstruct } from './constructs/redis-construct';
import { ServiceDiscoveryConstruct } from './constructs/service-discovery-construct';
import { AlbConstruct } from './constructs/alb-construct';
import { EcsFargateConstruct } from './constructs/ecs-fargate-construct';
import { PipelineConstruct } from './constructs/pipeline-construct';
import { FrontendConstruct } from './constructs/frontend-construct';

export class ContainerizedMicroservicesStack extends cdk.Stack {
  public readonly network: NetworkConstruct;
  public readonly ecr: EcrConstruct;
  public readonly secrets: SecretsConstruct;
  public readonly redis: RedisConstruct;
  public readonly serviceDiscovery: ServiceDiscoveryConstruct;
  public readonly alb: AlbConstruct;
  public readonly ecsFargate: EcsFargateConstruct;
  public readonly pipeline: PipelineConstruct;
  public readonly frontend: FrontendConstruct;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Network Infrastructure (VPC, Subnets, Security Groups)
    this.network = new NetworkConstruct(this, 'NetworkConstruct');

    // 2. Container Registries (ECR Repositories with scanOnPush)
    this.ecr = new EcrConstruct(this, 'EcrConstruct', {
      serviceNames: ['auth', 'orders', 'notifications'],
    });

    // 3. Secrets Management (AWS Secrets Manager)
    this.secrets = new SecretsConstruct(this, 'SecretsConstruct');

    // 4. ElastiCache Redis Cluster for Session Caching
    this.redis = new RedisConstruct(this, 'RedisConstruct', {
      vpc: this.network.vpc,
      securityGroup: this.network.redisSecurityGroup,
    });

    // 5. AWS Cloud Map Service Discovery
    this.serviceDiscovery = new ServiceDiscoveryConstruct(this, 'ServiceDiscoveryConstruct', {
      vpc: this.network.vpc,
      namespaceName: 'microservices.local',
    });

    // 6. Application Load Balancer with Path-based Target Groups
    this.alb = new AlbConstruct(this, 'AlbConstruct', {
      vpc: this.network.vpc,
      securityGroup: this.network.albSecurityGroup,
    });

    // Target Groups for Path Routing
    const authTargetGroup = this.alb.addServiceTargetGroup('Auth', '/auth/*', 10);
    const ordersTargetGroup = this.alb.addServiceTargetGroup('Orders', '/orders/*', 20);
    const notificationsTargetGroup = this.alb.addServiceTargetGroup('Notifications', '/notifications/*', 30);

    // 7. Amazon ECS Fargate Cluster & Microservices
    this.ecsFargate = new EcsFargateConstruct(this, 'EcsFargateConstruct', {
      vpc: this.network.vpc,
      securityGroup: this.network.ecsSecurityGroup,
      cloudMapNamespace: this.serviceDiscovery.namespace,
      dbSecret: this.secrets.dbCredentialsSecret,
      apiSecret: this.secrets.apiKeysSecret,
      redisEndpoint: this.redis.endpointAddress,
    });

    // Instantiate Auth Microservice
    this.ecsFargate.createMicroservice({
      serviceName: 'auth',
      repository: this.ecr.getRepository('auth'),
      targetGroup: authTargetGroup,
      environment: {
        REDIS_HOST: this.redis.endpointAddress,
        REDIS_PORT: this.redis.endpointPort,
      },
      secrets: {
        DB_CREDENTIALS: ecs.Secret.fromSecretsManager(this.secrets.dbCredentialsSecret),
        JWT_SECRET: ecs.Secret.fromSecretsManager(this.secrets.apiKeysSecret, 'jwtSecret'),
      },
    });

    // Instantiate Orders Microservice
    this.ecsFargate.createMicroservice({
      serviceName: 'orders',
      repository: this.ecr.getRepository('orders'),
      targetGroup: ordersTargetGroup,
      environment: {
        AUTH_SERVICE_URL: 'http://auth.microservices.local:3000',
        NOTIFICATIONS_SERVICE_URL: 'http://notifications.microservices.local:3000',
      },
      secrets: {
        DB_CREDENTIALS: ecs.Secret.fromSecretsManager(this.secrets.dbCredentialsSecret),
      },
    });

    // Instantiate Notifications Microservice
    this.ecsFargate.createMicroservice({
      serviceName: 'notifications',
      repository: this.ecr.getRepository('notifications'),
      targetGroup: notificationsTargetGroup,
      secrets: {
        API_KEYS: ecs.Secret.fromSecretsManager(this.secrets.apiKeysSecret),
      },
    });

    // 8. Frontend (CloudFront + S3)
    this.frontend = new FrontendConstruct(this, 'FrontendConstruct', {
      alb: this.alb.alb,
    });

    // 9. CI/CD Pipeline for Blue/Green Deployments and Frontend
    this.pipeline = new PipelineConstruct(this, 'PipelineConstruct', {
      ecsServices: this.ecsFargate.services,
      ecrRepositories: this.ecr.repositories,
      frontendBucket: this.frontend.bucket,
      frontendDistribution: this.frontend.distribution,
    });

    // Stack Outputs
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: this.alb.alb.loadBalancerDnsName,
      description: 'Public DNS URL of Application Load Balancer',
    });

    new cdk.CfnOutput(this, 'CloudMapNamespaceName', {
      value: this.serviceDiscovery.namespace.namespaceName,
      description: 'Private DNS Namespace Name for Service Discovery',
    });

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${this.frontend.distribution.distributionDomainName}`,
      description: 'Public URL of the CloudFront Frontend Distribution',
    });
  }
}
