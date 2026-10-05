import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from './env.js';
import { RetryableError, UserFacingError } from './gemini.js';
import { secrets } from './secrets.js';

export interface DownloadedVideo {
  path: string;
  mimeType: string;
  dir: string;
  caption?: string;
  title?: string;
  author?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  cleanup: () => Promise<void>;
}

/** Longest video we will analyze; caps Gemini spend per import. */
export const MAX_DURATION_SEC = 20 * 60;

/** Total time for all download attempts; leaves room for Gemini inside the 5 minute worker. */
const DOWNLOAD_BUDGET_MS = 190_000;
/** Cap for a single attempt when there is somewhere else to fall back to. */
const ROUTED_ATTEMPT_MS = 90_000;
const SOLO_ATTEMPT_MS = 170_000;
const MIN_ATTEMPT_MS = 30_000;
/** Proxy attempts before the final direct attempt. */
const PROXY_ATTEMPTS = 2;
const PROXY_SCHEMES = new Set(['http:', 'https:', 'socks5:', 'socks5h:']);

/** Parse the download-proxies parameter: proxy URLs separated by newlines, commas or spaces. Invalid entries are dropped. */
export function parseProxies(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => {
      try {
        return PROXY_SCHEMES.has(new URL(s).protocol);
      } catch {
        return false;
      }
    });
}

/**
 * Routes to try for one download: proxies in a random order, then a direct connection as a last resort.
 * A single rotating gateway is tried twice, since providers hand out a new exit IP per connection.
 */
export function routePlan(proxies: string[], random: () => number = Math.random): (string | null)[] {
  if (!proxies.length) return [null];
  const pool = [...proxies];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return [...Array.from({ length: PROXY_ATTEMPTS }, (_, i) => pool[i % pool.length]!), null];
}

/** Failures a different exit IP might fix: blocks, rate limits, bot checks and network or proxy errors. */
export function shouldRotate(stderr: string): boolean {
  const s = stderr.toLowerCase();
  if (s.includes('unsupported url') || s.includes('does not pass filter') || s.includes('private video')) return false;
  return /http error (403|429|5\d\d)|rate.?limit|too many requests|not a bot|sign in to confirm|login|cookies|timed out|connection|proxy|tunnel/.test(s);
}

