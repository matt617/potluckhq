#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { PotluckStack, readStackConfig } from '../lib/potluck-stack.js';

const app = new App();
const config = readStackConfig(app);

new PotluckStack(app, `Potluck-${config.stage}`, {
  config,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: `Potluck recipe communities (${config.stage})`,
});
