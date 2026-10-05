# Potluck architecture

Potluck turns cooking videos into recipes and techniques people can keep privately, plan and shop with
in a kitchen, or exchange through recipe circles. It is built to cost close to nothing when
idle and to scale with real usage.

See [Kitchens and recipe circles implementation](kitchen-implementation.md) for ownership, privacy,
new API contracts and the required migration procedure.

## Cost shape

| Piece | Service | Idle cost |
|---|---|---|
| Web app | S3 + CloudFront | ~$0 |
| API | API Gateway HTTP API + Lambda (arm64) | $0 |
| Data | DynamoDB on-demand, one table | $0 |
| Auth | Cognito user pool | $0 under 10k MAU |
| Ingest queue | SQS + DLQ | $0 |
| Secrets | SSM Parameter Store standard | $0 |
| Video download | yt-dlp + static ffmpeg in a Lambda layer | $0 |
| Recipe extraction | Gemini Flash-Lite, full video plus caption every time, low media resolution | ~$0.001–0.005 per video |

Variable cost is dominated by Gemini calls and WhatsApp/SMS messages. Every Gemini call is metered in
micro-USD against the paying account.

## Request flow

```
Telegram / WhatsApp / SMS ──► /webhooks/* ──► webhooks Lambda ──┐
Web app ──► /api/* (JWT) ──► api Lambda ────────────────────────┼─► DynamoDB
                                                                └─► SQS ingest ─► worker Lambda
worker: yt-dlp download to /tmp at ≤480p (YouTube goes to Gemini by URL) ─► Gemini ─► Recipe ─► reply on channel
```

One CloudFront distribution serves everything on one origin, so the browser never needs CORS:

| Path | Origin |
|---|---|
| `/*` | web bucket (SPA, 404 → `/index.html`) |
| `/media/*` | media bucket, thumbnails only (keys start with `media/`) |
| `/api/*`, `/public/*`, `/webhooks/*` | HTTP API, caching disabled, all methods |

## Lambda handlers

All in `packages/functions/src/handlers/`, each exporting `handler`. Node 24, arm64, bundled with esbuild.

| File | Trigger | Notes |
|---|---|---|
| `api.ts` | HTTP API `ANY /api/{proxy+}` with Cognito JWT authorizer, and `GET /public/{proxy+}` without auth | Router for the web app |
| `webhooks.ts` | HTTP API `ANY /webhooks/{proxy+}`, no authorizer | Telegram, WhatsApp, Stripe; each verifies its own signature |
| `worker.ts` | SQS ingest queue, batch size 1 | 1536 MB, 5 min timeout, 2 GB ephemeral storage, layer with `/opt/bin/yt-dlp` and `/opt/bin/ffmpeg` |
| `sms.ts` | SNS topic fed by AWS End User Messaging inbound SMS | Only deployed when `smsEnabled` context is true |

## Environment variables

| Name | Used by | Meaning |
|---|---|---|
| `STAGE` | all | e.g. `prod` |
| `TABLE_NAME` | all | DynamoDB table |
| `MEDIA_BUCKET` | api, worker | Private bucket for uploads and thumbnails |
| `INGEST_QUEUE_URL` | api, webhooks, sms | SQS queue |
| `PARAM_PREFIX` | all | SSM prefix, e.g. `/potluck/prod/` |
| `APP_URL` | all | Public origin, e.g. `https://d123.cloudfront.net` |
| `GEMINI_MODEL` | worker, api | Default `gemini-flash-lite-latest`; must be on the allowlist in `@potluck/core` |
| `SMS_ENABLED` | all | `true` or `false` |
| `SMS_ORIGINATION_NUMBER` | all | E.164 number when SMS is enabled |
| `YTDLP_PATH` | worker | `/opt/bin/yt-dlp` |
| `FFMPEG_DIR` | worker | `/opt/bin`, used by yt-dlp to merge separate video and audio streams |
| `SES_FROM_EMAIL` | api | Optional; invite emails are skipped when empty |
| `HOME`, `XDG_CACHE_HOME` | worker | `/tmp` so yt-dlp can write its cache |

## SSM parameters

Read at cold start with `GetParametersByPath` under `PARAM_PREFIX`, decrypted. A missing parameter disables
that feature instead of failing. Set them with `scripts/set-secrets.sh`.

`gemini-api-key`, `telegram-bot-token`, `telegram-webhook-secret`, `telegram-bot-username`,
`whatsapp-token`, `whatsapp-phone-number-id`, `whatsapp-app-secret`, `whatsapp-verify-token`,
`whatsapp-number`, `stripe-secret-key`, `stripe-webhook-secret`, `stripe-price-plus`, `stripe-price-pro`.

## Media bucket keys

