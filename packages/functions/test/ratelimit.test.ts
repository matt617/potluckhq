import { describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, number>());
vi.mock('../src/lib/db.js', () => ({
  ddb: {
    send: async (cmd: { input: { Key: { pk: string; sk: string }; ExpressionAttributeValues: Record<string, number> } }) => {
      const k = `${cmd.input.Key.pk}/${cmd.input.Key.sk}`;
      const n = store.get(k) ?? 0;
      if (n >= cmd.input.ExpressionAttributeValues[':limit']!) throw Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });
      store.set(k, n + 1);
    },
  },
  isConditionalFailure: (e: { name?: string }) => e?.name === 'ConditionalCheckFailedException',
}));

const { hit, enforce } = await import('../src/lib/ratelimit.js');

describe('rate limiter', () => {
  it('allows up to the limit within a window, then blocks', async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hit('test#a', 3, 600));
    expect(results).toEqual([true, true, true, false]);
  });
  it('keeps separate counters per key', async () => {
    expect(await hit('test#b', 1, 600)).toBe(true);
    expect(await hit('test#c', 1, 600)).toBe(true);
  });
  it('raises a 429 with a friendly message', async () => {
    await enforce('test#d', 1, 600, 'slow down');
    await expect(enforce('test#d', 1, 600, 'slow down')).rejects.toMatchObject({ status: 429, code: 'rate_limited', message: 'slow down' });
  });
});
