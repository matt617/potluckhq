import {
  MEAL_SLOTS,
  PLAN_CONSTRAINTS,
  DAY_NAMES,
  type DietProfile,
  type MealPlan,
  type MealSlot,
  type PlanEntry,
  type Recipe,
  type Diner,
  ingredientConflicts,
  type SuggestPlanRequest,
  type TokenUsage,
} from '@potluck/core';
import { generateJson } from './gemini.js';
import { newId, nowIso } from './ids.js';

interface PlannerOutput {
  summary: string;
  entries: {
    day: number;
    slot: string;
    recipeId?: string | null;
    label?: string | null;
    servings: number;
    leftoverFromDay?: number | null;
    leftoverFromSlot?: string | null;
    note?: string | null;
  }[];
  newIdeas: { title: string; why: string; searchQuery: string }[];
}

const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    entries: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          day: { type: 'INTEGER' },
          slot: { type: 'STRING', enum: MEAL_SLOTS },
          recipeId: { type: 'STRING', nullable: true },
          label: { type: 'STRING', nullable: true },
          servings: { type: 'INTEGER' },
          leftoverFromDay: { type: 'INTEGER', nullable: true },
          leftoverFromSlot: { type: 'STRING', nullable: true },
          note: { type: 'STRING', nullable: true },
        },
        required: ['day', 'slot', 'servings'],
      },
    },
    newIdeas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { title: { type: 'STRING' }, why: { type: 'STRING' }, searchQuery: { type: 'STRING' } },
        required: ['title', 'why', 'searchQuery'],
      },
    },
  },
  required: ['summary', 'entries', 'newIdeas'],
};

const SYSTEM = `You are a practical meal planner for a small household or group. You build a week of meals from the group's own recipe book.

Rules:
- Use only recipeId values from the catalog. Never invent ids.
- Respect every allergy and diet strictly. Avoid dislikes when possible.
- Honor the constraints and away days: on away days plan nothing, or a label like "Travel - pack snacks" with no recipe.
- Plan leftovers deliberately: set leftoverFromDay/leftoverFromSlot on later entries that eat a batch cooked earlier. Leftover entries carry the same recipeId. servings on every entry is the portions eaten at that meal; the app sizes the cook and the shopping list from the sum.
- Reuse fresh ingredients across meals to reduce waste and cost.
- Vary proteins and cuisines across the week.
- GLP-1: smaller portions, protein first, fiber-rich, avoid very greasy or very large meals; this is general guidance, not medical advice.
- Workout: higher protein, more carbs on training days.
- Keep the summary under 120 words, written to the household, explaining the shape of the week.
- Never disclose individual requirements, medications or health goals in summaries, labels, notes or newIdeas. Requirements apply only to the diners attending that meal. An explicitly empty attendance list means no meal.
- newIdeas: up to 3 dishes not in the catalog that would fill a gap (only if allowed), each with a short search query to find a video.`;

export interface PlannerInput {
  request: SuggestPlanRequest;
  catalog: Recipe[];
  diners?: Diner[];
  diets: { name: string; diet: DietProfile }[];
  existing?: MealPlan;
  weekStart: string;
  communityId: string;
  model: string;
  userId: string;
}

