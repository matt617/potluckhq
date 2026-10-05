import { DeleteCommand, PutCommand, QueryCommand, ScanCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { tierConfig, type MemberNomination, type MemberCandidate, type Community } from '@potluck/core';
import { ddb, clean, isConditionalFailure } from './db.js';
import { env } from './env.js';
import * as repo from './repo.js';
import { requireAdmin, payerFor } from './access.js';
import { enforce } from './ratelimit.js';
import { Router, badRequest, forbidden, notFound, obj, str, HttpError, type Ctx } from './http.js';
import { nowIso } from './ids.js';

const uid = (ctx: Ctx) => {
  if (!ctx.user) throw forbidden();
  return ctx.user.id;
};
const key = (cid: string, userId: string) => ({
  pk: `COMM#${cid}`,
  sk: `NOMINATION#${userId}`,
});
const active = (n: MemberNomination) => n.expiresAt > nowIso();

async function queryNominations(pk: string, inbox = false): Promise<MemberNomination[]> {
  const items: MemberNomination[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: env.table,
        ...(inbox ? { IndexName: 'gsi1' } : { ConsistentRead: true }),
        KeyConditionExpression: inbox ? 'gsi1pk = :p AND begins_with(gsi1sk, :s)' : 'pk = :p AND begins_with(sk, :s)',
        ExpressionAttributeValues: { ':p': pk, ':s': 'NOMINATION#' },
        ExclusiveStartKey: start,
      }),
    );
    items.push(...(res.Items ?? []).map((i) => clean<MemberNomination>(i)!));
    start = res.LastEvaluatedKey;
  } while (start);
  return items;
}
export const nominations = async (cid: string) => (await queryNominations(`COMM#${cid}`)).filter(active);
export const userNominations = (userId: string) => queryNominations(`USER#${userId}`, true);

