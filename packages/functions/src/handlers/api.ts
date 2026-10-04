import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  AISLES,
  CREDIT_PACKS,
  MEAL_SLOTS,
  PLAN_CONSTRAINTS,
  TIER_ORDER,
  TIERS,
  budgetFor,
  buildShoppingList,
  canUseAiFeatures,
  isWeekKey,
  manualItem,
  parseIngredientLine,
  tierConfig,
  type Community,
  type CommunityDetail,
  type ImportJob,
  type Ingredient,
  type InvitePreview,
  type InviteResponse,
  type LinkCodeResponse,
  type MealPlan,
  type MeResponse,
  type PlanConstraint,
  type PlanEntry,
  type PlanResponse,
  type PublicConfig,
  type Recipe,
  type RecipeResponse,
  type Role,
  type Step,
  type SuggestPlanRequest,
  type SuggestPlanResponse,
} from '@potluck/core';
import { canReadRecipe, payerFor, requireAdmin, requireMember } from '../lib/access.js';
import { sendToChannel } from '../lib/channels/index.js';
import { chargeAi } from '../lib/charge.js';
import { sendInviteEmail } from '../lib/email.js';
import { env } from '../lib/env.js';
import { UserFacingError } from '../lib/gemini.js';
import {
  Router,
  badRequest,
  buildCtx,
  dispatch,
  forbidden,
  json,
  notFound,
  num,
  obj,
  paymentRequired,
  str,
  strArray,
  type Ctx,
} from '../lib/http.js';
import { newId, newLinkCode, newToken, nowIso } from '../lib/ids.js';
import { createImport } from '../lib/imports.js';
import { listText } from '../lib/messages.js';
import { suggestPlan } from '../lib/planner.js';
import * as repo from '../lib/repo.js';
import { ALLOWED_UPLOAD_TYPES, presignUpload, uploadKey } from '../lib/s3.js';
import { secrets } from '../lib/secrets.js';
import { priceForTier, stripeApi } from '../lib/stripe.js';

const router = new Router();

function me(ctx: Ctx) {
  if (!ctx.user) throw forbidden('Sign in required');
  return ctx.user;
}

async function meResponse(userId: string, email: string, name: string): Promise<MeResponse> {
  const user = await repo.ensureUser(userId, email, name);
  const memberships = await repo.listUserMemberships(userId);
  const communities = (await Promise.all(memberships.map(async (m) => {
    const c = await repo.getCommunity(m.communityId);
    return c ? { ...c, role: m.role } : undefined;
  }))).filter(Boolean) as MeResponse['communities'];
  const channels = (await repo.listUserChannels(userId)).map((c) => ({ kind: c.kind, address: c.address, linkedAt: c.linkedAt }));
  return { user, budget: budgetFor(user), communities, channels };
}

/* ----------------------------------- public ---------------------------------- */

router.on('GET', '/public/config', async () => {
  const s = await secrets().catch(() => ({} as Awaited<ReturnType<typeof secrets>>));
  const cfg: PublicConfig = {
    telegramBotUsername: s['telegram-bot-username'],
    whatsappNumber: s['whatsapp-number'],
    smsNumber: env.smsEnabled ? env.smsOriginationNumber : undefined,
    mediaBaseUrl: `${env.appUrl}/`,
    tiers: TIER_ORDER.map((id) => {
      const t = TIERS[id];
      return { id, name: t.name, priceCents: t.priceCents, maxCommunities: t.maxCommunities, maxMembersPerCommunity: t.maxMembersPerCommunity, importsPerMonth: t.importsPerMonth, aiFeatures: t.aiFeatures, aiAllowanceMicros: t.aiAllowanceMicros };
    }),
    creditPacks: CREDIT_PACKS,
    billingEnabled: Boolean(s['stripe-secret-key'] && s['stripe-price-plus'] && s['stripe-price-pro']),
  };
  return json(200, cfg, { 'cache-control': 'public, max-age=300' });
});

router.on('GET', '/public/invites/:token', async (ctx) => {
  const inv = await repo.getInvite(ctx.params.token!);
  if (!inv) throw notFound('This invite has expired or does not exist');
  const [inviter, community] = await Promise.all([repo.getUser(inv.invitedBy), repo.getCommunity(inv.communityId)]);
  if (!community) throw notFound('This community no longer exists');
  const owner = await payerFor(community);
  const preview: InvitePreview = {
    communityName: community.name,
    invitedByName: inviter?.displayName ?? 'Someone',
    expiresAt: inv.expiresAt,
    full: community.memberCount >= tierConfig(owner.tier).maxMembersPerCommunity,
  };
  return preview;
});

