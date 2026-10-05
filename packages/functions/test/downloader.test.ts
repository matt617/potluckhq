import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { downloadVideo, parseProxies, proxyLabel, redactProxy, routePlan, shouldRotate } from '../src/lib/downloader.js';
import { setSecretsForTest } from '../src/lib/secrets.js';

describe('proxy configuration', () => {
  it('parses proxies separated by newlines, commas or spaces and drops invalid entries', () => {
    expect(parseProxies('http://a:1\nsocks5h://u:p@b:2, https://c:3  ftp://d:4 nonsense')).toEqual([
      'http://a:1',
      'socks5h://u:p@b:2',
      'https://c:3',
    ]);
    expect(parseProxies(undefined)).toEqual([]);
  });

  it('goes direct when no proxies are configured', () => {
    expect(routePlan([])).toEqual([null]);
  });

  it('tries two proxies in random order, then direct', () => {
    const plan = routePlan(['http://a:1', 'http://b:1', 'http://c:1'], () => 0);
    expect(plan).toHaveLength(3);
    expect(new Set(plan.slice(0, 2)).size).toBe(2);
    expect(plan[2]).toBeNull();
  });

  it('retries a single rotating gateway before going direct', () => {
    expect(routePlan(['http://gw:1'])).toEqual(['http://gw:1', 'http://gw:1', null]);
  });

  it('rotates on blocks and network errors but not on bad links', () => {
    expect(shouldRotate('ERROR: HTTP Error 429: Too Many Requests')).toBe(true);
    expect(shouldRotate("Sign in to confirm you're not a bot")).toBe(true);
    expect(shouldRotate('Requested content is not available, rate-limit reached or login required')).toBe(true);
    expect(shouldRotate('Unable to connect to proxy')).toBe(true);
    expect(shouldRotate('ERROR: Unsupported URL: https://example.com')).toBe(false);
    expect(shouldRotate('video does not pass filter (duration < 1200)')).toBe(false);
    expect(shouldRotate('ERROR: Private video')).toBe(false);
  });

  it('never exposes proxy credentials', () => {
    const proxy = 'http://user:s3cret@proxy.example.net:8000';
    expect(proxyLabel(proxy)).toBe('proxy.example.net:8000');
    const text = redactProxy(`failed via ${proxy} and http://other:pw@x.example:1`, proxy);
    expect(text).not.toContain('s3cret');
    expect(text).not.toContain(':pw@');
  });
});

describe('downloadVideo routing', () => {
  let dir: string;
  const log = () => readFile(join(dir, 'calls.log'), 'utf8').then((s) => s.trim().split('\n'));

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fake-ytdlp-'));
    // Fake yt-dlp: records the proxy it was given; "blocked" proxies get a 429, anything else writes a video.
    const script = `#!/bin/sh
proxy=direct; out=""
while [ $# -gt 0 ]; do
  case "$1" in --proxy) proxy="$2"; shift ;; -o) out="$2"; shift ;; esac
  shift
done
echo "$proxy" >> "${dir}/calls.log"
case "$proxy" in *blocked*) echo "ERROR: HTTP Error 429: Too Many Requests via $proxy" >&2; exit 1 ;; esac
if [ "$proxy" = direct ] && [ -n "$FAKE_BLOCK_DIRECT" ]; then echo "ERROR: HTTP Error 403: Forbidden" >&2; exit 1; fi
d=$(dirname "$out"); echo video > "$d/video.mp4"; echo '{"title":"Shakshuka","duration":60}' > "$d/video.info.json"
`;
    await writeFile(join(dir, 'yt-dlp'), script);
    await chmod(join(dir, 'yt-dlp'), 0o755);
    process.env.YTDLP_PATH = join(dir, 'yt-dlp');
  });
  beforeEach(async () => {
    await rm(join(dir, 'calls.log'), { force: true });
    delete process.env.FAKE_BLOCK_DIRECT;
  });
  afterAll(async () => {
    setSecretsForTest(null);
    delete process.env.YTDLP_PATH;
    await rm(dir, { recursive: true, force: true });
  });

  it('downloads directly when no proxies are set', async () => {
    setSecretsForTest({});
    const v = await downloadVideo('https://www.tiktok.com/@a/video/1');
    await v.cleanup();
    expect(v.title).toBe('Shakshuka');
    expect(await log()).toEqual(['direct']);
  });

  it('moves to another proxy when one is rate limited', async () => {
    setSecretsForTest({ 'download-proxies': 'http://u:p@blocked.example:1\nhttp://u:p@good.example:1' });
    const v = await downloadVideo('https://www.tiktok.com/@a/video/1');
    await v.cleanup();
    const calls = await log();
    expect(calls.at(-1)).toBe('http://u:p@good.example:1');
    expect(calls).not.toContain('direct');
  });

  it('falls back to direct, and hides credentials when everything fails', async () => {
    process.env.FAKE_BLOCK_DIRECT = '1';
    setSecretsForTest({ 'download-proxies': 'http://u:s3cret@blocked.example:1' });
    const err: unknown = await downloadVideo('https://www.tiktok.com/@a/video/1').then(
      () => null,
      (e: unknown) => e,
    );
    expect(await log()).toEqual(['http://u:s3cret@blocked.example:1', 'http://u:s3cret@blocked.example:1', 'direct']);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain('s3cret');
  });
});
