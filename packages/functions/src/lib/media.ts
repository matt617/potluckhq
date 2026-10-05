import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HeroMoment, Recipe, Step, StoredVideo, VideoClip } from '@potluck/core';
import { env } from './env.js';
import { copyObject, deleteObject, putObject } from './s3.js';

/** Frames below this size are almost always black, blank or heavily blurred. */
const MIN_FRAME_BYTES = 12_000;
const CLIP_MIN_SEC = 2;
const CLIP_MAX_SEC = 10;
const CLIP_DEFAULT_SEC = 6;
const MAX_CLIPS = 12;
/** Whole budget for cutting and uploading technique media inside the worker. */
const MEDIA_BUDGET_MS = 100_000;
const PRIVATE_CACHE = 'private, max-age=31536000, immutable';

const ffmpegPath = () => join(env.ffmpegDir, 'ffmpeg');

function ffmpeg(args: string[], timeoutMs = 30_000): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath(), ['-hide_banner', '-nostdin', ...args]);
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr = (stderr + d.toString()).slice(-8000);
    });
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

/** Duration from ffmpeg's input banner; ffprobe is not bundled in the Lambda layer. */
export async function probeDuration(path: string): Promise<number | undefined> {
  const { stderr } = await ffmpeg(['-i', path], 15_000);
  const m = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined;
}

/**
 * Times to sample for the preview image, grouped by Gemini's ranked moments. Each moment gets a small spread
 * because model timestamps are approximate. Without moments, sample late in the video, where the finished dish usually is.
 */
export function heroCandidates(moments: HeroMoment[] | undefined, durationSec?: number): number[][] {
  const max = durationSec ? Math.max(0, durationSec - 0.2) : Number.POSITIVE_INFINITY;
  const clamp = (t: number) => Math.round(Math.min(max, Math.max(0, t)) * 100) / 100;
  const groups = (moments ?? []).slice(0, 3).map((m) => [...new Set([m.timestampSec - 0.75, m.timestampSec, m.timestampSec + 0.75].map(clamp))]);
  if (groups.length) return groups;
  if (!durationSec) return [[1]];
  return [[0.85, 0.7, 0.5].map((f) => clamp(durationSec * f))];
}

/**
 * Pick the preview frame: the sharpest frame (largest JPEG, a cheap detail proxy) around the best-ranked moment
 * that yields a usable image. Returns JPEG bytes, or undefined when no frame could be read.
 */
