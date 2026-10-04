import { describe, expect, it } from 'vitest';
import {
  budgetFor,
  buildShoppingList,
  canImport,
  canUseAiFeatures,
  costMicros,
  defaultTier,
  detectPlatform,
  extractUrls,
  formatAmount,
  hashKey,
  ingredientKey,
  isWeekKey,
  normalizeUrl,
  parseIngredientLine,
  scaleQuantity,
  splitCharge,
  weekStartOf,
  type Recipe,
  type UserProfile,
} from '../src/index.js';

const user = (over: Partial<UserProfile> = {}): UserProfile => ({
  id: 'u1', email: 'a@b.c', displayName: 'A', tier: 'free', diet: { allergies: [], diets: [], dislikes: [] }, units: 'us',
  aiCreditMicros: 0, usageMonth: new Date().toISOString().slice(0, 7), aiUsedMicros: 0, importsUsed: 0, createdAt: '', ...over,
});

describe('urls', () => {
  it('extracts and trims urls from chat text', () => {
    expect(extractUrls('look https://www.tiktok.com/@a/video/1?x=1, and https://youtu.be/abc).')).toEqual([
      'https://www.tiktok.com/@a/video/1?x=1',
      'https://youtu.be/abc',
    ]);
  });
  it('detects platforms', () => {
    expect(detectPlatform('https://vm.tiktok.com/ZM123/')).toBe('tiktok');
    expect(detectPlatform('https://www.instagram.com/reel/C1/')).toBe('instagram');
    expect(detectPlatform('https://youtu.be/x')).toBe('youtube');
    expect(detectPlatform('https://pin.it/abc')).toBe('pinterest');
    expect(detectPlatform('https://smittenkitchen.com/x')).toBe('web');
  });
  it('normalizes tracking params and youtube forms to one cache key', () => {
    expect(normalizeUrl('https://www.instagram.com/reel/C1/?igsh=abc&utm_source=ig')).toBe('https://instagram.com/reel/C1');
    const ids = ['https://youtu.be/abc123?si=zz', 'https://www.youtube.com/shorts/abc123', 'https://m.youtube.com/watch?v=abc123&feature=share'];
    expect(new Set(ids.map(normalizeUrl))).toEqual(new Set(['https://youtube.com/watch?v=abc123']));
    expect(hashKey(normalizeUrl(ids[0]!))).toBe(hashKey(normalizeUrl(ids[1]!)));
  });
});

describe('ingredients and units', () => {
  it('parses free-text ingredient lines', () => {
    expect(parseIngredientLine('1 1/2 cups diced onion, divided')).toMatchObject({ quantity: 1.5, unit: 'cup', name: 'diced onion', note: 'divided', aisle: 'produce' });
    expect(parseIngredientLine('2 cloves garlic')).toMatchObject({ quantity: 2, unit: 'clove', name: 'garlic' });
    expect(parseIngredientLine('½ tsp smoked paprika')).toMatchObject({ quantity: 0.5, unit: 'tsp', aisle: 'spices' });
    expect(parseIngredientLine('salt to taste')).toMatchObject({ quantity: null, unit: '', name: 'salt to taste' });
  });
  it('builds merge keys that ignore prep words and plurals', () => {
    expect(ingredientKey('Fresh chopped tomatoes')).toBe(ingredientKey('tomato'));
    expect(ingredientKey('large eggs')).toBe('egg');
  });
  it('scales and formats quantities', () => {
    expect(scaleQuantity(1, 4, 2)).toBe(0.5);
    expect(scaleQuantity(null, 4, 2)).toBeNull();
    expect(formatAmount(1.5, 'cup')).toBe('1½ cup');
    expect(formatAmount(0.25, 'tsp')).toBe('¼ tsp');
  });
});

