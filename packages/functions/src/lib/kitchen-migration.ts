import { copyRecipe, hashKey, type Recipe } from '@potluck/core';

export type MigrationRow = Record<string, unknown> & { pk: string; sk: string };
export interface MigrationChange {
  before?: MigrationRow;
  after?: MigrationRow;
}

/** Pure snapshot transformation. Run against an exported snapshot before allowing writes. */
export function migrateKitchenSnapshot(rows: MigrationRow[]): { rows: MigrationRow[]; changes: MigrationChange[]; copies: number } {
  const key = (r: MigrationRow) => JSON.stringify([r.pk, r.sk]);
  const original = new Map(rows.map((r) => [key(r), structuredClone(r)]));
  const output = new Map(rows.map((r) => [key(r), structuredClone(r)]));
  const mappings = new Map<string, string>();
  let copies = 0;
  for (const raw of rows) {
    if (!raw.pk.startsWith('RECIPE#') || raw.sk !== 'META') continue;
    const r = raw as unknown as Recipe;
    if (r.kitchenId || !r.communityIds?.length) continue;
    for (const cid of r.communityIds) {
      if (!original.has(key({ pk: `COMM#${cid}`, sk: 'META' }))) continue;
      const id = `copy-${hashKey(`${r.id}:kitchen:${cid}`)}`;
      const cloneKey = key({ pk: `RECIPE#${id}`, sk: 'META' });
      const oldSummaryKey = key({ pk: `COMM#${cid}`, sk: `RECIPE#${r.id}` });
      const oldSummary = output.get(oldSummaryKey);
      const copy = copyRecipe(r, id, `KITCHEN#${cid}`, cid);
      if (!output.has(cloneKey)) {
        output.set(cloneKey, {
          ...copy,
          pk: `RECIPE#${id}`,
          sk: 'META',
          gsi1pk: `USER#${copy.ownerId}`,
          gsi1sk: `RECIPE#${copy.createdAt}`,
        } as unknown as MigrationRow);
        copies++;
      }
      const summaryKey = key({ pk: `COMM#${cid}`, sk: `RECIPE#${id}` });
      if (!output.has(summaryKey))
        output.set(summaryKey, {
          ...(oldSummary ?? {
            title: r.title,
            tags: r.tags,
            servings: r.servings,
            totalMin: r.totalMin,
            platform: r.source.platform,
            addedBy: r.ownerId,
            addedAt: r.createdAt,
          }),
          kind: r.kind,
          pk: `COMM#${cid}`,
          sk: `RECIPE#${id}`,
          id,
          ownerId: copy.ownerId,
        });
      output.delete(oldSummaryKey);
      mappings.set(`${cid}:${r.id}`, id);
    }
    output.set(key(raw), { ...raw, communityIds: [] });
  }
  for (const [k, raw] of output) {
    if (raw.pk.startsWith('COMM#') && raw.sk === 'META') output.set(k, { ...raw, kind: raw.kind ?? 'kitchen' });
    const cid = raw.pk.startsWith('COMM#') ? raw.pk.slice(5) : String(raw.communityId ?? '');
    if (raw.sk.startsWith('PLAN#')) {
      const entries = ((raw.entries as { recipeId?: string }[]) ?? []).map((e) => ({
        ...e,
        recipeId: e.recipeId ? (mappings.get(`${cid}:${e.recipeId}`) ?? e.recipeId) : undefined,
      }));
      output.set(k, { ...raw, entries, revision: raw.revision ?? 0 });
    }
    if (raw.sk.startsWith('LIST#')) {
      const items = ((raw.items as { recipeIds?: string[] }[]) ?? []).map((i) => ({
        ...i,
        recipeIds: i.recipeIds?.map((id) => mappings.get(`${cid}:${id}`) ?? id),
      }));
      output.set(k, { ...raw, items });
    }
    if (typeof raw.recipeId === 'string' && mappings.has(`${cid}:${raw.recipeId}`))
      output.set(k, { ...raw, recipeId: mappings.get(`${cid}:${raw.recipeId}`)! });
  }
  // Do not silently retain dangling plan references.
  for (const row of output.values())
    if (row.sk.startsWith('PLAN#')) {
      for (const e of row.entries as { recipeId?: string }[])
        if (e.recipeId && !output.has(key({ pk: `RECIPE#${e.recipeId}`, sk: 'META' })))
          throw new Error(`Plan ${row.pk}/${row.sk} references a missing recipe ${e.recipeId}`);
    }
  const changes: MigrationChange[] = [];
  for (const k of new Set([...original.keys(), ...output.keys()])) {
    const before = original.get(k),
      after = output.get(k);
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ before, after });
  }
  // Materialize copies before changing references; detach originals last.
  const order = (c: MigrationChange) => (!c.before ? 0 : c.after?.pk.startsWith('RECIPE#') ? 3 : !c.after ? 2 : 1);
  changes.sort((a, b) => order(a) - order(b));
  return { rows: [...output.values()], changes, copies };
}
