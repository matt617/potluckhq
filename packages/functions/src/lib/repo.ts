import {
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  monthKey,
  type ChannelKind,
  type Community,
  type ExtractedRecipe,
  type ImportJob,
  type Invite,
  type MealPlan,
  type Membership,
  type Recipe,
  type RecipeSummary,
  type Role,
  type ShoppingList,
  type UserProfile,
} from '@potluck/core';
import { clean, ddb, DAY, isConditionalFailure, ttlIn } from './db.js';
import { env } from './env.js';
import { nowIso } from './ids.js';

const T = () => env.table;

async function get<X>(pk: string, sk: string): Promise<X | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: T(), Key: { pk, sk } }));
  return clean<X>(res.Item);
}

async function queryAll(params: Omit<ConstructorParameters<typeof QueryCommand>[0], 'TableName'>, limit = 1000): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({ TableName: T(), ...params, ExclusiveStartKey }));
    items.push(...((res.Items ?? []) as Record<string, unknown>[]));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey && items.length < limit);
  return items;
}

/* ---------------------------------- users --------------------------------- */

export function defaultProfile(id: string, email: string, displayName: string): UserProfile {
  return {
    id,
    email,
    displayName: displayName || email.split('@')[0] || 'Cook',
    tier: 'free',
    diet: { allergies: [], diets: [], dislikes: [] },
    units: 'us',
    aiCreditMicros: 0,
    usageMonth: monthKey(),
    aiUsedMicros: 0,
    importsUsed: 0,
    createdAt: nowIso(),
  };
}

export const getUser = (id: string) => get<UserProfile>(`USER#${id}`, 'PROFILE');

export async function ensureUser(id: string, email: string, name: string): Promise<UserProfile> {
  const existing = await getUser(id);
  if (existing) {
    if (email && existing.email !== email) {
      await updateUser(id, { email });
      existing.email = email;
    }
    return existing;
  }
  const profile = defaultProfile(id, email, name);
  try {
    await ddb.send(new PutCommand({
      TableName: T(),
      Item: { pk: `USER#${id}`, sk: 'PROFILE', ...profile },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
    return profile;
  } catch (err) {
    if (isConditionalFailure(err)) return (await getUser(id))!;
    throw err;
  }
}

/** Shallow update of top-level profile fields. */
export async function updateUser(id: string, patch: Partial<UserProfile>): Promise<void> {
  const entries = Object.entries(patch).filter(([k, v]) => v !== undefined && k !== 'id');
  if (!entries.length) return;
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets = entries.map(([k, v], i) => {
    names[`#f${i}`] = k;
    values[`:v${i}`] = v;
    return `#f${i} = :v${i}`;
  });
  await ddb.send(new UpdateCommand({
    TableName: T(),
    Key: { pk: `USER#${id}`, sk: 'PROFILE' },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ConditionExpression: 'attribute_exists(pk)',
  }));
}

/**
 * Record usage atomically. Monthly counters reset lazily: the first write in a new month
 * replaces them instead of adding. Purchased credits are debited separately.
 */
export async function recordUsage(userId: string, u: { aiMicros?: number; imports?: number; creditMicros?: number }): Promise<void> {
  const month = monthKey();
  const ai = u.aiMicros ?? 0;
  const imports = u.imports ?? 0;
  const credit = u.creditMicros ?? 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await ddb.send(new UpdateCommand({
        TableName: T(),
        Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
        UpdateExpression: 'ADD aiUsedMicros :a, importsUsed :i, aiCreditMicros :c',
        ConditionExpression: 'usageMonth = :m',
        ExpressionAttributeValues: { ':a': ai, ':i': imports, ':c': -credit, ':m': month },
      }));
      return;
    } catch (err) {
      if (!isConditionalFailure(err)) throw err;
    }
    try {
      await ddb.send(new UpdateCommand({
        TableName: T(),
        Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
        UpdateExpression: 'SET usageMonth = :m, aiUsedMicros = :a, importsUsed = :i ADD aiCreditMicros :c',
        ConditionExpression: 'attribute_exists(pk) AND (attribute_not_exists(usageMonth) OR usageMonth <> :m)',
        ExpressionAttributeValues: { ':a': ai, ':i': imports, ':c': -credit, ':m': month },
      }));
      return;
    } catch (err) {
      if (!isConditionalFailure(err)) throw err;
    }
  }
  throw new Error('Could not record usage after retries');
}

export async function addCredits(userId: string, micros: number): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: T(),
    Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
    UpdateExpression: 'ADD aiCreditMicros :c',
    ExpressionAttributeValues: { ':c': micros },
  }));
}

