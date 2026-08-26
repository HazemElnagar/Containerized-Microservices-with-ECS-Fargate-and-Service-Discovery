#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ContainerizedMicroservicesStack } from '../lib/containerized-microservices-stack';

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID;
if (!account) {
  throw new Error('AWS Account ID must be set in CDK_DEFAULT_ACCOUNT or AWS_ACCOUNT_ID env variables');
}

const env = {
  account,
  region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1',
};

new ContainerizedMicroservicesStack(app, 'ContainerizedMicroservicesStack', {
  description: 'Project 6: Containerized Microservices with ECS Fargate and Service Discovery Architecture',
  env,
});

app.synth();
