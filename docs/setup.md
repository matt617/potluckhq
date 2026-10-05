# Setup and deployment

This guide takes a fresh AWS account to a running Potluck with Telegram, WhatsApp, optional SMS and Stripe.
Every channel is optional. A missing SSM parameter switches that feature off instead of breaking the app.

## 1. Prerequisites

- Node 20 or newer and npm.
- AWS CLI v2 with credentials for the target account (`aws login` or `aws configure`).
- No Docker is needed. Lambdas bundle with local esbuild, and yt-dlp and ffmpeg ship as prebuilt arm64 binaries in a Lambda layer.

```bash
npm install
npx -w @potluck/infra cdk bootstrap        # once per account and region
```

## 2. First deploy

```bash
scripts/deploy.sh -c stage=prod -c alertEmail=you@example.com
```

The script downloads yt-dlp and a static ffmpeg into `infra/layers/ytdlp/bin/` if they are missing, builds the web app, deploys,
and prints the outputs. Keep these outputs handy:

| Output | Used for |
|---|---|
| `AppUrl` | The web app, and the base for every webhook |
| `TelegramWebhookUrl` | Telegram `setWebhook` |
| `WhatsAppWebhookUrl` | Meta app webhook callback |
| `StripeWebhookUrl` | Stripe webhook endpoint |
| `ParamPrefix` | Where secrets live in SSM, e.g. `/potluck/prod/` |

Optional context flags for `scripts/deploy.sh`:

| Flag | Effect |
|---|---|
| `-c domainName=potluckhq.app` | Serve the app on your own domain. Needs a public Route 53 zone for it in the same account; adds the certificate, DNS records and a www redirect |
| `-c alertEmail=...` | $25/month AWS Budget with 80% and 100% email alerts |
| `-c geminiModel=...` | Override the model; it must be on the allowlist in `packages/core/src/metering.ts` |
| `-c sesFromEmail=...` | Send invite emails through SES from this verified address |
| `-c smsEnabled=true -c smsOriginationNumber=+1...` | Deploy the inbound SMS handler (see step 6) |
| `-c pitr=true` | DynamoDB point-in-time recovery, which adds cost |
| `-c googleClientId=... -c googleClientSecret=...` | Google sign-in |
| `-c appleServiceId=... -c appleTeamId=... -c appleKeyId=... -c applePrivateKey=...` | Apple sign-in |

For Google sign-in, add `https://potluck-<stage>-<account>.auth.<region>.amazoncognito.com/oauth2/idpresponse`
as an authorized redirect URI in Google Cloud Console. Apple needs the same URL as its return URL.

## 3. Gemini

1. Create an API key at https://aistudio.google.com/apikey on a billing-enabled Google Cloud project.
   The free tier allows Google to train on your prompts, so use a paid project for real user content.
2. Run `scripts/set-secrets.sh --stage prod` and paste it at `gemini-api-key`. Skip the rest for now if you like.

## 4. Telegram (free)

1. In Telegram, message `@BotFather`, send `/newbot`, and pick a name and a username ending in `bot`.
2. Copy the token.
3. Run `scripts/set-secrets.sh --stage prod`. Fill in `telegram-bot-token` and `telegram-bot-username`.
   Leave `telegram-webhook-secret` blank to generate one.
4. Register the webhook:

   ```bash
   scripts/set-telegram-webhook.sh --stage prod
   ```

5. Optional: in BotFather, `/setcommands` with:

   ```
   start - Link your account
   plan - This week's meal plan
   shop - This week's shopping list
   use - Switch default community
   help - What I can do
   ```

## 5. WhatsApp Business Cloud API

1. Create a Meta developer app of type Business at https://developers.facebook.com/apps and add the WhatsApp product.
2. Complete Meta business verification for the business that will own the number. Without it you are limited
   to test numbers.
3. In WhatsApp → API Setup, add and verify a phone number. Note the Phone number ID.
4. Create a System User in Business Settings with the `whatsapp_business_messaging` and
   `whatsapp_business_management` permissions and generate a permanent token.
5. In App Settings → Basic, copy the App Secret.
6. Run `scripts/set-secrets.sh --stage prod` and fill `whatsapp-token`, `whatsapp-phone-number-id`,
   `whatsapp-app-secret`, `whatsapp-number`. Leave `whatsapp-verify-token` blank to generate one and copy
   the value it prints.
7. In WhatsApp → Configuration → Webhook, set:
   - Callback URL: the `WhatsAppWebhookUrl` output.
   - Verify token: the value from step 6.
   Then subscribe to the `messages` field.

Cost note: replies sent within 24 hours of a user's message are free service messages. Potluck only replies
to users who wrote in, so normal use stays in that free window.

## 6. SMS through AWS End User Messaging (optional)

US SMS needs 10DLC registration, which carries one-time and monthly fees, so it is off by default.

1. In the AWS console, open AWS End User Messaging SMS. Register a brand and a 10DLC campaign, or request a
   toll-free number and complete toll-free verification.