export async function addLedger(userId: string, entry: { kind: string; micros: number; model?: string; promptTokens?: number; outputTokens?: number; ref?: string; actorId?: string }) {
  const at = nowIso();
  await ddb.send(new PutCommand({
    TableName: T(),
    Item: { pk: `USER#${userId}`, sk: `LEDGER#${at}#${Math.random().toString(36).slice(2, 8)}`, at, ...entry, ttl: ttlIn(400 * DAY) },
  }));
}

/* -------------------------------- channels -------------------------------- */

export interface ChannelLink {
  kind: Exclude<ChannelKind, 'web'>;
  address: string;
  userId: string;
  linkedAt: string;
}

export const getChannel = (kind: string, address: string) => get<ChannelLink>(`CHANNEL#${kind}#${address}`, 'LINK');

export async function putChannel(link: ChannelLink): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: T(),
    Item: { pk: `CHANNEL#${link.kind}#${link.address}`, sk: 'LINK', gsi1pk: `USER#${link.userId}`, gsi1sk: `CHANNEL#${link.kind}#${link.address}`, ...link },
  }));
}

export async function deleteChannel(kind: string, address: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: T(), Key: { pk: `CHANNEL#${kind}#${address}`, sk: 'LINK' } }));
}

export async function listUserChannels(userId: string): Promise<ChannelLink[]> {
  const items = await queryAll({
    IndexName: 'gsi1',
    KeyConditionExpression: 'gsi1pk = :p AND begins_with(gsi1sk, :s)',
    ExpressionAttributeValues: { ':p': `USER#${userId}`, ':s': 'CHANNEL#' },
  });
  return items.map((i) => clean<ChannelLink>(i)!);
}

export async function putLinkCode(code: string, userId: string, ttlSeconds: number): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: T(),
    Item: { pk: `LINKCODE#${code}`, sk: 'CODE', userId, ttl: ttlIn(ttlSeconds), expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() },
  }));
}

/** Consume a link code once. Returns the user id it belongs to, if valid. */
export async function consumeLinkCode(code: string): Promise<string | undefined> {
  try {
    const res = await ddb.send(new DeleteCommand({
      TableName: T(),
      Key: { pk: `LINKCODE#${code.toUpperCase()}`, sk: 'CODE' },
      ReturnValues: 'ALL_OLD',
      ConditionExpression: 'attribute_exists(pk) AND expiresAt > :now',
      ExpressionAttributeValues: { ':now': nowIso() },
    }));
    return res.Attributes?.userId as string | undefined;
  } catch (err) {
    if (isConditionalFailure(err)) return undefined;
    throw err;
  }
}

/* ------------------------------- communities ------------------------------ */

export const getCommunity = (id: string) => get<Community>(`COMM#${id}`, 'META');
export const getMembership = (communityId: string, userId: string) => get<Membership>(`COMM#${communityId}`, `MEMBER#${userId}`);

function memberItem(m: Membership) {
  return { pk: `COMM#${m.communityId}`, sk: `MEMBER#${m.userId}`, gsi1pk: `USER#${m.userId}`, gsi1sk: `COMM#${m.communityId}`, ...m };
}

export async function createCommunity(c: Community, owner: Membership): Promise<void> {
  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      { Put: { TableName: T(), Item: { pk: `COMM#${c.id}`, sk: 'META', ...c }, ConditionExpression: 'attribute_not_exists(pk)' } },
      { Put: { TableName: T(), Item: memberItem(owner) } },
    ],
  }));
}

export async function updateCommunity(id: string, patch: Partial<Pick<Community, 'name' | 'description' | 'pantryStaples'>>): Promise<Community> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (!entries.length) return (await getCommunity(id))!;
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets = entries.map(([k, v], i) => {
    names[`#f${i}`] = k;
    values[`:v${i}`] = v;
    return `#f${i} = :v${i}`;
  });
  const res = await ddb.send(new UpdateCommand({
    TableName: T(),
    Key: { pk: `COMM#${id}`, sk: 'META' },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ConditionExpression: 'attribute_exists(pk)',
    ReturnValues: 'ALL_NEW',
  }));
  return clean<Community>(res.Attributes)!;
}

export async function listUserMemberships(userId: string): Promise<Membership[]> {
  const items = await queryAll({
    IndexName: 'gsi1',
    KeyConditionExpression: 'gsi1pk = :p AND begins_with(gsi1sk, :s)',
    ExpressionAttributeValues: { ':p': `USER#${userId}`, ':s': 'COMM#' },
  });
  return items.map((i) => clean<Membership>(i)!);
}

