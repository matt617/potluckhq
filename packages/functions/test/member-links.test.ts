import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Router, type Ctx } from '../src/lib/http';
const mock = vi.hoisted(() => ({
  send: vi.fn(),
  getMembership: vi.fn(),
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  updateUser: vi.fn(),
  listMembers: vi.fn(),
  listUserMemberships: vi.fn(),
  getCommunity: vi.fn(),
}));
vi.mock('../src/lib/db.js', async () => ({
  ...(await vi.importActual('../src/lib/db.js')),
  ddb: { send: mock.send },
}));
vi.mock('../src/lib/repo.js', () => mock);
vi.mock('../src/lib/access.js', () => ({
  requireAdmin: mock.requireAdmin,
  payerFor: async () => ({ tier: 'free' }),
}));
vi.mock('../src/lib/ratelimit.js', () => ({ enforce: async () => {} }));
const { registerMemberLinkRoutes } = await import('../src/lib/member-links');
const router = new Router();
registerMemberLinkRoutes(router);
const community = { id: 'home', name: 'Home', kind: 'kitchen', memberCount: 1 };
const nomination = {
  communityId: 'home',
  communityName: 'Home',
  userId: 'bob',
  displayName: 'Bob',
  nominatedBy: 'alice',
  nominatedByName: 'Alice',
  role: 'member',
  expiresAt: '2099-01-01',
};
function call(method: string, path: string, body: unknown = {}, id = 'alice') {
  const route = router.match(method, path)!;
  return route.handler({
    params: route.params,
    body,
    user: { id, email: `${id}@test.dev`, name: id },
  } as Ctx);
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.requireAdmin.mockResolvedValue({
    community,
    membership: { role: 'owner' },
  });
  mock.getMembership.mockResolvedValue(undefined);
  mock.getCommunity.mockResolvedValue(community);
  mock.getUser.mockImplementation(async (id) => ({
    id,
    displayName: id,
    email: `${id}@test.dev`,
  }));
  mock.listMembers.mockResolvedValue([]);
  mock.listUserMemberships.mockResolvedValue([]);
  mock.send.mockResolvedValue({});
});
describe('member lookup and nominations', () => {
  it('requires administration before searching or nominating', async () => {
    mock.requireAdmin.mockRejectedValue({ status: 403 });
    await expect(call('POST', '/api/communities/home/member-search', { query: 'Bob' })).rejects.toMatchObject({ status: 403 });
    await expect(
      call('POST', '/api/communities/home/nominations', {
        userId: 'bob',
        role: 'member',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(mock.send).not.toHaveBeenCalled();
  });
  it('searches shared members by name without scanning private profiles', async () => {
    mock.listUserMemberships.mockResolvedValue([{ communityId: 'friends' }]);
    mock.listMembers.mockResolvedValue([{ userId: 'bob', displayName: 'Bob' }]);
    const result = await call('POST', '/api/communities/home/member-search', {
      query: 'bo',
    });
    expect(result).toMatchObject({
      members: [{ userId: 'bob', displayName: 'Bob', status: 'member' }],
    });
    expect(mock.send.mock.calls.every(([c]) => c.constructor.name !== 'ScanCommand')).toBe(true);
  });
  it('matches full email case insensitively and never returns profile or email fields', async () => {
    mock.send.mockImplementation(async (c) =>
      c.constructor.name === 'ScanCommand'
        ? {
            Items: [
              {
                id: 'bob',
                displayName: 'Bob',
                email: 'BOB@Test.dev',
                diet: { allergies: ['private'] },
              },
              { id: 'other', displayName: 'Other', email: 'other@test.dev' },
            ],
          }
        : {},
    );
    expect(
      await call('POST', '/api/communities/home/member-search', {
        query: 'bob@test.dev',
      }),
    ).toEqual({
      members: [
        {
          userId: 'bob',
          displayName: 'Bob',
          context: 'Email matches your search',
          status: 'available',
        },
      ],
      cursor: undefined,
    });
  });
  it('returns a continuation when a bounded lookup has not searched every page', async () => {
    mock.send.mockImplementation(async (c) =>
      c.constructor.name === 'ScanCommand' ? { Items: [], LastEvaluatedKey: { pk: 'USER#last', sk: 'PROFILE' } } : {},
    );
    expect(
      await call('POST', '/api/communities/home/member-search', {
        query: 'bob@test.dev',
      }),
    ).toMatchObject({ members: [], cursor: expect.any(String) });
    expect(mock.send.mock.calls.filter(([c]) => c.constructor.name === 'ScanCommand')).toHaveLength(5);
  });
  it('creates a pending request without creating membership', async () => {
    await call('POST', '/api/communities/home/nominations', {
      userId: 'bob',
      role: 'member',
    });
    expect(mock.send).toHaveBeenCalledOnce();
    expect(mock.send.mock.calls[0]![0].input).toMatchObject({
      Item: {
        pk: 'COMM#home',
        sk: 'NOMINATION#bob',
        gsi1pk: 'USER#bob',
        role: 'member',
      },
      ConditionExpression: 'attribute_not_exists(pk) OR expiresAt <= :now',
    });
  });
  it('rejects existing members, full kitchens and admin elevation by admins', async () => {
    mock.getMembership.mockResolvedValue({ role: 'member' });
    await expect(
      call('POST', '/api/communities/home/nominations', {
        userId: 'bob',
        role: 'member',
      }),
    ).rejects.toMatchObject({ status: 400 });
    mock.getMembership.mockResolvedValue(undefined);
    mock.requireAdmin.mockResolvedValue({
      community: { ...community, memberCount: 100 },
      membership: { role: 'owner' },
    });
    await expect(
      call('POST', '/api/communities/home/nominations', {
        userId: 'bob',
        role: 'member',
      }),
    ).rejects.toMatchObject({ status: 400 });
    mock.requireAdmin.mockResolvedValue({
      community,
      membership: { role: 'admin' },
    });
    await expect(
      call('POST', '/api/communities/home/nominations', {
        userId: 'bob',
        role: 'admin',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('reports duplicate nominations as a recoverable conflict', async () => {
    mock.send.mockRejectedValue({ name: 'ConditionalCheckFailedException' });
    await expect(
      call('POST', '/api/communities/home/nominations', {
        userId: 'bob',
        role: 'member',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('does not let another account accept the nomination', async () => {
    mock.send.mockResolvedValue({ Items: [nomination] });
    await expect(call('POST', '/api/communities/home/nominations/accept')).rejects.toMatchObject({ status: 404 });
    expect(mock.send).toHaveBeenCalledOnce();
  });
  it('rejects expired and withdrawn nominations', async () => {
    mock.send.mockResolvedValue({
      Items: [{ ...nomination, expiresAt: '2000-01-01' }],
    });
    await expect(call('POST', '/api/communities/home/nominations/accept', {}, 'bob')).rejects.toMatchObject({ status: 404 });
    mock.send.mockResolvedValue({ Items: [] });
    await expect(call('POST', '/api/communities/home/nominations/accept', {}, 'bob')).rejects.toMatchObject({ status: 404 });
  });
  it('atomically consumes nomination, adds membership and enforces capacity', async () => {
    mock.send.mockResolvedValueOnce({ Items: [nomination] }).mockResolvedValue({});
    await call('POST', '/api/communities/home/nominations/accept', {}, 'bob');
    const transaction = mock.send.mock.calls[1]![0].input.TransactItems;
    expect(transaction).toHaveLength(3);
    expect(transaction[0].Delete).toMatchObject({
      Key: { pk: 'COMM#home', sk: 'NOMINATION#bob' },
      ExpressionAttributeValues: {
        ':expires': nomination.expiresAt,
        ':role': 'member',
      },
    });
    expect(transaction[1].Put.Item).toMatchObject({
      userId: 'bob',
      role: 'member',
    });
    expect(transaction[2].Update.ConditionExpression).toContain('memberCount < :limit');
  });
  it('handles acceptance racing a withdrawal or capacity change', async () => {
    mock.send.mockResolvedValueOnce({ Items: [nomination] }).mockRejectedValueOnce({ name: 'TransactionCanceledException' });
    await expect(call('POST', '/api/communities/home/nominations/accept', {}, 'bob')).rejects.toMatchObject({ status: 409 });
  });
  it('lets recipients decline and requires administration to withdraw for others', async () => {
    await call('DELETE', '/api/communities/home/nominations/bob', {}, 'bob');
    expect(mock.requireAdmin).not.toHaveBeenCalled();
    mock.requireAdmin.mockRejectedValue({ status: 403 });
    await expect(call('DELETE', '/api/communities/home/nominations/bob', {}, 'outsider')).rejects.toMatchObject({ status: 403 });
  });
});
