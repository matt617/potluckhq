import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addDays,
  DAY_NAMES,
  MEAL_SLOTS,
  weekStartOf,
  type MealPlan,
  type MealSlot,
  type PlanEntry,
  type RecipeSummary,
  type SuggestPlanResponse,
} from '@potluck/core';
import { api } from '../api';
import { AiResult, AiSuggest } from '../components/AiSuggest';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { ErrorNote, Field, Flash, Sheet, Skeleton, useFlash } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { useCommunity, useSession } from '../lib/session';
import { formatDate, newId } from '../lib/util';

export function Planner() {
  const community = useCommunity();
  const { me } = useSession();
  const [week, setWeek] = useState(() => weekStartOf());
  const planState = useAsync(() => api.plan(community.id, week), [community.id, week]);
  const recipesState = useAsync(() => api.recipes(community.id), [community.id]);
  const detail = useAsync(() => api.community(community.id), [community.id]);
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>();
  const [editing, setEditing] = useState<{ entry: PlanEntry; isNew: boolean } | null>(null);
  const [aiResult, setAiResult] = useState<SuggestPlanResponse | null>(null);
  const [flash, setFlash] = useFlash();

  useEffect(() => {
    if (planState.data) {
      setEntries(planState.data.plan.entries);
      setDirty(false);
    }
  }, [planState.data]);

  useEffect(() => setAiResult(null), [week, community.id]);

  const recipeMap = useMemo(() => {
    const m = new Map<string, RecipeSummary>();
    for (const r of recipesState.data?.recipes ?? []) m.set(r.id, r);
    for (const r of planState.data?.recipes ?? []) m.set(r.id, r);
    return m;
  }, [recipesState.data, planState.data]);

  const plan: MealPlan | undefined = planState.data?.plan;

  function entryTitle(e: PlanEntry): string {
    if (e.leftoverOf) {
      const src = entries.find((x) => x.id === e.leftoverOf);
      const name = src?.recipeId ? recipeMap.get(src.recipeId)?.title : src?.label;
      return `Leftovers${name ? `: ${name}` : ''}`;
    }
    if (e.recipeId) return recipeMap.get(e.recipeId)?.title ?? 'Recipe';
    return e.label || 'Untitled';
  }

  function upsert(entry: PlanEntry) {
    setEntries((list) => (list.some((e) => e.id === entry.id) ? list.map((e) => (e.id === entry.id ? entry : e)) : [...list, entry]));
    setDirty(true);
  }

  function remove(id: string) {
    setEntries((list) => list.filter((e) => e.id !== id).map((e) => (e.leftoverOf === id ? { ...e, leftoverOf: undefined } : e)));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      const res = await api.savePlan(community.id, week, {
        entries,
        constraints: aiResult?.plan.constraints ?? plan?.constraints,
        notes: aiResult?.plan.notes ?? plan?.notes,
      });
      planState.setData(res);
      setFlash('Plan saved');
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  const thisWeek = weekStartOf();

  return (
    <div className="stack-lg">
      <div className="row between wrap">
        <h1>Meal plan</h1>
        <div className="row week-nav">
          <button className="btn btn-small" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}>
            <CaretLeft size={16} weight="bold" aria-hidden />
          </button>
          <span className="week-label">
            {formatDate(week)} to {formatDate(addDays(week, 6))}
          </span>
          <button className="btn btn-small" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}>
            <CaretRight size={16} weight="bold" aria-hidden />
          </button>
          {week !== thisWeek && (
            <button className="btn btn-ghost btn-small" onClick={() => setWeek(thisWeek)}>
              This week
            </button>
          )}
        </div>
      </div>

      <AiSuggest
        key={`${community.id}-${week}`}
        communityId={community.id}
        week={week}
        ownerTier={detail.data?.ownerTier}
        isOwner={community.ownerId === me?.user.id}
        initialConstraints={plan?.constraints ?? []}
        hasEdits={dirty}
        onPlan={(res) => {
          // Load the suggestion into the grid as unsaved edits; the user reviews, then saves.
          setAiResult(res);
          setEntries(res.plan.entries);
          setDirty(true);
          void recipesState.reload();
        }}
      />
      {aiResult && <AiResult res={aiResult} onDismiss={() => setAiResult(null)} />}

      {planState.loading && !plan && <Skeleton label="Loading meal plan" />}
      <ErrorNote error={planState.error} onRetry={() => void planState.reload()} />

      {plan && (
        <>
          <div className="planner" role="table" aria-label="Week plan">
            {DAY_NAMES.map((day, d) => (
              <section key={day} className="plan-day" role="rowgroup" aria-label={day}>
                <h2 className="plan-day-title">
                  {day.slice(0, 3)} <span className="muted">{formatDate(addDays(week, d))}</span>
                </h2>
                {MEAL_SLOTS.map((slot) => {
                  const cell = entries.filter((e) => e.day === d && e.slot === slot);
                  return (
                    <div key={slot} className="plan-cell" role="row">
                      <span className="plan-slot">{slot}</span>
                      {cell.map((e) => (
                        <button key={e.id} className={`plan-entry${e.leftoverOf ? ' leftover' : ''}`} onClick={() => setEditing({ entry: e, isNew: false })}>
                          <span>{entryTitle(e)}</span>
                          <span className="muted small">×{e.servings}</span>
                        </button>
                      ))}
                      <button
                        className="plan-add"
                        aria-label={`Add ${slot} on ${day}`}
                        onClick={() => setEditing({ entry: { id: newId(), day: d, slot: slot as MealSlot, servings: 2 }, isNew: true })}
                      >
                        +
                      </button>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
          <div className="savebar">
            <ErrorNote error={error} />
            <div className="row between wrap">
              <span className="muted small">{dirty ? 'Unsaved changes' : plan.updatedAt ? 'All changes saved' : 'Nothing planned yet'}</span>
              <div className="row">
                <Link to="/shop" className="btn">
                  Shopping list
                </Link>
                <button className="btn btn-primary" disabled={!dirty || saving} onClick={save}>
                  {saving ? 'Saving…' : 'Save plan'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {editing && (
        <EntryEditor
          entry={editing.entry}
          isNew={editing.isNew}
          recipes={recipesState.data?.recipes ?? []}
          others={entries.filter((e) => e.id !== editing.entry.id && (e.recipeId || e.label) && !e.leftoverOf)}
          titleOf={entryTitle}
          onClose={() => setEditing(null)}
          onSave={(e) => {
            upsert(e);
            setEditing(null);
          }}
          onRemove={() => {
            remove(editing.entry.id);
            setEditing(null);
          }}
        />
      )}
      <Flash message={flash} />
    </div>
  );
}

function EntryEditor({
  entry,
  isNew,
  recipes,
  others,
  titleOf,
  onClose,
  onSave,
  onRemove,
}: {
  entry: PlanEntry;
  isNew: boolean;
  recipes: RecipeSummary[];
  others: PlanEntry[];
  titleOf: (e: PlanEntry) => string;
  onClose: () => void;
  onSave: (e: PlanEntry) => void;
  onRemove: () => void;
}) {
  const [kind, setKind] = useState<'recipe' | 'leftover' | 'label'>(entry.leftoverOf ? 'leftover' : entry.recipeId || isNew ? 'recipe' : 'label');
  const [recipeId, setRecipeId] = useState(entry.recipeId ?? '');
  const [leftoverOf, setLeftoverOf] = useState(entry.leftoverOf ?? '');
  const [label, setLabel] = useState(entry.label ?? '');
  const [servings, setServings] = useState(entry.servings);
  const [note, setNote] = useState(entry.note ?? '');
  const [filter, setFilter] = useState('');

  const sorted = recipes
    .filter((r) => !filter || r.title.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title));
  const earlier = others.filter((o) => o.day < entry.day || (o.day === entry.day && MEAL_SLOTS.indexOf(o.slot) < MEAL_SLOTS.indexOf(entry.slot)));

  const valid = kind === 'recipe' ? !!recipeId : kind === 'leftover' ? !!leftoverOf : !!label.trim();

  function save() {
    const leftoverSrc = others.find((o) => o.id === leftoverOf);
    onSave({
      id: entry.id,
      day: entry.day,
      slot: entry.slot,
      servings: Math.max(1, servings),
      recipeId: kind === 'recipe' ? recipeId : kind === 'leftover' ? leftoverSrc?.recipeId : undefined,
      leftoverOf: kind === 'leftover' ? leftoverOf : undefined,
      label: kind === 'label' ? label.trim() : undefined,
      note: note.trim() || undefined,
    });
  }

  return (
    <Sheet title={`${DAY_NAMES[entry.day]} ${entry.slot}`} onClose={onClose}>
      <div className="stack">
        <div className="segmented" role="tablist" aria-label="Entry type">
          <button type="button" role="tab" aria-selected={kind === 'recipe'} className={kind === 'recipe' ? 'on' : ''} onClick={() => setKind('recipe')}>
            Recipe
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'leftover'}
            className={kind === 'leftover' ? 'on' : ''}
            onClick={() => setKind('leftover')}
            disabled={!earlier.length}
          >
            Leftovers
          </button>
          <button type="button" role="tab" aria-selected={kind === 'label'} className={kind === 'label' ? 'on' : ''} onClick={() => setKind('label')}>
            Other
          </button>
        </div>
        {kind === 'recipe' && (
          <>
            <input type="search" placeholder="Filter recipes" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter recipes" />
            <ul className="pick-list" role="listbox" aria-label="Recipes">
              {sorted.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={recipeId === r.id}
                    className={recipeId === r.id ? 'on' : ''}
                    onClick={() => {
                      setRecipeId(r.id);
                      if (isNew) setServings(r.servings);
                    }}
                  >
                    {r.title}
                  </button>
                </li>
              ))}
              {!sorted.length && <li className="muted small">No recipes match.</li>}
            </ul>
          </>
        )}
        {kind === 'leftover' && (
          <Field label="Leftovers from">
            <select value={leftoverOf} onChange={(e) => setLeftoverOf(e.target.value)}>
              <option value="">Choose a meal…</option>
              {earlier.map((o) => (
                <option key={o.id} value={o.id}>
                  {DAY_NAMES[o.day]?.slice(0, 3)} {o.slot}: {titleOf(o)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {kind === 'label' && (
          <Field label="What's happening?" hint="e.g. Eat out, Takeout, Office lunch">
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
          </Field>
        )}
        <div className="form-grid">
          <Field label="Servings">
            <input type="number" min={1} max={50} value={servings} onChange={(e) => setServings(Number(e.target.value) || 1)} />
          </Field>
          <Field label="Note">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
          </Field>
        </div>
        <div className="row between">
          {!isNew ? (
            <button type="button" className="btn btn-danger" onClick={onRemove}>
              Remove
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="btn btn-primary" disabled={!valid} onClick={save}>
            {isNew ? 'Add' : 'Update'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
