# Potluck

Turn cooking videos into a shared recipe book, a weekly meal plan and a shopping list for a small
community: a household, an office, or a group of friends.

Send a TikTok, Instagram, YouTube, Facebook or Pinterest link, a recipe website, a photo of a cookbook page,
or a saved video to the Potluck bot on Telegram, WhatsApp or SMS. Gemini watches the whole video and
writes out the exact ingredients and steps. Then plan the week together, optionally with AI that
works around travel, long work days, long weekends, GLP-1 medication or a workout routine, and get one
merged shopping list.

Inspired by [video-to-recipe-bot](https://github.com/matt617/video-to-recipe-bot), rebuilt on AWS serverless
so it costs almost nothing until people use it.

## What's here

| Path | What it is |
|---|---|
| `packages/core` | Shared types, tiers, AI metering, unit conversion, shopping list merging |
| `packages/functions` | Lambda handlers: web API, chat and Stripe webhooks, import worker, inbound SMS |
| `packages/web` | React installable web app |
| `infra` | AWS CDK stack |
| `scripts` | Deploy, secrets, yt-dlp/ffmpeg fetch, Telegram webhook |
| `docs/architecture.md` | Design, data model, API contract, cost shape |
| `docs/setup.md` | Step-by-step setup for AWS, Gemini, Telegram, WhatsApp, SMS and Stripe |

## Plans

| | Free | Plus | Pro |
|---|---|---|---|
| Price | $0 | $4/month | $9/month |
| Communities you own | 1 | 3 | 10 |
| Members per community | 2 | 6 | 20 |
| Recipe imports per month | 15 | 300 | 1000 |
| AI meal planning | No | Yes | Yes |
| AI spend included | Platform absorbs imports | $2.00/month | $2.00/month |

After the included $2.00 of model spend, AI features stop until the owner buys a credit pack.
Only cheap models on the allowlist in `packages/core/src/metering.ts` can run. Edit
`packages/core/src/tiers.ts` to change limits or prices.

## Quick start

```bash
npm install
npm test                       # unit, handler and infrastructure tests
npm run typecheck
npx -w @potluck/infra cdk bootstrap      # once per AWS account and region
scripts/deploy.sh -c stage=prod -c alertEmail=you@example.com
scripts/set-secrets.sh --stage prod      # Gemini key, bot tokens, Stripe keys
scripts/set-telegram-webhook.sh --stage prod
```

See `docs/setup.md` for each channel and for billing.
