import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Community, ImportJob, Membership, UserProfile, MealPlan, Recipe, ShoppingList } from '@potluck/core';

const db = vi.hoisted(() => ({
  users: new Map<string, UserProfile>(),
  communities: new Map<string, Community>(),
  members: [] as Membership[],
  imports: new Map<string, ImportJob>(),
  recipes: new Map<string, Recipe>(),
  plans: new Map<string, MealPlan>(),
  lists: new Map<string, ShoppingList>(),
}));

vi.mock('../src/lib/kitchen-repo.js', () => ({ diners: async () => [{ id: 'diner' }], participation: async () => undefined }));
vi.mock('../src/lib/secrets.js', () => ({ secrets: async () => ({}) }));
vi.mock('../src/lib/queue.js', () => ({ enqueueImport: vi.fn(async () => undefined) }));
const limits = vi.hoisted(() => ({ blocked: new Set<string>() }));
vi.mock('../src/lib/ratelimit.js', () => ({
  enforceLimit: async (name: string, _subject: string, message: string) => {
    if (limits.blocked.has(name)) {
      const { HttpError } = await import('../src/lib/http.js');
      throw new HttpError(429, message, 'rate_limited');
    }
  },
  allowLimit: async () => true,
}));
vi.mock('../src/lib/repo.js', async () => {
  const { defaultProfile } = await vi.importActual<typeof import('../src/lib/repo.js')>('../src/lib/repo.js');
  return {
    defaultProfile,
    getUser: async (id: string) => db.users.get(id),
    ensureUser: async (id: string, email: string, name: string) => {
      if (!db.users.has(id)) db.users.set(id, defaultProfile(id, email, name));
      return db.users.get(id)!;
    },
    updateUser: async (id: string, patch: Partial<UserProfile>) => {
      db.users.set(id, { ...db.users.get(id)!, ...patch });
    },
    listUserMemberships: async (uid: string) => db.members.filter((m) => m.userId === uid),
    listUserChannels: async () => [],
    getCommunity: async (id: string) => db.communities.get(id),
    getMembership: async (cid: string, uid: string) => db.members.find((m) => m.communityId === cid && m.userId === uid),
    createCommunity: async (c: Community, m: Membership) => {
      db.communities.set(c.id, c);
      db.members.push(m);
    },
    listMembers: async (cid: string) => db.members.filter((m) => m.communityId === cid),
    listCommunityRecipes: async (cid: string) => [...db.recipes.values()].filter((r) => r.communityIds.includes(cid)),
    batchGetRecipes: async (ids: string[]) => new Map([...db.recipes].filter(([id]) => ids.includes(id))),
    getPlan: async (cid: string, week: string) => db.plans.get(`${cid}:${week}`),
    putPlan: async (plan: MealPlan) => db.plans.set(`${plan.communityId}:${plan.weekStart}`, plan),
    getListWithVersion: async (cid: string, week: string) => ({ list: db.lists.get(`${cid}:${week}`), version: 1 }),
    mutateList: async (cid: string, week: string, fn: (x: ShoppingList) => ShoppingList) => {
      const next = fn(db.lists.get(`${cid}:${week}`) ?? { communityId: cid, weekStart: week, items: [], generatedAt: '', updatedAt: '' });
      db.lists.set(`${cid}:${week}`, next);
      return next;
    },
    getInvite: async () => undefined,
    putImport: async (job: ImportJob) => {
      db.imports.set(job.id, job);
    },
    getImport: async (id: string) => db.imports.get(id),
    updateImport: async (id: string, patch: Partial<ImportJob>) => {
      db.imports.set(id, { ...db.imports.get(id)!, ...patch });
    },
  };
});

const { handler } = await import('../src/handlers/api.js');

function event(method: string, path: string, body?: unknown, sub: string | null = 'u1'): APIGatewayProxyEventV2 {
  return {
    rawPath: path,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
    requestContext: { http: { method }, ...(sub ? { authorizer: { jwt: { claims: { sub, email: `${sub}@example.com` } } } } : {}) },
  } as unknown as APIGatewayProxyEventV2;
}

