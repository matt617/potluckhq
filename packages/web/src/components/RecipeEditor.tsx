import { useState, type FormEvent } from 'react';
import { formatAmount, parseIngredientLine, type Ingredient, type Recipe, type Step } from '@potluck/core';
import { api } from '../api';
import { ErrorNote, Field, TagInput } from './ui';
import { buttonVariants } from '@/components/ui/button';

function ingredientLine(i: Ingredient): string {
  const amount = formatAmount(i.quantity, i.unit);
  return [amount, i.name].filter(Boolean).join(' ') + (i.note ? `, ${i.note}` : '');
}

/** Lines starting with "## " become ingredient group headings. */
function ingredientsToText(list: Ingredient[]): string {
  const out: string[] = [];
  let group: string | undefined;
  for (const i of list) {
    if ((i.group ?? undefined) !== group) {
      group = i.group ?? undefined;
      if (group) out.push(`## ${group}`);
    }
    out.push(ingredientLine(i));
  }
  return out.join('\n');
}

function textToIngredients(text: string, previous: Ingredient[]): Ingredient[] {
  const byLine = new Map(previous.map((i) => [ingredientLine(i), i]));
  const out: Ingredient[] = [];
  let group: string | undefined;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('## ')) {
      group = line.slice(3).trim() || undefined;
      continue;
    }
    // Unchanged lines keep their original aisle and estimate flag.
    const same = byLine.get(line);
    const parsed = same ?? parseIngredientLine(line);
    out.push({ ...parsed, ...(group ? { group } : { group: undefined }), estimated: same?.estimated });
  }
  return out;
}

function stepsToText(steps: Step[]): string {
  return steps.map((s) => s.text).join('\n\n');
}

function textToSteps(text: string, previous: Step[]): Step[] {
  const byText = new Map(previous.map((s) => [s.text.trim(), s]));
  return text
    .split(/\n\s*\n|\n(?=\d+[.)]\s)/)
    .map((t) => t.replace(/^\d+[.)]\s*/, '').trim())
    .filter(Boolean)
    .map((t) => byText.get(t) ?? { text: t });
}

const num = (v: string): number | null => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v)) || 0));

export function RecipeEditor({ recipe, onCancel, onSaved }: { recipe: Recipe; onCancel: () => void; onSaved: (r: Recipe) => void }) {
  const [title, setTitle] = useState(recipe.title);
  const [description, setDescription] = useState(recipe.description ?? '');
  const [servings, setServings] = useState(String(recipe.servings));
  const [prep, setPrep] = useState(recipe.prepMin?.toString() ?? '');
  const [cook, setCook] = useState(recipe.cookMin?.toString() ?? '');
  const [cuisine, setCuisine] = useState(recipe.cuisine ?? '');
  const [tags, setTags] = useState(recipe.tags);
  const [ingredients, setIngredients] = useState(() => ingredientsToText(recipe.ingredients));
  const [steps, setSteps] = useState(() => stepsToText(recipe.steps));
  const [tips, setTips] = useState((recipe.tips ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await api.updateRecipe(recipe.id, {
        updatedAt: recipe.updatedAt,
        title: title.trim(),
        description: description.trim() || undefined,
        servings: Math.max(1, Number(servings) || recipe.servings),
        prepMin: num(prep),
        cookMin: num(cook),
        cuisine: cuisine.trim() || undefined,
        tags,
        ingredients: textToIngredients(ingredients, recipe.ingredients),
        steps: textToSteps(steps, recipe.steps),
        tips: tips
          .split('\n')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onSaved(res.recipe);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-8" onSubmit={submit}>
      <div className="flex items-center gap-2 justify-between flex-wrap">
        <h1>Edit recipe</h1>
        <div className="flex items-center gap-2">
          <button type="button" className={buttonVariants()} onClick={onCancel}>
            Cancel
          </button>
          <button className={buttonVariants({ variant: 'default' })} disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <ErrorNote error={error} />
      <div className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px] flex flex-col gap-3">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Description">
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-end gap-3">
          <Field label="Servings">
            <input type="number" min={1} value={servings} onChange={(e) => setServings(e.target.value)} />
          </Field>
          <Field label="Prep (min)">
            <input type="number" min={0} value={prep} onChange={(e) => setPrep(e.target.value)} />
          </Field>
          <Field label="Cook (min)">
            <input type="number" min={0} value={cook} onChange={(e) => setCook(e.target.value)} />
          </Field>
          <Field label="Cuisine">
            <input value={cuisine} onChange={(e) => setCuisine(e.target.value)} />
          </Field>
        </div>
        <Field label="Tags" hint="Press Enter or comma to add a tag">
          <TagInput value={tags} onChange={setTags} lowercase placeholder="chicken, weeknight, high-protein" />
        </Field>
      </div>
      <div className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px] flex flex-col gap-3">
        <Field label="Ingredients" hint='One per line, e.g. "2 cups rice, rinsed". Start a line with "## " for a group heading.'>
          <textarea rows={12} className="font-mono text-[0.88rem]" value={ingredients} onChange={(e) => setIngredients(e.target.value)} />
        </Field>
        <Field label="Steps" hint="Separate steps with a blank line.">
          <textarea rows={12} value={steps} onChange={(e) => setSteps(e.target.value)} />
        </Field>
        <Field label="Tips" hint="One per line.">
          <textarea rows={3} value={tips} onChange={(e) => setTips(e.target.value)} />
        </Field>
      </div>
    </form>
  );
}
