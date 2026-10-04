import type { MealPlan, Recipe, ShoppingItem, Aisle } from './types.js';
import { formatAmount, fromBase, scaleQuantity, toBase, normalizeUnit, unitDimension, round } from './units.js';
import { guessAisle, ingredientKey } from './ingredients.js';

interface Bucket {
  key: string;
  name: string;
  aisle: Aisle;
  volumeMl: number;
  weightG: number;
  counts: Map<string, number>;
  untracked: boolean;
  recipeIds: Set<string>;
}

/**
 * Build a merged shopping list from a week plan. Every entry's servings are portions eaten
 * at that meal, so a leftover entry adds its portions to the batch cooked earlier and is
 * bought once with it. Quantities are scaled to each entry's servings,
 * merged across recipes by ingredient key, and converted to one friendly unit per dimension.
 */
export function buildShoppingList(
  plan: Pick<MealPlan, 'entries'>,
  recipes: Map<string, Recipe>,
  opts: { units: 'us' | 'metric'; pantryStaples?: string[]; previous?: ShoppingItem[] },
): ShoppingItem[] {
  const buckets = new Map<string, Bucket>();
  const byId = new Map(plan.entries.map((e) => [e.id, e]));
  for (const entry of plan.entries) {
    const recipeId = entry.leftoverOf ? (byId.get(entry.leftoverOf)?.recipeId ?? entry.recipeId) : entry.recipeId;
    if (!recipeId) continue;
    const recipe = recipes.get(recipeId);
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      const key = ingredientKey(ing.name);
      if (!key) continue;
      let b = buckets.get(key);
      if (!b) {
        b = { key, name: ing.name.trim(), aisle: ing.aisle ?? guessAisle(ing.name), volumeMl: 0, weightG: 0, counts: new Map(), untracked: false, recipeIds: new Set() };
        buckets.set(key, b);
      }
      b.recipeIds.add(recipe.id);
      const qty = scaleQuantity(ing.quantity, recipe.servings, entry.servings);
      if (qty === null) {
        b.untracked = true;
        continue;
      }
      const base = toBase(qty, ing.unit);
      if (base?.dimension === 'volume') b.volumeMl += base.amount;
      else if (base?.dimension === 'weight') b.weightG += base.amount;
      else {
        const unit = unitDimension(ing.unit) === 'unknown' ? ing.unit.trim().toLowerCase() : normalizeUnit(ing.unit);
        b.counts.set(unit, (b.counts.get(unit) ?? 0) + qty);
      }
    }
  }

  const staples = new Set((opts.pantryStaples ?? []).map(ingredientKey));
  const previous = new Map((opts.previous ?? []).map((i) => [i.key, i]));
  const items: ShoppingItem[] = [];

  for (const b of buckets.values()) {
    const parts: { quantity: number; unit: string }[] = [];
    if (b.weightG > 0) parts.push(fromBase(b.weightG, 'weight', opts.units));
    if (b.volumeMl > 0) parts.push(fromBase(b.volumeMl, 'volume', opts.units));
    for (const [unit, q] of b.counts) parts.push({ quantity: Math.ceil(round(q, 2) * 4) / 4, unit: unit && q > 1 && !unit.endsWith('s') ? pluralUnit(unit) : unit });
    const display = parts.length ? parts.map((p) => formatAmount(p.quantity, p.unit)).join(' + ') + (b.untracked ? ' + to taste' : '') : 'as needed';
    const first = parts[0];
    items.push({
      key: b.key,
      name: b.name,
      quantity: parts.length === 1 && first ? first.quantity : null,
      unit: parts.length === 1 && first ? first.unit : '',
      aisle: b.aisle,
      checked: previous.get(b.key)?.checked ?? false,
      staple: staples.has(b.key) || undefined,
      recipeIds: [...b.recipeIds],
      display,
    });
  }

  // Keep hand-added items across regenerations.
  for (const p of opts.previous ?? []) if (p.manual && !buckets.has(p.key)) items.push(p);

  return items.sort((a, b) => a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name));
}

function pluralUnit(u: string): string {
  if (u.endsWith('ch') || u.endsWith('sh')) return `${u}es`;
  if (u === 'leaf') return 'leaves';
  return `${u}s`;
}

export function manualItem(name: string, amount?: string): ShoppingItem {
  return {
    key: `manual:${ingredientKey(name)}:${Date.now().toString(36)}`,
    name: name.trim(),
    quantity: null,
    unit: '',
    aisle: guessAisle(name),
    checked: false,
    manual: true,
    recipeIds: [],
    display: amount?.trim() || '',
  };
}

/** Plain-text rendering for sending a list over Telegram, WhatsApp or SMS. */
export function shoppingListText(items: ShoppingItem[], aisleLabel: (a: Aisle) => string): string {
  const open = items.filter((i) => !i.checked && !i.staple);
  if (!open.length) return 'Your shopping list is empty.';
  const byAisle = new Map<Aisle, ShoppingItem[]>();
  for (const i of open) byAisle.set(i.aisle, [...(byAisle.get(i.aisle) ?? []), i]);
  const lines: string[] = [];
  for (const [aisle, list] of byAisle) {
    lines.push(`*${aisleLabel(aisle)}*`);
    for (const i of list) lines.push(`• ${i.name}${i.display ? ` (${i.display})` : ''}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}