export async function listMembers(communityId: string): Promise<Membership[]> {
  const items = await queryAll({
    KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
    ExpressionAttributeValues: { ':p': `COMM#${communityId}`, ':s': 'MEMBER#' },
  });
  return items.map((i) => clean<Membership>(i)!);
}

/** Add a member if the community is under its limit. Returns false when full. */
export async function addMember(m: Membership, maxMembers: number): Promise<'added' | 'exists' | 'full'> {
  try {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: T(), Item: memberItem(m), ConditionExpression: 'attribute_not_exists(pk)' } },
        {
          Update: {
            TableName: T(),
            Key: { pk: `COMM#${m.communityId}`, sk: 'META' },
            UpdateExpression: 'ADD memberCount :one',
            ConditionExpression: 'attribute_exists(pk) AND memberCount < :max',
            ExpressionAttributeValues: { ':one': 1, ':max': maxMembers },
          },
        },
      ],
    }));
    return 'added';
  } catch (err) {
    if (!isConditionalFailure(err)) throw err;
    if (await getMembership(m.communityId, m.userId)) return 'exists';
    return 'full';
  }
}

export async function removeMember(communityId: string, userId: string): Promise<void> {
  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      { Delete: { TableName: T(), Key: { pk: `COMM#${communityId}`, sk: `MEMBER#${userId}` }, ConditionExpression: 'attribute_exists(pk)' } },
      { Update: { TableName: T(), Key: { pk: `COMM#${communityId}`, sk: 'META' }, UpdateExpression: 'ADD memberCount :neg', ExpressionAttributeValues: { ':neg': -1 } } },
    ],
  }));
}

export async function setMemberRole(communityId: string, userId: string, role: Role): Promise<Membership> {
  const res = await ddb.send(new UpdateCommand({
    TableName: T(),
    Key: { pk: `COMM#${communityId}`, sk: `MEMBER#${userId}` },
    UpdateExpression: 'SET #r = :r',
    ExpressionAttributeNames: { '#r': 'role' },
    ExpressionAttributeValues: { ':r': role },
    ConditionExpression: 'attribute_exists(pk)',
    ReturnValues: 'ALL_NEW',
  }));
  return clean<Membership>(res.Attributes)!;
}

/** Delete a community and everything stored under it. Recipes themselves stay with their owners. */
export async function deleteCommunity(communityId: string): Promise<void> {
  const items = await queryAll({ KeyConditionExpression: 'pk = :p', ExpressionAttributeValues: { ':p': `COMM#${communityId}` } }, 100_000);
  for (const item of items) {
    const sk = String(item.sk);
    if (sk.startsWith('RECIPE#')) await removeCommunityFromRecipe(sk.slice(7), communityId).catch(() => undefined);
  }
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await ddb.send(new BatchWriteCommand({
      RequestItems: { [T()]: chunk.map((it) => ({ DeleteRequest: { Key: { pk: it.pk, sk: it.sk } } })) },
    }));
  }
}

/* --------------------------------- invites -------------------------------- */

export async function putInvite(inv: Invite): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: T(),
    Item: { pk: `INVITE#${inv.token}`, sk: 'INVITE', ...inv, ttl: Math.floor(new Date(inv.expiresAt).getTime() / 1000) },
  }));
}

export async function getInvite(token: string): Promise<Invite | undefined> {
  const inv = await get<Invite>(`INVITE#${token}`, 'INVITE');
  if (!inv || new Date(inv.expiresAt).getTime() < Date.now()) return undefined;
  return inv;
}

/* --------------------------------- recipes -------------------------------- */

export function summaryOf(r: Recipe, addedBy: string): RecipeSummary {
  return {
    id: r.id,
    title: r.title,
    ownerId: r.ownerId,
    addedBy,
    tags: r.tags,
    totalMin: r.totalMin ?? null,
    servings: r.servings,
    thumbnailKey: r.source.thumbnailKey,
    platform: r.source.platform,
    proteinG: r.nutrition?.proteinG ?? null,
    calories: r.nutrition?.calories ?? null,
    addedAt: nowIso(),
  };
}

export const getRecipe = (id: string) => get<Recipe>(`RECIPE#${id}`, 'META');

export async function putRecipe(r: Recipe): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: T(),
    Item: { pk: `RECIPE#${r.id}`, sk: 'META', gsi1pk: `USER#${r.ownerId}`, gsi1sk: `RECIPE#${r.createdAt}`, ...r },
  }));
}

