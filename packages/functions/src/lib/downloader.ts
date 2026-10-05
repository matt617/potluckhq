import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from './env.js';
import { RetryableError, UserFacingError } from './gemini.js';

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

/**
 * Download a social video with yt-dlp into /tmp. Picks a small file with audio, merging
 * separate video and audio streams with the bundled ffmpeg when needed. Video is deleted by `cleanup`; only technique
 * videos are kept, as a separate copy made by media.ts.
 */
export async function downloadVideo(url: string): Promise<DownloadedVideo> {
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
    '-o',
    join(dir, 'video.%(ext)s'),
    url,
  ];
  const { code, stderr } = await run(env.ytdlpPath, args, 170_000);
  const files = await readdir(dir);
  const video = files.find((f) => f.startsWith('video.') && !/\.(json|part|ytdl)$/.test(f) && !/\.f\d+\./.test(f));
  if (code !== 0 || !video) {
    await cleanup();
    throw classifyYtdlpError(stderr);
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
    path: join(dir, video),
    mimeType,
    dir,
    caption: caption || undefined,
    title: typeof info.title === 'string' ? info.title : undefined,
    author: (typeof info.uploader === 'string' && info.uploader) || (typeof info.channel === 'string' && info.channel) || undefined,
    thumbnailUrl: typeof info.thumbnail === 'string' ? info.thumbnail : undefined,
    durationSec: typeof info.duration === 'number' ? info.duration : undefined,
    cleanup,
  };
}

export function classifyYtdlpError(stderr: string): Error {
  const s = stderr.toLowerCase();
  if (s.includes('does not pass filter') || s.includes('duration')) return new UserFacingError('That video is longer than 20 minutes, which is too long to analyze.', 'too_long');
  if (s.includes('login') || s.includes('private') || s.includes('cookies') || s.includes('rate-limit') || s.includes('rate limit')) {
    return new UserFacingError('That platform blocked the download (it may be private or require login). Try saving the video and sending the file itself, or paste the caption text.', 'blocked');
  }
  if (s.includes('unsupported url')) return new UserFacingError('That link is not a supported video. Try a TikTok, Instagram, YouTube, Facebook or Pinterest link.', 'unsupported');
  if (s.includes('http error 5') || s.includes('timed out') || s.includes('connection')) return new RetryableError(`yt-dlp transient failure: ${stderr.slice(-300)}`);
  return new UserFacingError('Could not download that video. If it is public, try again later or send the video file directly.', 'download');
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: { ...process.env, HOME: '/tmp', XDG_CACHE_HOME: '/tmp' } });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr = (stderr + d.toString()).slice(-8000);
    });
    child.stdout.on('data', () => undefined);
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stderr: String(err) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
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
  if (!res.ok) throw new UserFacingError(`That page returned an error (${res.status}).`, 'download');
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
