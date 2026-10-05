import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Annotations,
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Size,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import type { App } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat, type NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cr from 'aws-cdk-lib/custom-resources';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '..', '..');

export interface StackConfig {
  stage: string;
  /** Apex domain with a public Route 53 hosted zone in this account, e.g. potluckhq.app. */
  domainName?: string;
  alertEmail?: string;
  smsEnabled: boolean;
  smsOriginationNumber?: string;
  sesFromEmail?: string;
  geminiModel: string;
  pitr: boolean;
  skipYtdlp: boolean;
  /** Directory holding api.ts, webhooks.ts, worker.ts and sms.ts. */
  handlersDir: string;
  /** Built SPA. When missing, only config.json is deployed. */
  webDistDir: string;
  google?: { clientId: string; clientSecret: string };
  apple?: { servicesId: string; teamId: string; keyId: string; privateKey: string };
}

function ctxString(app: Construct, key: string): string | undefined {
  const v = app.node.tryGetContext(key);
  if (v === undefined || v === null || v === '') return undefined;
  return String(v);
}

function ctxBool(app: Construct, key: string, fallback: boolean): boolean {
  const v = app.node.tryGetContext(key);
  if (v === undefined || v === null || v === '') return fallback;
  return v === true || v === 'true' || v === '1';
}

export function readStackConfig(app: App | Construct): StackConfig {
  const googleClientId = ctxString(app, 'googleClientId');
  const googleClientSecret = ctxString(app, 'googleClientSecret');
  const appleServiceId = ctxString(app, 'appleServiceId');
  const appleTeamId = ctxString(app, 'appleTeamId');
  const appleKeyId = ctxString(app, 'appleKeyId');
  const applePrivateKey = ctxString(app, 'applePrivateKey');
  const handlersDir = ctxString(app, 'handlersDir');
  return {
    stage: ctxString(app, 'stage') ?? 'prod',
    domainName: ctxString(app, 'domainName')?.toLowerCase().replace(/\.$/, ''),
    alertEmail: ctxString(app, 'alertEmail'),
    smsEnabled: ctxBool(app, 'smsEnabled', false),
    smsOriginationNumber: ctxString(app, 'smsOriginationNumber'),
    sesFromEmail: ctxString(app, 'sesFromEmail'),
    geminiModel: ctxString(app, 'geminiModel') ?? 'gemini-flash-lite-latest',
    pitr: ctxBool(app, 'pitr', false),
    skipYtdlp: ctxBool(app, 'skipYtdlp', false),
    handlersDir: handlersDir ? resolve(process.cwd(), handlersDir) : join(REPO_ROOT, 'packages', 'functions', 'src', 'handlers'),
    webDistDir: ctxString(app, 'webDistDir') ?? join(REPO_ROOT, 'packages', 'web', 'dist'),
    google: googleClientId && googleClientSecret ? { clientId: googleClientId, clientSecret: googleClientSecret } : undefined,
    apple:
      appleServiceId && appleTeamId && appleKeyId && applePrivateKey
        ? { servicesId: appleServiceId, teamId: appleTeamId, keyId: appleKeyId, privateKey: applePrivateKey }
        : undefined,
  };
}

export interface PotluckStackProps extends StackProps {
  config: StackConfig;
}

