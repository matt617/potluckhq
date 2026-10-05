# Proxy plan for video downloads

Status: **tabled**. Code is ready in [PR #11](https://github.com/matt617/potluckhq/pull/11), not merged. Nothing changes in production until the PR is merged and the `download-proxies` parameter is set.

## Problem

The ingest worker Lambda runs yt-dlp from AWS IP ranges. TikTok, Instagram and YouTube treat those ranges as bots, so some imports fail with rate limits, login walls or "Sign in to confirm you're not a bot". Today the bot asks the user to send the video file instead, which always works but adds friction.

Pick this up again when blocked downloads become common. Watch the share of imports that end as "That platform blocked the download" in the worker logs.

## Approach

Send yt-dlp downloads through a pool of residential proxies. More AWS IPs won't help: each extra NAT gateway costs about $32/month and still gives a datacenter IP that the platforms already flag.

What PR #11 does:

- Reads proxy URLs from the SSM SecureString `/potluck/<stage>/download-proxies` (separated by commas or newlines; `http`, `https`, `socks5` or `socks5h`; credentials in the URL).
- Each import tries up to two proxies in random order, then a direct connection.
- Moves to the next route only on failures a new IP could fix: 403, 429 or 5xx responses, rate limits, bot checks, login walls, network or proxy errors, and timeouts. Bad links, private videos and the 20 minute limit fail straight away.
- All attempts share a 190 s budget (90 s each when there is a fallback), so the 5 minute worker still has time for Gemini.
- Proxy credentials are removed from logs and errors. Logs show `host:port` only.
- If the parameter is unset, behaviour is the same as today.
- Recipe web page fetches (`fetchPageText`) still go direct.

## Provider

Start with pay-as-you-go **residential** proxies from **IPRoyal** (traffic never expires) or **Decodo** (formerly Smartproxy). Reconsider Bright Data or Oxylabs only at much higher volume. If Instagram still blocks residential IPs, upgrade to **mobile** (4G/5G) proxies.

| Provider | Residential price (2026) | Notes |
|---|---|---|
| IPRoyal | ~$1.75–3.70/GB | Non-expiring traffic, sticky sessions, SOCKS5 |
| Decodo | from ~$2/GB | Good price-to-quality, well rated for TikTok and YouTube |
| Bright Data | from ~$2.50/GB | Largest pool, best compliance, heavier onboarding |
| Oxylabs | ~$8/GB | Enterprise; more than we need |
| DataImpulse | ~$1/GB | Cheapest; quality less proven |

Prices change often, so recheck before buying.

**Expected cost:** 480p clips are about 5–20 MB, so 10–20 GB per 1,000 imports, about $20–60/month. Only blocked downloads use more than one route.

## Must-know: use sticky sessions

YouTube's media URLs are tied to the IP that fetched the page, and TikTok's sometimes are. A gateway that changes IP on every request breaks downloads partway through. Configure **sticky sessions** of about 10 minutes and list several distinct session URLs, so each download keeps one IP and each retry gets a new one:

```
http://user-session-a1:PASS@gate.provider.com:7000,
http://user-session-b2:PASS@gate.provider.com:7000,
http://user-session-c3:PASS@gate.provider.com:7000,
http://user-session-d4:PASS@gate.provider.com:7000,
http://user-session-e5:PASS@gate.provider.com:7000
```

The exact username format varies by provider. Check their sticky-session docs.

## Steps when we pick this up

1. **Rebase PR #11** onto `main` and make sure CI passes. It only touches `downloader.ts`, `secrets.ts`, `set-secrets.sh`, `docs/setup.md` and a new test, so conflicts should be small.
2. **Buy a trial**: 1–2 GB of US residential traffic from IPRoyal or Decodo.
3. **Generate 5 sticky-session URLs** (about 10 minute sessions, US exit).
4. **Store them**: `scripts/set-secrets.sh --stage prod`, fill in `download-proxies`, and skip everything else.
5. **Merge PR #11**. Merging to `main` deploys production.
6. **Smoke test**: import one TikTok, one Instagram Reel, one YouTube Short and one Facebook video. In CloudWatch, check the ingest worker for `Download blocked, trying another route` and which route succeeded.
7. **Watch for a week**: the blocked-import rate, proxy GB used in the provider dashboard, and import duration (the existing alarm fires near the 5 minute timeout).

## Rollback

Delete the `download-proxies` parameter. Lambdas cache parameters for about 5 minutes per container, and downloads then go direct again. No deploy is needed.

## Follow-ups (not in PR #11)

- **YouTube bot check**: if YouTube still says "not a bot" through residential IPs, add yt-dlp's proof-of-origin token plugin (`bgutil-ytdlp-pot-provider`). It needs a helper service next to yt-dlp, which means layer and infra changes.
- **Metrics**: emit a CloudWatch metric per route outcome (proxy ok, proxy blocked, direct ok, all failed) so we can measure the proxies' effect instead of reading logs.
- **Per-platform routing**: send only platforms that block us (likely Instagram first) through proxies to cut cost.
- **Page fetches**: route `fetchPageText` through the pool too if recipe sites start blocking us. That needs an undici `ProxyAgent`.
- **Health tracking**: temporarily skip a proxy after repeated failures instead of picking it at random every time.

## Risks and open questions

- **Terms of service**: most platforms prohibit automated downloading and working around blocks. Decide whether we accept that risk before turning this on. The fallback (users send the file themselves) stays available either way.
- **Provider sourcing**: residential IPs come from consumer devices. Prefer providers that publish how they source and consent their IPs.
- **Privacy**: video URLs pass through the proxy provider. Mention a proxy subprocessor in the privacy policy if we enable this.
- **Cost spikes**: set a spend cap or low-balance alert in the provider dashboard.

## References

- [PR #11: Route video downloads through a rotating proxy pool](https://github.com/matt617/potluckhq/pull/11)
- [Proxyway: best TikTok proxies 2026](https://proxyway.com/best/proxies-for-tiktok)
- [Proxyway: YouTube proxies](https://proxyway.com/best/youtube-proxies)
- [Bright Data: best residential proxies 2026](https://brightdata.com/blog/proxy-101/best-residential-proxy-providers)
- [bgutil-ytdlp-pot-provider](https://pypi.org/project/bgutil-ytdlp-pot-provider)