2. Request a phone number and associate it with the registration.
3. Deploy with SMS on:

   ```bash
   scripts/deploy.sh -c stage=prod -c smsEnabled=true -c smsOriginationNumber=+15551234567
   ```

4. Copy the `SmsInboundTopicArn` output. In End User Messaging, open the phone number, enable two-way SMS,
   choose Amazon SNS as the destination, and paste the topic ARN.

## 7. Stripe billing

1. In the Stripe dashboard, create two products with monthly recurring prices:
   - Plus at $4.00 per month.
   - Pro at $9.00 per month.
   Copy each price ID (`price_...`).

   Or with the Stripe CLI:

   ```bash
   stripe products create --name "Potluck Plus"
   stripe prices create --product prod_XXX --unit-amount 400 --currency usd -d "recurring[interval]=month"
   stripe products create --name "Potluck Pro"
   stripe prices create --product prod_YYY --unit-amount 900 --currency usd -d "recurring[interval]=month"
   ```

   Credit packs are charged as one-off payments created on the fly, so they need no products.
2. Developers → Webhooks → Add endpoint. Use the `StripeWebhookUrl` output and select these events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
3. Copy the signing secret (`whsec_...`).
4. In Settings → Billing → Customer portal, enable it so users can cancel and update cards.
5. Run `scripts/set-secrets.sh --stage prod` and fill `stripe-secret-key`, `stripe-webhook-secret`,
   `stripe-price-plus` and `stripe-price-pro`.

## 8. Keeping yt-dlp current

Video sites change often, and yt-dlp ships fixes quickly. When imports from one platform start failing:

```bash
npm run fetch:ytdlp && scripts/deploy.sh -c stage=prod
```

The script refreshes yt-dlp every time and keeps the existing ffmpeg; pass `--refresh-ffmpeg` to replace it too.

Imports that still fail after three attempts are marked failed, the sender gets a message, and the SQS
message lands in the dead-letter queue shown by the `IngestDlqUrl` output.

Some platforms block downloads from cloud IP ranges. Instagram is the most likely to do this. When a download is
blocked, the bot asks the user to send the video file itself, which always works. Paid download services or
proxies were deliberately left out; revisit only if blocked downloads become common.

## 9. Local development

```bash
VITE_PROXY_TARGET=https://<AppUrl host> npm run dev:web
```

Vite proxies `/api`, `/public` and `/config.json` to the deployed stack, and Cognito already allows
`http://localhost:5173/auth/callback`.

## 10. Tearing down

`cdk destroy` keeps the DynamoDB table, user pool and media bucket because they hold user data.
Delete them by hand if you really want them gone.

## 11. Continuous delivery

Every change goes through GitHub. Pull requests run the **Test**, **Secret scan** and **Synth** jobs in
`.github/workflows/pipeline.yml`, and `main` only accepts changes through a pull request with those checks green.
Merging to `main` runs the same checks again, then deploys to the `production` GitHub environment and smoke-tests
the live site.

There are no AWS keys in GitHub. The deploy job signs in with GitHub's OIDC token, which only the `production`
environment of `matt617/potluckhq` can exchange for the `potluck-github-deploy-production` role. That role can only
assume the CDK bootstrap roles. It is created once by hand:

```bash
cd infra && npx cdk deploy PotluckGithubDeploy -c githubRepo=matt617/potluckhq \
  -c githubSubjectPrefix="$(gh api repos/matt617/potluckhq/actions/oidc/customization/sub --jq .sub_claim_prefix)"
```

Deployment settings are GitHub environment variables on `production`:

| Variable | Purpose |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | Role the deploy job assumes |
| `AWS_REGION` | `us-east-1` |
| `DOMAIN_NAME` | `potluckhq.app` |
| `ALERT_EMAIL` | Receives CloudWatch alarms, the budget alert and forwarded support mail |
| `COGNITO_USE_SES` | `true` once SES production access is approved, so sign-up codes come from no-reply@potluckhq.app |

To require a manual approval before each production deploy, add yourself as a required reviewer on the
`production` environment in the repository settings.

Dependabot opens weekly update pull requests, and secret scanning with push protection blocks committed keys.

## 12. Email

SES sends from potluckhq.app with DKIM, a `mail.potluckhq.app` MAIL FROM domain and a DMARC policy, all created by
the stack. Mail to support@, privacy@, legal@ and hello@potluckhq.app is received by SES, stored for 30 days and
forwarded to `ALERT_EMAIL`. While the SES account is in the sandbox, it can only deliver to verified addresses, so
keep `COGNITO_USE_SES` false until production access is approved.

## 13. Alarms

CloudWatch alarms email `ALERT_EMAIL` through the `AlertTopicArn` SNS topic. Confirm the subscription email once.
They cover the dead-letter queue, Lambda errors and throttles, slow imports, API 5xx errors, Gemini spend over
$1.00 in an hour, failing imports, heavy rate limiting, and SES bounce and complaint rates.
