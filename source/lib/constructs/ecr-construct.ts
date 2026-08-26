import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as cdk from 'aws-cdk-lib';

export interface EcrConstructProps {
  /**
   * List of microservice names to generate ECR repositories for.
   */
  readonly serviceNames?: string[];
}

export class EcrConstruct extends Construct {
  public readonly repositories: Map<string, ecr.IRepository> = new Map();

  constructor(scope: Construct, id: string, props?: EcrConstructProps) {
    super(scope, id);

    const serviceNames = props?.serviceNames ?? ['auth', 'orders', 'notifications'];

    serviceNames.forEach((name) => {
      // TODO: Customize lifecycle rules or image scanning preferences
      const repo = new ecr.Repository(this, `${name}Repository`, {
        repositoryName: `microservices/${name}`,
        imageScanOnPush: true, // Vulnerability scanning on image push
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteImages: true,
      });

      this.repositories.set(name, repo);
    });
  }

  public getRepository(serviceName: string): ecr.IRepository {
    const repo = this.repositories.get(serviceName);
    if (!repo) {
      throw new Error(`Repository for service '${serviceName}' not found in EcrConstruct`);
    }
    return repo;
  }
}