| Prefix | Lifetime | Purpose |
|---|---|---|
| `uploads/<userId>/` | expires after 7 days | Photo uploads for cookbook pages and comment screenshots |
| `media/thumbs/` | kept | Recipe thumbnails, served at `/media/*`. Video imports use the frame Gemini picks as most appetizing (`<hash>-hero.jpg`) |
| `private/techniques/<recipeId>/` | until the technique or its owner is deleted | Technique videos: `video.mp4` (faststart remux), `clip-<n>.mp4` muted step loops and `clip-<n>.jpg` posters. Never served from `/media`; the API returns one-hour presigned URLs to readers |

Recipe videos are never stored. They live in the worker's `/tmp` for the length of one invocation. Technique videos
(content Gemini classifies as teaching a method, such as velveting) are kept under `private/` for playback.
The bucket allows CORS `PUT` from `APP_URL` and `http://localhost:5173` for presigned uploads.

## DynamoDB single-table design

Table keys `pk`, `sk`; one GSI `gsi1` on `gsi1pk`, `gsi1sk`; TTL attribute `ttl`.

| Entity | pk | sk | gsi1pk / gsi1sk |
|---|---|---|---|
| User profile | `USER#<id>` | `PROFILE` | |
| Linked channel | `CHANNEL#<kind>#<address>` | `LINK` | `USER#<id>` / `CHANNEL#<kind>#<address>` |
| Link code | `LINKCODE#<code>` | `CODE` | (ttl 15 min) |
| Community | `COMM#<id>` | `META` | |
| Membership | `COMM#<id>` | `MEMBER#<userId>` | `USER#<userId>` / `COMM#<id>` |
| Invite | `INVITE#<token>` | `INVITE` | (ttl 7 days) |
| Recipe | `RECIPE#<id>` | `META` | `USER#<ownerId>` / `RECIPE#<createdAt>` |
| Community recipe summary | `COMM#<id>` | `RECIPE#<recipeId>` | |
| Import job | `IMPORT#<id>` | `META` | `USER#<userId>` / `IMPORT#<createdAt>` (ttl 30 days) |
| Extraction cache | `CACHE#<urlHash>` | `EXTRACT` | (ttl 180 days) |
| Meal plan | `COMM#<id>` | `PLAN#<weekStart>` | |
| Shopping list | `COMM#<id>` | `LIST#<weekStart>` | |
| AI ledger entry | `USER#<id>` | `LEDGER#<iso>#<rand>` | (ttl 400 days) |
| Stripe customer | `STRIPECUST#<customerId>` | `MAP` | |
| Processed webhook | `EVENT#<provider>#<id>` | `SEEN` | (ttl 3 days) |

## HTTP API

Request and response types live in `packages/core/src/api.ts`. Errors are `{ error, code? }`.
Quota errors use status 402 with code `ai_tier`, `ai_allowance`, `import_quota` or `tier_limit`.

