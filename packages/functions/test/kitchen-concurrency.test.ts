import { beforeEach, expect, it, vi } from 'vitest';
const send = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/db.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/db.js')>('../src/lib/db.js');
  return { ...actual, ddb: { send } };
});
const { putPlan } = await import('../src/lib/repo');
const { acceptTransfer } = await import('../src/lib/kitchen-repo');
const { isConditionalFailure } = await import('../src/lib/db.js');
beforeEach(() => {
  send.mockReset();
});
it('recognizes database conflicts', () => {
  expect(isConditionalFailure({ name: 'ConditionalCheckFailedException' })).toBe(true);
});
it('uses a conditional plan write instead of overwriting a newer revision', async () => {
  send.mockRejectedValue(Object.assign(new Error('changed'), { name: 'ConditionalCheckFailedException' }));
  await expect(putPlan({ communityId: 'home', weekStart: '2026-10-05', entries: [], constraints: [], updatedAt: '', revision: 3 }, 2)).rejects.toMatchObject({
    status: 409,
    code: 'plan_conflict',
  });
  expect(send.mock.calls[0]![0].input).toMatchObject({ ConditionExpression: 'revision = :v', ExpressionAttributeValues: { ':v': 2 } });
});
it('atomically changes owner, both roles and consumes the transfer', async () => {
  send.mockResolvedValue({});
  await acceptTransfer('home', { from: 'alice', to: 'bob', expiresAt: '2099-01-01' });
  const transaction = send.mock.calls[0]![0].input.TransactItems;
  expect(transaction).toHaveLength(4);
  expect(transaction[0].Update.ConditionExpression).toBe('ownerId = :from');
  expect(transaction[3].Delete.ConditionExpression).toContain('expiresAt > :now');
});
it('reports a transfer race as a recoverable conflict', async () => {
  send.mockRejectedValue(Object.assign(new Error('changed'), { name: 'TransactionCanceledException' }));
  await expect(acceptTransfer('home', { from: 'alice', to: 'bob', expiresAt: '2099-01-01' })).rejects.toMatchObject({ status: 409 });
});