/* ------------------------------------- me ------------------------------------ */

router.on('GET', '/api/me', async (ctx) => {
  const u = me(ctx);
  return meResponse(u.id, u.email, u.name);
});

router.on('PATCH', '/api/me', async (ctx) => {
  const u = me(ctx);
  const b = obj(ctx.body);
  const user = await repo.ensureUser(u.id, u.email, u.name);
  const patch: Parameters<typeof repo.updateUser>[1] = {};
  if (b.displayName !== undefined) patch.displayName = str(b.displayName, 'displayName', { max: 60 });
  if (b.units !== undefined) {
    if (b.units !== 'us' && b.units !== 'metric') throw badRequest('units must be us or metric');
    patch.units = b.units;
  }
  if (b.defaultCommunityId !== undefined) {
    const cid = str(b.defaultCommunityId, 'defaultCommunityId')!;
    await requireMember(cid, u.id);
    patch.defaultCommunityId = cid;
  }
  if (b.diet !== undefined) {
    const d = obj(b.diet);
    patch.diet = {
      allergies: strArray(d.allergies, 'allergies', 30, 60) ?? user.diet.allergies,
      diets: strArray(d.diets, 'diets', 20, 60) ?? user.diet.diets,
      dislikes: strArray(d.dislikes, 'dislikes', 50, 60) ?? user.diet.dislikes,
      goals: d.goals !== undefined ? str(d.goals, 'goals', { max: 500, optional: true }) : user.diet.goals,
      glp1: d.glp1 !== undefined ? Boolean(d.glp1) : user.diet.glp1,
      dailyProteinTargetG: d.dailyProteinTargetG !== undefined ? (num(d.dailyProteinTargetG, 'dailyProteinTargetG', { min: 0, max: 500, optional: true }) ?? null) : user.diet.dailyProteinTargetG,
    };
  }
  await repo.updateUser(u.id, patch);
  return meResponse(u.id, u.email, u.name);
});

router.on('POST', '/api/me/link-code', async (ctx) => {
  const u = me(ctx);
  await repo.ensureUser(u.id, u.email, u.name);
  const code = newLinkCode();
  const ttl = 15 * 60;
  await repo.putLinkCode(code, u.id, ttl);
  const res: LinkCodeResponse = {
    code,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    instructions: `Send "link ${code}" to the Potluck bot on Telegram, WhatsApp or SMS within 15 minutes.`,
  };
  return res;
});

router.on('DELETE', '/api/me/channels/:kind/:address', async (ctx) => {
  const u = me(ctx);
  const link = await repo.getChannel(ctx.params.kind!, ctx.params.address!);
  if (!link || link.userId !== u.id) throw notFound('Linked chat not found');
  await repo.deleteChannel(link.kind, link.address);
  return { ok: true };
});

/* --------------------------------- communities ------------------------------- */

router.on('POST', '/api/communities', async (ctx) => {
  const u = me(ctx);
  const b = obj(ctx.body);
  const name = str(b.name, 'name', { max: 60 })!;
  const user = await repo.ensureUser(u.id, u.email, u.name);
  const owned = (await repo.listUserMemberships(u.id)).filter((m) => m.role === 'owner').length;
  const tier = tierConfig(user.tier);
  if (owned >= tier.maxCommunities) {
    throw paymentRequired(`The ${tier.name} plan allows ${tier.maxCommunities} communit${tier.maxCommunities === 1 ? 'y' : 'ies'}. Upgrade to create more.`, 'tier_limit');
  }
  const now = nowIso();
  const community: Community = {
    id: newId(),
    name,
    description: str(b.description, 'description', { max: 300, optional: true }),
    ownerId: u.id,
    memberCount: 1,
    pantryStaples: ['salt', 'black pepper', 'olive oil', 'water'],
    createdAt: now,
  };
  await repo.createCommunity(community, { communityId: community.id, userId: u.id, role: 'owner', displayName: user.displayName, joinedAt: now });
  if (!user.defaultCommunityId) await repo.updateUser(u.id, { defaultCommunityId: community.id });
  return community;
});

