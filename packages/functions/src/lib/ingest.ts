import {
  budgetFor,
  canImport,
  detectPlatform,
  hashKey,
  normalizeUrl,
  type ExtractedRecipe,
  type ImportErrorCode,
  type ImportJob,
  type Platform,
  type Recipe,
  type TokenUsage,
} from '@potluck/core';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { payerFor } from './access.js';
import { sendToChannel } from './channels/index.js';
import { chargeAi } from './charge.js';
import { downloadVideo, fetchPageText, type DownloadedVideo } from './downloader.js';
import { env } from './env.js';
import { extractRecipe } from './extract.js';
import { RetryableError, UserFacingError, videoPartFromFile, type Part } from './gemini.js';
import { newId, nowIso } from './ids.js';
import { pickHeroFrame, storeTechniqueMedia } from './media.js';
import { recipeReadyText, recipeLink, techniqueReadyText } from './messages.js';
import { emitMetric } from './metrics.js';
import * as repo from './repo.js';
import { deleteObject, getObjectBytes, putObject, storeThumbnail } from './s3.js';

/** A video file on local disk, kept until the import finishes so technique media can be cut from it. */
interface LocalVideo {
  path: string;
  mimeType: string;
  durationSec?: number;
  cleanup: () => Promise<void>;
}

const PUBLIC_IMMUTABLE = 'public, max-age=31536000, immutable';

interface Extraction {
  extracted: ExtractedRecipe;
  usage?: TokenUsage;
  model?: string;
  platform: Platform;
  thumbnailKey?: string;
  author?: string;
  fromCache: boolean;
  localVideo?: LocalVideo;
}

/**
 * Process one import job end to end. Returns normally for completed or permanently failed
 * jobs and throws RetryableError for transient failures so SQS retries the message.
 */
export async function processImport(importId: string, opts: { finalAttempt?: boolean } = {}): Promise<void> {
  const job = await repo.getImport(importId);
  if (!job || job.status === 'done' || job.status === 'failed') return;
  const community = await repo.getCommunity(job.communityId);
  if (!community) return fail(job, 'The community no longer exists.', 'unreadable');
  const payer = await payerFor(community);
  let keepUploads = false;
  let ex: Extraction | undefined;

  try {
    const urlHash = job.url ? hashKey(normalizeUrl(job.url)) : undefined;

    // Same link already in this community: point at the existing recipe, no AI spend.
    if (urlHash) {
      const dupe = await repo.getCommunitySourceRecipe(job.communityId, urlHash);
      if (dupe) {
        const existing = await repo.getRecipe(dupe);
        if (existing && existing.communityIds.includes(job.communityId)) {
          await repo.updateImport(job.id, { status: 'done', recipeId: existing.id });
          await reply(job, `*${existing.title}* is already in ${community.name}'s book.\n${recipeLink(existing.id)}`);
          return;
        }
      }
    }

    const cached = urlHash ? await repo.getCachedExtraction(urlHash) : undefined;
    if (cached) {
      ex = { extracted: cached.extracted, platform: detectPlatform(job.url!), thumbnailKey: cached.thumbnailKey, author: cached.author, fromCache: true };
      // The extraction is reused, but each technique keeps its own copy of the video, so fetch it again.
      if (cached.extracted.isTechnique && ex.platform !== 'web') ex.localVideo = await downloadVideo(job.url!).catch(() => undefined);
    } else {
      const gate = canImport(budgetFor(payer));
      if (!gate.ok) {
        return fail(job, gate.reason === 'import_quota'
          ? `${community.name} has used all of its recipe imports this month.`
          : `${community.name} is out of AI credit this month. The owner can buy more credits in the app.`, 'quota');
      }
      ex = await runExtraction(job, urlHash);
    }

    if (ex.usage && ex.model) {
      await chargeAi(payer, { model: ex.model, usage: ex.usage, kind: 'import', ref: job.id, actorId: job.userId, countImport: true });
    }

    if (!ex.extracted.isRecipe && !ex.extracted.isTechnique) {
      return fail(job, `That doesn't look like a recipe or a cooking technique${ex.extracted.reason ? `: ${ex.extracted.reason}` : '.'}`, 'not_recipe');
    }

    if (urlHash && !cached) {
      await repo.putCachedExtraction(urlHash, { url: normalizeUrl(job.url!), extracted: ex.extracted, thumbnailKey: ex.thumbnailKey, author: ex.author, createdAt: nowIso() });
    }

    const recipe = toRecipe(job, ex);
    if (recipe.kind === 'technique' && ex.localVideo) {
      recipe.video = await storeTechniqueMedia({
        recipeId: recipe.id,
        videoPath: ex.localVideo.path,
        mimeType: ex.localVideo.mimeType,
        steps: recipe.steps,
        durationSec: ex.localVideo.durationSec,
      }).catch((err) => {
        console.warn('Technique media failed; saving without playback', job.id, err);
        return undefined;
      });
    }
    await repo.putRecipe(recipe);
    await repo.shareRecipe(recipe, job.communityId, job.userId);
    if (urlHash) await repo.putCommunitySourceRecipe(job.communityId, urlHash, recipe.id);
    await repo.updateImport(job.id, { status: 'done', recipeId: recipe.id });
    emitMetric('ImportSucceeded', 1, 'Count');
    let text = recipe.kind === 'technique' ? techniqueReadyText(recipe, community.name) : recipeReadyText(recipe, community.name);
    if (ex.extracted.additionalDishes?.length) text += `\n\nThis video also showed: ${ex.extracted.additionalDishes.join(', ')}.`;
    await reply(job, text);
  } catch (err) {
    if (err instanceof UserFacingError) return fail(job, err.message, err.code);
    if (err instanceof RetryableError) {
      if (opts.finalAttempt) return fail(job, 'The AI service is busy right now. Please send that again in a few minutes.', 'busy');
      keepUploads = true;
      throw err;
    }
    console.error('Import failed', job.id, err);
    return fail(job, 'Something went wrong while reading that recipe. Please try again.', 'internal');
  } finally {
    await ex?.localVideo?.cleanup().catch(() => undefined);
    if (!keepUploads) for (const key of [...(job.imageKeys ?? []), ...(job.videoKey ? [job.videoKey] : [])]) await deleteObject(key);
  }
}

