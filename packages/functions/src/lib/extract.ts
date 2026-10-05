import { AISLES, guessAisle, normalizeUnit, type Aisle, type ExtractedRecipe, type Ingredient } from '@potluck/core';
import { generateJson, type Part, type GenerateResult } from './gemini.js';

const AISLE_IDS = AISLES.map((a) => a.id);

/** OpenAPI-subset schema accepted by Gemini structured output. */
export const RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: ['recipe', 'technique', 'neither'] },
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
          endSec: { type: 'INTEGER', nullable: true },
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
    technique: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        summary: { type: 'STRING', nullable: true },
        whyItWorks: { type: 'STRING', nullable: true },
        appliesTo: { type: 'ARRAY', items: { type: 'STRING' } },
        mistakes: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['appliesTo', 'mistakes'],
    },
    heroMoments: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { timestampSec: { type: 'NUMBER' }, why: { type: 'STRING', nullable: true } },
        required: ['timestampSec'],
      },
    },
    heroImageIndex: { type: 'INTEGER', nullable: true },
  },
  required: ['kind', 'isRecipe', 'title', 'servings', 'tags', 'ingredients', 'steps', 'confidence'],
  propertyOrdering: ['kind', 'isRecipe', 'reason', 'title', 'description', 'servings', 'prepMin', 'cookMin', 'cuisine', 'tags', 'ingredients', 'steps', 'nutrition', 'equipment', 'tips', 'author', 'confidence', 'additionalDishes', 'technique', 'heroMoments', 'heroImageIndex'],
} as const;

export const EXTRACT_SYSTEM = `You are a meticulous recipe developer who turns cooking videos, photos and posts into precise, cookable written recipes.

Rules:
- Watch the whole video. Use what is said, shown on screen (text overlays), and the post caption together. When they disagree, prefer on-screen text and spoken amounts over guesses.
- kind: "recipe" when the main purpose is making a specific dish. "technique" when the main purpose is teaching a cooking method or skill that applies to many dishes, such as velveting meat, knife cuts, making a roux, laminating dough or searing. A technique video may cook something along the way; still choose "technique" if the method is the lesson. "neither" for anything else, with isRecipe=false, a reason, and empty arrays.
- isRecipe: true only when kind is "recipe".
- For a technique: title names the technique (e.g. "Velveting meat for stir-fries"). steps are the stages of the technique, each with timestampSec and endSec bracketing the 3 to 10 seconds of footage that best shows that stage being done (not talking to camera). ingredients lists only what the technique itself uses, with estimated amounts if unstated; it may be empty. Fill technique.summary, technique.whyItWorks (only if the video explains it), technique.appliesTo and technique.mistakes. servings=1. nutrition=null.
- If several dishes are made, extract the main dish and list the others in additionalDishes.
- Ingredients: one entry per ingredient with a numeric quantity (decimals, e.g. 0.5) and a short unit (g, kg, ml, l, tsp, tbsp, cup, oz, lb, clove, can, bunch, pinch, or "" for whole items). Put prep words like "diced" in note, not in name. Use group for sub-recipes such as "Sauce" or "Marinade".
- When an amount is not stated, estimate a realistic one for the stated servings and set estimated=true. Use quantity=null only for "to taste" items like salt.
- aisle must be one of the allowed values for a typical grocery store.
- Steps: imperative, specific (times, temperatures in both °F and °C, visual cues). Include the video timestamp in seconds where each step starts when you can tell.
- servings: what the recipe as shown makes; estimate if unstated.
- nutrition: estimated per serving.
- tags: 3-8 lowercase tags covering meal type, main protein, diet (e.g. vegetarian, gluten-free, high-protein), and speed (e.g. under-30-min).
- confidence: 0 to 1, how sure you are the recipe is complete and accurate.
- Never invent a creator name; author only if shown or stated.
- heroMoments: for videos, the 3 best timestamps (seconds, best first) for a preview image. For a recipe, choose the finished dish or its most appetizing moment: plated or in the pan, well lit, in focus, filling the frame, without hands, faces, logos or text overlays covering the food. For a technique, choose the clearest frame of the technique in action. Empty for photos and text.
- heroImageIndex: for photo imports, the 0-based index of the photo that shows the food most appetizingly; null otherwise.`;

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
  context.push('Extract the recipe or technique as JSON.');
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
    .map((s) => ({
      text: s.text.trim().slice(0, 1000),
      timestampSec: clampInt(s.timestampSec, 0, 36_000),
      endSec: clampInt(s.endSec, 0, 36_000),
      durationMin: clampInt(s.durationMin, 0, 2_000),
    }));
  const kind = (raw as { kind?: string }).kind;
  const isTechnique = kind === 'technique' && steps.length > 0;
  const isRecipe = !isTechnique && kind !== 'neither' && Boolean(raw.isRecipe) && ingredients.length > 0;
  const technique = raw.technique;
  return {
    isRecipe,
    isTechnique,
    reason: raw.reason ?? (isRecipe || isTechnique ? undefined : 'No ingredients could be identified.'),
    title: (raw.title || (isTechnique ? 'Untitled technique' : 'Untitled recipe')).trim().slice(0, 140),
    description: raw.description?.trim().slice(0, 600) || undefined,
    servings: isTechnique ? 1 : clampInt(raw.servings, 1, 100) ?? 4,
    prepMin: clampInt(raw.prepMin, 0, 2_000),
    cookMin: clampInt(raw.cookMin, 0, 5_000),
    cuisine: raw.cuisine?.trim().slice(0, 40) || undefined,
    tags: [...new Set((raw.tags ?? []).map((t) => String(t).toLowerCase().trim().slice(0, 30)).filter(Boolean))].slice(0, 10),
    ingredients,
    steps,
    nutrition: !isTechnique && raw.nutrition && typeof raw.nutrition.calories === 'number' ? {
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
    technique: isTechnique
      ? {
          summary: technique?.summary?.trim().slice(0, 600) || undefined,
          whyItWorks: technique?.whyItWorks?.trim().slice(0, 1000) || undefined,
          appliesTo: (technique?.appliesTo ?? []).map((a) => String(a).trim().slice(0, 60)).filter(Boolean).slice(0, 12),
          mistakes: (technique?.mistakes ?? []).map((m) => String(m).trim().slice(0, 300)).filter(Boolean).slice(0, 10),
        }
      : null,
    heroMoments: (raw.heroMoments ?? [])
      .filter((m) => m && typeof m.timestampSec === 'number' && Number.isFinite(m.timestampSec) && m.timestampSec >= 0)
      .slice(0, 3)
      .map((m) => ({ timestampSec: Math.min(36_000, m.timestampSec), ...(m.why ? { why: String(m.why).slice(0, 200) } : {}) })),
    heroImageIndex: clampInt(raw.heroImageIndex, 0, 50),
  };
}
