import { Construct } from 'constructs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class SecretsConstruct extends Construct {
  public readonly dbCredentialsSecret: secretsmanager.ISecret;
  public readonly apiKeysSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Database Credentials Secret
    // TODO: Define custom JSON structure or KMS encryption keys if required
    this.dbCredentialsSecret = new secretsmanager.Secret(this, 'DbCredentialsSecret', {
      secretName: 'microservices/db-credentials',
      description: 'Database connection credentials injected into microservice containers at runtime',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'app_user' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });

    // API Keys & JWT Secrets
    this.apiKeysSecret = new secretsmanager.Secret(this, 'ApiKeysSecret', {
      secretName: 'microservices/api-keys',
      description: 'JWT Secret and API Keys for Auth and internal service validation',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ jwtIssuer: 'microservices-auth' }),
        generateStringKey: 'jwtSecret',
        passwordLength: 32,
      },
    });
  }
}
