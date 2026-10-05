import {
  budgetFor,
  copyRecipe,
  hashKey,
  tierConfig,
  type Diner,
  type KitchenActivity,
  type OwnershipTransfer,
  type RecipeAnnotation,
  type Recipe,
} from '@potluck/core';
import { canReadRecipe, payerFor, requireAdmin, requireMember } from './access.js';
import { HttpError, badRequest, forbidden, notFound, num, obj, str, strArray, type Ctx, type Router } from './http.js';
import { newId, nowIso } from './ids.js';
import * as repo from './repo.js';
import * as kr from './kitchen-repo.js';
import { emitMetric } from './metrics.js';
import { copyRecipeMedia } from './media.js';

function user(ctx: Ctx) {
  if (!ctx.user) throw forbidden();
  return ctx.user;
}
const emptyDiet = () => ({ allergies: [] as string[], diets: [] as string[], dislikes: [] as string[] });

export function registerKitchenRoutes(router: Router) {
  router.on('GET', '/api/communities/:cid/participation', async (ctx) => {
    const cid = ctx.params.cid!;
    await requireAdmin(cid, user(ctx).id);
    return { weeks: await kr.weeklyParticipation(cid) };
  });
  router.on('POST', '/api/kitchens/start', async (ctx) => {
    const u = user(ctx);
    const profile = await repo.ensureUser(u.id, u.email, u.name);
    const memberships = await repo.listUserMemberships(u.id);
    for (const m of memberships) {
      const c = await repo.getCommunity(m.communityId);
      if (c && c.kind !== 'circle') return c;
    }
    // Stable identity makes retrying first-run setup safe.
    let id = `home-${hashKey(u.id)}`;
    // A former owner may have transferred this kitchen and subsequently left it.
    for (let attempt = 0; attempt < 20; attempt++) {
      const existing = await repo.getCommunity(id);
      if (!existing) break;
      if (await repo.getMembership(id, u.id)) return existing;
      id = `home-${hashKey(`${u.id}:${id}:${existing.ownerId}`)}`;
      if (attempt === 19) throw new HttpError(409, 'Please create a named kitchen.', 'conflict');
    }
    const c = {
      id,
      name: 'My kitchen',
      kind: 'kitchen' as const,
      ownerId: u.id,
      memberCount: 1,
      pantryStaples: ['salt', 'black pepper', 'olive oil', 'water'],
      createdAt: nowIso(),
    };
    try {
      await repo.createCommunity(c, { communityId: id, userId: u.id, role: 'owner', displayName: profile.displayName, joinedAt: nowIso() });
    } catch (e) {
      const concurrent = await repo.getCommunity(id);
      if (!concurrent) throw e;
    }
    await repo.updateUser(u.id, { defaultCommunityId: id });
    emitMetric('KitchenStarted', 1, 'Count');
    return c;
  });

  router.on('GET', '/api/library', async (ctx) => {
    const uid = user(ctx).id;
    return { recipes: (await repo.listUserRecipes(uid)).map((r) => repo.summaryOf(r, uid)), annotations: await kr.annotations(uid) };
  });
  router.on('POST', '/api/library/:rid', async (ctx) => {
    const uid = user(ctx).id,
      source = await repo.getRecipe(ctx.params.rid!);
    if (!source || !(await canReadRecipe(source, uid))) throw notFound();
    if (source.ownerId === uid && !source.kitchenId) return { recipe: source };
    return { recipe: await repo.saveRecipeCopy(source, uid) };
  });
  router.on('PUT', '/api/library/:rid/annotation', async (ctx) => {
    const uid = user(ctx).id,
      r = await repo.getRecipe(ctx.params.rid!);
    if (!r || r.ownerId !== uid || r.kitchenId) throw notFound('Save this recipe to My recipes first.');
    const b = obj(ctx.body);
    const annotation: RecipeAnnotation = {
      recipeId: r.id,
      collections: strArray(b.collections, 'collections', 20, 60) ?? [],
      note: str(b.note, 'note', { max: 2000, optional: true }) ?? '',
    };
    await kr.writeRecord(`USER#${uid}`, `ANNOTATION#${r.id}`, annotation);
    return annotation;
  });
  router.on('GET', '/api/recipes/:rid/origin', async (ctx) => {
    const uid = user(ctx).id,
      r = await repo.getRecipe(ctx.params.rid!);
    if (!r || !(await canReadRecipe(r, uid))) throw notFound();
    let origin = r.originRecipeId ? await repo.getRecipe(r.originRecipeId) : undefined;
    if (origin && !(await canReadRecipe(origin, uid))) origin = await kr.readRecord<Recipe>(`RECIPE#${r.originRecipeId}`, 'PUBLISHED');
    if (!origin) return { available: false };
    return { available: true, changed: origin.updatedAt !== r.originUpdatedAt, recipe: origin };
  });
  router.on('POST', '/api/recipes/:rid/origin', async (ctx) => {
    const uid = user(ctx).id,
      r = await repo.getRecipe(ctx.params.rid!);
    if (!r || !(await canReadRecipe(r, uid))) throw notFound();
    if (r.kitchenId) await requireMember(r.kitchenId, uid);
    else if (r.ownerId !== uid) throw forbidden();
    const b = obj(ctx.body);
    let origin = r.originRecipeId ? await repo.getRecipe(r.originRecipeId) : undefined;
    if (origin && !(await canReadRecipe(origin, uid))) origin = await kr.readRecord<Recipe>(`RECIPE#${r.originRecipeId}`, 'PUBLISHED');
    if (!origin) throw notFound('Original recipe is no longer available. Your copy is unchanged.');
    if (b.updatedAt !== r.updatedAt || b.originUpdatedAt !== origin.updatedAt)
      throw new HttpError(409, 'A recipe changed. Review the comparison again.', 'conflict');
    const next = { ...copyRecipe(origin, r.id, r.ownerId, r.kitchenId), createdAt: r.createdAt, updatedAt: nowIso(), archived: r.archived };
    await copyRecipeMedia(origin, next);
    await repo.saveRecipeAndSummaries(next, r.updatedAt);
    return { recipe: next, canEdit: true };
  });
  router.on('POST', '/api/recipes/:rid/publish', async (ctx) => {
    const uid = user(ctx).id,
      r = await repo.getRecipe(ctx.params.rid!);
    if (!r) throw notFound();
    if (r.kitchenId) await requireMember(r.kitchenId, uid);
    else if (r.ownerId !== uid) throw forbidden();
    await kr.writeRecord(`RECIPE#${r.id}`, 'PUBLISHED', r);
    return { ok: true };
  });

  router.on('GET', '/api/communities/:cid/people', async (ctx) => {
    const uid = user(ctx).id,
      cid = ctx.params.cid!;
    await requireMember(cid, uid);
    return { diners: await kr.diners(cid) };
  });
  router.on('PUT', '/api/communities/:cid/people/:id', async (ctx) => {
    const uid = user(ctx).id,
      cid = ctx.params.cid!,
      id = ctx.params.id!;
    const { community, membership } = await requireMember(cid, uid);
    if (community.kind === 'circle') throw badRequest('Food profiles belong to kitchens, not recipe circles.');
    const b = obj(ctx.body),
      existing = await kr.readRecord<Diner>(`COMM#${cid}`, `DINER#${id}`);
    const linkedUser = str(b.userId, 'userId', { max: 100, optional: true });
    // A linked member alone controls their food requirements, including revocation.
    if (existing?.userId && existing.userId !== uid) throw forbidden('Only this person can change their food preferences.');
    if (linkedUser && linkedUser !== uid) throw forbidden('People add their own shared food preferences.');
    if (!linkedUser && membership.role === 'member') throw forbidden('An organizer can add children and guests.');
    const all = await kr.diners(cid);
    if (!existing && all.length >= 40) throw badRequest('This kitchen already has 40 diners.');
    if (linkedUser && all.some((d) => d.id !== id && d.userId === linkedUser)) throw badRequest('You already have a diner profile here.');
    const d = b.diet === undefined ? emptyDiet() : obj(b.diet);
    const diner: Diner = {
      id,
      name: str(b.name, 'name', { max: 60 })!,
      userId: linkedUser,
      usual: b.usual === true,
      portions: num(b.portions, 'portions', { min: 0.25, max: 20 })!,
      diet: {
        allergies: strArray(d.allergies, 'allergies', 30, 60) ?? [],
        diets: strArray(d.diets, 'diets', 20, 60) ?? [],
        dislikes: strArray(d.dislikes, 'dislikes', 50, 60) ?? [],
      },
    };
    await kr.writeRecord(`COMM#${cid}`, `DINER#${id}`, diner);
    return diner;
  });
  router.on('DELETE', '/api/communities/:cid/people/:id', async (ctx) => {
    const uid = user(ctx).id,
      cid = ctx.params.cid!,
      id = ctx.params.id!;
    const { membership } = await requireMember(cid, uid);
    const d = await kr.readRecord<Diner>(`COMM#${cid}`, `DINER#${id}`);
    if (d?.userId ? d.userId !== uid : membership.role === 'member') throw forbidden();
    await kr.removeRecord(`COMM#${cid}`, `DINER#${id}`);
    return { ok: true };
  });

  router.on('GET', '/api/communities/:cid/activity', async (ctx) => {
    const cid = ctx.params.cid!;
    await requireMember(cid, user(ctx).id);
    return { activity: (await kr.activity(cid)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100) };
  });
  router.on('POST', '/api/communities/:cid/activity', async (ctx) => {
    const uid = user(ctx).id,
      cid = ctx.params.cid!,
      b = obj(ctx.body);
    const { membership } = await requireMember(cid, uid);
    const recipeId = str(b.recipeId, 'recipeId')!,
      r = await repo.getRecipe(recipeId);
    if (!r || !r.communityIds.includes(cid)) throw notFound('Recipe not in this kitchen or circle.');
    if (!['want', 'made', 'note'].includes(String(b.kind))) throw badRequest('Choose a valid action.');
    const kind = b.kind as KitchenActivity['kind'];
    const entry: KitchenActivity = {
      id: kind === 'want' ? `${uid}-${recipeId}-want` : newId(),
      actorId: uid,
      actorName: membership.displayName,
      kind,
      recipeId,
      recipeTitle: r.title,
      note: str(b.note, 'note', { max: 1000, optional: true }) ?? '',
      at: nowIso(),
    };
    await kr.writeRecord(`COMM#${cid}`, `ACTIVITY#${entry.id}`, entry);
    await kr.writeRecord(`USER#${uid}`, `CONTRIBUTION#${cid}#${entry.id}`, { cid, id: entry.id });
    if (kind === 'made') await kr.participation(cid, uid, 'cooked');
    emitMetric(kind === 'made' ? 'MealCooked' : kind === 'want' ? 'RecipeWanted' : 'CookingNoteAdded', 1, 'Count');
    return entry;
  });
  router.on('DELETE', '/api/communities/:cid/activity/:id', async (ctx) => {
    const cid = ctx.params.cid!,
      uid = user(ctx).id;
    const { membership } = await requireMember(cid, uid);
    const entry = await kr.readRecord<KitchenActivity>(`COMM#${cid}`, `ACTIVITY#${ctx.params.id}`);
    if (entry && entry.actorId !== uid && membership.role === 'member') throw forbidden();
    await kr.removeRecord(`COMM#${cid}`, `ACTIVITY#${ctx.params.id}`);
    return { ok: true };
  });
  router.on('GET', '/api/communities/:cid/allowance', async (ctx) => {
    const { community } = await requireMember(ctx.params.cid!, user(ctx).id);
    const payer = await payerFor(community);
    return { ownerName: payer.displayName, ownerId: payer.id, budget: budgetFor(payer), tier: tierConfig(payer.tier) };
  });

  router.on('GET', '/api/communities/:cid/transfer', async (ctx) => {
    await requireMember(ctx.params.cid!, user(ctx).id);
    return { transfer: (await kr.transfer(ctx.params.cid!)) ?? null };
  });
  router.on('POST', '/api/communities/:cid/transfer', async (ctx) => {
    const uid = user(ctx).id,
      cid = ctx.params.cid!;
    const { membership } = await requireAdmin(cid, uid);
    if (membership.role !== 'owner') throw forbidden('Only the owner can transfer ownership.');
    const to = str(obj(ctx.body).to, 'to')!;
    if (to === uid || !(await repo.getMembership(cid, to))) throw badRequest('Choose another existing member.');
    const transfer: OwnershipTransfer = { from: uid, to, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() };
    await kr.writeRecord(`COMM#${cid}`, 'TRANSFER', transfer);
    return { transfer };
  });
  router.on('DELETE', '/api/communities/:cid/transfer', async (ctx) => {
    const uid = user(ctx).id,
      cid = ctx.params.cid!;
    const { community } = await requireMember(cid, uid),
      t = await kr.transfer(cid);
    if (community.ownerId !== uid && t?.to !== uid) throw forbidden();
    await kr.removeRecord(`COMM#${cid}`, 'TRANSFER');
    return { ok: true };
  });
  router.on('POST', '/api/communities/:cid/transfer/accept', async (ctx) => {
    const uid = user(ctx).id,
      cid = ctx.params.cid!;
    const { community } = await requireMember(cid, uid),
      t = await kr.transfer(cid);
    if (!t || t.to !== uid || t.expiresAt <= nowIso()) throw badRequest('This transfer is no longer available.');
    const profile = await repo.getUser(uid);
    if (!profile) throw notFound();
    const tier = tierConfig(profile.tier);
    const owned = (await repo.listUserMemberships(uid)).filter((m) => m.role === 'owner');
    const scopes = await Promise.all(owned.map((m) => repo.getCommunity(m.communityId)));
    const circle = community.kind === 'circle';
    if (
      community.memberCount > (circle ? 20 : tier.maxMembersPerCommunity) ||
      scopes.filter((c) => c && (c.kind === 'circle') === circle).length >= (circle ? 3 : tier.maxCommunities)
    )
      throw badRequest('Your current plan cannot support this kitchen. Upgrade or reduce its membership before accepting.');
    await kr.acceptTransfer(cid, t);
    return { ok: true };
  });

  router.on('GET', '/api/communities/:cid/invites', async (ctx) => {
    const cid = ctx.params.cid!;
    await requireAdmin(cid, user(ctx).id);
    return { invites: (await kr.records<{ token: string; expiresAt: string; role: string }>(`COMM#${cid}`, 'INVITE#')).filter((i) => i.expiresAt > nowIso()) };
  });
  router.on('DELETE', '/api/communities/:cid/invites/:token', async (ctx) => {
    const cid = ctx.params.cid!,
      token = ctx.params.token!;
    await requireAdmin(cid, user(ctx).id);
    const inv = await repo.getInvite(token);
    if (inv && inv.communityId !== cid) throw forbidden();
    await kr.removeRecord(`INVITE#${token}`, 'INVITE');
    await kr.removeRecord(`COMM#${cid}`, `INVITE#${token}`);
    return { ok: true };
  });
}