/** Save Gemini's choice of the most appetizing frame as the public thumbnail. Failures fall back to the platform thumbnail. */
async function heroThumbnail(video: LocalVideo | undefined, extracted: ExtractedRecipe, name: string): Promise<string | undefined> {
  if (!video) return undefined;
  try {
    const bytes = await pickHeroFrame(video.path, extracted.heroMoments, video.durationSec);
    if (!bytes) return undefined;
    const key = `media/thumbs/${name}-hero.jpg`;
    await putObject(key, bytes, 'image/jpeg', PUBLIC_IMMUTABLE);
    return key;
  } catch (err) {
    console.warn('Hero frame failed', err);
    return undefined;
  }
}

const asLocal = (v: DownloadedVideo): LocalVideo => ({ path: v.path, mimeType: v.mimeType, durationSec: v.durationSec, cleanup: v.cleanup });

async function runExtraction(job: ImportJob, urlHash: string | undefined): Promise<Extraction> {
  const model = env.geminiModel;
  await repo.updateImport(job.id, { status: job.kind === 'url' ? 'downloading' : 'extracting' });

  if (job.kind === 'url' && job.url) {
    const platform = detectPlatform(job.url);
    if (platform === 'youtube') {
      const id = normalizeUrl(job.url).split('v=')[1];
      await repo.updateImport(job.id, { status: 'extracting' });
      const res = await extractRecipe({ model, parts: [{ fileData: { fileUri: `https://www.youtube.com/watch?v=${id}` } }], sourceUrl: job.url });
      // Gemini watched it by URL. A small local copy is only needed to grab the chosen frame and keep technique videos.
      const downloaded = await downloadVideo(job.url).catch(() => undefined);
      const localVideo = downloaded && asLocal(downloaded);
      const name = urlHash ?? newId();
      const thumbnailKey =
        (await heroThumbnail(localVideo, res.data, name)) ?? (id ? await storeThumbnail(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, name) : undefined);
      return { extracted: res.data, usage: res.usage, model, platform, thumbnailKey, author: res.data.author, fromCache: false, localVideo };
    }
    if (platform === 'web') {
      const page = await fetchPageText(job.url);
      await repo.updateImport(job.id, { status: 'extracting' });
      const res = await extractRecipe({ model, parts: [{ text: page.text }], sourceUrl: job.url });
      const thumbnailKey = await storeThumbnail(page.imageUrl, urlHash ?? newId());
      return { extracted: res.data, usage: res.usage, model, platform, thumbnailKey, author: res.data.author, fromCache: false };
    }
    const video = await downloadVideo(job.url);
    try {
      await repo.updateImport(job.id, { status: 'extracting' });
      const { part, cleanup } = await videoPartFromFile(video.path, video.mimeType);
      let res: Awaited<ReturnType<typeof extractRecipe>>;
      try {
        res = await extractRecipe({ model, parts: [part], caption: video.caption, sourceUrl: job.url });
      } finally {
        await cleanup();
      }
      const localVideo = asLocal(video);
      const name = urlHash ?? newId();
      const thumbnailKey = (await heroThumbnail(localVideo, res.data, name)) ?? (await storeThumbnail(video.thumbnailUrl, name));
      return { extracted: res.data, usage: res.usage, model, platform, thumbnailKey, author: res.data.author ?? video.author, fromCache: false, localVideo };
    } catch (err) {
      await video.cleanup();
      throw err;
    }
  }

  if (job.kind === 'video' && job.videoKey) {
    const { bytes, contentType } = await getObjectBytes(job.videoKey);
    const path = join(tmpdir(), `${job.id}.mp4`);
    await writeFile(path, bytes);
    const mimeType = contentType.startsWith('video/') ? contentType : 'video/mp4';
    const localVideo: LocalVideo = { path, mimeType, cleanup: () => rm(path, { force: true }) };
    try {
      const { part, cleanup } = await videoPartFromFile(path, mimeType);
      let res: Awaited<ReturnType<typeof extractRecipe>>;
      try {
        res = await extractRecipe({ model, parts: [part], caption: job.text });
      } finally {
        await cleanup();
      }
      const thumbnailKey = await heroThumbnail(localVideo, res.data, job.id);
      return { extracted: res.data, usage: res.usage, model, platform: 'upload', thumbnailKey, author: res.data.author, fromCache: false, localVideo };
    } catch (err) {
      await localVideo.cleanup();
      throw err;
    }
  }

  if (job.kind === 'image' && job.imageKeys?.length) {
    const parts: Part[] = [];
    const photos: { bytes: Uint8Array; contentType: string }[] = [];
    for (const key of job.imageKeys) {
      const obj = await getObjectBytes(key);
      photos.push(obj);
      parts.push({ inlineData: { mimeType: obj.contentType.startsWith('image/') ? obj.contentType : 'image/jpeg', data: Buffer.from(obj.bytes).toString('base64') } });
    }
    const res = await extractRecipe({ model, parts, caption: job.text, lowMediaResolution: false });
    // Use the photo Gemini judged most appetizing, falling back to the first one.
    const hero = photos[res.data.heroImageIndex ?? 0] ?? photos[0];
    let thumbnailKey: string | undefined;
    if (hero && hero.bytes.length < 5 * 1024 * 1024) {
      thumbnailKey = `media/thumbs/${job.id}.jpg`;
      await putObject(thumbnailKey, hero.bytes, hero.contentType, PUBLIC_IMMUTABLE);
    }
    return { extracted: res.data, usage: res.usage, model, platform: 'photo', thumbnailKey, author: res.data.author, fromCache: false };
  }

  if (job.kind === 'text' && job.text) {
    const res = await extractRecipe({ model, parts: [{ text: job.text }] });
    return { extracted: res.data, usage: res.usage, model, platform: 'text', author: res.data.author, fromCache: false };
  }

  throw new UserFacingError('Nothing to import.');
}

