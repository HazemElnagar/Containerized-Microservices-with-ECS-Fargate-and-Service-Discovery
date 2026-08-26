import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cdk from 'aws-cdk-lib';

export interface AlbConstructProps {
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
}

export class AlbConstruct extends Construct {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly httpListener: elbv2.ApplicationListener;
  public readonly targetGroups: Map<string, elbv2.ApplicationTargetGroup> = new Map();

  constructor(scope: Construct, id: string, props: AlbConstructProps) {
    super(scope, id);

    // Application Load Balancer
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'ApplicationLoadBalancer', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.securityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // Create S3 Bucket for ALB Access Logs
    const logBucket = new s3.Bucket(this, 'AlbLogsBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    this.alb.logAccessLogs(logBucket);

    // HTTP Listener on Port 80
    this.httpListener = this.alb.addListener('HttpListener', {
      port: 80,
      open: true,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: '404 Route Not Found',
      }),
    });
  }

  /**
   * Helper method to add a path-based routing rule to the ALB.
   */
  public addServiceTargetGroup(
    serviceName: string,
    pathPattern: string,
    priority: number
  ): elbv2.ApplicationTargetGroup {
    const targetGroup = new elbv2.ApplicationTargetGroup(this, `${serviceName}TargetGroup`, {
      vpc: this.alb.vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    this.httpListener.addAction(`${serviceName}RoutingRule`, {
      priority: priority,
      conditions: [elbv2.ListenerCondition.pathPatterns([pathPattern])],
      action: elbv2.ListenerAction.forward([targetGroup]),
    });

    this.targetGroups.set(serviceName, targetGroup);
    return targetGroup;
  }
}