router.on('GET', '/api/communities/:cid', async (ctx) => {
  const u = me(ctx);
  const { community, membership } = await requireMember(ctx.params.cid!, u.id);
  const [members, owner] = await Promise.all([repo.listMembers(community.id), payerFor(community)]);
  const detail: CommunityDetail = { community, role: membership.role, members, ownerTier: owner.tier };
  return detail;
});

router.on('PATCH', '/api/communities/:cid', async (ctx) => {
  const u = me(ctx);
  await requireAdmin(ctx.params.cid!, u.id);
  const b = obj(ctx.body);
  return repo.updateCommunity(ctx.params.cid!, {
    name: str(b.name, 'name', { max: 60, optional: true }),
    description: b.description !== undefined ? (str(b.description, 'description', { max: 300, optional: true }) ?? '') : undefined,
    pantryStaples: strArray(b.pantryStaples, 'pantryStaples', 200, 60),
  });
});

router.on('DELETE', '/api/communities/:cid', async (ctx) => {
  const u = me(ctx);
  const { membership } = await requireMember(ctx.params.cid!, u.id);
  if (membership.role !== 'owner') throw forbidden('Only the owner can delete a community');
  const members = await repo.listMembers(ctx.params.cid!);
  await repo.deleteCommunity(ctx.params.cid!);
  for (const m of members) {
    const profile = await repo.getUser(m.userId);
    if (profile?.defaultCommunityId === ctx.params.cid) await repo.updateUser(m.userId, { defaultCommunityId: '' });
  }
  return { ok: true };
});

router.on('POST', '/api/communities/:cid/invites', async (ctx) => {
  const u = me(ctx);
  const { community } = await requireAdmin(ctx.params.cid!, u.id);
  const b = (ctx.body ?? {}) as Record<string, unknown>;
  const role = b.role === 'admin' ? 'admin' : 'member';
  const email = str(b.email, 'email', { max: 254, optional: true });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('That email address looks wrong');
  const owner = await payerFor(community);
  if (community.memberCount >= tierConfig(owner.tier).maxMembersPerCommunity) {
    throw paymentRequired(`${community.name} is full on the ${tierConfig(owner.tier).name} plan. The owner can upgrade to add more people.`, 'tier_limit');
  }
  const token = newToken();
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  await repo.putInvite({ token, communityId: community.id, communityName: community.name, invitedBy: u.id, role, email, expiresAt });
  const url = `${env.appUrl}/invite/${token}`;
  if (email) {
    const inviter = await repo.getUser(u.id);
    await sendInviteEmail(email, inviter?.displayName ?? 'A friend', community.name, url);
  }
  const res: InviteResponse = { token, url, expiresAt };
  return res;
});

router.on('POST', '/api/invites/:token/accept', async (ctx) => {
  const u = me(ctx);
  const inv = await repo.getInvite(ctx.params.token!);
  if (!inv) throw notFound('This invite has expired or does not exist');
  const community = await repo.getCommunity(inv.communityId);
  if (!community) throw notFound('This community no longer exists');
  const user = await repo.ensureUser(u.id, u.email, u.name);
  const owner = await payerFor(community);
  const result = await repo.addMember(
    { communityId: community.id, userId: u.id, role: inv.role, displayName: user.displayName, joinedAt: nowIso() },
    tierConfig(owner.tier).maxMembersPerCommunity,
  );
  if (result === 'full') throw paymentRequired(`${community.name} is full. Ask the owner to upgrade their plan.`, 'tier_limit');
  if (!user.defaultCommunityId) await repo.updateUser(u.id, { defaultCommunityId: community.id });
  return (await repo.getCommunity(community.id))!;
});

router.on('PATCH', '/api/communities/:cid/members/:uid', async (ctx) => {
  const u = me(ctx);
  const { membership } = await requireAdmin(ctx.params.cid!, u.id);
  const role = (obj(ctx.body).role as Role) ?? '';
  if (role !== 'admin' && role !== 'member') throw badRequest('role must be admin or member');
  const target = await repo.getMembership(ctx.params.cid!, ctx.params.uid!);
  if (!target) throw notFound('Member not found');
  if (target.role === 'owner') throw forbidden('The owner role cannot be changed');
  if (membership.role !== 'owner' && target.role === 'admin') throw forbidden('Only the owner can change an admin');
  return repo.setMemberRole(ctx.params.cid!, ctx.params.uid!, role);
});

