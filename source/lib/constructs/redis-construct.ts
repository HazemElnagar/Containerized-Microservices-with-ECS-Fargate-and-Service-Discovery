import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';

export interface RedisConstructProps {
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
  /**
   * Cache node instance type.
   * @default 'cache.t3.micro'
   */
  readonly nodeType?: string;
}

export class RedisConstruct extends Construct {
  public readonly redisReplicationGroup: elasticache.CfnReplicationGroup;
  public readonly endpointAddress: string;
  public readonly endpointPort: string;

  constructor(scope: Construct, id: string, props: RedisConstructProps) {
    super(scope, id);

    // Create Subnet Group for Redis across private subnets
    const subnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for ElastiCache Redis cluster',
      subnetIds: props.vpc.isolatedSubnets.map((s) => s.subnetId).concat(
        props.vpc.privateSubnets.map((s) => s.subnetId)
      ),
      cacheSubnetGroupName: 'redis-subnet-group',
    });

    // TODO: Adjust Redis node count or cluster mode for high availability
    // Note: Enabling transitEncryptionEnabled requires the client connection to use TLS (e.g., tls: {} in ioredis).
    this.redisReplicationGroup = new elasticache.CfnReplicationGroup(this, 'RedisCluster', {
      replicationGroupDescription: 'Shared session store for stateless containers',
      engine: 'redis',
      cacheNodeType: props.nodeType ?? 'cache.t3.micro',
      numCacheClusters: 1,
      cacheSubnetGroupName: subnetGroup.ref,
      securityGroupIds: [props.securityGroup.securityGroupId],
      automaticFailoverEnabled: false,
      transitEncryptionEnabled: true,
      atRestEncryptionEnabled: true,
    });

    this.endpointAddress = this.redisReplicationGroup.attrPrimaryEndPointAddress;
    this.endpointPort = this.redisReplicationGroup.attrPrimaryEndPointPort;
  }
}