export async function suggestPlan(input: PlannerInput): Promise<{ plan: MealPlan; newIdeas: PlannerOutput['newIdeas']; usage: TokenUsage }> {
  const { request } = input;
  const slots = request.slots?.length ? request.slots : (['dinner'] as MealSlot[]);
  const servings = request.servings ?? Math.max(1, input.diets.length);
  const catalog = input.catalog.slice(0, 250).map((r) => ({
    id: r.id,
    title: r.title,
    tags: r.tags.slice(0, 6),
    totalMin: r.totalMin ?? null,
    servings: r.servings,
    ingredients: r.ingredients.map((i) => ({ name: i.name, note: i.note, estimated: i.estimated })),
    kcal: r.nutrition?.calories ?? null,
    proteinG: r.nutrition?.proteinG ?? null,
  }));
  const constraintText = request.constraints
    .map((c) => PLAN_CONSTRAINTS.find((p) => p.id === c))
    .filter(Boolean)
    .map((c) => `- ${c!.label}: ${c!.hint}`)
    .join('\n');
  const people = input.diets.map((d) => {
    const x = d.diet;
    const bits = [
      x.allergies.length ? `allergies: ${x.allergies.join(', ')}` : '',
      x.diets.length ? `diet: ${x.diets.join(', ')}` : '',
      x.dislikes.length ? `dislikes: ${x.dislikes.join(', ')}` : '',
      x.goals ? `goals: ${x.goals}` : '',
      x.glp1 ? 'on a GLP-1 medication' : '',
      x.dailyProteinTargetG ? `protein target ${x.dailyProteinTargetG} g/day` : '',
    ].filter(Boolean);
    return `- ${d.name}: ${bits.join('; ') || 'no restrictions'}`;
  });
  const prompt = [
    `Week starting Monday ${input.weekStart}. Day 0 = Monday … 6 = Sunday.`,
    `Meals to plan: ${slots.join(', ')}. Default servings per meal: ${servings}.`,
    request.awayDays?.length ? `Away days (nobody cooking): ${request.awayDays.map((d) => DAY_NAMES[d]).join(', ')}.` : '',
    constraintText ? `Constraints:\n${constraintText}` : '',
    request.notes ? `Extra notes from the household: ${request.notes.slice(0, 1000)}` : '',
    !input.diners ? `Default food requirements (never quote personal requirements):\n${people.join('\n')}` : '',
    `Meal attendance and eligible recipes:\n${JSON.stringify(
      Array.from({ length: 7 }, (_, day) =>
        slots.map((slot) => {
          const ids = request.attendance?.[`${day}:${slot}`];
          const diners = (input.diners ?? []).filter((d) => (ids ? ids.includes(d.id) : d.usual));
          return {
            day,
            slot,
            skip: ids?.length === 0,
            requirements: diners.map((d) => d.diet),
            servings: diners.length ? diners.reduce((n, d) => n + d.portions, 0) : servings,
            recipeIds: input.catalog
              .filter(
                (r) =>
                  r.ingredients.length &&
                  !ingredientConflicts(
                    r,
                    diners.map((d) => d.diet),
                  ).length,
              )
              .map((r) => r.id),
          };
        }),
      ).flat(),
    )}`,
    `New dishes outside the catalog allowed: ${request.allowNewIdeas ? 'yes' : 'no'}.`,
    `Recipe catalog (JSON):\n${JSON.stringify(catalog)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const { data, usage } = await generateJson<PlannerOutput>({
    model: input.model,
    system: SYSTEM,
    parts: [{ text: prompt }],
    schema: PLAN_SCHEMA,
    maxOutputTokens: 3000,
    temperature: 0.5,
  });

  const validIds = new Set(catalog.map((r) => r.id));
  const bySlot = new Map<string, PlanEntry>();
  const entries: PlanEntry[] = [];
  const sorted = [...(data.entries ?? [])].sort((a, b) => a.day - b.day || MEAL_SLOTS.indexOf(a.slot as MealSlot) - MEAL_SLOTS.indexOf(b.slot as MealSlot));
  for (const e of sorted) {
    if (!Number.isInteger(e.day) || e.day < 0 || e.day > 6) continue;
    if (!MEAL_SLOTS.includes(e.slot as MealSlot) || !slots.includes(e.slot as MealSlot)) continue;
    const key = `${e.day}:${e.slot}`;
    if (bySlot.has(key)) continue;
    const recipeId = e.recipeId && validIds.has(e.recipeId) ? e.recipeId : undefined;
    const label = e.label?.trim().slice(0, 80) || undefined;
    if (!recipeId && !label) continue;
    const source = e.leftoverFromDay != null && e.leftoverFromSlot ? bySlot.get(`${e.leftoverFromDay}:${e.leftoverFromSlot}`) : undefined;
    const entry: PlanEntry = {
      id: newId(10),
      day: e.day,
      slot: e.slot as MealSlot,
      recipeId,
      label: recipeId ? undefined : label,
      servings: Math.min(40, Math.max(1, Math.round(e.servings || servings))),
      leftoverOf: source && !source.leftoverOf && source.recipeId === recipeId ? source.id : undefined,
      note: e.note?.trim().slice(0, 200) || undefined,
    };
    bySlot.set(key, entry);
    entries.push(entry);
  }

  const plan: MealPlan = {
    communityId: input.communityId,
    weekStart: input.weekStart,
    entries,
    constraints: request.constraints,
    notes: request.notes,
    aiSummary: String(data.summary ?? '').slice(0, 1200),
    updatedAt: nowIso(),
    updatedBy: input.userId,
  };
  const newIdeas = request.allowNewIdeas
    ? (data.newIdeas ?? [])
        .slice(0, 3)
        .map((i) => ({ title: String(i.title).slice(0, 100), why: String(i.why).slice(0, 300), searchQuery: String(i.searchQuery).slice(0, 100) }))
    : [];
  return { plan, newIdeas, usage };
}