router.on('DELETE', '/api/communities/:cid/members/:uid', async (ctx) => {
  const u = me(ctx);
  const cid = ctx.params.cid!;
  const uid = ctx.params.uid!;
  const { membership } = await requireMember(cid, u.id);
  const target = uid === u.id ? membership : await repo.getMembership(cid, uid);
  if (!target) throw notFound('Member not found');
  if (target.role === 'owner') throw forbidden('The owner cannot leave. Delete the community instead.');
  if (uid !== u.id) {
    if (membership.role === 'member') throw forbidden('Only admins can remove people');
    if (target.role === 'admin' && membership.role !== 'owner') throw forbidden('Only the owner can remove an admin');
  }
  await repo.removeMember(cid, uid);
  const profile = await repo.getUser(uid);
  if (profile?.defaultCommunityId === cid) await repo.updateUser(uid, { defaultCommunityId: '' });
  return { ok: true };
});

/* ----------------------------------- recipes --------------------------------- */

router.on('GET', '/api/communities/:cid/recipes', async (ctx) => {
  const u = me(ctx);
  await requireMember(ctx.params.cid!, u.id);
  return { recipes: await repo.listCommunityRecipes(ctx.params.cid!) };
});

router.on('DELETE', '/api/communities/:cid/recipes/:rid', async (ctx) => {
  const u = me(ctx);
  const { membership } = await requireMember(ctx.params.cid!, u.id);
  const recipe = await repo.getRecipe(ctx.params.rid!);
  if (!recipe) throw notFound('Recipe not found');
  if (recipe.ownerId !== u.id && membership.role === 'member') throw forbidden('Only the recipe owner or an admin can remove it');
  await repo.unshareRecipe(recipe.id, ctx.params.cid!);
  return { ok: true };
});

router.on('GET', '/api/recipes/:rid', async (ctx) => {
  const u = me(ctx);
  const recipe = await repo.getRecipe(ctx.params.rid!);
  if (!recipe || !(await canReadRecipe(recipe, u.id))) throw notFound('Recipe not found');
  const res: RecipeResponse = { recipe, canEdit: await canEditRecipe(recipe, u.id) };
  return res;
});

/** Owners and admins of any community holding the recipe can fix extraction mistakes. */
async function canEditRecipe(recipe: Recipe, userId: string): Promise<boolean> {
  if (recipe.ownerId === userId) return true;
  for (const cid of recipe.communityIds) {
    const m = await repo.getMembership(cid, userId);
    if (m && m.role !== 'member') return true;
  }
  return false;
}

function parseIngredients(v: unknown): Ingredient[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 100) throw badRequest('ingredients must be an array of at most 100 items');
  return v.map((raw, i) => {
    if (typeof raw === 'string') return parseIngredientLine(raw);
    const o = obj(raw);
    const name = str(o.name, `ingredients[${i}].name`, { max: 120 })!;
    const parsed = parseIngredientLine(name);
    return {
      quantity: o.quantity === null ? null : (num(o.quantity, `ingredients[${i}].quantity`, { min: 0, max: 100000, optional: true }) ?? null),
      unit: str(o.unit, 'unit', { max: 20, optional: true }) ?? '',
      name,
      note: str(o.note, 'note', { max: 200, optional: true }),
      aisle: AISLES.some((a) => a.id === o.aisle) ? (o.aisle as Ingredient['aisle']) : parsed.aisle,
      group: str(o.group, 'group', { max: 60, optional: true }),
    };
  });
}

function parseSteps(v: unknown): Step[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 80) throw badRequest('steps must be an array of at most 80 items');
  return v.map((raw, i) => {
    if (typeof raw === 'string') return { text: raw.trim().slice(0, 1000) };
    const o = obj(raw);
    return {
      text: str(o.text, `steps[${i}].text`, { max: 1000 })!,
      timestampSec: num(o.timestampSec, 'timestampSec', { min: 0, optional: true }) ?? null,
      durationMin: num(o.durationMin, 'durationMin', { min: 0, optional: true }) ?? null,
    };
  }).filter((s) => s.text);
}

