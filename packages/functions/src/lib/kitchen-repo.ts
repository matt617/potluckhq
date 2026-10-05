import { DeleteCommand, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { weekStartOf, hashKey, type Diner, type KitchenActivity, type OwnershipTransfer, type RecipeAnnotation } from '@potluck/core';
import { ddb, isConditionalFailure } from './db.js';
import { env } from './env.js';
import { HttpError } from './http.js';
import { nowIso } from './ids.js';

export async function readRecord<T>(pk: string, sk: string): Promise<T | undefined> {
  const r = await ddb.send(new GetCommand({ TableName: env.table, Key: { pk, sk }, ConsistentRead: true }));
  return r.Item?.value as T | undefined;
}
export async function writeRecord<T>(pk: string, sk: string, value: T): Promise<void> {
  await ddb.send(new PutCommand({ TableName: env.table, Item: { pk, sk, value } }));
}
export async function removeRecord(pk: string, sk: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: env.table, Key: { pk, sk } }));
}
export async function records<T>(pk: string, prefix: string): Promise<T[]> {
  const result: T[] = [];
  let key: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({
        TableName: env.table,
        KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
        ExpressionAttributeValues: { ':p': pk, ':s': prefix },
        ExclusiveStartKey: key,
        ConsistentRead: true,
      }),
    );
    result.push(...(r.Items ?? []).map((i) => i.value as T));
    key = r.LastEvaluatedKey;
  } while (key);
  return result;
}
export const diners = (cid: string) => records<Diner>(`COMM#${cid}`, 'DINER#');
export const activity = (cid: string) => records<KitchenActivity>(`COMM#${cid}`, 'ACTIVITY#');
export const annotations = (uid: string) => records<RecipeAnnotation>(`USER#${uid}`, 'ANNOTATION#');
export const transfer = (cid: string) => readRecord<OwnershipTransfer>(`COMM#${cid}`, 'TRANSFER');

export interface WeeklyParticipation {
  week: string;
  saved: boolean;
  planned: boolean;
  shopped: boolean;
  cooked: boolean;
  participants: string[];
}
/** Only action flags and account hashes, never recipe text or dietary information. */
export async function participation(cid: string, uid: string, action: 'saved' | 'planned' | 'shopped' | 'cooked') {
  const week = weekStartOf();
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: env.table,
        Key: { pk: `COMM#${cid}`, sk: `USAGEWEEK#${week}` },
        UpdateExpression: 'SET #action = :yes, #week = :week, ttl = :ttl ADD participants :actor',
        ExpressionAttributeNames: { '#action': action, '#week': 'week' },
        ExpressionAttributeValues: { ':yes': true, ':week': week, ':ttl': Math.floor(Date.now() / 1000) + 90 * 86400, ':actor': new Set([hashKey(uid)]) },
      }),
    );
    await ddb.send(
      new PutCommand({
        TableName: env.table,
        Item: { pk: `USER#${uid}`, sk: `PARTICIPATION#${cid}#${week}`, value: { cid, week }, ttl: Math.floor(Date.now() / 1000) + 90 * 86400 },
      }),
    );
  } catch {
    console.warn('Participation metric could not be recorded');
  }
}
export async function weeklyParticipation(cid: string) {
  const r = await ddb.send(
    new QueryCommand({
      TableName: env.table,
      KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
      ExpressionAttributeValues: { ':p': `COMM#${cid}`, ':s': 'USAGEWEEK#' },
      ScanIndexForward: false,
      Limit: 13,
    }),
  );
  return (r.Items ?? []).map((i) => ({
    week: String(i.week),
    saved: !!i.saved,
    planned: !!i.planned,
    shopped: !!i.shopped,
    cooked: !!i.cooked,
    participants: (i.participants as Set<string> | undefined)?.size ?? 0,
  }));
}

export async function forgetContributions(uid: string) {
  for (const ref of await records<{ cid: string; id: string }>(`USER#${uid}`, 'CONTRIBUTION#')) {
    const a = await readRecord<KitchenActivity>(`COMM#${ref.cid}`, `ACTIVITY#${ref.id}`);
    if (a?.actorId === uid) await removeRecord(`COMM#${ref.cid}`, `ACTIVITY#${ref.id}`);
  }
  for (const ref of await records<{ cid: string; week: string }>(`USER#${uid}`, 'PARTICIPATION#')) {
    try {
      await ddb.send(
        new UpdateCommand({
          TableName: env.table,
          Key: { pk: `COMM#${ref.cid}`, sk: `USAGEWEEK#${ref.week}` },
          UpdateExpression: 'DELETE participants :actor',
          ConditionExpression: 'attribute_exists(pk)',
          ExpressionAttributeValues: { ':actor': new Set([hashKey(uid)]) },
        }),
      );
    } catch (e) {
      if (!isConditionalFailure(e)) throw e;
    }
  }
}

export async function acceptTransfer(cid: string, t: OwnershipTransfer): Promise<void> {
  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.table,
              Key: { pk: `COMM#${cid}`, sk: 'META' },
              UpdateExpression: 'SET ownerId = :to',
              ConditionExpression: 'ownerId = :from',
              ExpressionAttributeValues: { ':to': t.to, ':from': t.from },
            },
          },
          ...(
            [
              { id: t.to, before: undefined, after: 'owner' },
              { id: t.from, before: 'owner', after: 'admin' },
            ] as const
          ).map((m) => ({
            Update: {
              TableName: env.table,
              Key: { pk: `COMM#${cid}`, sk: `MEMBER#${m.id}` },
              UpdateExpression: 'SET #role = :after',
              ConditionExpression: m.before ? '#role = :before' : 'attribute_exists(pk) AND #role <> :after',
              ExpressionAttributeNames: { '#role': 'role' },
              ExpressionAttributeValues: { ':after': m.after, ...(m.before ? { ':before': m.before } : {}) },
            },
          })),
          {
            Delete: {
              TableName: env.table,
              Key: { pk: `COMM#${cid}`, sk: 'TRANSFER' },
              ConditionExpression: '#v.#to = :to AND #v.#from = :from AND #v.expiresAt > :now',
              ExpressionAttributeNames: { '#v': 'value', '#to': 'to', '#from': 'from' },
              ExpressionAttributeValues: { ':to': t.to, ':from': t.from, ':now': nowIso() },
            },
          },
        ],
      }),
    );
  } catch (e) {
    if (isConditionalFailure(e)) throw new HttpError(409, 'The transfer or membership changed. Refresh and try again.', 'conflict');
    throw e;
  }
}
