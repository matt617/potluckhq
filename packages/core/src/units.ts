/**
 * Unit normalization and conversion for merging shopping list quantities.
 * Volumes convert through millilitres, weights through grams. Count units stay as-is.
 */

type Dimension = 'volume' | 'weight' | 'count';

interface UnitDef {
  canonical: string;
  dimension: Dimension;
  /** Factor to the base unit (ml or g). Count units use 1. */
  factor: number;
}

const DEFS: Record<string, UnitDef> = {};
function def(names: string[], canonical: string, dimension: Dimension, factor: number) {
  for (const n of names) DEFS[n] = { canonical, dimension, factor };
}

def(['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'], 'ml', 'volume', 1);
def(['l', 'liter', 'liters', 'litre', 'litres'], 'l', 'volume', 1000);
def(['tsp', 'teaspoon', 'teaspoons', 't'], 'tsp', 'volume', 4.92892);
def(['tbsp', 'tablespoon', 'tablespoons', 'tbs', 'tbl', 'T'], 'tbsp', 'volume', 14.7868);
def(['fl oz', 'floz', 'fluid ounce', 'fluid ounces'], 'fl oz', 'volume', 29.5735);
def(['cup', 'cups', 'c'], 'cup', 'volume', 236.588);
def(['pint', 'pints', 'pt'], 'pint', 'volume', 473.176);
def(['quart', 'quarts', 'qt'], 'quart', 'volume', 946.353);
def(['gallon', 'gallons', 'gal'], 'gallon', 'volume', 3785.41);
def(['g', 'gram', 'grams', 'gr'], 'g', 'weight', 1);
def(['kg', 'kilogram', 'kilograms', 'kilo', 'kilos'], 'kg', 'weight', 1000);
def(['oz', 'ounce', 'ounces'], 'oz', 'weight', 28.3495);
def(['lb', 'lbs', 'pound', 'pounds'], 'lb', 'weight', 453.592);
def(['', 'whole', 'each', 'piece', 'pieces', 'pc', 'pcs'], '', 'count', 1);
for (const c of ['clove', 'can', 'bunch', 'slice', 'stalk', 'sprig', 'head', 'pinch', 'dash', 'handful', 'package', 'packet', 'jar', 'bottle', 'stick', 'fillet', 'sheet', 'leaf', 'block', 'bag', 'box']) {
  const plural = c.endsWith('h') ? `${c}es` : c === 'leaf' ? 'leaves' : `${c}s`;
  def([c, plural], c, 'count', 1);
}

export function normalizeUnit(unit: string | undefined | null): string {
  const raw = (unit ?? '').trim();
  const key = raw === 'T' ? 'T' : raw.toLowerCase().replace(/\.$/, '');
  return DEFS[key]?.canonical ?? key;
}

export function unitDimension(unit: string): Dimension | 'unknown' {
  const d = DEFS[normalizeUnit(unit)];
  return d ? d.dimension : 'unknown';
}

export function toBase(quantity: number, unit: string): { amount: number; dimension: Dimension } | null {
  const d = DEFS[normalizeUnit(unit)];
  if (!d || d.dimension === 'count') return null;
  return { amount: quantity * d.factor, dimension: d.dimension };
}

/** Choose a friendly unit for a base amount in the user's unit system. */
export function fromBase(amount: number, dimension: 'volume' | 'weight', system: 'us' | 'metric'): { quantity: number; unit: string } {
  if (dimension === 'weight') {
    if (system === 'metric') return amount >= 1000 ? { quantity: round(amount / 1000, 2), unit: 'kg' } : { quantity: round(amount, 0), unit: 'g' };
    const oz = amount / DEFS.oz!.factor;
    return oz >= 16 ? { quantity: round(oz / 16, 2), unit: 'lb' } : { quantity: round(oz, 1), unit: 'oz' };
  }
  if (system === 'metric') return amount >= 1000 ? { quantity: round(amount / 1000, 2), unit: 'l' } : { quantity: round(amount, 0), unit: 'ml' };
  const cups = amount / DEFS.cup!.factor;
  if (cups >= 0.25) return { quantity: roundFraction(cups), unit: 'cup' };
  const tbsp = amount / DEFS.tbsp!.factor;
  if (tbsp >= 1) return { quantity: roundFraction(tbsp), unit: 'tbsp' };
  return { quantity: roundFraction(amount / DEFS.tsp!.factor), unit: 'tsp' };
}

export function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Round to the nearest quarter, which reads naturally for kitchen measures. */
export function roundFraction(n: number): number {
  return Math.max(0.25, Math.round(n * 4) / 4);
}

const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾', '0.33': '⅓', '0.67': '⅔' };

export function formatQuantity(q: number | null): string {
  if (q === null || Number.isNaN(q)) return '';
  const whole = Math.floor(q);
  const frac = round(q - whole, 2);
  const glyph = FRACTIONS[String(frac)];
  if (frac === 0) return String(whole);
  if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph;
  return String(round(q, 2));
}

export function formatAmount(q: number | null, unit: string): string {
  const qty = formatQuantity(q);
  if (!qty) return unit ? unit : '';
  return unit ? `${qty} ${unit}` : qty;
}

/** Scale an ingredient quantity for a new serving count. */
export function scaleQuantity(q: number | null, fromServings: number, toServings: number): number | null {
  if (q === null) return null;
  if (!fromServings || fromServings <= 0) return q;
  return round((q * toServings) / fromServings, 3);
}
