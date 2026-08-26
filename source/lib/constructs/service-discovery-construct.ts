import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';

export interface ServiceDiscoveryConstructProps {
  readonly vpc: ec2.IVpc;
  /**
   * Private DNS domain name.
   * @default 'microservices.local'
   */
  readonly namespaceName?: string;
}

export class ServiceDiscoveryConstruct extends Construct {
  public readonly namespace: servicediscovery.IPrivateDnsNamespace;

  constructor(scope: Construct, id: string, props: ServiceDiscoveryConstructProps) {
    super(scope, id);

    const namespaceName = props.namespaceName ?? 'microservices.local';

    // AWS Cloud Map Private DNS Namespace
    this.namespace = new servicediscovery.PrivateDnsNamespace(this, 'PrivateDnsNamespace', {
      name: namespaceName,
      vpc: props.vpc,
      description: 'Cloud Map DNS namespace for container-to-container service discovery',
    });
  }
}
