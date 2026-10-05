import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, isConditionalFailure } from './db.js';
import { env } from './env.js';
import { HttpError } from './http.js';
import { emitMetric } from './metrics.js';

/**
 * Fixed-window counter in DynamoDB. Returns true when the call is allowed.
 * One conditional write per call; windows expire through the table TTL.
 */
export async function hit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / windowSec);
  try {
    await ddb.send(new UpdateCommand({
      TableName: env.table,
      Key: { pk: `RATE#${key}`, sk: String(bucket) },
      UpdateExpression: 'ADD #c :one SET #t = if_not_exists(#t, :ttl)',
      ConditionExpression: 'attribute_not_exists(#c) OR #c < :limit',
      ExpressionAttributeNames: { '#c': 'count', '#t': 'ttl' },
      ExpressionAttributeValues: { ':one': 1, ':limit': limit, ':ttl': (bucket + 1) * windowSec + 60 },
    }));
    return true;
  } catch (err) {
    if (isConditionalFailure(err)) {
      emitMetric('RateLimited', 1, 'Count', { Limit: key.split('#')[0] ?? 'unknown' });
      return false;
    }
    throw err;
  }
}

/** Throw a 429 when over the limit. */
export async function enforce(key: string, limit: number, windowSec: number, message: string): Promise<void> {
  if (!(await hit(key, limit, windowSec))) throw new HttpError(429, message, 'rate_limited');
}

/** Limits, kept in one place so they are easy to review and tune. */
export const LIMITS = {
  importsPer10Min: { limit: 12, window: 600 },
  importsPerDay: { limit: 80, window: 86_400 },
  planSuggestPerHour: { limit: 10, window: 3600 },
  linkCodesPerHour: { limit: 6, window: 3600 },
  invitesPerDay: { limit: 30, window: 86_400 },
  uploadsPer10Min: { limit: 40, window: 600 },
  exportsPerHour: { limit: 5, window: 3600 },
  /** Messages a linked chat can send the bot. */
  chatMessagesPer10Min: { limit: 40, window: 600 },
  /** Replies to a chat that is not linked yet; protects SMS and WhatsApp spend. */
  unknownSenderRepliesPer30Min: { limit: 1, window: 1800 },
} as const;

export async function enforceLimit(name: keyof typeof LIMITS, subject: string, message: string): Promise<void> {
  const l = LIMITS[name];
  await enforce(`${name}#${subject}`, l.limit, l.window, message);
}

export async function allowLimit(name: keyof typeof LIMITS, subject: string): Promise<boolean> {
  const l = LIMITS[name];
  return hit(`${name}#${subject}`, l.limit, l.window);
}
