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
    t.resourceCountIs('AWS::SNS::Topic', 1);
    t.resourceCountIs('AWS::Budgets::Budget', 1);
  }, 120_000);
});
