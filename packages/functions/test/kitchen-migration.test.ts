import { describe, expect, it } from 'vitest';
import { migrateKitchenSnapshot, type MigrationRow } from '../src/lib/kitchen-migration';

function snapshot(): MigrationRow[] {
  return [
    { pk: 'COMM#home', sk: 'META', id: 'home', name: 'Home' },
    { pk: 'COMM#office', sk: 'META', id: 'office', name: 'Office' },
    {
      pk: 'RECIPE#r',
      sk: 'META',
      id: 'r',
      ownerId: 'alice',
      title: 'Dinner',
      servings: 2,
      tags: [],
      ingredients: [{ name: 'rice', quantity: 1, unit: 'cup', aisle: 'pantry' }],
      steps: [{ text: 'Cook' }],
      source: { platform: 'text' },
      communityIds: ['home', 'office'],
      createdAt: '2026-10-04',
      updatedAt: '2026-10-04',
    },
    ...['home', 'office'].map((c) => ({ pk: `COMM#${c}`, sk: 'RECIPE#r', id: 'r', title: 'Dinner', addedBy: 'alice', addedAt: 'yesterday' })),
    { pk: 'COMM#home', sk: 'PLAN#2026-10-05', entries: [{ id: 'meal', recipeId: 'r', servings: 2 }], updatedAt: 'yesterday' },
    {
      pk: 'COMM#home',
      sk: 'LIST#2026-10-05',
      items: [
        { key: 'rice', recipeIds: ['r'], checked: true },
        { key: 'manual', manual: true },
      ],
    },
    { pk: 'COMM#home', sk: 'SRC#url', recipeId: 'r' },
    { pk: 'IMPORT#job', sk: 'META', communityId: 'home', recipeId: 'r' },
  ];
}
describe('kitchen snapshot migration', () => {
  it('preserves originals, creates independent copies and repairs references', () => {
    const input = snapshot(),
      result = migrateKitchenSnapshot(input);
    expect(result.copies).toBe(2);
    const home = result.rows.find((r) => r.pk === 'COMM#home' && r.sk.startsWith('RECIPE#'))!;
    const office = result.rows.find((r) => r.pk === 'COMM#office' && r.sk.startsWith('RECIPE#'))!;
    expect(home.id).not.toBe(office.id);
    expect(result.rows.find((r) => r.pk === 'RECIPE#r')?.communityIds).toEqual([]);
    expect((result.rows.find((r) => r.sk.startsWith('PLAN#'))?.entries as { recipeId: string }[])[0]?.recipeId).toBe(home.id);
    expect((result.rows.find((r) => r.sk.startsWith('LIST#'))?.items as { checked: boolean }[])[0]?.checked).toBe(true);
    expect(result.rows.find((r) => r.pk === 'IMPORT#job')?.recipeId).toBe(home.id);
    expect(input).toEqual(snapshot());
  });
  it('retains technique classification and assigns private media to the new copy', () => {
    const rows = snapshot(),
      r = rows.find((x) => x.pk === 'RECIPE#r')!;
    r.kind = 'technique';
    r.video = { key: 'private/techniques/r/video.mp4', mimeType: 'video/mp4', clips: [] };
    const result = migrateKitchenSnapshot(rows);
    const copy = result.rows.find((x) => x.pk.startsWith('RECIPE#copy-'))!;
    expect((copy.video as { key: string }).key).toContain(`/techniques/${copy.id}/`);
    expect(result.rows.find((x) => x.pk === 'COMM#home' && x.sk.startsWith('RECIPE#'))?.kind).toBe('technique');
    expect(migrateKitchenSnapshot(result.rows).changes).toEqual([]);
  });
  it('can be rerun without duplicate copies or edits', () => {
    const first = migrateKitchenSnapshot(snapshot());
    expect(migrateKitchenSnapshot(first.rows).changes).toEqual([]);
  });
  it('stops rather than accepting a broken plan', () => {
    const rows = snapshot();
    rows.push({ pk: 'COMM#office', sk: 'PLAN#2026-10-05', entries: [{ recipeId: 'missing' }] });
    expect(() => migrateKitchenSnapshot(rows)).toThrow('missing recipe');
  });
  it('materializes copies before detaching originals', () => {
    const result = migrateKitchenSnapshot(snapshot());
    expect(result.changes[0]?.before).toBeUndefined();
    expect(result.changes.at(-1)?.after?.pk).toBe('RECIPE#r');
  });
});