export function toRecipe(job: ImportJob, ex: Extraction): Recipe {
  const e = ex.extracted;
  const now = nowIso();
  const total = (e.prepMin ?? 0) + (e.cookMin ?? 0);
  return {
    id: newId(),
    kind: e.isTechnique ? 'technique' : 'recipe',
    ownerId: job.userId,
    title: e.title,
    description: e.description,
    servings: e.servings,
    prepMin: e.prepMin ?? null,
    cookMin: e.cookMin ?? null,
    totalMin: total > 0 ? total : null,
    cuisine: e.cuisine,
    tags: e.tags,
    ingredients: e.ingredients,
    steps: e.steps,
    nutrition: e.nutrition ?? null,
    equipment: e.equipment,
    tips: e.tips,
    ...(e.isTechnique && e.technique ? { technique: e.technique } : {}),
    source: { url: job.url, platform: ex.platform, author: ex.author, thumbnailKey: ex.thumbnailKey },
    communityIds: [],
    confidence: e.confidence,
    createdAt: now,
    updatedAt: now,
  };
}

async function fail(job: ImportJob, message: string, errorCode: ImportErrorCode): Promise<void> {
  emitMetric('ImportFailed', 1, 'Count');
  await repo.updateImport(job.id, { status: 'failed', error: message, errorCode });
  await reply(job, `⚠️ ${message}`);
}

async function reply(job: ImportJob, text: string): Promise<void> {
  if (job.channel !== 'web' && job.replyTo) await sendToChannel(job.channel, job.replyTo, text);
}
