import { describe, expect, it } from 'vitest';
import {
  batchPortions,
  buildShoppingList,
  copyRecipe,
  ingredientConflicts,
  planFingerprint,
  shoppingChanges,
  validatePlanEntries,
  type MealPlan,
  type PlanEntry,
  type Recipe,
} from '../src/index';

export const recipe: Recipe = {
  id: 'r',
  ownerId: 'alice',
  title: 'Dinner',
  servings: 2,
  tags: [],
  ingredients: [{ name: 'milk', quantity: 1, unit: 'cup', aisle: 'dairy_eggs' }],
  steps: [{ text: 'Cook.' }],
  source: { platform: 'text' },
  communityIds: ['home', 'office'],
  createdAt: '2026-10-04',
  updatedAt: '2026-10-04',
};
const original: PlanEntry = { id: 'cook', day: 0, slot: 'dinner', servings: 3, recipeId: 'r' };
const leftover: PlanEntry = { id: 'later', day: 2, slot: 'dinner', servings: 3, recipeId: 'r', leftoverOf: 'cook' };
describe('independent kitchen recipes', () => {
  it('preserves techniques with independently owned video and clip paths', () => {
    const source: Recipe = {
      ...recipe,
      kind: 'technique',
      video: {
        key: 'private/techniques/r/video.mp4',
        mimeType: 'video/mp4',
        clips: [{ key: 'private/techniques/r/clip.mp4', posterKey: 'private/techniques/r/poster.jpg', startSec: 0, endSec: 5 }],
      },
    };
    const copied = copyRecipe(source, 'copy', 'KITCHEN#home', 'home');
    expect(copied.kind).toBe('technique');
    expect(copied.video?.key).toMatch(/^private\/techniques\/copy\//);
    expect(copied.video?.clips[0]?.posterKey).not.toBe(source.video?.clips[0]?.posterKey);
    expect(buildShoppingList({ entries: [original] }, new Map([['r', source]]), { units: 'us' })).toEqual([]);
  });
  it('keeps provenance but isolates nested edits and scope', () => {
    const c = copyRecipe(recipe, 'copy', 'KITCHEN#home', 'home');
    c.ingredients[0]!.name = 'oat milk';
    expect(recipe.ingredients[0]!.name).toBe('milk');
    expect(c.communityIds).toEqual(['home']);
    expect(c.originRecipeId).toBe('r');
    expect(copyRecipe(c, 'personal', 'bob').communityIds).toEqual([]);
  });
});
describe('meal relationships', () => {
  it('shows the complete cooking batch without doubling ingredients', () => {
    expect(batchPortions([original, leftover], 'cook')).toBe(6);
    const list = buildShoppingList({ entries: [original, leftover] }, new Map([['r', recipe]]), { units: 'us' });
    expect(list[0]?.quantity).toBe(3);
    expect(list[0]?.unit).toBe('cup');
  });
  it('rejects missing, chained, mismatched and earlier leftovers and duplicate ids', () => {
    expect(validatePlanEntries([original, leftover])).toBeUndefined();
    expect(validatePlanEntries([leftover])).toBeTruthy();
    expect(validatePlanEntries([original, { ...leftover, recipeId: 'wrong' }])).toBeTruthy();
    expect(validatePlanEntries([original, { ...leftover, day: 0, slot: 'breakfast' }])).toBeTruthy();
    expect(validatePlanEntries([original, original])).toBeTruthy();
    expect(validatePlanEntries([original, leftover, { ...leftover, id: 'chain', day: 4, leftoverOf: 'later' }])).toBeTruthy();
  });
});
describe('shopping updates', () => {
  it('unchecks a purchased item when its required quantity changes', () => {
    const before = buildShoppingList({ entries: [original] }, new Map([['r', recipe]]), { units: 'us' }).map((i) => ({ ...i, checked: true }));
    const after = buildShoppingList({ entries: [original, leftover] }, new Map([['r', recipe]]), { units: 'us', previous: before });
    expect(after[0]?.checked).toBe(false);
    expect(shoppingChanges(before, after)).toHaveLength(1);
    expect(buildShoppingList({ entries: [original] }, new Map([['r', recipe]]), { units: 'us', previous: before })[0]?.checked).toBe(true);
  });
  it('tracks recipe edits as well as plan edits', () => {
    const p: MealPlan = { communityId: 'home', weekStart: '2026-10-05', entries: [original], constraints: [], updatedAt: '' };
    const a = planFingerprint(p, new Map([['r', recipe]]));
    expect(planFingerprint(p, new Map([['r', { ...recipe, updatedAt: 'later' }]]))).not.toBe(a);
    expect(planFingerprint({ ...p, entries: [original, leftover] }, new Map([['r', recipe]]))).not.toBe(a);
  });
});
describe('ingredient conflicts', () => {
  it('checks actual ingredients and common aliases, independent of title', () => {
    expect(ingredientConflicts({ ...recipe, title: 'Dairy-free soup' }, [{ allergies: ['dairy'], diets: [], dislikes: [] }])).toEqual(['dairy']);
  });
  it('only uses the attending diners passed to it', () => {
    expect(ingredientConflicts(recipe, [])).toEqual([]);
    expect(ingredientConflicts(recipe, [{ allergies: [], diets: ['vegan'], dislikes: [] }])).toEqual(['vegan']);
  });
  it('treats dislikes as preferences rather than restrictions', () =>
    expect(ingredientConflicts(recipe, [{ allergies: [], diets: [], dislikes: ['milk'] }])).toEqual([]));
});