/** Save a recipe and refresh the summary copy in every community it belongs to. */
export async function saveRecipeAndSummaries(r: Recipe): Promise<void> {
  await putRecipe(r);
  for (const cid of r.communityIds) {
    const existing = await get<RecipeSummary>(`COMM#${cid}`, `RECIPE#${r.id}`);
    const summary = { ...summaryOf(r, existing?.addedBy ?? r.ownerId), addedAt: existing?.addedAt ?? nowIso() };
    await ddb.send(new PutCommand({ TableName: T(), Item: { pk: `COMM#${cid}`, sk: `RECIPE#${r.id}`, ...summary } }));
  }
}

export async function shareRecipe(r: Recipe, communityId: string, addedBy: string): Promise<void> {
  await ddb.send(new PutCommand({ TableName: T(), Item: { pk: `COMM#${communityId}`, sk: `RECIPE#${r.id}`, ...summaryOf(r, addedBy) } }));
  if (!r.communityIds.includes(communityId)) {
    await ddb.send(new UpdateCommand({
      TableName: T(),
      Key: { pk: `RECIPE#${r.id}`, sk: 'META' },
      UpdateExpression: 'SET communityIds = list_append(communityIds, :c)',
      ConditionExpression: 'NOT contains(communityIds, :id)',
      ExpressionAttributeValues: { ':c': [communityId], ':id': communityId },
    })).catch((err) => {
      if (!isConditionalFailure(err)) throw err;
    });
  }
}

async function removeCommunityFromRecipe(recipeId: string, communityId: string): Promise<void> {
  const r = await getRecipe(recipeId);
  if (!r) return;
  await ddb.send(new UpdateCommand({
    TableName: T(),
    Key: { pk: `RECIPE#${recipeId}`, sk: 'META' },
    UpdateExpression: 'SET communityIds = :ids',
    ExpressionAttributeValues: { ':ids': r.communityIds.filter((c) => c !== communityId) },
  }));
}

export async function unshareRecipe(recipeId: string, communityId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: T(), Key: { pk: `COMM#${communityId}`, sk: `RECIPE#${recipeId}` } }));
  await removeCommunityFromRecipe(recipeId, communityId);
}

export async function deleteRecipe(r: Recipe): Promise<void> {
  for (const cid of r.communityIds) {
    await ddb.send(new DeleteCommand({ TableName: T(), Key: { pk: `COMM#${cid}`, sk: `RECIPE#${r.id}` } }));
  }
  await ddb.send(new DeleteCommand({ TableName: T(), Key: { pk: `RECIPE#${r.id}`, sk: 'META' } }));
}

export async function listCommunityRecipes(communityId: string): Promise<RecipeSummary[]> {
  const items = await queryAll({
    KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
    ExpressionAttributeValues: { ':p': `COMM#${communityId}`, ':s': 'RECIPE#' },
  }, 5000);
  return items.map((i) => clean<RecipeSummary>(i)!).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export async function batchGetRecipes(ids: string[]): Promise<Map<string, Recipe>> {
  const out = new Map<string, Recipe>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 100) {
    let keys: Record<string, unknown>[] | undefined = unique.slice(i, i + 100).map((id) => ({ pk: `RECIPE#${id}`, sk: 'META' }));
    for (let attempt = 0; keys?.length && attempt < 5; attempt++) {
      const res = await ddb.send(new BatchGetCommand({ RequestItems: { [T()]: { Keys: keys } } }));
      for (const item of res.Responses?.[T()] ?? []) {
        const r = clean<Recipe>(item)!;
        out.set(r.id, r);
      }
      keys = res.UnprocessedKeys?.[T()]?.Keys as Record<string, unknown>[] | undefined;
    }
  }
  return out;
}

/* --------------------------------- imports -------------------------------- */

export async function putImport(job: ImportJob): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: T(),
    Item: { pk: `IMPORT#${job.id}`, sk: 'META', gsi1pk: `USER#${job.userId}`, gsi1sk: `IMPORT#${job.createdAt}`, ...job, ttl: ttlIn(30 * DAY) },
  }));
}

export const getImport = (id: string) => get<ImportJob>(`IMPORT#${id}`, 'META');

