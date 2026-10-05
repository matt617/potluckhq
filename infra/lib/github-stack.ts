import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export interface GithubDeployStackProps extends StackProps {
  /** owner/repo, e.g. matt617/potluckhq */
  repo: string;
  /** GitHub environment allowed to deploy, e.g. production */
  environment: string;
  /**
   * Subject prefix GitHub puts in the token. Repos using immutable subjects send
   * repo:<owner>@<ownerId>/<repo>@<repoId>; read it from
   * GET /repos/{owner}/{repo}/actions/oidc/customization/sub (sub_claim_prefix).
   */
  subjectPrefix?: string;
}

/**
 * Lets GitHub Actions deploy without stored AWS keys. The workflow exchanges its OIDC token
 * for this role, and only jobs running in the named GitHub environment of this repo qualify.
 * The role itself can do nothing except assume the CDK bootstrap roles, which carry the
 * actual deploy permissions.
 */
export class GithubDeployStack extends Stack {
  constructor(scope: Construct, id: string, props: GithubDeployStackProps) {
    super(scope, id, props);
    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GithubOidc',
      `arn:${this.partition}:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );
    const role = new iam.Role(this, 'DeployRole', {
      roleName: `potluck-github-deploy-${props.environment}`,
      description: `GitHub Actions deploys for ${props.repo} (${props.environment})`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `${props.subjectPrefix ?? `repo:${props.repo}`}:environment:${props.environment}`,
        },
      }),
    });
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole', 'sts:TagSession'],
      resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*-${this.account}-${this.region}`],
    }));
    // The workflow reads stack outputs after deploying to run smoke tests.
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['cloudformation:DescribeStacks'],
      resources: [`arn:${this.partition}:cloudformation:${this.region}:${this.account}:stack/Potluck-*/*`],
    }));
    new CfnOutput(this, 'DeployRoleArn', { value: role.roleArn });
  }
}
