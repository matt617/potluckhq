import type { DietProfile, MealPlan, PlanEntry, Recipe, ShoppingItem, StoredVideo } from './types.js';
import { hashKey } from './url.js';

export interface Diner {
  id: string;
  name: string;
  userId?: string;
  usual: boolean;
  portions: number;
  /** Kitchen-specific food requirements only; personal health goals stay private. */
  diet: Pick<DietProfile, 'allergies' | 'diets' | 'dislikes'>;
}

export interface RecipeAnnotation {
  recipeId: string;
  collections: string[];
  note: string;
}

export interface KitchenActivity {
  id: string;
  actorId: string;
  actorName: string;
  kind: 'want' | 'made' | 'note';
  recipeId: string;
  recipeTitle: string;
  note: string;
  at: string;
}

export interface OwnershipTransfer {
  from: string;
  to: string;
  expiresAt: string;
}

/** Copies own their private videos, so deleting the source cannot break playback. */
export function independentVideo(video: StoredVideo | undefined, id: string): StoredVideo | undefined {
  if (!video) return undefined;
  const prefix = `private/techniques/${id}/`;
  const key = (source: string) => (source.startsWith(prefix) ? source : `${prefix}copies/${hashKey(source)}.${source.split('.').pop() ?? 'bin'}`);
  return { ...video, key: key(video.key), clips: video.clips.map((c) => ({ ...c, key: key(c.key), ...(c.posterKey ? { posterKey: key(c.posterKey) } : {}) })) };
}

export function copyRecipe(source: Recipe, id: string, ownerId: string, kitchenId?: string): Recipe {
  return {
    ...structuredClone(source),
    id,
    ownerId,
    kitchenId,
    communityIds: kitchenId ? [kitchenId] : [],
    originRecipeId: source.id,
    originUpdatedAt: source.updatedAt,
    archived: false,
    video: independentVideo(source.video, id),
  };
}

export function planFingerprint(plan: MealPlan, recipes: Map<string, Recipe>): string {
  return hashKey(JSON.stringify({ entries: plan.entries, recipes: [...recipes.values()].map((r) => [r.id, r.updatedAt]).sort() }));
}

export function batchPortions(entries: PlanEntry[], id: string): number {
  return entries.filter((e) => e.id === id || e.leftoverOf === id).reduce((n, e) => n + e.servings, 0);
}

export function validatePlanEntries(entries: PlanEntry[]): string | undefined {
  const ids = new Set(entries.map((e) => e.id));
  if (ids.size !== entries.length) return 'Every meal needs a unique identifier.';
  const slots = ['breakfast', 'lunch', 'dinner', 'snack'];
  for (const e of entries) {
    if (!Number.isInteger(e.day)) return 'Choose a valid day.';
    if (!e.recipeId && !e.label && !e.leftoverOf) return 'Choose a recipe or describe the meal.';
    if (!e.leftoverOf) continue;
    const source = entries.find((x) => x.id === e.leftoverOf);
    if (!source || source.leftoverOf || !source.recipeId || e.recipeId !== source.recipeId)
      return 'Leftovers must refer to an original cooking meal with the same recipe.';
    if (source.day * 4 + slots.indexOf(source.slot) >= e.day * 4 + slots.indexOf(e.slot)) return 'Cook the original meal before eating its leftovers.';
  }
  return undefined;
}

/** A conservative conflict screen, not a guarantee of allergen absence. */
export function ingredientConflicts(recipe: Recipe, diets: Diner['diet'][]): string[] {
  const text = recipe.ingredients
    .map((i) => `${i.name} ${i.note ?? ''}`)
    .join(' ')
    .toLowerCase();
  const aliases: Record<string, string[]> = {
    milk: ['milk', 'cream', 'cheese', 'butter', 'yogurt', 'whey'],
    dairy: ['milk', 'cream', 'cheese', 'butter', 'yogurt', 'whey'],
    egg: ['egg', 'eggs', 'mayonnaise'],
    eggs: ['egg', 'eggs', 'mayonnaise'],
    peanuts: ['peanut', 'peanuts'],
    peanut: ['peanut', 'peanuts'],
    shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop'],
    gluten: ['wheat', 'flour', 'bread', 'pasta', 'barley', 'rye', 'soy sauce'],
    soy: ['soy', 'tofu', 'tempeh', 'edamame', 'miso'],
    sesame: ['sesame', 'tahini'],
    'tree nuts': ['almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'macadamia'],
  };
  const meat = ['beef', 'pork', 'chicken', 'turkey', 'lamb', 'bacon', 'sausage', 'gelatin'];
  const fish = ['fish', 'salmon', 'tuna', 'anchovy', ...aliases.shellfish!];
  const matches = (words: string[]) => words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(text));
  const conflicts = new Set<string>();
  for (const diet of diets) {
    for (const a of diet.allergies) if (matches(aliases[a.toLowerCase()] ?? [a.toLowerCase()])) conflicts.add(a);
    for (const d of diet.diets) {
      const name = d.toLowerCase();
      const forbidden =
        name === 'vegan'
          ? [...meat, ...fish, ...aliases.dairy!, ...aliases.egg!, 'honey']
          : name === 'vegetarian'
            ? [...meat, ...fish]
            : name === 'pescatarian'
              ? meat
              : name === 'gluten-free'
                ? aliases.gluten!
                : [];
      if (matches(forbidden)) conflicts.add(d);
    }
  }
  return [...conflicts];
}

export function shoppingChanges(before: ShoppingItem[], after: ShoppingItem[]): { name: string; before: string; after: string }[] {
  const old = new Map(before.filter((i) => !i.manual).map((i) => [i.key, i]));
  const next = new Map(after.filter((i) => !i.manual).map((i) => [i.key, i]));
  return [...new Set([...old.keys(), ...next.keys()])].flatMap((key) => {
    const a = old.get(key),
      b = next.get(key);
    return a?.display === b?.display ? [] : [{ name: b?.name ?? a!.name, before: a?.display ?? 'Not needed', after: b?.display ?? 'No longer needed' }];
  });
}
