#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { GithubDeployStack } from '../lib/github-stack.js';
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

// One-time setup, deployed by hand: cdk deploy PotluckGithubDeploy -c githubRepo=owner/repo
const githubRepo = app.node.tryGetContext('githubRepo');
if (githubRepo) {
  new GithubDeployStack(app, 'PotluckGithubDeploy', {
    repo: String(githubRepo),
    environment: String(app.node.tryGetContext('githubEnvironment') ?? 'production'),
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1' },
  });
}