describe('shopping list', () => {
  const recipe = (id: string, servings: number, ingredients: Recipe['ingredients']): Recipe => ({
    id, ownerId: 'u', title: id, servings, tags: [], ingredients, steps: [], source: { platform: 'web' }, communityIds: [], createdAt: '', updatedAt: '',
  });
  const a = recipe('a', 4, [
    { quantity: 1, unit: 'cup', name: 'milk', aisle: 'dairy_eggs' },
    { quantity: 2, unit: 'clove', name: 'garlic', aisle: 'produce' },
    { quantity: 500, unit: 'g', name: 'chicken thighs', aisle: 'meat_seafood' },
    { quantity: null, unit: '', name: 'salt', aisle: 'spices' },
  ]);
  const b = recipe('b', 2, [
    { quantity: 4, unit: 'tbsp', name: 'milk', aisle: 'dairy_eggs' },
    { quantity: 1, unit: 'clove', name: 'garlic', aisle: 'produce' },
    { quantity: 1, unit: 'lb', name: 'chicken thigh', aisle: 'meat_seafood' },
  ]);
  const recipes = new Map([[a.id, a], [b.id, b]]);

  it('merges across recipes with unit conversion and scaling', () => {
    const items = buildShoppingList(
      { entries: [{ id: 'e1', day: 0, slot: 'dinner', recipeId: 'a', servings: 4 }, { id: 'e2', day: 1, slot: 'dinner', recipeId: 'b', servings: 4 }] },
      recipes,
      { units: 'us', pantryStaples: ['salt'] },
    );
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey['milk']!.display).toBe('1½ cup'); // 1 cup + 8 tbsp
    expect(byKey['garlic']!.display).toBe('4 cloves'); // 2 + 1×2
    expect(byKey['chicken thigh']!.unit).toBe('lb'); // 500 g + 2 lb ≈ 3.1 lb
    expect(byKey['chicken thigh']!.quantity).toBeCloseTo(3.1, 1);
    expect(byKey['salt']!.staple).toBe(true);
  });

  it('counts leftovers once, as part of the original cook', () => {
    const items = buildShoppingList(
      { entries: [{ id: 'e1', day: 0, slot: 'dinner', recipeId: 'a', servings: 4 }, { id: 'e2', day: 1, slot: 'lunch', recipeId: 'a', servings: 4, leftoverOf: 'e1' }] },
      recipes,
      { units: 'metric' },
    );
    expect(items.find((i) => i.key === 'chicken thigh')!.display).toBe('1 kg');
  });

  it('keeps checked state and manual items across regeneration', () => {
    const first = buildShoppingList({ entries: [{ id: 'e1', day: 0, slot: 'dinner', recipeId: 'a', servings: 4 }] }, recipes, { units: 'us' });
    first[0]!.checked = true;
    const manual = { key: 'manual:foil:1', name: 'foil', quantity: null, unit: '', aisle: 'other' as const, checked: false, manual: true, recipeIds: [], display: '' };
    const again = buildShoppingList({ entries: [{ id: 'e1', day: 0, slot: 'dinner', recipeId: 'a', servings: 4 }] }, recipes, { units: 'us', previous: [...first, manual] });
    expect(again.find((i) => i.key === first[0]!.key)!.checked).toBe(true);
    expect(again.some((i) => i.key === 'manual:foil:1')).toBe(true);
  });
});

describe('weeks', () => {
  it('finds the Monday of a week', () => {
    expect(weekStartOf('2026-10-04')).toBe('2026-09-28'); // Sunday
    expect(weekStartOf('2026-10-05')).toBe('2026-10-05'); // Monday
    expect(isWeekKey('2026-10-05')).toBe(true);
    expect(isWeekKey('2026-10-06')).toBe(false);
  });
});

describe('metering and tiers', () => {
  it('prices calls in micro-dollars and rejects expensive models', () => {
    expect(costMicros('gemini-flash-lite-latest', { promptTokens: 10_000, outputTokens: 1_000 })).toBe(1400);
    expect(() => costMicros('gemini-2.5-pro', { promptTokens: 1, outputTokens: 1 })).toThrow(/allowlist/);
  });
  it('free users import within quota but get no AI features', () => {
    const b = budgetFor(user());
    expect(canImport(b).ok).toBe(true);
    expect(canUseAiFeatures(b)).toEqual({ ok: false, reason: 'tier' });
    expect(canImport(budgetFor(user({ importsUsed: 15 })))).toEqual({ ok: false, reason: 'import_quota' });
  });
  it('paid users spend the $2 allowance, then credits', () => {
    const fresh = budgetFor(user({ tier: 'plus' }));
    expect(canUseAiFeatures(fresh).ok).toBe(true);
    const spent = budgetFor(user({ tier: 'plus', aiUsedMicros: 2_000_000 }));
    expect(canUseAiFeatures(spent)).toEqual({ ok: false, reason: 'allowance_exhausted' });
    const withCredits = budgetFor(user({ tier: 'plus', aiUsedMicros: 1_999_000, aiCreditMicros: 500_000 }));
    expect(canUseAiFeatures(withCredits).ok).toBe(true);
    expect(splitCharge(withCredits, 3000)).toEqual({ fromAllowanceMicros: 1000, fromCreditsMicros: 2000 });
  });
  it('resets monthly usage lazily', () => {
    const b = budgetFor(user({ tier: 'pro', usageMonth: '2020-01', aiUsedMicros: 9_999_999, importsUsed: 999 }));
    expect(b.allowanceLeftMicros).toBe(2_000_000);
    expect(b.importsLeft).toBe(1000);
  });
});

// Guard against accidental tier changes; the free tier is part of the product promise.
describe('free tier promise', () => {
  it('is one community with two members and no AI features', () => {
    expect(defaultTier()).toMatchObject({ maxCommunities: 1, maxMembersPerCommunity: 2, aiFeatures: false });
  });
});