export async function pickHeroFrame(videoPath: string, moments: HeroMoment[] | undefined, durationSec?: number): Promise<Uint8Array | undefined> {
  const dir = await mkdtemp(join(tmpdir(), 'hero-'));
  try {
    for (const [g, group] of heroCandidates(moments, durationSec).entries()) {
      let best: Uint8Array | undefined;
      for (const [i, t] of group.entries()) {
        const out = join(dir, `${g}-${i}.jpg`);
        const { code } = await ffmpeg(['-ss', String(t), '-i', videoPath, '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-q:v', '3', '-y', out]);
        if (code !== 0) continue;
        const bytes = await readFile(out).catch(() => undefined);
        if (bytes && bytes.length >= MIN_FRAME_BYTES && (!best || bytes.length > best.length)) best = bytes;
      }
      if (best) return best;
    }
    return undefined;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Clip ranges for technique steps: one short window per step that has a start time, inside the video. */
export function planClips(steps: Step[], durationSec?: number): { startSec: number; endSec: number }[] {
  const out: { startSec: number; endSec: number }[] = [];
  const seen = new Set<number>();
  for (const s of steps) {
    if (typeof s.timestampSec !== 'number' || seen.has(s.timestampSec)) continue;
    const start = s.timestampSec;
    if (durationSec !== undefined && start >= durationSec - 0.5) continue;
    let end = typeof s.endSec === 'number' && s.endSec > start ? s.endSec : start + CLIP_DEFAULT_SEC;
    end = Math.min(end, start + CLIP_MAX_SEC);
    if (durationSec !== undefined) end = Math.min(end, durationSec);
    if (end - start < CLIP_MIN_SEC) end = durationSec !== undefined ? Math.min(durationSec, start + CLIP_MIN_SEC) : start + CLIP_MIN_SEC;
    if (end <= start) continue;
    seen.add(start);
    out.push({ startSec: start, endSec: Math.round(end * 100) / 100 });
    if (out.length >= MAX_CLIPS) break;
  }
  return out;
}

export const techniqueMediaPrefix = (recipeId: string) => `private/techniques/${recipeId}/`;

/**
 * Keep a technique video for playback: a streamable copy of the full video plus a short muted loop and poster
 * for each step. Stored privately; viewers get signed URLs. Returns undefined if the full video could not be stored.
 */
export async function storeTechniqueMedia(input: {
  recipeId: string;
  videoPath: string;
  mimeType: string;
  steps: Step[];
  durationSec?: number;
}): Promise<StoredVideo | undefined> {
  const deadline = Date.now() + MEDIA_BUDGET_MS;
  const prefix = techniqueMediaPrefix(input.recipeId);
  const dir = await mkdtemp(join(tmpdir(), 'tech-'));
  try {
    const durationSec = input.durationSec ?? (await probeDuration(input.videoPath));
    const full = join(dir, 'video.mp4');
    // Remux with the index up front so playback starts before the whole file loads; transcode if the codecs do not fit MP4.
    let res = await ffmpeg(['-i', input.videoPath, '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', '-y', full], 60_000);
    if (res.code !== 0) {
      res = await ffmpeg(
        [
          '-i',
          input.videoPath,
          '-vf',
          "scale=-2:'trunc(min(480,ih)/2)*2'",
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '26',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '96k',
          '-movflags',
          '+faststart',
          '-y',
          full,
        ],
        Math.max(10_000, deadline - Date.now()),
      );
    }
    if (res.code !== 0) {
      console.warn('Technique video could not be prepared', res.stderr.slice(-300));
      return undefined;
    }
    const videoKey = `${prefix}video.mp4`;
    await putObject(videoKey, await readFile(full), 'video/mp4', PRIVATE_CACHE);

    const clips: VideoClip[] = [];
    for (const [i, c] of planClips(input.steps, durationSec).entries()) {
      if (deadline - Date.now() < 8_000) break;
      const clipPath = join(dir, `clip-${i}.mp4`);
      const cut = await ffmpeg(
        [
          '-ss',
          String(c.startSec),
          '-i',
          full,
          '-t',
          String(c.endSec - c.startSec),
          '-an',
          '-vf',
          "scale=-2:'trunc(min(480,ih)/2)*2'",
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '28',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          '-y',
          clipPath,
        ],
        Math.min(30_000, deadline - Date.now()),
      );
      if (cut.code !== 0 || !(await stat(clipPath).catch(() => null))?.size) continue;
      const key = `${prefix}clip-${i}.mp4`;
      await putObject(key, await readFile(clipPath), 'video/mp4', PRIVATE_CACHE);
      const posterPath = join(dir, `clip-${i}.jpg`);
      const mid = c.startSec + (c.endSec - c.startSec) / 2;
      const poster = await ffmpeg(['-ss', String(mid), '-i', full, '-frames:v', '1', '-vf', "scale='min(640,iw)':-2", '-q:v', '4', '-y', posterPath], 15_000);
      let posterKey: string | undefined;
      if (poster.code === 0) {
        posterKey = `${prefix}clip-${i}.jpg`;
        await putObject(posterKey, await readFile(posterPath), 'image/jpeg', PRIVATE_CACHE);
      }
      clips.push({ startSec: c.startSec, endSec: c.endSec, key, ...(posterKey ? { posterKey } : {}) });
    }
    return { key: videoKey, mimeType: 'video/mp4', ...(durationSec ? { durationSec: Math.round(durationSec) } : {}), clips };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Every private object a recipe owns. */
export function mediaKeys(r: Pick<Recipe, 'video'>): string[] {
  if (!r.video) return [];
  return [r.video.key, ...r.video.clips.flatMap((c) => [c.key, ...(c.posterKey ? [c.posterKey] : [])])];
}

export async function deleteRecipeMedia(r: Pick<Recipe, 'video'>): Promise<void> {
  for (const key of mediaKeys(r)) await deleteObject(key);
}

export async function copyRecipeMedia(source: Pick<Recipe, 'video'>, target: Pick<Recipe, 'video'>): Promise<void> {
  const from = mediaKeys(source),
    to = mediaKeys(target);
  if (from.length !== to.length) throw new Error('Video copy is incomplete');
  for (let i = 0; i < from.length; i++) await copyObject(from[i]!, to[i]!);
}
