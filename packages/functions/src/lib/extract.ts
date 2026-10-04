import { AISLES, guessAisle, normalizeUnit, type Aisle, type ExtractedRecipe, type Ingredient } from '@potluck/core';
import { generateJson, type Part, type GenerateResult } from './gemini.js';

const AISLE_IDS = AISLES.map((a) => a.id);

/** OpenAPI-subset schema accepted by Gemini structured output. */
export const RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isRecipe: { type: 'BOOLEAN' },
    reason: { type: 'STRING', nullable: true },
    title: { type: 'STRING' },
    description: { type: 'STRING', nullable: true },
    servings: { type: 'INTEGER' },
    prepMin: { type: 'INTEGER', nullable: true },
    cookMin: { type: 'INTEGER', nullable: true },
    cuisine: { type: 'STRING', nullable: true },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
    ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          quantity: { type: 'NUMBER', nullable: true },
          unit: { type: 'STRING' },
          name: { type: 'STRING' },
          note: { type: 'STRING', nullable: true },
          aisle: { type: 'STRING', enum: AISLE_IDS },
          estimated: { type: 'BOOLEAN' },
          group: { type: 'STRING', nullable: true },
        },
        required: ['quantity', 'unit', 'name', 'aisle', 'estimated'],
      },
    },
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          timestampSec: { type: 'INTEGER', nullable: true },
          durationMin: { type: 'INTEGER', nullable: true },
        },
        required: ['text'],
      },
    },
    nutrition: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        calories: { type: 'NUMBER' },
        proteinG: { type: 'NUMBER' },
        carbsG: { type: 'NUMBER' },
        fatG: { type: 'NUMBER' },
        fiberG: { type: 'NUMBER' },
      },
      required: ['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG'],
    },
    equipment: { type: 'ARRAY', items: { type: 'STRING' } },
    tips: { type: 'ARRAY', items: { type: 'STRING' } },
    author: { type: 'STRING', nullable: true },
    confidence: { type: 'NUMBER' },
    additionalDishes: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['isRecipe', 'title', 'servings', 'tags', 'ingredients', 'steps', 'confidence'],
  propertyOrdering: ['isRecipe', 'reason', 'title', 'description', 'servings', 'prepMin', 'cookMin', 'cuisine', 'tags', 'ingredients', 'steps', 'nutrition', 'equipment', 'tips', 'author', 'confidence', 'additionalDishes'],
} as const;

export const EXTRACT_SYSTEM = `You are a meticulous recipe developer who turns cooking videos, photos and posts into precise, cookable written recipes.

Rules:
- Watch the whole video. Use what is said, shown on screen (text overlays), and the post caption together. When they disagree, prefer on-screen text and spoken amounts over guesses.
- If the content is not a recipe or cooking how-to, set isRecipe=false, explain in reason, and return empty arrays.
- If several dishes are made, extract the main dish and list the others in additionalDishes.
- Ingredients: one entry per ingredient with a numeric quantity (decimals, e.g. 0.5) and a short unit (g, kg, ml, l, tsp, tbsp, cup, oz, lb, clove, can, bunch, pinch, or "" for whole items). Put prep words like "diced" in note, not in name. Use group for sub-recipes such as "Sauce" or "Marinade".
- When an amount is not stated, estimate a realistic one for the stated servings and set estimated=true. Use quantity=null only for "to taste" items like salt.
- aisle must be one of the allowed values for a typical grocery store.
- Steps: imperative, specific (times, temperatures in both °F and °C, visual cues). Include the video timestamp in seconds where each step starts when you can tell.
- servings: what the recipe as shown makes; estimate if unstated.
- nutrition: estimated per serving.
- tags: 3-8 lowercase tags covering meal type, main protein, diet (e.g. vegetarian, gluten-free, high-protein), and speed (e.g. under-30-min).
- confidence: 0 to 1, how sure you are the recipe is complete and accurate.
- Never invent a creator name; author only if shown or stated.`;