router.on('PATCH', '/api/recipes/:rid', async (ctx) => {
  const u = me(ctx);
  const recipe = await repo.getRecipe(ctx.params.rid!);
  if (!recipe || !(await canReadRecipe(recipe, u.id))) throw notFound('Recipe not found');
  if (!(await canEditRecipe(recipe, u.id))) throw forbidden('Only the recipe owner or a community admin can edit it');
  const b = obj(ctx.body);
  const next: Recipe = { ...recipe, updatedAt: nowIso() };
  if (b.title !== undefined) next.title = str(b.title, 'title', { max: 140 })!;
  if (b.description !== undefined) next.description = str(b.description, 'description', { max: 600, optional: true });
  if (b.cuisine !== undefined) next.cuisine = str(b.cuisine, 'cuisine', { max: 40, optional: true });
  if (b.servings !== undefined) next.servings = num(b.servings, 'servings', { min: 1, max: 100 })!;
  if (b.prepMin !== undefined) next.prepMin = num(b.prepMin, 'prepMin', { min: 0, max: 2000, optional: true }) ?? null;
  if (b.cookMin !== undefined) next.cookMin = num(b.cookMin, 'cookMin', { min: 0, max: 5000, optional: true }) ?? null;
  if (b.tags !== undefined) next.tags = (strArray(b.tags, 'tags', 15, 30) ?? []).map((t) => t.toLowerCase());
  if (b.tips !== undefined) next.tips = strArray(b.tips, 'tips', 20, 500);
  next.ingredients = parseIngredients(b.ingredients) ?? next.ingredients;
  next.steps = parseSteps(b.steps) ?? next.steps;
  const total = (next.prepMin ?? 0) + (next.cookMin ?? 0);
  next.totalMin = total > 0 ? total : null;
  await repo.saveRecipeAndSummaries(next);
  const res: RecipeResponse = { recipe: next, canEdit: true };
  return res;
});

router.on('DELETE', '/api/recipes/:rid', async (ctx) => {
  const u = me(ctx);
  const recipe = await repo.getRecipe(ctx.params.rid!);
  if (!recipe || !(await canReadRecipe(recipe, u.id))) throw notFound('Recipe not found');
  if (recipe.ownerId !== u.id) throw forbidden('Only the person who added a recipe can delete it');
  await repo.deleteRecipe(recipe);
  return { ok: true };
});

router.on('POST', '/api/recipes/:rid/share', async (ctx) => {
  const u = me(ctx);
  const cid = str(obj(ctx.body).communityId, 'communityId')!;
  await requireMember(cid, u.id);
  const recipe = await repo.getRecipe(ctx.params.rid!);
  if (!recipe || !(await canReadRecipe(recipe, u.id))) throw notFound('Recipe not found');
  await repo.shareRecipe(recipe, cid, u.id);
  return { ok: true };
});

/* ----------------------------------- imports --------------------------------- */

router.on('POST', '/api/uploads', async (ctx) => {
  const u = me(ctx);
  const contentType = str(obj(ctx.body).contentType, 'contentType')!;
  if (!ALLOWED_UPLOAD_TYPES.includes(contentType)) throw badRequest('Only photos (JPEG, PNG, WebP, HEIC) and videos (MP4, MOV, WebM) can be uploaded');
  const key = uploadKey(u.id, contentType);
  return { key, uploadUrl: await presignUpload(key, contentType) };
});

router.on('POST', '/api/imports', async (ctx) => {
  const u = me(ctx);
  const b = obj(ctx.body);
  await repo.ensureUser(u.id, u.email, u.name);
  const imageKeys = strArray(b.imageKeys, 'imageKeys', 6, 300);
  const keys = imageKeys ?? [];
  const videoKey = keys.find((k) => /\.(mp4|mov|webm)$/.test(k));
  return createImport({
    userId: u.id,
    communityId: str(b.communityId, 'communityId')!,
    url: str(b.url, 'url', { max: 2000, optional: true }),
    imageKeys: videoKey ? undefined : imageKeys,
    videoKey,
    text: str(b.text, 'text', { max: 20000, optional: true }),
    channel: 'web',
  });
});

router.on('GET', '/api/imports', async (ctx) => {
  const u = me(ctx);
  return { imports: await repo.listUserImports(u.id) };
});