export class PotluckStack extends Stack {
  constructor(scope: Construct, id: string, props: PotluckStackProps) {
    super(scope, id, props);
    const cfg = props.config;
    const paramPrefix = `/potluck/${cfg.stage}/`;

    // ---------- Data ----------
    const table = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: cfg.pitr },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    table.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ---------- Buckets ----------
    const webBucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: false,
    });

    // CORS for presigned uploads is applied after the distribution exists (see MediaBucketCors)
    // because the bucket is itself a CloudFront origin and a direct reference would form a cycle.
    const mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        { id: 'expire-uploads', prefix: 'uploads/', expiration: Duration.days(7) },
        { id: 'abort-multipart', abortIncompleteMultipartUploadAfter: Duration.days(1) },
      ],
    });

    // ---------- Queue ----------
    const dlq = new sqs.Queue(this, 'IngestDlq', {
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });
    const ingestQueue = new sqs.Queue(this, 'IngestQueue', {
      visibilityTimeout: Duration.minutes(6),
      retentionPeriod: Duration.days(4),
      enforceSSL: true,
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    // ---------- HTTP API (created before the distribution; routes added later) ----------
    const httpApi = new apigw.HttpApi(this, 'HttpApi', {
      description: `Potluck API (${cfg.stage})`,
      createDefaultStage: true,
    });
    const apiDomain = `${httpApi.apiId}.execute-api.${this.region}.amazonaws.com`;

    // ---------- CloudFront ----------
    // ---------- Custom domain (optional) ----------
    let zone: route53.IHostedZone | undefined;
    let certificate: acm.ICertificate | undefined;
    if (cfg.domainName) {
      if (this.region !== 'us-east-1') throw new Error('A custom domain needs the stack in us-east-1, where CloudFront certificates live.');
      zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: cfg.domainName });
      certificate = new acm.Certificate(this, 'Certificate', {
        domainName: cfg.domainName,
        subjectAlternativeNames: [`www.${cfg.domainName}`],
        validation: acm.CertificateValidation.fromDns(zone),
      });
    }

    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: 'Serve index.html for client-side routes',
      code: cloudfront.FunctionCode.fromInline(
        [
          'function handler(event) {',
          '  var request = event.request;',
          '  var host = request.headers.host ? request.headers.host.value : "";',
          "  if (host.indexOf('www.') === 0) {",
          "    return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: 'https://' + host.slice(4) + request.uri } } };",
          '  }',
          "  if (request.uri.indexOf('.') === -1) { request.uri = '/index.html'; }",
          '  return request;',
          '}',
        ].join('\n'),
      ),
    });

    const apiOrigin = new origins.HttpOrigin(apiDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      readTimeout: Duration.seconds(30),
    });
    const apiBehavior: cloudfront.BehaviorOptions = {
      origin: apiOrigin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    };

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `Potluck ${cfg.stage}`,
      ...(cfg.domainName && certificate ? { domainNames: [cfg.domainName, `www.${cfg.domainName}`], certificate } : {}),
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        '/media/*': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(mediaBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
        },
        '/api/*': apiBehavior,
        '/public/*': apiBehavior,
        '/webhooks/*': apiBehavior,
      },
    });
    const appUrl = cfg.domainName ? `https://${cfg.domainName}` : `https://${distribution.distributionDomainName}`;
    if (zone && cfg.domainName) {
      const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
      for (const [id, name] of [['Apex', cfg.domainName], ['Www', `www.${cfg.domainName}`]] as const) {
        new route53.ARecord(this, `${id}A`, { zone, recordName: name, target });
        new route53.AaaaRecord(this, `${id}Aaaa`, { zone, recordName: name, target });
      }
    }

    new cr.AwsCustomResource(this, 'MediaBucketCors', {
      installLatestAwsSdk: false,
      onUpdate: {
        service: 'S3',
        action: 'putBucketCors',
        parameters: {
          Bucket: mediaBucket.bucketName,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedMethods: ['PUT'],
                AllowedOrigins: [appUrl, 'http://localhost:5173'],
                AllowedHeaders: ['*'],
                MaxAgeSeconds: 3000,
              },
            ],
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${mediaBucket.node.addr}-cors`),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({ actions: ['s3:PutBucketCORS'], resources: [mediaBucket.bucketArn] }),
      ]),
    });

    // ---------- Cognito ----------
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      passwordPolicy: { minLength: 10, requireSymbols: false, requireUppercase: false, requireDigits: true, requireLowercase: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const providers: cognito.UserPoolClientIdentityProvider[] = [cognito.UserPoolClientIdentityProvider.COGNITO];
    const providerConstructs: Construct[] = [];
    if (cfg.google) {
      providerConstructs.push(
        new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
          userPool,
          clientId: cfg.google.clientId,
          clientSecretValue: SecretValue.unsafePlainText(cfg.google.clientSecret),
          scopes: ['openid', 'email', 'profile'],
          attributeMapping: {
            email: cognito.ProviderAttribute.GOOGLE_EMAIL,
            fullname: cognito.ProviderAttribute.GOOGLE_NAME,
          },
        }),
      );
      providers.push(cognito.UserPoolClientIdentityProvider.GOOGLE);
    }
    if (cfg.apple) {
      providerConstructs.push(
        new cognito.UserPoolIdentityProviderApple(this, 'Apple', {
          userPool,
          clientId: cfg.apple.servicesId,
          teamId: cfg.apple.teamId,
          keyId: cfg.apple.keyId,
          privateKeyValue: SecretValue.unsafePlainText(cfg.apple.privateKey),
          scopes: ['email', 'name'],
          attributeMapping: {
            email: cognito.ProviderAttribute.APPLE_EMAIL,
            fullname: cognito.ProviderAttribute.APPLE_NAME,
          },
        }),
      );
      providers.push(cognito.UserPoolClientIdentityProvider.APPLE);
    }

    const userPoolClient = userPool.addClient('WebClient', {
      generateSecret: false,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      supportedIdentityProviders: providers,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [`${appUrl}/auth/callback`, 'http://localhost:5173/auth/callback'],
        logoutUrls: [`${appUrl}/`, 'http://localhost:5173/'],
      },
    });
    for (const p of providerConstructs) userPoolClient.node.addDependency(p);

    const userPoolDomain = userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: `potluck-${cfg.stage}-${this.account}` },
      // Managed login (v2) supports full theming; the classic hosted UI only takes a logo and limited CSS.
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    // Sign-in pages themed to match the web app. Settings come from infra/cognito/build-branding.py.
    const brandingDir = join(REPO_ROOT, 'infra', 'cognito');
    const svg = (file: string) => readFileSync(join(brandingDir, file)).toString('base64');
    new cognito.CfnManagedLoginBranding(this, 'LoginBranding', {
      userPoolId: userPool.userPoolId,
      clientId: userPoolClient.userPoolClientId,
      useCognitoProvidedValues: false,
      settings: JSON.parse(readFileSync(join(brandingDir, 'branding.json'), 'utf8')),
      assets: (['LIGHT', 'DARK'] as const).flatMap((mode) => [
        { category: 'FORM_LOGO', colorMode: mode, extension: 'SVG', bytes: svg(`logo-${mode.toLowerCase()}.svg`) },
        { category: 'FAVICON_SVG', colorMode: mode, extension: 'SVG', bytes: svg(`favicon-${mode.toLowerCase()}.svg`) },
      ]),
    });
    const cognitoDomainUrl = userPoolDomain.baseUrl();

    // ---------- Lambda functions ----------
    const handlerEntry = (name: string): string => {
      const entry = join(cfg.handlersDir, `${name}.ts`);
      if (!existsSync(entry)) {
        throw new Error(`Lambda handler not found: ${entry}. Build packages/functions first or pass -c handlersDir=<dir>.`);
      }
      return entry;
    };

    const commonEnv: Record<string, string> = {
      STAGE: cfg.stage,
      TABLE_NAME: table.tableName,
      MEDIA_BUCKET: mediaBucket.bucketName,
      INGEST_QUEUE_URL: ingestQueue.queueUrl,
      PARAM_PREFIX: paramPrefix,
      APP_URL: appUrl,
      GEMINI_MODEL: cfg.geminiModel,
      SMS_ENABLED: String(cfg.smsEnabled),
      SMS_ORIGINATION_NUMBER: cfg.smsOriginationNumber ?? '',
      NODE_OPTIONS: '--enable-source-maps',
    };

    const lockFile = join(REPO_ROOT, 'package-lock.json');
    const makeFn = (id: string, name: string, overrides: Partial<NodejsFunctionProps> & { environment?: Record<string, string> } = {}) => {
      const logGroup = new logs.LogGroup(this, `${id}Logs`, {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      const { environment, ...rest } = overrides;
      return new NodejsFunction(this, id, {
        entry: handlerEntry(name),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: Duration.seconds(29),
        logGroup,
        projectRoot: REPO_ROOT,
        depsLockFilePath: existsSync(lockFile) ? lockFile : undefined,
        environment: { ...commonEnv, ...environment },
        bundling: {
          format: OutputFormat.ESM,
          minify: true,
          sourceMap: true,
          target: 'node22',
          mainFields: ['module', 'main'],
          externalModules: [],
          forceDockerBundling: false,
          banner: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
        },
        ...rest,
      });
    };

    const apiFn = makeFn('ApiFn', 'api', {
      description: 'Potluck web API',
      environment: { SES_FROM_EMAIL: cfg.sesFromEmail ?? '' },
    });
    const webhooksFn = makeFn('WebhooksFn', 'webhooks', { description: 'Telegram, WhatsApp and Stripe webhooks' });

    const layerDir = join(REPO_ROOT, 'infra', 'layers', 'ytdlp');
    const ytdlpBinary = join(layerDir, 'bin', 'yt-dlp');
    let ytdlpLayer: lambda.ILayerVersion | undefined;
    if (existsSync(ytdlpBinary) && !existsSync(join(layerDir, 'bin', 'ffmpeg')) && !cfg.skipYtdlp) {
      throw new Error(`ffmpeg missing next to yt-dlp in ${layerDir}/bin. Run "npm run fetch:ytdlp".`);
    }
    if (existsSync(ytdlpBinary)) {
      ytdlpLayer = new lambda.LayerVersion(this, 'YtDlpLayer', {
        code: lambda.Code.fromAsset(layerDir),
        compatibleArchitectures: [lambda.Architecture.ARM_64],
        description: 'yt-dlp and ffmpeg binaries at /opt/bin',
      });
    } else if (cfg.skipYtdlp) {
      Annotations.of(this).addWarningV2('potluck:ytdlp', 'yt-dlp layer skipped; video downloads will fail at runtime.');
    } else {
      throw new Error(`yt-dlp binary missing at ${ytdlpBinary}. Run "npm run fetch:ytdlp" or pass -c skipYtdlp=true.`);
    }

    const workerFn = makeFn('WorkerFn', 'worker', {
      description: 'Recipe ingest worker: yt-dlp + Gemini',
      memorySize: 1536,
      timeout: Duration.minutes(5),
      ephemeralStorageSize: Size.mebibytes(2048),
      layers: ytdlpLayer ? [ytdlpLayer] : [],
      environment: { YTDLP_PATH: '/opt/bin/yt-dlp', FFMPEG_DIR: '/opt/bin', HOME: '/tmp', XDG_CACHE_HOME: '/tmp' },
    });
    workerFn.addEventSource(new SqsEventSource(ingestQueue, { batchSize: 1, reportBatchItemFailures: true }));

    let smsFn: NodejsFunction | undefined;
    let smsTopic: sns.Topic | undefined;
    if (cfg.smsEnabled) {
      smsFn = makeFn('SmsFn', 'sms', { description: 'Inbound SMS from AWS End User Messaging' });
      smsTopic = new sns.Topic(this, 'InboundSmsTopic', { displayName: 'Potluck inbound SMS', enforceSSL: true });
      smsTopic.addToResourcePolicy(
        new iam.PolicyStatement({
          principals: [new iam.ServicePrincipal('sms-voice.amazonaws.com')],
          actions: ['sns:Publish'],
          resources: [smsTopic.topicArn],
          conditions: { StringEquals: { 'aws:SourceAccount': this.account } },
        }),
      );
      smsTopic.addSubscription(new subs.LambdaSubscription(smsFn));
    }

    // ---------- Permissions ----------
    const allFns = [apiFn, webhooksFn, workerFn, ...(smsFn ? [smsFn] : [])];
    const ssmPath = `arn:${this.partition}:ssm:${this.region}:${this.account}:parameter/potluck/${cfg.stage}`;
    for (const fn of allFns) {
      table.grantReadWriteData(fn);
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ssm:GetParametersByPath', 'ssm:GetParameters', 'ssm:GetParameter'],
          resources: [ssmPath, `${ssmPath}/*`],
        }),
      );
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['kms:Decrypt'],
          resources: ['*'],
          conditions: { StringEquals: { 'kms:ViaService': `ssm.${this.region}.amazonaws.com` } },
        }),
      );
      if (cfg.smsEnabled) {
        fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['sms-voice:SendTextMessage'], resources: ['*'] }));
      }
    }
    for (const fn of [apiFn, webhooksFn, ...(smsFn ? [smsFn] : [])]) ingestQueue.grantSendMessages(fn);

    mediaBucket.grantPut(apiFn, 'uploads/*');
    mediaBucket.grantRead(apiFn, 'media/*');
    mediaBucket.grantDelete(apiFn, 'media/*');
    mediaBucket.grantPut(webhooksFn, 'uploads/*');
    if (smsFn) mediaBucket.grantPut(smsFn, 'uploads/*');
    mediaBucket.grantRead(workerFn, 'uploads/*');
    mediaBucket.grantDelete(workerFn, 'uploads/*');
    mediaBucket.grantPut(workerFn, 'media/*');
    mediaBucket.grantRead(workerFn, 'media/*');

    if (cfg.sesFromEmail) {
      apiFn.addToRolePolicy(new iam.PolicyStatement({ actions: ['ses:SendEmail'], resources: ['*'] }));
    }

    // ---------- Routes ----------
    const jwtAuthorizer = new HttpJwtAuthorizer('CognitoJwt', `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`, {
      jwtAudience: [userPoolClient.userPoolClientId],
    });
    const apiIntegration = new HttpLambdaIntegration('ApiIntegration', apiFn);
    const webhooksIntegration = new HttpLambdaIntegration('WebhooksIntegration', webhooksFn);

    httpApi.addRoutes({ path: '/api/{proxy+}', methods: [apigw.HttpMethod.ANY], integration: apiIntegration, authorizer: jwtAuthorizer });
    httpApi.addRoutes({ path: '/public/{proxy+}', methods: [apigw.HttpMethod.GET], integration: apiIntegration });
    httpApi.addRoutes({ path: '/webhooks/{proxy+}', methods: [apigw.HttpMethod.ANY], integration: webhooksIntegration });

    // ---------- Web app + runtime config ----------
    const runtimeConfig = {
      region: this.region,
      userPoolId: userPool.userPoolId,
      clientId: userPoolClient.userPoolClientId,
      cognitoDomain: cognitoDomainUrl,
    };
    const hasDist = existsSync(join(cfg.webDistDir, 'index.html'));
    if (!hasDist) {
      Annotations.of(this).addWarningV2('potluck:web', `Web build not found at ${cfg.webDistDir}; deploying config.json only.`);
    }
    new s3deploy.BucketDeployment(this, 'WebDeployment', {
      destinationBucket: webBucket,
      sources: [
        ...(hasDist ? [s3deploy.Source.asset(cfg.webDistDir)] : []),
        s3deploy.Source.jsonData('config.json', runtimeConfig),
      ],
      prune: hasDist,
      distribution,
      distributionPaths: ['/*'],
      memoryLimit: 256,
    });

    // ---------- Budget alarm ----------
    if (cfg.alertEmail) {
      new budgets.CfnBudget(this, 'MonthlyBudget', {
        budget: {
          budgetName: `potluck-${cfg.stage}-monthly`,
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: { amount: 25, unit: 'USD' },
        },
        notificationsWithSubscribers: [80, 100].map((threshold) => ({
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: cfg.alertEmail! }],
        })),
      });
    }

    // ---------- Outputs ----------
    new CfnOutput(this, 'AppUrl', { value: appUrl });
    new CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'ClientId', { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, 'CognitoDomain', { value: cognitoDomainUrl });
    new CfnOutput(this, 'TelegramWebhookUrl', { value: `${appUrl}/webhooks/telegram` });
    new CfnOutput(this, 'WhatsAppWebhookUrl', { value: `${appUrl}/webhooks/whatsapp` });
    new CfnOutput(this, 'StripeWebhookUrl', { value: `${appUrl}/webhooks/stripe` });
    new CfnOutput(this, 'TableName', { value: table.tableName });
    new CfnOutput(this, 'ParamPrefix', { value: paramPrefix });
    new CfnOutput(this, 'IngestDlqUrl', { value: dlq.queueUrl });
    if (smsTopic) {
      new CfnOutput(this, 'SmsInboundTopicArn', {
        value: smsTopic.topicArn,
        description:
          'In AWS End User Messaging SMS, open your phone number, enable two-way SMS, choose Amazon SNS as the destination and paste this topic ARN.',
      });
    }
  }
}
