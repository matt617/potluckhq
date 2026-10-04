import type { Aisle, Ingredient } from './types.js';
import { normalizeUnit } from './units.js';

const AISLE_KEYWORDS: [Aisle, string[]][] = [
  ['spices', ['salt', 'pepper', 'paprika', 'cumin', 'oregano', 'thyme', 'cinnamon', 'chili powder', 'chilli flakes', 'red pepper flakes', 'turmeric', 'garam masala', 'curry powder', 'nutmeg', 'bay leaf', 'bay leaves', 'cayenne', 'coriander seed', 'italian seasoning', 'garlic powder', 'onion powder', 'smoked paprika', 'allspice', 'cardamom', 'clove']],
  ['meat_seafood', ['chicken', 'beef', 'pork', 'bacon', 'sausage', 'turkey', 'lamb', 'steak', 'mince', 'ground', 'salmon', 'tuna', 'shrimp', 'prawn', 'cod', 'fish', 'scallop', 'crab', 'chorizo', 'ham', 'prosciutto', 'duck']],
  ['dairy_eggs', ['milk', 'cream', 'butter', 'cheese', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'yogurt', 'yoghurt', 'egg', 'ricotta', 'sour cream', 'cottage', 'ghee', 'mascarpone', 'halloumi']],
  ['frozen', ['frozen', 'ice cream', 'puff pastry']],
  ['bakery', ['bread', 'baguette', 'bun', 'tortilla', 'pita', 'naan', 'roll', 'brioche', 'sourdough', 'wrap']],
  ['condiments', ['sauce', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'vinegar', 'soy', 'tamari', 'sriracha', 'hot sauce', 'miso', 'gochujang', 'fish sauce', 'pesto', 'salsa', 'harissa', 'tahini', 'dressing', 'oyster sauce', 'worcestershire']],
  ['beverages', ['wine', 'beer', 'juice', 'coffee', 'tea', 'soda', 'sparkling']],
  ['pantry', ['flour', 'sugar', 'rice', 'pasta', 'noodle', 'oil', 'stock', 'broth', 'beans', 'lentil', 'chickpea', 'oats', 'honey', 'maple', 'syrup', 'canned', 'tomato paste', 'coconut milk', 'baking', 'yeast', 'cornstarch', 'breadcrumbs', 'panko', 'quinoa', 'couscous', 'nuts', 'almond', 'peanut', 'cashew', 'seeds', 'chocolate', 'cocoa', 'vanilla', 'raisin']],
  ['produce', ['onion', 'garlic', 'tomato', 'potato', 'carrot', 'celery', 'pepper', 'lettuce', 'spinach', 'kale', 'cabbage', 'broccoli', 'cauliflower', 'zucchini', 'courgette', 'cucumber', 'mushroom', 'lemon', 'lime', 'orange', 'apple', 'banana', 'berries', 'avocado', 'ginger', 'cilantro', 'coriander', 'parsley', 'basil', 'mint', 'dill', 'rosemary', 'scallion', 'green onion', 'shallot', 'leek', 'chili', 'jalapeño', 'jalapeno', 'corn', 'peas', 'squash', 'sweet potato', 'eggplant', 'aubergine', 'asparagus', 'bok choy', 'herb', 'fruit', 'arugula', 'radish', 'beet']],
];

/** Keyword fallback for when the model did not supply an aisle or the user typed an item by hand. */
export function guessAisle(name: string): Aisle {
  const n = name.toLowerCase();
  for (const [aisle, words] of AISLE_KEYWORDS) {
    if (words.some((w) => n.includes(w))) return aisle;
  }
  return 'other';
}

const UNICODE_FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

function parseNumber(token: string): number | null {
  const t = token.trim();
  if (!t) return null;
  if (UNICODE_FRACTIONS[t] !== undefined) return UNICODE_FRACTIONS[t]!;
  const mixedGlyph = t.match(/^(\d+)([¼½¾⅓⅔⅛])$/);
  if (mixedGlyph) return Number(mixedGlyph[1]) + UNICODE_FRACTIONS[mixedGlyph[2]!]!;
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Parse a free-text line such as "1 1/2 cups diced onion, divided" into a structured ingredient. */
export function parseIngredientLine(line: string): Ingredient {
  let rest = line.trim().replace(/^[-*•]\s*/, '');
  let quantity: number | null = null;
  const qtyMatch = rest.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+[¼½¾⅓⅔⅛]|\d*\.?\d+|[¼½¾⅓⅔⅛])(\s*-\s*\d*\.?\d+)?\s*/);
  if (qtyMatch) {
    const parts = qtyMatch[1]!.split(/\s+/);
    quantity = parts.reduce<number | null>((acc, p) => {
      const v = parseNumber(p);
      return v === null ? acc : (acc ?? 0) + v;
    }, null);
    rest = rest.slice(qtyMatch[0].length);
  }
  let unit = '';
  const unitMatch = rest.match(/^(fl\.?\s?oz|[a-zA-Z]+)\.?\s+/);
  if (unitMatch) {
    const candidate = normalizeUnit(unitMatch[1]!.replace(/\s/g, ' '));
    const known = candidate !== unitMatch[1]!.toLowerCase() || ['g', 'kg', 'ml', 'l', 'oz', 'lb', 'cup', 'tsp', 'tbsp', 'clove', 'can', 'bunch', 'pinch'].includes(candidate);
    if (known && quantity !== null) {
      unit = candidate;
      rest = rest.slice(unitMatch[0].length);
    }
  }
  rest = rest.replace(/^of\s+/i, '');
  const [name, ...noteParts] = rest.split(',');
  const cleanName = (name ?? '').trim();
  const note = noteParts.join(',').trim();
  return {
    quantity,
    unit,
    name: cleanName,
    ...(note ? { note } : {}),
    aisle: guessAisle(cleanName),
  };
}

/** Normalize an ingredient name into a merge key: lowercase, singular-ish, no prep words. */
export function ingredientKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\b(fresh|large|small|medium|chopped|diced|minced|sliced|grated|finely|roughly|thinly|peeled|boneless|skinless|organic|optional|to taste|ripe|raw|cooked)\b/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ')
    .trim();
}