router.on('GET', '/api/imports/:id', async (ctx) => {
  const u = me(ctx);
  const job = await repo.getImport(ctx.params.id!);
  if (!job || job.userId !== u.id) throw notFound('Import not found');
  return job satisfies ImportJob;
});

/* ------------------------------------ plans ---------------------------------- */

function requireWeek(week: string): string {
  if (!isWeekKey(week)) throw badRequest('week must be the ISO date of a Monday, e.g. 2026-10-05');
  return week;
}

function emptyPlan(communityId: string, weekStart: string): MealPlan {
  return { communityId, weekStart, entries: [], constraints: [], updatedAt: nowIso() };
}

async function planResponse(communityId: string, plan: MealPlan): Promise<PlanResponse> {
  const all = await repo.listCommunityRecipes(communityId);
  const ids = new Set(plan.entries.map((e) => e.recipeId).filter(Boolean));
  return { plan, recipes: all.filter((r) => ids.has(r.id)) };
}

function parseEntries(v: unknown): PlanEntry[] {
  if (!Array.isArray(v) || v.length > 7 * MEAL_SLOTS.length * 3) throw badRequest('entries must be an array');
  const entries = v.map((raw) => {
    const o = obj(raw);
    const slot = o.slot as PlanEntry['slot'];
    if (!MEAL_SLOTS.includes(slot)) throw badRequest('Invalid meal slot');
    return {
      id: str(o.id, 'id', { max: 40, optional: true }) ?? newId(10),
      day: num(o.day, 'day', { min: 0, max: 6 })!,
      slot,
      recipeId: str(o.recipeId, 'recipeId', { max: 40, optional: true }),
      label: str(o.label, 'label', { max: 80, optional: true }),
      servings: num(o.servings, 'servings', { min: 1, max: 100, optional: true }) ?? 2,
      leftoverOf: str(o.leftoverOf, 'leftoverOf', { max: 40, optional: true }),
      note: str(o.note, 'note', { max: 200, optional: true }),
    } satisfies PlanEntry;
  });
  const ids = new Set(entries.map((e) => e.id));
  for (const e of entries) if (e.leftoverOf && !ids.has(e.leftoverOf)) e.leftoverOf = undefined;
  return entries;
}

function parseConstraints(v: unknown): PlanConstraint[] {
  const list = strArray(v, 'constraints', 10, 30) ?? [];
  return list.filter((c): c is PlanConstraint => PLAN_CONSTRAINTS.some((p) => p.id === c));
}

router.on('GET', '/api/communities/:cid/plans/:week', async (ctx) => {
  const u = me(ctx);
  const week = requireWeek(ctx.params.week!);
  await requireMember(ctx.params.cid!, u.id);
  const plan = (await repo.getPlan(ctx.params.cid!, week)) ?? emptyPlan(ctx.params.cid!, week);
  return planResponse(ctx.params.cid!, plan);
});

router.on('PUT', '/api/communities/:cid/plans/:week', async (ctx) => {
  const u = me(ctx);
  const week = requireWeek(ctx.params.week!);
  await requireMember(ctx.params.cid!, u.id);
  const b = obj(ctx.body);
  const existing = await repo.getPlan(ctx.params.cid!, week);
  const plan: MealPlan = {
    communityId: ctx.params.cid!,
    weekStart: week,
    entries: parseEntries(b.entries),
    constraints: b.constraints !== undefined ? parseConstraints(b.constraints) : existing?.constraints ?? [],
    notes: b.notes !== undefined ? str(b.notes, 'notes', { max: 1000, optional: true }) : existing?.notes,
    aiSummary: existing?.aiSummary,
    updatedAt: nowIso(),
    updatedBy: u.id,
  };
  await repo.putPlan(plan);
  return planResponse(ctx.params.cid!, plan);
});