Authenticated, under `/api`:

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/me` | → `MeResponse` (creates the profile on first call) |
| PATCH | `/api/me` | `UpdateMeRequest` → `MeResponse` |
| POST | `/api/me/link-code` | → `LinkCodeResponse` |
| DELETE | `/api/me/channels/{kind}/{address}` | → `{ ok }` |
| POST | `/api/communities` | `CreateCommunityRequest` → `Community` |
| GET | `/api/communities/{cid}` | → `CommunityDetail` |
| PATCH | `/api/communities/{cid}` | `UpdateCommunityRequest` → `Community` |
| DELETE | `/api/communities/{cid}` | → `{ ok }` owner only |
| POST | `/api/communities/{cid}/invites` | `CreateInviteRequest` → `InviteResponse` |
| PATCH | `/api/communities/{cid}/members/{uid}` | `{ role }` → `Membership` |
| DELETE | `/api/communities/{cid}/members/{uid}` | → `{ ok }` admin, or self to leave |
| POST | `/api/invites/{token}/accept` | → `Community` |
| GET | `/api/communities/{cid}/recipes` | → `RecipeListResponse` |
| DELETE | `/api/communities/{cid}/recipes/{rid}` | → `{ ok }` |
| POST | `/api/uploads` | `UploadUrlRequest` → `UploadUrlResponse` |
| POST | `/api/imports` | `CreateImportRequest` → `ImportJob` |
| GET | `/api/imports` | → `ImportsResponse` |
| GET | `/api/imports/{id}` | → `ImportJob` |
| GET | `/api/recipes/{rid}` | → `RecipeResponse` |
| PATCH | `/api/recipes/{rid}` | `UpdateRecipeRequest` → `RecipeResponse` |
| DELETE | `/api/recipes/{rid}` | → `{ ok }` owner only |
| POST | `/api/recipes/{rid}/share` | `ShareRecipeRequest` → `{ ok, recipe }` (independent copy) |
| GET | `/api/communities/{cid}/plans/{week}` | → `PlanResponse` (empty plan if none) |
| PUT | `/api/communities/{cid}/plans/{week}` | `SavePlanRequest` → `PlanResponse` |
| POST | `/api/communities/{cid}/plans/{week}/suggest` | `SuggestPlanRequest` → `SuggestPlanResponse` |
| GET | `/api/communities/{cid}/lists/{week}` | → `ShoppingListResponse` (empty list if none) |
| POST | `/api/communities/{cid}/lists/{week}/generate` | `{ preview: true }` or `{ planFingerprint }` → `ShoppingListResponse` |
| POST | `/api/communities/{cid}/lists/{week}/items` | `AddShoppingItemRequest` → `ShoppingListResponse` |
| PATCH | `/api/communities/{cid}/lists/{week}/items/{key}` | `PatchShoppingItemRequest` → `ShoppingListResponse` (key URI-encoded) |
| POST | `/api/communities/{cid}/lists/{week}/send` | → `{ ok, sentTo }` sends to the caller's linked chat |
| POST | `/api/billing/checkout` | `CheckoutRequest` → `UrlResponse` |
| POST | `/api/billing/portal` | → `UrlResponse` |

Public, no auth: `GET /public/config` → `PublicConfig`, `GET /public/invites/{token}` → `InvitePreview`.

Webhooks, no auth: `POST /webhooks/telegram`, `GET|POST /webhooks/whatsapp`, `POST /webhooks/stripe`.

## Web app runtime config

The SPA fetches `/config.json` at startup, written by the CDK deployment:

```json
{ "region": "us-east-1", "userPoolId": "...", "clientId": "...", "cognitoDomain": "https://<prefix>.auth.us-east-1.amazoncognito.com" }
```

Login uses the Cognito managed login page with OAuth authorization code + PKCE. The redirect URI is
`<origin>/auth/callback` and the sign-out URI is `<origin>/`. The API base is the same origin. For local
development, Vite proxies `/api`, `/public` and `/config.json` to `VITE_PROXY_TARGET`.

Thumbnail URLs are `PublicConfig.mediaBaseUrl + recipe.thumbnailKey`.

## Tiers and AI

Defined in `packages/core/src/tiers.ts`.

| Tier | Price | Communities | Members each | Imports/month | AI planning | AI allowance |
|---|---|---|---|---|---|---|
| Free | $0 | 1 | 2 | 15 | No | none, platform absorbs import cost |
| Plus | $4 | 3 | 6 | 300 | Yes | $2.00 of model cost |
| Pro | $9 | 10 | 20 | 1000 | Yes | $2.00 of model cost |

A community's limits and AI spend belong to its owner. After the monthly allowance is spent, AI stops
until the owner buys a credit pack. Only models on the allowlist in `metering.ts` can run.

## Import pipeline details

1. A link, photo, video or text arrives from the web app or a chat and becomes an import job in SQS.
2. If the same link is already in that community, the user is pointed at the existing recipe. No AI is spent.
3. If any community imported the same link before, the cached extraction is reused. No AI is spent and no
   import is counted against the quota.
4. Otherwise the worker downloads the video and sends the whole video plus its caption to Gemini Flash-Lite
   at low media resolution. YouTube links go to Gemini by URL with no download. Recipe websites are fetched
   and their text, including structured recipe data, is sent instead. Videos under 14 MB go inline; larger
   ones use the Gemini Files API and are deleted right after.
5. The structured result is sanitized, saved, shared into the community and cached globally by normalized URL.
6. The cost is metered to the community owner and the sender is messaged on the channel they used.

Uploaded photos and videos are deleted from S3 as soon as the job finishes. A transient failure keeps
them for the retry.

## Confirmed product decisions (2026-10-04)

- Free users can import recipes, up to 15 per month, with the platform paying. They get no AI planning or
  suggestions, and cannot buy credits.
- Paid owners get $2.00 of model spend per month. After that, AI stops until they buy a credit pack.
  Packs carry a margin: $5 buys $2.50 of spend and $10 buys $5.50.
- Extraction always sends the full video plus caption to a cheap, fast Gemini model.
- No paid third-party download services. If platforms block downloads from AWS, users send the video
  file instead. Revisit only if blocking becomes common.
- "Potluck" is the working product name.

## Web design system

Calm, minimal, editorial. Defined as tokens at the top of `packages/web/src/styles.css`, with light and dark
modes that follow the system setting.

- **Type:** Geist for text and Geist Mono for amounts, codes and timestamps, both self-hosted.
- **Color:** one warm-neutral gray family plus a single herb-green accent. Primary buttons are near-black.
  Status colors are pale pastels.
- **Shape:** containers 12px, buttons and inputs 8px, tags and chips fully round.
- **Icons:** Phosphor. No emoji in the interface.
- **Motion:** short fades and rises on `transform` and `opacity` only, all disabled for reduced-motion users.
- **Loading:** skeletons shaped like the content they replace.
- **Photos:** public-domain images in `packages/web/public/images`, credited in `CREDITS.md` there.