/** Host and port only, so proxy credentials never reach logs or error messages. */
export function proxyLabel(proxy: string): string {
  try {
    const u = new URL(proxy);
    return `${u.hostname}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return 'proxy';
  }
}

export function redactProxy(text: string, proxy: string | null): string {
  const out = proxy ? text.split(proxy).join(proxyLabel(proxy)) : text;
  return out.replace(/\/\/[^\s/@:]+:[^\s/@]+@/g, '//***@');
}

async function configuredProxies(): Promise<string[]> {
  try {
    return parseProxies((await secrets())['download-proxies']);
  } catch {
    return [];
  }
}

/**
 * Download a social video with yt-dlp into /tmp. Picks a small file with audio, merging
 * separate video and audio streams with the bundled ffmpeg when needed. Video is deleted by `cleanup` and never stored.
 * When the download-proxies parameter is set, each import leaves through a randomly chosen proxy and moves to
 * another one if the platform blocks or rate-limits it.
 */
export async function downloadVideo(url: string): Promise<DownloadedVideo> {
  const plan = routePlan(await configuredProxies());
  const deadline = Date.now() + DOWNLOAD_BUDGET_MS;
  let stderr = '';
  for (const [i, proxy] of plan.entries()) {
    const remaining = deadline - Date.now();
    if (i > 0 && remaining < MIN_ATTEMPT_MS) break;
    const result = await attempt(url, proxy, Math.min(plan.length > 1 ? ROUTED_ATTEMPT_MS : SOLO_ATTEMPT_MS, remaining));
    if ('video' in result) return result.video;
    stderr = result.stderr;
    if (i === plan.length - 1 || !(result.timedOut || shouldRotate(stderr))) break;
    console.warn('Download blocked, trying another route', { attempt: i + 1, via: proxy ? proxyLabel(proxy) : 'direct' });
  }
  throw classifyYtdlpError(stderr);
}

async function attempt(
  url: string,
  proxy: string | null,
  timeoutMs: number,
): Promise<{ video: DownloadedVideo } | { stderr: string; timedOut: boolean }> {
  const dir = await mkdtemp(join(tmpdir(), 'dl-'));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '--no-mtime',
    '--restrict-filenames',
    // 480p is plenty for Gemini at low media resolution and keeps downloads small.
    // Prefer one file with audio; otherwise merge separate streams with ffmpeg.
    '-f',
    'b[height<=480][vcodec!=none][acodec!=none]/bv*[height<=480][ext=mp4]+ba[ext=m4a]/bv*[height<=480]+ba/b[height<=720]/bv*+ba/b',
    '--merge-output-format',
    'mp4',
    '--ffmpeg-location',
    env.ffmpegDir,
    '--max-filesize',
    '250M',
    '--match-filter',
    `duration <? ${MAX_DURATION_SEC}`,
    '--write-info-json',
    '--socket-timeout',
    '20',
    '--retries',
    '2',
    ...(proxy ? ['--proxy', proxy] : []),
    '-o',
    join(dir, 'video.%(ext)s'),
    url,
  ];
  const { code, stderr, timedOut } = await run(env.ytdlpPath, args, timeoutMs);
  const files = await readdir(dir);
  const video = files.find((f) => f.startsWith('video.') && !/\.(json|part|ytdl)$/.test(f) && !/\.f\d+\./.test(f));
  if (code !== 0 || !video) {
    await cleanup();
    return { stderr: redactProxy(stderr, proxy), timedOut };
  }
  let info: Record<string, unknown> = {};
  const infoFile = files.find((f) => f.endsWith('.info.json'));
  if (infoFile) {
    try {
      info = JSON.parse(await readFile(join(dir, infoFile), 'utf8'));
    } catch {
      info = {};
    }
  }
  const ext = video.split('.').pop()!.toLowerCase();
  const mimeType = ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  const caption = [info.title, info.description].filter((s) => typeof s === 'string' && s.trim()).join('\n\n');
  return {
    video: {
      path: join(dir, video),
      mimeType,
      dir,
      caption: caption || undefined,
      title: typeof info.title === 'string' ? info.title : undefined,
      author: (typeof info.uploader === 'string' && info.uploader) || (typeof info.channel === 'string' && info.channel) || undefined,
      thumbnailUrl: typeof info.thumbnail === 'string' ? info.thumbnail : undefined,
      durationSec: typeof info.duration === 'number' ? info.duration : undefined,
      cleanup,
    },
  };
}

export function classifyYtdlpError(stderr: string): Error {
  const s = stderr.toLowerCase();
  if (s.includes('does not pass filter') || s.includes('duration')) return new UserFacingError('That video is longer than 20 minutes, which is too long to analyze.');
  if (s.includes('login') || s.includes('private') || s.includes('cookies') || s.includes('rate-limit') || s.includes('rate limit')) {
    return new UserFacingError('That platform blocked the download (it may be private or require login). Try saving the video and sending the file itself, or paste the caption text.');
  }
  if (s.includes('unsupported url')) return new UserFacingError('That link is not a supported video. Try a TikTok, Instagram, YouTube, Facebook or Pinterest link.');
  if (s.includes('http error 5') || s.includes('timed out') || s.includes('connection')) return new RetryableError(`yt-dlp transient failure: ${stderr.slice(-300)}`);
  return new UserFacingError('Could not download that video. If it is public, try again later or send the video file directly.');
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: { ...process.env, HOME: '/tmp', XDG_CACHE_HOME: '/tmp' } });
    let stderr = '';
    let timedOut = false;
    child.stderr.on('data', (d) => {
      stderr = (stderr + d.toString()).slice(-8000);
    });
    child.stdout.on('data', () => undefined);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stderr: String(err), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr, timedOut });
    });
  });
}

/** Fetch a web page and reduce it to readable text plus its preview image. */
export async function fetchPageText(url: string): Promise<{ text: string; imageUrl?: string; title?: string }> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; PotluckRecipeBot/1.0)', accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new UserFacingError(`That page returned an error (${res.status}).`);
  const html = (await res.text()).slice(0, 2_000_000);
  const meta = (prop: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)`, 'i'))?.[1];
  // Structured recipe data is the most reliable text on recipe blogs; keep it verbatim.
  const ldJson = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!.trim()).join('\n');
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|footer|header|aside)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|li|h\d|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return {
    text: `${ldJson ? `Structured data:\n${ldJson.slice(0, 30_000)}\n\n` : ''}Page text:\n${text.slice(0, 60_000)}`,
    imageUrl: meta('og:image'),
    title: meta('og:title'),
  };
}
