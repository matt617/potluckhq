import { budgetFor, canImport, detectPlatform, type ChannelKind, type ImportJob } from '@potluck/core';
import { payerFor, requireMember } from './access.js';
import { badRequest, paymentRequired } from './http.js';
import { newId, nowIso } from './ids.js';
import { enqueueImport } from './queue.js';
import { enforceLimit } from './ratelimit.js';
import * as repo from './repo.js';

export interface NewImport {
  userId: string;
  communityId: string;
  url?: string;
  imageKeys?: string[];
  videoKey?: string;
  text?: string;
  channel: ChannelKind;
  replyTo?: string;
}

/** Validate access and quota, persist the job and queue it for the worker. */
export async function createImport(input: NewImport): Promise<ImportJob> {
  const { community } = await requireMember(input.communityId, input.userId);
  await enforceLimit('importsPer10Min', input.userId, 'That is a lot of recipes at once. Please wait a few minutes and send the rest.');
  await enforceLimit('importsPerDay', input.userId, 'You have reached the daily import limit. Try again tomorrow.');
  const payer = await payerFor(community);
  const gate = canImport(budgetFor(payer));
  if (!gate.ok) {
    if (gate.reason === 'import_quota') throw paymentRequired('This community has used all of its recipe imports for the month.', 'import_quota');
    throw paymentRequired('This community is out of AI credit for the month. The owner can buy more credits.', 'ai_allowance');
  }
  let kind: ImportJob['kind'];
  if (input.url) {
    try {
      const u = new URL(input.url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
    } catch {
      throw badRequest('That does not look like a valid link');
    }
    kind = 'url';
  } else if (input.videoKey) kind = 'video';
  else if (input.imageKeys?.length) kind = 'image';
  else if (input.text && input.text.length >= 40) kind = 'text';
  else throw badRequest('Send a link, photos, a video, or recipe text of at least 40 characters');

  for (const key of [...(input.imageKeys ?? []), ...(input.videoKey ? [input.videoKey] : [])]) {
    if (!key.startsWith(`uploads/${input.userId}/`)) throw badRequest('Invalid upload key');
  }
  if ((input.imageKeys?.length ?? 0) > 6) throw badRequest('At most 6 photos per recipe');

  const now = nowIso();
  const job: ImportJob = {
    id: newId(),
    userId: input.userId,
    communityId: input.communityId,
    status: 'queued',
    kind,
    url: input.url,
    imageKeys: input.imageKeys,
    videoKey: input.videoKey,
    text: input.text?.slice(0, 20_000),
    channel: input.channel,
    replyTo: input.replyTo,
    createdAt: now,
    updatedAt: now,
  };
  await repo.putImport(job);
  await enqueueImport(job.id);
  return job;
}

export function describeSource(job: Pick<ImportJob, 'kind' | 'url'>): string {
  if (job.kind === 'url' && job.url) {
    const p = detectPlatform(job.url);
    return p === 'web' ? 'recipe page' : `${p[0]!.toUpperCase()}${p.slice(1)} video`;
  }
  if (job.kind === 'image') return 'photos';
  if (job.kind === 'video') return 'video';
  return 'recipe text';
}
