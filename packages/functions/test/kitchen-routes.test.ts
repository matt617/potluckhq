import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Community, Diner, Membership, Recipe, UserProfile } from '@potluck/core';
import { Router, type Ctx } from '../src/lib/http';

const db = vi.hoisted(() => ({
  communities: new Map<string, Community>(),
  users: new Map<string, UserProfile>(),
  members: [] as Membership[],
  recipes: new Map<string, Recipe>(),
  records: new Map<string, unknown>(),
  accepted: [] as string[],
}));
vi.mock('../src/lib/repo.js', () => ({
  getCommunity: async (id: string) => db.communities.get(id),
  getUser: async (id: string) => db.users.get(id),
  getMembership: async (cid: string, uid: string) => db.members.find((m) => m.communityId === cid && m.userId === uid),
  listUserMemberships: async (uid: string) => db.members.filter((m) => m.userId === uid),
  getRecipe: async (id: string) => db.recipes.get(id),
  listUserRecipes: async (uid: string) => [...db.recipes.values()].filter((r) => r.ownerId === uid),
  summaryOf: (r: Recipe) => r,
  saveRecipeAndSummaries: async (r: Recipe) => db.recipes.set(r.id, r),
  getInvite: async (token: string) => db.records.get(`INVITE#${token}/INVITE`),
}));
vi.mock('../src/lib/kitchen-repo.js', () => ({
  readRecord: async (pk: string, sk: string) => db.records.get(`${pk}/${sk}`),
  writeRecord: async (pk: string, sk: string, v: unknown) => db.records.set(`${pk}/${sk}`, v),
  removeRecord: async (pk: string, sk: string) => db.records.delete(`${pk}/${sk}`),
  diners: async (cid: string) => [...db.records.entries()].filter(([k]) => k.startsWith(`COMM#${cid}/DINER#`)).map(([, v]) => v),
  activity: async (cid: string) => [...db.records.entries()].filter(([k]) => k.startsWith(`COMM#${cid}/ACTIVITY#`)).map(([, v]) => v),
  annotations: async (uid: string) => [...db.records.entries()].filter(([k]) => k.startsWith(`USER#${uid}/ANNOTATION#`)).map(([, v]) => v),
  transfer: async (cid: string) => db.records.get(`COMM#${cid}/TRANSFER`),
  acceptTransfer: async (cid: string) => db.accepted.push(cid),
}));
const { registerKitchenRoutes } = await import('../src/lib/kitchen-routes');
const router = new Router();
registerKitchenRoutes(router);
async function call(method: string, path: string, body: unknown = {}, uid = 'alice') {
  const route = router.match(method, path);
  if (!route) throw new Error('Missing route');
  return route.handler({ params: route.params, body, user: { id: uid, email: `${uid}@example.test`, name: uid } } as Ctx);
}
beforeEach(() => {
  db.communities.clear();
  db.users.clear();
  db.records.clear();
  db.recipes.clear();
  db.members = [];
  db.accepted = [];
  db.communities.set('home', { id: 'home', name: 'Home', ownerId: 'alice', memberCount: 2, pantryStaples: [], createdAt: '' });
  db.members.push(
    { communityId: 'home', userId: 'alice', role: 'owner', displayName: 'Alice', joinedAt: '' },
    { communityId: 'home', userId: 'bob', role: 'member', displayName: 'Bob', joinedAt: '' },
  );
  db.users.set('bob', { id: 'bob', tier: 'free' } as UserProfile);
  db.recipes.set('r', {
    id: 'r',
    ownerId: 'KITCHEN#home',
    kitchenId: 'home',
    communityIds: ['home'],
    title: 'Dinner',
    ingredients: [],
    steps: [],
    tags: [],
    servings: 2,
    source: { platform: 'text' },
    createdAt: '',
    updatedAt: 'now',
  });
});
const diner: Diner = { id: 'd', name: 'Bob', userId: 'bob', portions: 1, usual: true, diet: { allergies: ['peanuts'], diets: [], dislikes: [] } };
describe('kitchen privacy and permissions', () => {
  it('rejects nonmembers reading people or activity', async () => {
    await expect(call('GET', '/api/communities/home/people', {}, 'outsider')).rejects.toMatchObject({ status: 403 });
    await expect(call('GET', '/api/communities/home/activity', {}, 'outsider')).rejects.toMatchObject({ status: 403 });
  });
  it('requires a person to opt into their own shared profile, even for owners', async () => {
    await expect(call('PUT', '/api/communities/home/people/d', diner)).rejects.toMatchObject({ status: 403 });
    await call('PUT', '/api/communities/home/people/d', diner, 'bob');
    expect(db.records.get('COMM#home/DINER#d')).toEqual(diner);
    await expect(call('PUT', '/api/communities/home/people/d', { ...diner, userId: undefined })).rejects.toMatchObject({ status: 403 });
  });
  it('lets the person revoke their profile', async () => {
    db.records.set('COMM#home/DINER#d', diner);
    await call('DELETE', '/api/communities/home/people/d', {}, 'bob');
    expect(db.records.has('COMM#home/DINER#d')).toBe(false);
  });
  it('keeps personal medication and goals out of shared profiles', async () => {
    await call('PUT', '/api/communities/home/people/d', { ...diner, diet: { ...diner.diet, goals: 'private goal', glp1: true } }, 'bob');
    expect((db.records.get('COMM#home/DINER#d') as Diner).diet).toEqual(diner.diet);
  });
  it('allows guest profiles for organizers but not other members', async () => {
    await call('PUT', '/api/communities/home/people/guest', { ...diner, id: 'guest', userId: undefined });
    await expect(call('PUT', '/api/communities/home/people/guest2', { ...diner, id: 'guest2', userId: undefined }, 'bob')).rejects.toMatchObject({
      status: 403,
    });
  });
  it('does not expose private original recipes through lineage', async () => {
    db.recipes.set('r', { ...db.recipes.get('r')!, originRecipeId: 'private' });
    db.recipes.set('private', { ...db.recipes.get('r')!, id: 'private', kitchenId: undefined, ownerId: 'alice', communityIds: [] });
    expect(await call('GET', '/api/recipes/r/origin', {}, 'bob')).toEqual({ available: false });
  });
  it('private notes can only be written on personal copies', async () => {
    await expect(call('PUT', '/api/library/r/annotation', { note: 'secret', collections: [] }, 'bob')).rejects.toMatchObject({ status: 404 });
  });
  it('prevents activity from referencing another kitchen’s recipe', async () => {
    db.recipes.set('r', { ...db.recipes.get('r')!, communityIds: ['elsewhere'] });
    await expect(call('POST', '/api/communities/home/activity', { recipeId: 'r', kind: 'made', note: '' })).rejects.toMatchObject({ status: 404 });
  });
  it('makes Want to try idempotent', async () => {
    for (let i = 0; i < 2; i++) await call('POST', '/api/communities/home/activity', { recipeId: 'r', kind: 'want', note: '' }, 'bob');
    expect([...db.records.keys()].filter((k) => k.includes('ACTIVITY'))).toHaveLength(1);
  });
  it('does not allow another member to erase a contribution', async () => {
    db.records.set('COMM#home/ACTIVITY#a', { actorId: 'alice' });
    await expect(call('DELETE', '/api/communities/home/activity/a', {}, 'bob')).rejects.toMatchObject({ status: 403 });
  });
});
describe('ownership transfer', () => {
  it('requires current owner and existing recipient', async () => {
    await expect(call('POST', '/api/communities/home/transfer', { to: 'alice' }, 'bob')).rejects.toMatchObject({ status: 403 });
    await expect(call('POST', '/api/communities/home/transfer', { to: 'outsider' })).rejects.toMatchObject({ status: 400 });
  });
  it('requires acceptance by the named recipient', async () => {
    await call('POST', '/api/communities/home/transfer', { to: 'bob' });
    await expect(call('POST', '/api/communities/home/transfer/accept', {}, 'alice')).rejects.toMatchObject({ status: 400 });
    await call('POST', '/api/communities/home/transfer/accept', {}, 'bob');
    expect(db.accepted).toEqual(['home']);
  });
  it('rejects expired or over-limit transfers without changing ownership', async () => {
    db.records.set('COMM#home/TRANSFER', { from: 'alice', to: 'bob', expiresAt: '2000-01-01' });
    await expect(call('POST', '/api/communities/home/transfer/accept', {}, 'bob')).rejects.toMatchObject({ status: 400 });
    db.records.set('COMM#home/TRANSFER', { from: 'alice', to: 'bob', expiresAt: '2099-01-01' });
    db.communities.get('home')!.memberCount = 3;
    await expect(call('POST', '/api/communities/home/transfer/accept', {}, 'bob')).rejects.toMatchObject({ status: 400 });
    expect(db.accepted).toEqual([]);
  });
});