async function call(method: string, path: string, body?: unknown, sub: string | null = 'u1') {
  const res = (await handler(event(method, path, body, sub))) as APIGatewayProxyStructuredResultV2;
  return { status: res.statusCode, body: JSON.parse(String(res.body)) };
}

beforeEach(() => {
  limits.blocked.clear();
  db.users.clear();
  db.communities.clear();
  db.members.length = 0;
  db.imports.clear();
  db.recipes.clear();
  db.plans.clear();
  db.lists.clear();
});

function failedImport(communityId: string, patch: Partial<ImportJob> = {}): ImportJob {
  const job: ImportJob = {
    id: 'imp1',
    userId: 'u1',
    communityId,
    status: 'failed',
    kind: 'url',
    url: 'https://www.tiktok.com/@chef/video/1',
    channel: 'web',
    error: 'Could not download that video.',
    errorCode: 'download',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...patch,
  };
  db.imports.set(job.id, job);
  return job;
}

describe('api handler', () => {
  it('rejects /api calls without a verified token', async () => {
    expect((await call('GET', '/api/me', undefined, null)).status).toBe(401);
  });

  it('creates a profile on first /api/me', async () => {
    const res = await call('GET', '/api/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'u1', tier: 'free', email: 'u1@example.com' });
    expect(res.body.budget.aiFeatures).toBe(false);
  });

  it('limits free users to one community', async () => {
    expect((await call('POST', '/api/communities', { name: 'Home' })).status).toBe(200);
    const second = await call('POST', '/api/communities', { name: 'Office' });
    expect(second.status).toBe(402);
    expect(second.body.code).toBe('tier_limit');
  });

  it('lets paid users create more communities', async () => {
    await call('GET', '/api/me');
    db.users.set('u1', { ...db.users.get('u1')!, tier: 'plus' });
    for (const name of ['Home', 'Office', 'Friends']) expect((await call('POST', '/api/communities', { name })).status).toBe(200);
    expect((await call('POST', '/api/communities', { name: 'Fourth' })).body.code).toBe('tier_limit');
  });

  it('blocks AI planning for communities owned by free users', async () => {
    const c = await call('POST', '/api/communities', { name: 'Home' });
    const res = await call('POST', `/api/communities/${c.body.id}/plans/2026-10-05/suggest`, { constraints: ['glp1'] });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('ai_tier');
  });

  it('keeps non-members out of a community', async () => {
    const c = await call('POST', '/api/communities', { name: 'Home' });
    expect((await call('GET', `/api/communities/${c.body.id}`, undefined, 'stranger')).status).toBe(403);
  });

  it('validates week keys', async () => {
    const c = await call('POST', '/api/communities', { name: 'Home' });
    expect((await call('GET', `/api/communities/${c.body.id}/plans/2026-10-06`)).status).toBe(400);
  });

  it('returns 429 when a rate limit is hit', async () => {
    const c = await call('POST', '/api/communities', { name: 'Home' });
    db.users.set('u1', { ...db.users.get('u1')!, tier: 'plus' });
    limits.blocked.add('planSuggestPerHour');
    const res = await call('POST', `/api/communities/${c.body.id}/plans/2026-10-05/suggest`, { constraints: [] });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('rate_limited');
  });

  it('serves public invite previews without auth and 404s unknown tokens', async () => {
    expect((await call('GET', '/public/invites/nope', undefined, null)).status).toBe(404);
  });

  it('retries a failed link import as a new job and hides the old one', async () => {
    const c = await call('POST', '/api/communities', { name: 'Home' });
    failedImport(c.body.id);
    const res = await call('POST', '/api/imports/imp1/retry');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'queued', kind: 'url', url: 'https://www.tiktok.com/@chef/video/1', communityId: c.body.id });
    expect(res.body.id).not.toBe('imp1');
    expect(db.imports.get('imp1')!.dismissedAt).toBeTruthy();
  });

  it("refuses to retry uploads, unfinished imports, or someone else's import", async () => {
    const c = await call('POST', '/api/communities', { name: 'Home' });
    failedImport(c.body.id, { kind: 'image', url: undefined, imageKeys: ['uploads/u1/a.jpg'] });
    expect((await call('POST', '/api/imports/imp1/retry')).status).toBe(400);
    failedImport(c.body.id, { status: 'extracting' });
    expect((await call('POST', '/api/imports/imp1/retry')).status).toBe(400);
    failedImport(c.body.id);
    expect((await call('POST', '/api/imports/imp1/retry', undefined, 'stranger')).status).toBe(404);
    expect((await call('POST', '/api/imports/imp1/dismiss', undefined, 'stranger')).status).toBe(404);
  });

  it('dismisses a failed import', async () => {
    const c = await call('POST', '/api/communities', { name: 'Home' });
    failedImport(c.body.id);
    expect((await call('POST', '/api/imports/imp1/dismiss')).status).toBe(200);
    expect(db.imports.get('imp1')!.dismissedAt).toBeTruthy();
  });
});