export async function updateImport(id: string, patch: Partial<ImportJob>): Promise<void> {
  const entries = Object.entries({ ...patch, updatedAt: nowIso() }).filter(([, v]) => v !== undefined);
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets = entries.map(([k, v], i) => {
    names[`#f${i}`] = k;
    values[`:v${i}`] = v;
    return `#f${i} = :v${i}`;
  });
  await ddb.send(new UpdateCommand({
    TableName: T(),
    Key: { pk: `IMPORT#${id}`, sk: 'META' },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

export async function listUserImports(userId: string, limit = 30): Promise<ImportJob[]> {
  const res = await ddb.send(new QueryCommand({
    TableName: T(),
    IndexName: 'gsi1',
    KeyConditionExpression: 'gsi1pk = :p AND begins_with(gsi1sk, :s)',
    ExpressionAttributeValues: { ':p': `USER#${userId}`, ':s': 'IMPORT#' },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return (res.Items ?? []).map((i) => clean<ImportJob>(i)!);
}

/* ------------------------------ extraction cache --------------------------- */

export interface CachedExtraction {
  url: string;
  extracted: ExtractedRecipe;
  thumbnailKey?: string;
  author?: string;
  createdAt: string;
}

export const getCachedExtraction = (hash: string) => get<CachedExtraction>(`CACHE#${hash}`, 'EXTRACT');

export async function putCachedExtraction(hash: string, value: CachedExtraction): Promise<void> {
  await ddb.send(new PutCommand({ TableName: T(), Item: { pk: `CACHE#${hash}`, sk: 'EXTRACT', ...value, ttl: ttlIn(180 * DAY) } }));
}

/* ------------------------------ plans and lists ---------------------------- */

export const getPlan = (communityId: string, week: string) => get<MealPlan>(`COMM#${communityId}`, `PLAN#${week}`);

export async function putPlan(plan: MealPlan): Promise<void> {
  await ddb.send(new PutCommand({ TableName: T(), Item: { pk: `COMM#${plan.communityId}`, sk: `PLAN#${plan.weekStart}`, ...plan } }));
}

export async function getListWithVersion(communityId: string, week: string): Promise<{ list?: ShoppingList; version: number }> {
  const res = await ddb.send(new GetCommand({ TableName: T(), Key: { pk: `COMM#${communityId}`, sk: `LIST#${week}` } }));
  return { list: clean<ShoppingList>(res.Item), version: Number(res.Item?.version ?? 0) };
}

/**
 * Optimistic read-modify-write so two people ticking items at the same time
 * don't overwrite each other.
 */
export async function mutateList(
  communityId: string,
  week: string,
  fn: (list: ShoppingList) => ShoppingList,
): Promise<ShoppingList> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { list, version } = await getListWithVersion(communityId, week);
    const base: ShoppingList = list ?? { communityId, weekStart: week, items: [], generatedAt: '', updatedAt: nowIso() };
    const next = { ...fn(structuredClone(base)), updatedAt: nowIso() };
    try {
      await ddb.send(new PutCommand({
        TableName: T(),
        Item: { pk: `COMM#${communityId}`, sk: `LIST#${week}`, ...next, version: version + 1 },
        ConditionExpression: version === 0 ? 'attribute_not_exists(pk)' : 'version = :v',
        ExpressionAttributeValues: version === 0 ? undefined : { ':v': version },
      }));
      return next;
    } catch (err) {
      if (!isConditionalFailure(err)) throw err;
    }
  }
  throw new Error('Shopping list is busy, try again');
}

/* --------------------------------- stripe --------------------------------- */

export async function mapStripeCustomer(customerId: string, userId: string): Promise<void> {
  await ddb.send(new PutCommand({ TableName: T(), Item: { pk: `STRIPECUST#${customerId}`, sk: 'MAP', userId } }));
}

export async function userForStripeCustomer(customerId: string): Promise<string | undefined> {
  const item = await get<{ userId: string }>(`STRIPECUST#${customerId}`, 'MAP');
  return item?.userId;
}

/** Idempotency guard for webhook deliveries. Returns true the first time an id is seen. */
export async function markEventSeen(provider: string, id: string): Promise<boolean> {
  try {
    await ddb.send(new PutCommand({
      TableName: T(),
      Item: { pk: `EVENT#${provider}#${id}`, sk: 'SEEN', ttl: ttlIn(3 * DAY) },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
    return true;
  } catch (err) {
    if (isConditionalFailure(err)) return false;
    throw err;
  }
}

/* --------------------------- per-community source index --------------------------- */

export async function getCommunitySourceRecipe(communityId: string, urlHash: string): Promise<string | undefined> {
  return (await get<{ recipeId: string }>(`COMM#${communityId}`, `SRC#${urlHash}`))?.recipeId;
}

export async function putCommunitySourceRecipe(communityId: string, urlHash: string, recipeId: string): Promise<void> {
  await ddb.send(new PutCommand({ TableName: T(), Item: { pk: `COMM#${communityId}`, sk: `SRC#${urlHash}`, recipeId } }));
}

export async function unmarkEvent(provider: string, id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: T(), Key: { pk: `EVENT#${provider}#${id}`, sk: 'SEEN' } }));
}