export interface ExtractInput {
  parts: Part[];
  caption?: string;
  sourceUrl?: string;
  model: string;
  lowMediaResolution?: boolean;
}

export async function extractRecipe(input: ExtractInput): Promise<GenerateResult<ExtractedRecipe>> {
  const context: string[] = [];
  if (input.sourceUrl) context.push(`Source URL: ${input.sourceUrl}`);
  if (input.caption) context.push(`Post caption / description:\n${input.caption.slice(0, 8000)}`);
  context.push('Extract the recipe as JSON.');
  const result = await generateJson<ExtractedRecipe>({
    model: input.model,
    system: EXTRACT_SYSTEM,
    parts: [...input.parts, { text: context.join('\n\n') }],
    schema: RECIPE_SCHEMA as unknown as Record<string, unknown>,
    maxOutputTokens: 6000,
    temperature: 0.2,
    lowMediaResolution: input.lowMediaResolution ?? true,
  });
  return { ...result, data: sanitizeExtraction(result.data) };
}

const clampInt = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;
  return n === null ? null : Math.min(max, Math.max(min, n));
};

/** Defensive cleanup: models occasionally return odd units, aisles or numbers. */
export function sanitizeExtraction(raw: ExtractedRecipe): ExtractedRecipe {
  const ingredients: Ingredient[] = (raw.ingredients ?? [])
    .filter((i) => i && typeof i.name === 'string' && i.name.trim())
    .slice(0, 80)
    .map((i) => ({
      quantity: typeof i.quantity === 'number' && Number.isFinite(i.quantity) && i.quantity > 0 ? i.quantity : null,
      unit: normalizeUnit(i.unit ?? ''),
      name: i.name.trim().slice(0, 120),
      ...(i.note ? { note: String(i.note).trim().slice(0, 200) } : {}),
      aisle: (AISLE_IDS as string[]).includes(i.aisle) ? (i.aisle as Aisle) : guessAisle(i.name),
      ...(i.estimated ? { estimated: true } : {}),
      ...(i.group ? { group: String(i.group).trim().slice(0, 60) } : {}),
    }));
  const steps = (raw.steps ?? [])
    .filter((s) => s && typeof s.text === 'string' && s.text.trim())
    .slice(0, 60)
    .map((s) => ({ text: s.text.trim().slice(0, 1000), timestampSec: clampInt(s.timestampSec, 0, 36_000), durationMin: clampInt(s.durationMin, 0, 2_000) }));
  return {
    isRecipe: Boolean(raw.isRecipe) && ingredients.length > 0,
    reason: raw.reason ?? (ingredients.length ? undefined : 'No ingredients could be identified.'),
    title: (raw.title || 'Untitled recipe').trim().slice(0, 140),
    description: raw.description?.trim().slice(0, 600) || undefined,
    servings: clampInt(raw.servings, 1, 100) ?? 4,
    prepMin: clampInt(raw.prepMin, 0, 2_000),
    cookMin: clampInt(raw.cookMin, 0, 5_000),
    cuisine: raw.cuisine?.trim().slice(0, 40) || undefined,
    tags: [...new Set((raw.tags ?? []).map((t) => String(t).toLowerCase().trim().slice(0, 30)).filter(Boolean))].slice(0, 10),
    ingredients,
    steps,
    nutrition: raw.nutrition && typeof raw.nutrition.calories === 'number' ? {
      calories: Math.round(raw.nutrition.calories),
      proteinG: Math.round(raw.nutrition.proteinG ?? 0),
      carbsG: Math.round(raw.nutrition.carbsG ?? 0),
      fatG: Math.round(raw.nutrition.fatG ?? 0),
      fiberG: Math.round(raw.nutrition.fiberG ?? 0),
    } : null,
    equipment: (raw.equipment ?? []).map(String).slice(0, 20),
    tips: (raw.tips ?? []).map(String).slice(0, 10),
    author: raw.author?.trim().slice(0, 80) || undefined,
    confidence: typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0.5,
    additionalDishes: (raw.additionalDishes ?? []).map(String).slice(0, 10),
  };
}