describe('kitchen planning and shopping contracts', () => {
  const week = '2026-10-05';
  async function setup() {
    const { body: c } = await call('POST', '/api/communities', { name: 'Home' });
    db.recipes.set('r', {
      id: 'r',
      ownerId: `KITCHEN#${c.id}`,
      kitchenId: c.id,
      title: 'Rice',
      servings: 2,
      ingredients: [{ name: 'rice', quantity: 1, unit: 'cup', aisle: 'pantry' }],
      steps: [],
      tags: [],
      source: { platform: 'text' },
      communityIds: [c.id],
      createdAt: 'now',
      updatedAt: 'now',
    });
    return {
      cid: c.id,
      path: `/api/communities/${c.id}/plans/${week}`,
      entry: { id: 'meal', day: 0, slot: 'dinner', recipeId: 'r', servings: 2, dinerIds: ['diner'], cookId: 'u1' },
    };
  }
  it('saves scoped attendance and rejects stale revisions without overwriting', async () => {
    const { cid, path, entry } = await setup();
    const first = await call('PUT', path, { revision: 0, entries: [entry], constraints: ['glp1', 'workout', 'quick'] });
    expect(first.status).toBe(200);
    expect(first.body.plan.revision).toBe(1);
    expect(first.body.plan.constraints).not.toContain('glp1');
    expect((await call('PUT', path, { revision: 0, entries: [] })).status).toBe(409);
    expect(db.plans.get(`${cid}:${week}`)?.entries).toHaveLength(1);
  });
  it('rejects foreign recipes, missing people, nonmember cooks and techniques', async () => {
    const { path, entry } = await setup();
    for (const patch of [{ recipeId: 'foreign' }, { dinerIds: ['foreign'] }, { cookId: 'outsider' }, { leftoverOf: 'missing' }])
      expect((await call('PUT', path, { revision: 0, entries: [{ ...entry, ...patch }] })).status).toBe(400);
    db.recipes.get('r')!.kind = 'technique';
    expect((await call('PUT', path, { revision: 0, entries: [entry] })).status).toBe(400);
  });
  it('requires a fresh shopping preview after recipe changes', async () => {
    const { cid, path, entry } = await setup();
    await call('PUT', path, { revision: 0, entries: [entry] });
    const listPath = `/api/communities/${cid}/lists/${week}/generate`;
    const preview = await call('POST', listPath, { preview: true });
    expect(preview.status).toBe(200);
    expect(db.lists.size).toBe(0);
    db.recipes.get('r')!.updatedAt = 'later';
    expect((await call('POST', listPath, { planFingerprint: preview.body.list.planFingerprint })).status).toBe(409);
    const fresh = await call('POST', listPath, { preview: true });
    expect((await call('POST', listPath, { planFingerprint: fresh.body.list.planFingerprint })).status).toBe(200);
    expect(db.lists.size).toBe(1);
  });
  it('keeps circles out of kitchen planning and shopping endpoints', async () => {
    const { body: c } = await call('POST', '/api/communities', { name: 'Friends', kind: 'circle' });
    for (const path of [`plans/${week}`, `lists/${week}`]) expect((await call('GET', `/api/communities/${c.id}/${path}`)).status).toBe(400);
  });
});
