import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ExtractedRecipe } from '@potluck/core';

const stored = vi.hoisted(() => new Map<string, { bytes: number; type: string; cache?: string }>());
const deleted = vi.hoisted(() => [] as string[]);
vi.mock('../src/lib/s3.js', () => ({
  putObject: async (key: string, body: Uint8Array, type: string, cache?: string) => void stored.set(key, { bytes: body.length, type, cache }),
  deleteObject: async (key: string) => void deleted.push(key),
}));

const { heroCandidates, planClips, pickHeroFrame, probeDuration, storeTechniqueMedia, mediaKeys, deleteRecipeMedia } = await import('../src/lib/media.js');
const { sanitizeExtraction } = await import('../src/lib/extract.js');

const base: ExtractedRecipe = { isRecipe: true, title: 'x', servings: 2, tags: [], ingredients: [], steps: [], confidence: 1 };

describe('technique classification', () => {
  it('keeps a technique with steps even without ingredients, and drops recipe-only fields', () => {
    const out = sanitizeExtraction({
      ...base,
      kind: 'technique',
      isRecipe: true,
      title: 'Velveting meat',
      servings: 4,
      steps: [{ text: 'Slice against the grain', timestampSec: 12, endSec: 18 }],
      nutrition: { calories: 1, proteinG: 1, carbsG: 1, fatG: 1, fiberG: 1 },
      technique: { summary: 'Coat meat in starch', appliesTo: ['beef stir-fry'], mistakes: ['Skipping the rest'] },
    } as ExtractedRecipe & { kind: string });
    expect(out.isTechnique).toBe(true);
    expect(out.isRecipe).toBe(false);
    expect(out.servings).toBe(1);
    expect(out.nutrition).toBeNull();
    expect(out.steps[0]).toMatchObject({ timestampSec: 12, endSec: 18 });
    expect(out.technique).toEqual({ summary: 'Coat meat in starch', whyItWorks: undefined, appliesTo: ['beef stir-fry'], mistakes: ['Skipping the rest'] });
  });

  it('rejects "neither" content and keeps recipes as recipes', () => {
    expect(sanitizeExtraction({ ...base, kind: 'neither', ingredients: [{ quantity: 1, unit: '', name: 'egg', aisle: 'dairy_eggs' }] } as never)).toMatchObject({ isRecipe: false, isTechnique: false });
    const recipe = sanitizeExtraction({ ...base, kind: 'recipe', ingredients: [{ quantity: 1, unit: '', name: 'egg', aisle: 'dairy_eggs' }] } as never);
    expect(recipe).toMatchObject({ isRecipe: true, isTechnique: false, technique: null });
  });

  it('cleans hero moments and the hero photo index', () => {
    const out = sanitizeExtraction({ ...base, heroMoments: [{ timestampSec: 40 }, { timestampSec: -1 }, { timestampSec: 5, why: 'plated' }, { timestampSec: 9 }, { timestampSec: 11 }], heroImageIndex: 2 } as never);
    expect(out.heroMoments).toEqual([{ timestampSec: 40 }, { timestampSec: 5, why: 'plated' }, { timestampSec: 9 }]);
    expect(out.heroImageIndex).toBe(2);
  });
});

describe('frame and clip planning', () => {
  it('samples around each ranked moment, clamped to the video', () => {
    expect(heroCandidates([{ timestampSec: 10 }, { timestampSec: 0.2 }], 30)).toEqual([[9.25, 10, 10.75], [0, 0.2, 0.95]]);
    expect(heroCandidates([{ timestampSec: 30 }], 30)).toEqual([[29.25, 29.8]]);
  });

  it('falls back to late frames, where the finished dish usually is', () => {
    expect(heroCandidates([], 100)).toEqual([[85, 70, 50]]);
  });

  it('cuts one short clip per timed step', () => {
    const clips = planClips(
      [
        { text: 'a', timestampSec: 2, endSec: 7 },
        { text: 'no time' },
        { text: 'too long', timestampSec: 10, endSec: 60 },
        { text: 'no end', timestampSec: 20 },
        { text: 'dupe', timestampSec: 20, endSec: 22 },
        { text: 'tail', timestampSec: 29 },
        { text: 'past end', timestampSec: 40 },
      ],
      30,
    );
    expect(clips).toEqual([
      { startSec: 2, endSec: 7 },
      { startSec: 10, endSec: 20 },
      { startSec: 20, endSec: 26 },
      { startSec: 29, endSec: 30 },
    ]);
  });
});

let ffmpegDir: string | undefined;
try {
  ffmpegDir = dirname(execFileSync('which', ['ffmpeg']).toString().trim()) || undefined;
} catch {
  ffmpegDir = undefined;
}

describe.skipIf(!ffmpegDir)('ffmpeg media pipeline', () => {
  let dir: string;
  let video: string;
  beforeAll(async () => {
    process.env.FFMPEG_DIR = ffmpegDir;
    dir = await mkdtemp(join(tmpdir(), 'media-test-'));
    video = join(dir, 'in.mp4');
    // 12 s test pattern with a tone: a stand-in for a downloaded cooking video.
    execFileSync(join(ffmpegDir!, 'ffmpeg'), [
      '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=12',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', video,
    ]);
  }, 60_000);
  afterAll(async () => {
    delete process.env.FFMPEG_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it('reads the duration without ffprobe', async () => {
    expect(Math.round((await probeDuration(video))!)).toBe(12);
  });

  it('extracts a usable JPEG hero frame', async () => {
    const bytes = await pickHeroFrame(video, [{ timestampSec: 6 }], 12);
    expect(bytes).toBeDefined();
    expect(Buffer.from(bytes!).subarray(0, 2).toString('hex')).toBe('ffd8');
  }, 30_000);

  it('stores the full video, clips and posters privately, and deletes them all', async () => {
    const result = await storeTechniqueMedia({
      recipeId: 'r1',
      videoPath: video,
      mimeType: 'video/mp4',
      steps: [{ text: 'one', timestampSec: 1, endSec: 4 }, { text: 'two', timestampSec: 6 }],
    });
    expect(result).toMatchObject({ key: 'private/techniques/r1/video.mp4', mimeType: 'video/mp4', durationSec: 12 });
    expect(result!.clips).toEqual([
      { startSec: 1, endSec: 4, key: 'private/techniques/r1/clip-0.mp4', posterKey: 'private/techniques/r1/clip-0.jpg' },
      { startSec: 6, endSec: 12, key: 'private/techniques/r1/clip-1.mp4', posterKey: 'private/techniques/r1/clip-1.jpg' },
    ]);
    for (const key of mediaKeys({ video: result })) {
      expect(stored.get(key)?.bytes).toBeGreaterThan(0);
      expect(stored.get(key)?.cache).toMatch(/^private/);
    }
    await deleteRecipeMedia({ video: result });
    expect(deleted.sort()).toEqual(mediaKeys({ video: result }).sort());
  }, 60_000);
});