export function registerMemberLinkRoutes(router: Router) {
  router.on('POST', '/api/communities/:cid/member-search', async (ctx) => {
    const actor = uid(ctx),
      cid = ctx.params.cid!;
    await requireAdmin(cid, actor);
    await enforce(`memberSearch#${actor}`, 60, 600, 'Too many searches. Try again in a few minutes.');
    const b = obj(ctx.body),
      query = str(b.query, 'query', { max: 254 })!.trim().toLowerCase();
    if (query.length < 2) throw badRequest('Enter at least two characters or a complete email address.');
    const [members, pending, memberships] = await Promise.all([repo.listMembers(cid), nominations(cid), repo.listUserMemberships(actor)]);
    const candidates = new Map<string, MemberCandidate>();
    const add = (userId: string, displayName: string, context: string) => {
      if (userId === actor) return;
      candidates.set(userId, {
        userId,
        displayName,
        context,
        status: members.some((m) => m.userId === userId) ? 'member' : pending.some((n) => n.userId === userId) ? 'pending' : 'available',
      });
    };
    // Name search is limited to people the requester already shares a space with.
    if (!b.cursor)
      for (const membership of memberships) {
        const community = await repo.getCommunity(membership.communityId);
        if (!community) continue;
        for (const m of await repo.listMembers(community.id))
          if (m.displayName.toLowerCase().includes(query)) add(m.userId, m.displayName, `Member of ${community.name}`);
      }
    let cursor: string | undefined;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query)) {
      let start: Record<string, unknown> | undefined;
      if (b.cursor) {
        try {
          const decoded = JSON.parse(Buffer.from(str(b.cursor, 'cursor', { max: 2000 })!, 'base64url').toString());
          if (typeof decoded.pk !== 'string' || typeof decoded.sk !== 'string') throw new Error();
          start = { pk: decoded.pk, sk: decoded.sk };
        } catch {
          throw badRequest('Search again to refresh these results.');
        }
      }
      // Existing profiles predate directory indexes. Bound each request and expose continuation,
      // rather than silently treating the first scan page as the complete member database.
      for (let page = 0; page < 5; page++) {
        const res = await ddb.send(
          new ScanCommand({
            TableName: env.table,
            Limit: 200,
            ExclusiveStartKey: start,
            FilterExpression: 'sk = :profile',
            ExpressionAttributeValues: { ':profile': 'PROFILE' },
            ProjectionExpression: 'pk, sk, id, displayName, email',
          }),
        );
        for (const item of res.Items ?? [])
          if (typeof item.email === 'string' && item.email.toLowerCase() === query)
            add(String(item.id), String(item.displayName), 'Email matches your search');
        start = res.LastEvaluatedKey;
        if (!start || candidates.size) break;
      }
      if (start) cursor = Buffer.from(JSON.stringify(start)).toString('base64url');
    }
    return {
      members: [...candidates.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)),
      cursor,
    };
  });

  router.on('GET', '/api/communities/:cid/nominations', async (ctx) => {
    await requireAdmin(ctx.params.cid!, uid(ctx));
    return { nominations: await nominations(ctx.params.cid!) };
  });
  router.on('POST', '/api/communities/:cid/nominations', async (ctx) => {
    const actor = uid(ctx),
      cid = ctx.params.cid!,
      b = obj(ctx.body);
    const { community, membership } = await requireAdmin(cid, actor);
    const userId = str(b.userId, 'member', { max: 100 })!;
    if (b.role !== 'member' && b.role !== 'admin') throw badRequest('Choose member or admin.');
    if (b.role === 'admin' && membership.role !== 'owner') throw forbidden('Only the owner can nominate an admin.');
    if (await repo.getMembership(cid, userId)) throw badRequest('This person is already a member.');
    const target = await repo.getUser(userId);
    if (!target) throw notFound('This member is no longer available. Search again.');
    const owner = await payerFor(community);
    const limit = community.kind === 'circle' ? 20 : tierConfig(owner.tier).maxMembersPerCommunity;
    if (community.memberCount >= limit) throw badRequest('This space is full. Remove a member or change the owner’s plan before nominating someone.');
    await enforce(`nominations#${cid}`, 30, 86400, 'This space has reached its daily nomination limit. Try tomorrow.');
    const n: MemberNomination = {
      communityId: cid,
      communityName: community.name,
      userId,
      displayName: target.displayName,
      nominatedBy: actor,
      nominatedByName: (await repo.getUser(actor))?.displayName ?? 'A member',
      role: b.role,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
    try {
      await ddb.send(
        new PutCommand({
          TableName: env.table,
          Item: {
            ...key(cid, userId),
            ...n,
            gsi1pk: `USER#${userId}`,
            gsi1sk: `NOMINATION#${cid}`,
            ttl: Math.floor(new Date(n.expiresAt).getTime() / 1000),
          },
          ConditionExpression: 'attribute_not_exists(pk) OR expiresAt <= :now',
          ExpressionAttributeValues: { ':now': nowIso() },
        }),
      );
    } catch (e) {
      if (isConditionalFailure(e)) throw new HttpError(409, 'A nomination for this member is already pending.');
      throw e;
    }
    return { nomination: n };
  });
  router.on('GET', '/api/me/nominations', async (ctx) => {
    const result: MemberNomination[] = [];
    for (const n of await userNominations(uid(ctx))) {
      const c = active(n) ? await repo.getCommunity(n.communityId) : undefined;
      if (c && !(await repo.getMembership(c.id, n.userId))) result.push({ ...n, communityName: c.name });
    }
    return { nominations: result };
  });
  router.on('DELETE', '/api/communities/:cid/nominations/:uid', async (ctx) => {
    if (uid(ctx) !== ctx.params.uid) await requireAdmin(ctx.params.cid!, uid(ctx));
    await ddb.send(
      new DeleteCommand({
        TableName: env.table,
        Key: key(ctx.params.cid!, ctx.params.uid!),
      }),
    );
    return { ok: true };
  });
  router.on('POST', '/api/communities/:cid/nominations/accept', async (ctx) => {
    const userId = uid(ctx),
      cid = ctx.params.cid!;
    // Read the primary record; the inbox index may lag a cancellation.
    const n = (await nominations(cid)).find((n) => n.userId === userId);
    if (!n) throw notFound('This nomination expired or was withdrawn.');
    const community = await repo.getCommunity(cid);
    if (!community) throw notFound('This space no longer exists.');
    const existing = await repo.getMembership(cid, userId);
    if (existing) {
      await ddb.send(new DeleteCommand({ TableName: env.table, Key: key(cid, userId) }));
      return community;
    }
    const profile = await repo.getUser(userId);
    if (!profile) throw notFound('Reload your account before accepting.');
    const owner = await payerFor(community);
    const limit = community.kind === 'circle' ? 20 : tierConfig(owner.tier).maxMembersPerCommunity;
    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Delete: {
                TableName: env.table,
                Key: key(cid, userId),
                ConditionExpression: 'expiresAt = :expires AND expiresAt > :now AND #role = :role',
                ExpressionAttributeNames: { '#role': 'role' },
                ExpressionAttributeValues: {
                  ':expires': n.expiresAt,
                  ':now': nowIso(),
                  ':role': n.role,
                },
              },
            },
            {
              Put: {
                TableName: env.table,
                Item: {
                  pk: `COMM#${cid}`,
                  sk: `MEMBER#${userId}`,
                  gsi1pk: `USER#${userId}`,
                  gsi1sk: `COMM#${cid}`,
                  communityId: cid,
                  userId,
                  displayName: profile.displayName,
                  role: n.role,
                  joinedAt: nowIso(),
                },
                ConditionExpression: 'attribute_not_exists(pk)',
              },
            },
            {
              Update: {
                TableName: env.table,
                Key: { pk: `COMM#${cid}`, sk: 'META' },
                UpdateExpression: 'ADD memberCount :one',
                ConditionExpression: 'attribute_exists(pk) AND memberCount < :limit',
                ExpressionAttributeValues: { ':one': 1, ':limit': limit },
              },
            },
          ],
        }),
      );
    } catch (e) {
      if (isConditionalFailure(e)) throw new HttpError(409, 'This nomination changed or the space is full. Refresh and try again.');
      throw e;
    }
    if (!profile.defaultCommunityId && community.kind !== 'circle') await repo.updateUser(userId, { defaultCommunityId: cid });
    return (await repo.getCommunity(cid)) as Community;
  });
}