router.on('POST', '/api/communities/:cid/plans/:week/suggest', async (ctx) => {
  const u = me(ctx);
  const week = requireWeek(ctx.params.week!);
  const { community } = await requireMember(ctx.params.cid!, u.id);
  const payer = await payerFor(community);
  const gate = canUseAiFeatures(budgetFor(payer));
  if (!gate.ok) {
    if (gate.reason === 'tier') throw paymentRequired('AI meal planning is part of the Plus and Pro plans.', 'ai_tier');
    throw paymentRequired(`${community.name} has used its AI allowance for this month. The owner can buy more credits.`, 'ai_allowance');
  }
  const b = obj(ctx.body);
  const request: SuggestPlanRequest = {
    constraints: parseConstraints(b.constraints),
    notes: str(b.notes, 'notes', { max: 1000, optional: true }),
    awayDays: Array.isArray(b.awayDays) ? b.awayDays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : [],
    slots: (strArray(b.slots, 'slots', 4, 20) ?? ['dinner']).filter((s): s is PlanEntry['slot'] => MEAL_SLOTS.includes(s as PlanEntry['slot'])),
    servings: num(b.servings, 'servings', { min: 1, max: 40, optional: true }),
    allowNewIdeas: Boolean(b.allowNewIdeas),
  };
  const catalog = await repo.listCommunityRecipes(community.id);
  if (catalog.length < 3) throw badRequest('Add at least 3 recipes to the book before asking for a plan.');
  const members = await repo.listMembers(community.id);
  const profiles = (await Promise.all(members.map((m) => repo.getUser(m.userId)))).filter(Boolean);
  try {
    const { plan, newIdeas, usage } = await suggestPlan({
      request,
      catalog,
      diets: profiles.map((p) => ({ name: p!.displayName, diet: p!.diet })),
      weekStart: week,
      communityId: community.id,
      model: env.geminiModel,
      userId: u.id,
    });
    const costMicros = await chargeAi(payer, { model: env.geminiModel, usage, kind: 'plan', ref: `${community.id}:${week}`, actorId: u.id });
    // Returned as a draft; the client saves it with PUT once the household is happy.
    const res: SuggestPlanResponse = { plan, newIdeas, costMicros };
    return res;
  } catch (err) {
    if (err instanceof UserFacingError) throw badRequest(err.message);
    throw err;
  }
});

/* ------------------------------- shopping lists ------------------------------ */

router.on('GET', '/api/communities/:cid/lists/:week', async (ctx) => {
  const u = me(ctx);
  const week = requireWeek(ctx.params.week!);
  await requireMember(ctx.params.cid!, u.id);
  const { list } = await repo.getListWithVersion(ctx.params.cid!, week);
  return { list: list ?? { communityId: ctx.params.cid!, weekStart: week, items: [], generatedAt: '', updatedAt: nowIso() } };
});

router.on('POST', '/api/communities/:cid/lists/:week/generate', async (ctx) => {
  const u = me(ctx);
  const week = requireWeek(ctx.params.week!);
  const { community } = await requireMember(ctx.params.cid!, u.id);
  const plan = await repo.getPlan(community.id, week);
  if (!plan?.entries.some((e) => e.recipeId)) throw badRequest('Add some recipes to this week\'s plan first.');
  const recipes = await repo.batchGetRecipes(plan.entries.map((e) => e.recipeId).filter((x): x is string => Boolean(x)));
  const user = await repo.getUser(u.id);
  const list = await repo.mutateList(community.id, week, (prev) => ({
    ...prev,
    items: buildShoppingList(plan, recipes, { units: user?.units ?? 'us', pantryStaples: community.pantryStaples, previous: prev.items }),
    generatedAt: nowIso(),
  }));
  return { list };
});

router.on('POST', '/api/communities/:cid/lists/:week/items', async (ctx) => {
  const u = me(ctx);
  const week = requireWeek(ctx.params.week!);
  await requireMember(ctx.params.cid!, u.id);
  const b = obj(ctx.body);
  const item = manualItem(str(b.name, 'name', { max: 100 })!, str(b.amount, 'amount', { max: 40, optional: true }));
  const list = await repo.mutateList(ctx.params.cid!, week, (prev) => {
    if (prev.items.length >= 300) throw badRequest('The list is full');
    return { ...prev, items: [...prev.items, item] };
  });
  return { list };
});

router.on('PATCH', '/api/communities/:cid/lists/:week/items/:key', async (ctx) => {
  const u = me(ctx);
  const week = requireWeek(ctx.params.week!);
  await requireMember(ctx.params.cid!, u.id);
  const b = obj(ctx.body);
  const key = ctx.params.key!;
  const list = await repo.mutateList(ctx.params.cid!, week, (prev) => {
    if (!prev.items.some((i) => i.key === key)) throw notFound('Item not found');
    const items = b.remove
      ? prev.items.filter((i) => i.key !== key)
      : prev.items.map((i) => (i.key === key && typeof b.checked === 'boolean' ? { ...i, checked: b.checked } : i));
    return { ...prev, items };
  });
  return { list };
});

