import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { PotluckStack, readStackConfig } from '../lib/potluck-stack.js';

const here = dirname(fileURLToPath(import.meta.url));

function synth(extra: Record<string, unknown> = {}): Template {
  const app = new App({
    outdir: mkdtempSync(join(tmpdir(), 'potluck-cdk-')),
    context: {
      stage: 'test',
      skipYtdlp: true,
      handlersDir: join(here, 'stubs'),
      webDistDir: join(here, 'no-such-dist'),
      ...extra,
    },
  });
  const stack = new PotluckStack(app, 'PotluckTest', {
    config: readStackConfig(app),
    env: { account: '123456789012', region: 'us-east-1' },
  });
  return Template.fromStack(stack);
}

describe('PotluckStack', () => {
  let template: Template;
  beforeAll(() => {
    template = synth();
  }, 120_000);

  it('uses an on-demand table with gsi1 and ttl', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
      GlobalSecondaryIndexes: [Match.objectLike({ IndexName: 'gsi1' })],
    });
  });

  it('creates three arm64 Node 22 handlers when SMS is off', () => {
    const fns = template.findResources('AWS::Lambda::Function', {
      Properties: { Runtime: 'nodejs22.x', Architectures: ['arm64'] },
    });
    expect(Object.keys(fns)).toHaveLength(3);
  });

  it('protects only /api routes with a JWT authorizer', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', { AuthorizerType: 'JWT' });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'ANY /api/{proxy+}', AuthorizationType: 'JWT' });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'ANY /webhooks/{proxy+}', AuthorizationType: 'NONE' });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'GET /public/{proxy+}', AuthorizationType: 'NONE' });
  });

  it('blocks public access on every bucket', () => {
    const buckets = template.findResources('AWS::S3::Bucket');
    expect(Object.keys(buckets).length).toBeGreaterThanOrEqual(2);
    for (const b of Object.values(buckets)) {
      expect(b.Properties.PublicAccessBlockConfiguration).toEqual({
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      });
    }
  });

  it('wires the worker to SQS with partial batch failures', () => {
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 1,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      MemorySize: 1536,
      Timeout: 300,
      EphemeralStorage: { Size: 2048 },
    });
  });

  it('adds the SMS handler, topic and budget when enabled', () => {
    const t = synth({ smsEnabled: true, alertEmail: 'ops@example.com' });
    const fns = t.findResources('AWS::Lambda::Function', {
      Properties: { Runtime: 'nodejs22.x', Architectures: ['arm64'] },
    });
    expect(Object.keys(fns)).toHaveLength(4);
    // Inbound SMS topic plus the alert topic.
    t.resourceCountIs('AWS::SNS::Topic', 2);
    t.resourceCountIs('AWS::Budgets::Budget', 1);
    t.hasResourceProperties('AWS::CloudWatch::Alarm', { AlarmName: 'potluck-test-sms-errors' });
  }, 120_000);
});

describe('PotluckStack safety and alerting', () => {
  let t: Template;
  beforeAll(() => {
    t = synth({ alertEmail: 'alerts@example.com' });
  }, 120_000);

  it('throttles the whole API as a safety net', () => {
    t.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: { ThrottlingRateLimit: 50, ThrottlingBurstLimit: 100 },
    });
  });

  it('caps how many imports run at once', () => {
    t.hasResourceProperties('AWS::Lambda::EventSourceMapping', { ScalingConfig: { MaximumConcurrency: 5 } });
  });

  it('alerts on the dead-letter queue, Lambda errors and AI spend by email', () => {
    for (const name of ['dlq-messages', 'api-errors', 'worker-errors', 'ai-spend', 'imports-failing']) {
      t.hasResourceProperties('AWS::CloudWatch::Alarm', { AlarmName: `potluck-test-${name}`, AlarmActions: Match.anyValue() });
    }
    t.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'email', Endpoint: 'alerts@example.com' });
  });

  it('lets only the API delete Cognito users', () => {
    t.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Action: 'cognito-idp:AdminDeleteUser' })]) },
    });
  });
});

describe('PotluckStack with a custom domain', () => {
  let t: Template;
  beforeAll(() => {
    t = synth({
      domainName: 'example.com',
      alertEmail: 'alerts@example.com',
      cognitoUseSes: true,
      'hosted-zone:account=123456789012:domainName=example.com:region=us-east-1': { Id: '/hostedzone/Z123TEST', Name: 'example.com.' },
    });
  }, 120_000);

  it('verifies the domain in SES with a custom MAIL FROM and DMARC', () => {
    t.hasResourceProperties('AWS::SES::EmailIdentity', {
      EmailIdentity: 'example.com',
      MailFromAttributes: { MailFromDomain: 'mail.example.com' },
    });
    t.hasResourceProperties('AWS::Route53::RecordSet', { Name: '_dmarc.example.com.', Type: 'TXT' });
  });

  it('sends Cognito email through SES from the domain', () => {
    t.hasResourceProperties('AWS::Cognito::UserPool', {
      EmailConfiguration: Match.objectLike({ EmailSendingAccount: 'DEVELOPER', From: 'Potluck <no-reply@example.com>' }),
    });
  });

  it('receives support, privacy and legal mail and forwards it', () => {
    t.hasResourceProperties('AWS::Route53::RecordSet', { Name: 'example.com.', Type: 'MX' });
    t.hasResourceProperties('AWS::SES::ReceiptRule', {
      Rule: Match.objectLike({ Recipients: Match.arrayWith(['support@example.com', 'privacy@example.com', 'legal@example.com']), ScanEnabled: true }),
    });
  });
});

describe('GithubDeployStack', () => {
  it('trusts only the production environment of one repo and can only assume CDK roles', async () => {
    const { GithubDeployStack } = await import('../lib/github-stack.js');
    const app = new App();
    const stack = new GithubDeployStack(app, 'Gh', { repo: 'owner/repo', environment: 'production', env: { account: '123456789012', region: 'us-east-1' } });
    const t = Template.fromStack(stack);
    t.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [Match.objectLike({
          Condition: { StringEquals: { 'token.actions.githubusercontent.com:sub': 'repo:owner/repo:environment:production', 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' } },
        })],
      },
    });
    t.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Action: ['sts:AssumeRole', 'sts:TagSession'], Resource: Match.anyValue() })]) },
    });
  });
});
