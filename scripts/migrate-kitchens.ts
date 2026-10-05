import { readFile, writeFile } from 'node:fs/promises';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { migrateKitchenSnapshot, type MigrationRow } from '../packages/functions/src/lib/kitchen-migration';
import { S3Client, CopyObjectCommand } from '@aws-sdk/client-s3';
import type { StoredVideo } from '@potluck/core';

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const table = option('--table'),
  snapshotPath = option('--snapshot');
const apply = args.includes('--apply');
if (!snapshotPath) throw new Error('Supply --snapshot <path>. Default is a read-only rehearsal. --table exports a snapshot if the file does not exist.');
if (apply && (!table || !args.includes('--maintenance-confirmed')))
  throw new Error('Applying requires --table and --maintenance-confirmed. Pause imports and API writes first.');
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const revive = (_key: string, value: unknown) =>
  value && typeof value === 'object' && '__dynamoSet' in value ? new Set((value as { __dynamoSet: unknown[] }).__dynamoSet) : value;
const serialize = (_key: string, value: unknown) => (value instanceof Set ? { __dynamoSet: [...value] } : value);
let rows: MigrationRow[];
try {
  rows = JSON.parse(await readFile(snapshotPath, 'utf8'), revive);
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || !table || apply) throw e;
  rows = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await db.send(new ScanCommand({ TableName: table, ExclusiveStartKey: cursor, ConsistentRead: true }));
    rows.push(...((page.Items ?? []) as MigrationRow[]));
    cursor = page.LastEvaluatedKey;
  } while (cursor);
  await writeFile(snapshotPath, JSON.stringify(rows, serialize, 2), { flag: 'wx', mode: 0o600 });
}
if (!Array.isArray(rows) || rows.some((r) => typeof r.pk !== 'string' || typeof r.sk !== 'string'))
  throw new Error('Snapshot must be an array of DynamoDB document records with pk and sk.');
const result = migrateKitchenSnapshot(rows);
const rehearsal = migrateKitchenSnapshot(result.rows);
if (rehearsal.changes.length) throw new Error('Migration is not idempotent. No data was written.');
console.log(JSON.stringify({ mode: apply ? 'apply' : 'rehearsal', records: rows.length, copies: result.copies, changes: result.changes.length }));
const normalize = (v: unknown): unknown =>
  v instanceof Set
    ? [...v].map(normalize).sort()
    : Array.isArray(v)
      ? v.map(normalize)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .filter(([, x]) => x !== undefined)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, normalize(x)]),
          )
        : v;
const same = (a: unknown, b: unknown) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
const videoCopies = result.changes.filter((c) => !c.before && c.after?.video);
if (apply && videoCopies.length) {
  const bucket = option('--media-bucket');
  if (!bucket) throw new Error('Technique copies require --media-bucket. No database records have been changed.');
  const s3 = new S3Client({});
  const keys = (v: StoredVideo) => [v.key, ...v.clips.flatMap((c) => [c.key, ...(c.posterKey ? [c.posterKey] : [])])];
  for (const change of videoCopies) {
    const target = change.after!;
    const source = rows.find((r) => r.pk === `RECIPE#${target.originRecipeId}` && r.sk === 'META');
    if (!source?.video) throw new Error(`Missing source video for ${target.pk}`);
    const from = keys(source.video as StoredVideo),
      to = keys(target.video as StoredVideo);
    if (from.length !== to.length) throw new Error(`Incomplete video copy for ${target.pk}`);
    for (let i = 0; i < from.length; i++)
      await s3.send(new CopyObjectCommand({ Bucket: bucket, Key: to[i]!, CopySource: `${bucket}/${from[i]!.split('/').map(encodeURIComponent).join('/')}` }));
  }
}
if (apply)
  for (const change of result.changes) {
    const reference = change.after ?? change.before!,
      Key = { pk: reference.pk, sk: reference.sk };
    const current = (await db.send(new GetCommand({ TableName: table, Key, ConsistentRead: true }))).Item;
    if (same(current, change.after)) continue;
    if (!same(current, change.before)) throw new Error(`Record changed after snapshot: ${Key.pk}/${Key.sk}. Paused without overwriting it.`);
    const fields = Object.entries(change.before ?? {}).filter(([, v]) => v !== undefined);
    const condition = fields.length
      ? {
          ConditionExpression: fields.map((_, i) => `#f${i} = :v${i}`).join(' AND '),
          ExpressionAttributeNames: Object.fromEntries(fields.map(([k], i) => [`#f${i}`, k])),
          ExpressionAttributeValues: Object.fromEntries(fields.map(([, v], i) => [`:v${i}`, v])),
        }
      : { ConditionExpression: 'attribute_not_exists(pk)' };
    if (change.after) await db.send(new PutCommand({ TableName: table, Item: change.after, ...condition }));
    else await db.send(new DeleteCommand({ TableName: table, Key, ...condition }));
  }
if (apply) console.log('Migration finished. Retain the snapshot and verify counts before resuming writes.');