router.on('POST', '/api/communities/:cid/lists/:week/send', async (ctx) => {
  const u = me(ctx);
  const week = requireWeek(ctx.params.week!);
  const { community } = await requireMember(ctx.params.cid!, u.id);
  const channels = await repo.listUserChannels(u.id);
  if (!channels.length) throw badRequest('Link a Telegram, WhatsApp or SMS chat in your account first.');
  const { list } = await repo.getListWithVersion(community.id, week);
  const text = listText(list, community.name);
  const target = channels.find((c) => c.kind === 'telegram') ?? channels.find((c) => c.kind === 'whatsapp') ?? channels[0]!;
  const sent = await sendToChannel(target.kind, target.address, text);
  if (!sent) throw new UserFacingError('Could not reach your chat right now.');
  return { ok: true, sentTo: target.kind };
});

/* ----------------------------------- billing --------------------------------- */

router.on('POST', '/api/billing/checkout', async (ctx) => {
  const u = me(ctx);
  const user = await repo.ensureUser(u.id, u.email, u.name);
  const b = obj(ctx.body);
  const base = {
    client_reference_id: user.id,
    metadata: { userId: user.id },
    ...(user.stripeCustomerId ? { customer: user.stripeCustomerId } : user.email ? { customer_email: user.email } : {}),
    success_url: `${env.appUrl}/account?checkout=success`,
    cancel_url: `${env.appUrl}/account?checkout=cancelled`,
    allow_promotion_codes: true,
  };
  if (b.tier === 'plus' || b.tier === 'pro') {
    if (user.stripeSubscriptionId && user.tier !== 'free') {
      throw badRequest('You already have a subscription. Use "Manage billing" to change plans.');
    }
    const price = await priceForTier(b.tier);
    if (!price) throw badRequest('Billing is not configured yet');
    const session = await stripeApi<{ url: string }>('POST', 'checkout/sessions', {
      ...base,
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      subscription_data: { metadata: { userId: user.id } },
    });
    return { url: session.url };
  }
  const pack = CREDIT_PACKS.find((p) => p.id === b.creditPackId);
  if (!pack) throw badRequest('Choose a plan or a credit pack');
  if (!tierConfig(user.tier).aiFeatures) throw paymentRequired('AI credits are available on the Plus and Pro plans.', 'ai_tier');
  const session = await stripeApi<{ url: string }>('POST', 'checkout/sessions', {
    ...base,
    mode: 'payment',
    ...(user.stripeCustomerId ? {} : { customer_creation: 'always' }),
    metadata: { userId: user.id, creditPackId: pack.id },
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: pack.priceCents, product_data: { name: `Potluck AI credits (${pack.id.replace('credits_', '$')})` } } }],
  });
  return { url: session.url };
});

router.on('POST', '/api/billing/portal', async (ctx) => {
  const u = me(ctx);
  const user = await repo.ensureUser(u.id, u.email, u.name);
  if (!user.stripeCustomerId) throw badRequest('No billing account yet. Choose a plan first.');
  const session = await stripeApi<{ url: string }>('POST', 'billing_portal/sessions', { customer: user.stripeCustomerId, return_url: `${env.appUrl}/account` });
  return { url: session.url };
});

/* ----------------------------------- entry ----------------------------------- */

interface JwtClaims { sub?: string; email?: string; name?: string; 'cognito:username'?: string }

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  let ctx: Ctx;
  try {
    ctx = buildCtx(event);
  } catch (err) {
    return json(400, { error: (err as Error).message, code: 'bad_request' });
  }
  const claims = (event.requestContext as { authorizer?: { jwt?: { claims?: JwtClaims } } }).authorizer?.jwt?.claims;
  if (ctx.path.startsWith('/api/')) {
    if (!claims?.sub) return json(401, { error: 'Sign in required', code: 'unauthorized' });
    ctx.user = { id: claims.sub, email: claims.email ?? '', name: claims.name ?? claims.email?.split('@')[0] ?? 'Cook' };
  }
  return dispatch(router, ctx);
}

export { router };
