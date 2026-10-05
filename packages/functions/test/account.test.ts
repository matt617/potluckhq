import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ log: [] as string[], stripeError: null as Error | null }));

vi.mock('../src/lib/stripe.js', () => ({
  stripeApi: async (method: string, path: string) => {
    calls.log.push(`stripe ${method} ${path}`);
    if (calls.stripeError) throw calls.stripeError;
    return {};
  },
}));
vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: class { send = async () => { calls.log.push('cognito delete'); }; },
  AdminDeleteUserCommand: class { constructor(public input: unknown) {} },
}));
vi.mock('../src/lib/repo.js', () => ({
  getUser: async (id: string) => (id === 'u1' ? { id: 'u1', stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1' } : { id, defaultCommunityId: 'own' }),
  listUserMemberships: async () => [
    { communityId: 'own', userId: 'u1', role: 'owner' },
    { communityId: 'other', userId: 'u1', role: 'member' },
  ],
  listMembers: async () => [{ communityId: 'own', userId: 'u1' }, { communityId: 'own', userId: 'friend' }],
  deleteCommunity: async (id: string) => void calls.log.push(`delete community ${id}`),
  updateUser: async (id: string) => void calls.log.push(`reset default ${id}`),
  removeMember: async (cid: string) => void calls.log.push(`leave ${cid}`),
  listUserRecipes: async () => [{ id: 'r1' }, { id: 'r2' }],
  deleteRecipe: async (r: { id: string }) => void calls.log.push(`delete recipe ${r.id}`),
  listUserChannels: async () => [{ kind: 'telegram', address: '42' }],
  deleteChannel: async (k: string) => void calls.log.push(`unlink ${k}`),
  purgeUserRecords: async (_id: string, cus?: string) => void calls.log.push(`purge ${cus}`),
}));

process.env.USER_POOL_ID = 'us-east-1_test';
const { deleteAccount } = await import('../src/lib/account.js');

beforeEach(() => {
  calls.log.length = 0;
  calls.stripeError = null;
});

describe('deleteAccount', () => {
  it('cancels billing first, then removes shared data, personal records and the login', async () => {
    const summary = await deleteAccount('u1');
    expect(summary).toEqual({ communitiesDeleted: 1, communitiesLeft: 1, recipesDeleted: 2, subscriptionCancelled: true });
    expect(calls.log).toEqual([
      'stripe DELETE subscriptions/sub_1',
      'delete community own',
      'reset default friend',
      'leave other',
      'delete recipe r1',
      'delete recipe r2',
      'unlink telegram',
      'purge cus_1',
      'cognito delete',
    ]);
  });

  it('tolerates an already cancelled subscription', async () => {
    calls.stripeError = new Error('Stripe 404: No such subscription');
    await expect(deleteAccount('u1')).resolves.toMatchObject({ subscriptionCancelled: false });
  });

  it('stops before deleting anything if billing cannot be cancelled', async () => {
    calls.stripeError = new Error('Stripe 500: api_error');
    await expect(deleteAccount('u1')).rejects.toThrow(/500/);
    expect(calls.log).toEqual(['stripe DELETE subscriptions/sub_1']);
  });
});
