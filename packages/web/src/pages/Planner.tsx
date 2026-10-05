import { RecordPicker } from '../components/RecordPicker';
import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addDays,
  DAY_NAMES,
  MEAL_SLOTS,
  weekStartOf,
  batchPortions,
  type Diner,
  type Membership,
  type MealPlan,
  type MealSlot,
  type PlanEntry,
  type RecipeSummary,
  type SuggestPlanResponse,
} from '@potluck/core';
import { api } from '../api';
import { AiResult, AiSuggest } from '../components/AiSuggest';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { ErrorNote, Field, FormDialog, PageHeader, Skeleton } from '../components/ui';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAsync, useInterval } from '../lib/hooks';
import { useCommunity, useSession } from '../lib/session';
import { formatDate, newId } from '../lib/util';
import { kitchenPath, useWeek } from '../lib/kitchen-context';
import { readStore, writeStore } from '../lib/storage';
import { toast } from 'sonner';

export function Planner() {
  const community = useCommunity();
  const { me } = useSession();
  const [week, changeWeek] = useWeek();
  const planState = useAsync(() => api.plan(community.id, week), [community.id, week]);
  const recipesState = useAsync(() => api.recipes(community.id), [community.id]);
  const detail = useAsync(() => api.community(community.id), [community.id]);
  const people = useAsync(() => api.diners(community.id), [community.id]);
  const [showAll, setShowAll] = useState(() => readStore('potluck.allMeals') === 'true');
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>();
  const [editing, setEditing] = useState<{
    entry: PlanEntry;
    isNew: boolean;
  } | null>(null);
  const [aiResult, setAiResult] = useState<SuggestPlanResponse | null>(null);
  const draftKey = `potluck.planDraft:${me?.user.id}:${community.id}:${week}`;
  const [recoverable, setRecoverable] = useState<{
    entries: PlanEntry[];
    revision: number;
  } | null>(null);
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  useInterval(() => void planState.reload(), 15000, !dirty && !saving && !editing);
  useEffect(() => {
    if (dirty)
      writeStore(
        draftKey,
        JSON.stringify({
          entries,
          revision: draftRevision ?? planState.data?.plan.revision ?? 0,
        }),
        'session',
      );
  }, [entries, dirty, draftKey, draftRevision, planState.data]);
  function setWeek(next: string) {
    if (!dirty || window.confirm('Leave this draft? You can restore it when you return to this week.')) {
      setDirty(false);
      setEditing(null);
      changeWeek(next);
    }
  }
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const click = (e: MouseEvent) => {
      if ((e.target as Element).closest('a[href]') && !window.confirm('Discard unsaved meal-plan changes?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const navigate = (e: Event) => {
      if (!window.confirm('Leave your unsaved meal-plan draft? You can restore it later.')) e.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    window.addEventListener('potluck:before-navigation', navigate);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
      window.removeEventListener('potluck:before-navigation', navigate);
    };
  }, [dirty]);

  useEffect(() => {
    if (dirty) return;
    if (planState.data?.plan.communityId === community.id && planState.data.plan.weekStart === week) {
      setEntries(planState.data.plan.entries);
      setDirty(false);
      setDraftRevision(null);
      try {
        const draft = readStore(draftKey, 'session');
        const value = draft ? JSON.parse(draft) : null;
        setRecoverable(value && Array.isArray(value.entries) && Number.isInteger(value.revision) ? value : null);
      } catch {
        setRecoverable(null);
      }
    }
  }, [planState.data]);

  useEffect(() => setAiResult(null), [week, community.id]);

  const recipeMap = useMemo(() => {
    const m = new Map<string, RecipeSummary>();
    for (const r of recipesState.data?.recipes ?? []) m.set(r.id, r);
    for (const r of planState.data?.recipes ?? []) m.set(r.id, r);
    return m;
  }, [recipesState.data, planState.data]);

  const plan: MealPlan | undefined = planState.data?.plan.weekStart === week ? planState.data.plan : undefined;

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
    if (!dirty) setDraftRevision(plan?.revision ?? 0);
    const hasLeftovers = entries.some((e) => e.leftoverOf === entry.id);
    const canSupplyLeftovers = !!entry.recipeId && !entry.leftoverOf;
    if (hasLeftovers && !canSupplyLeftovers && !window.confirm('This meal will no longer supply leftovers. Remove its planned leftovers?')) return;
    setEntries((list) =>
      list.some((e) => e.id === entry.id)
        ? list
            .filter((e) => canSupplyLeftovers || e.leftoverOf !== entry.id)
            .map((e) => (e.id === entry.id ? entry : e.leftoverOf === entry.id ? { ...e, recipeId: entry.recipeId } : e))
        : [...list, entry],
    );
    setDirty(true);
  }

  function remove(id: string) {
    if (entries.some((e) => e.leftoverOf === id) && !window.confirm('Remove this cooking meal and its planned leftovers?')) return;
    if (!dirty) setDraftRevision(plan?.revision ?? 0);
    setEntries((list) => list.filter((e) => e.id !== id && e.leftoverOf !== id));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      const res = await api.savePlan(community.id, week, {
        entries,
        revision: draftRevision ?? plan?.revision ?? 0,
        constraints: aiResult?.plan.constraints ?? plan?.constraints,
        notes: aiResult?.plan.notes ?? plan?.notes,
      });
      setDirty(false);
      writeStore(draftKey, null, 'session');
      setRecoverable(null);
      setDraftRevision(null);
      planState.setData(res);
      toast('Plan saved');
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  const thisWeek = weekStartOf();
  const todayIndex = week === thisWeek ? (new Date().getDay() + 6) % 7 : -1;

  if (community.kind === 'circle')
    return (
      <div className="stack">
        <h1>Circles exchange recipes</h1>
        <p>Choose a kitchen to plan meals.</p>
        <Link className="btn" to="/circles">
          Recipe circles
        </Link>
      </div>
    );
  return (
    <div className="stack-lg">
      <PageHeader eyebrow={week === thisWeek ? 'This week' : week < thisWeek ? 'Past week' : 'Coming up'} title="Meal plan">
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
      </PageHeader>

      <AiSuggest
        key={`${community.id}-${week}`}
        communityId={community.id}
        week={week}
        ownerTier={detail.data?.ownerTier}
        isOwner={community.ownerId === me?.user.id}
        initialConstraints={plan?.constraints ?? []}
        hasEdits={dirty}
        attendance={Object.fromEntries(entries.filter((e) => e.dinerIds).map((e) => [`${e.day}:${e.slot}`, e.dinerIds!]))}
        onPlan={(res) => {
          // Load the suggestion into the grid as unsaved edits; the user reviews, then saves.
          if (!dirty) setDraftRevision(plan?.revision ?? 0);
          setAiResult(res);
          setEntries(res.plan.entries);
          setDirty(true);
          void recipesState.reload();
        }}
      />
      {aiResult && <AiResult res={aiResult} onDismiss={() => setAiResult(null)} />}

      {planState.loading && !plan && <Skeleton label="Loading meal plan" />}
      <ErrorNote error={planState.error} onRetry={() => void planState.reload()} />
      {recoverable && !dirty && (
        <section className="note stack">
          <p>You have an unsaved draft for this week.</p>
          <div className="row">
            <button
              className="btn"
              onClick={() => {
                setEntries(recoverable.entries);
                setDraftRevision(recoverable.revision);
                setDirty(true);
                setRecoverable(null);
              }}
            >
              Restore draft
            </button>
            <button
              className="btn"
              onClick={() => {
                writeStore(draftKey, null, 'session');
                setRecoverable(null);
              }}
            >
              Discard draft
            </button>
          </div>
        </section>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={showAll}
          onChange={(e) => {
            setShowAll(e.target.checked);
            writeStore('potluck.allMeals', String(e.target.checked));
          }}
        />
        Show breakfast, lunch and snacks
      </label>
      {!showAll && entries.some((e) => e.slot !== 'dinner') && <p className="small muted">Other meals are planned. Show all meals to see them.</p>}

      {plan && (
        <>
          <div className="planner" role="table" aria-label="Week plan">
            {DAY_NAMES.map((day, d) => (
              <section key={day} className={`plan-day${d === todayIndex ? ' today' : ''}`} role="rowgroup" aria-label={day}>
                <h2 className="plan-day-title">
                  <span className="plan-day-name">{day.slice(0, 3)}</span>
                  <span className="plan-day-date">{formatDate(addDays(week, d))}</span>
                  {d === todayIndex && <span className="plan-today">Today</span>}
                </h2>
                {(showAll ? MEAL_SLOTS : (['dinner'] as MealSlot[])).map((slot) => {
                  const cell = entries.filter((e) => e.day === d && e.slot === slot);
                  return (
                    <div key={slot} className="plan-cell" role="row">
                      <span className="plan-slot">{slot}</span>
                      {cell.map((e) => (
                        <button
                          key={e.id}
                          className={`plan-entry${e.leftoverOf ? ' leftover' : ''}`}
                          onClick={() => setEditing({ entry: e, isNew: false })}
                        >
                          <span>{entryTitle(e)}</span>
                          <span className="muted small">×{e.servings}</span>
                          {!e.leftoverOf && batchPortions(entries, e.id) > e.servings && (
                            <span className="small">
                              Cook {batchPortions(entries, e.id)} portions; eat {e.servings}, save {batchPortions(entries, e.id) - e.servings}
                            </span>
                          )}
                          {e.cookId && (
                            <span className="small">
                              Cook: {detail.data?.members.find((m) => m.userId === e.cookId)?.displayName ?? 'Former member'}
                            </span>
                          )}
                        </button>
                      ))}
                      <button
                        className="plan-add"
                        aria-label={`Add ${slot} on ${day}`}
                        onClick={() => {
                          const diners = people.data?.diners.filter((p) => p.usual) ?? [];
                          setEditing({
                            entry: {
                              id: newId(),
                              day: d,
                              slot: slot as MealSlot,
                              servings: diners.reduce((n, p) => n + p.portions, 0) || 2,
                              dinerIds: diners.length ? diners.map((p) => p.id) : undefined,
                            },
                            isNew: true,
                          });
                        }}
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
                <Link to={kitchenPath('/shop', community.id, week)} className="btn">
                  Shopping list
                </Link>
                <button className="btn btn-primary" disabled={!dirty || saving} onClick={save}>
                  {saving ? 'Saving…' : 'Save plan'}
                </button>
                {!!error && (
                  <button
                    className="btn"
                    onClick={() => {
                      if (window.confirm('Discard this draft and load the latest saved plan?')) {
                        writeStore(draftKey, null, 'session');
                        setDirty(false);
                        setDraftRevision(null);
                        setRecoverable(null);
                        setError(undefined);
                        void planState.reload();
                      }
                    }}
                  >
                    Load latest plan
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {editing && (
        <EntryEditor
          entry={editing.entry}
          isNew={editing.isNew}
          recipes={(recipesState.data?.recipes ?? []).filter((r) => !r.archived && r.kind !== 'technique')}
          diners={people.data?.diners ?? []}
          members={detail.data?.members ?? []}
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
    </div>
  );
}

function EntryEditor({
  entry,
  isNew,
  recipes,
  diners,
  members,
  others,
  titleOf,
  onClose,
  onSave,
  onRemove,
}: {
  entry: PlanEntry;
  isNew: boolean;
  recipes: RecipeSummary[];
  diners: Diner[];
  members: Membership[];
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
  const [dinerIds, setDinerIds] = useState(entry.dinerIds ?? diners.filter((d) => d.usual).map((d) => d.id));
  const [cookId, setCookId] = useState(entry.cookId ?? '');
  const baseId = useId();

  const earlier = others.filter((o) => o.day < entry.day || (o.day === entry.day && MEAL_SLOTS.indexOf(o.slot) < MEAL_SLOTS.indexOf(entry.slot)));

  const valid =
    (kind === 'recipe' ? recipes.some((r) => r.id === recipeId) : kind === 'leftover' ? earlier.some((o) => o.id === leftoverOf) : !!label.trim()) &&
    (!cookId || members.some((m) => m.userId === cookId));

  function save() {
    const leftoverSrc = others.find((o) => o.id === leftoverOf);
    onSave({
      id: entry.id,
      day: entry.day,
      slot: entry.slot,
      servings: Math.max(0.25, servings),
      recipeId: kind === 'recipe' ? recipeId : kind === 'leftover' ? leftoverSrc?.recipeId : undefined,
      leftoverOf: kind === 'leftover' ? leftoverOf : undefined,
      label: kind === 'label' ? label.trim() : undefined,
      note: note.trim() || undefined,
      dinerIds: diners.length ? dinerIds.filter((id) => diners.some((d) => d.id === id)) : undefined,
      cookId: cookId || undefined,
    });
  }

  return (
    <FormDialog
      title={`${DAY_NAMES[entry.day]} ${entry.slot}`}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save();
      }}
      footer={
        <>
          {!isNew && (
            <Button type="button" variant="destructive" className="sm:mr-auto" onClick={onRemove}>
              Remove
            </Button>
          )}
          <Button type="submit" variant="default" disabled={!valid}>
            {isNew ? 'Add' : 'Update'}
          </Button>
        </>
      }
    >
      <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)} className="gap-4">
        <TabsList aria-label="Entry type">
          <TabsTrigger value="recipe">Recipe</TabsTrigger>
          <TabsTrigger value="leftover" disabled={!earlier.length}>
            Leftovers
          </TabsTrigger>
          <TabsTrigger value="label">Other</TabsTrigger>
        </TabsList>
        <TabsContent value="recipe" className="flex flex-col gap-2">
          <Field label="Recipe" hint="Choose a recipe from this kitchen’s book. Your selection stays visible when you search again.">
            <RecordPicker
              label="Recipes"
              value={recipeId}
              placeholder="Choose a recipe"
              empty="No recipes match. Add a recipe to this kitchen’s book first."
              options={recipes.map((r) => ({
                value: r.id,
                label: r.title,
                detail: `${r.servings} servings${r.totalMin ? ` · ${r.totalMin} min` : ''}`,
              }))}
              onChange={(id) => {
                setRecipeId(id);
                if (isNew && !dinerIds.length) setServings(recipes.find((r) => r.id === id)!.servings);
              }}
            />
          </Field>
        </TabsContent>
        <TabsContent value="leftover">
          <Field label="Leftovers from">
            <RecordPicker
              label="Earlier meals"
              value={leftoverOf}
              onChange={setLeftoverOf}
              placeholder="Choose an earlier meal"
              options={earlier.map((o) => ({
                value: o.id,
                label: titleOf(o),
                detail: `${DAY_NAMES[o.day]} ${o.slot}`,
              }))}
            />
          </Field>
        </TabsContent>
        <TabsContent value="label">
          <Field label="What's happening?" hint="e.g. Eat out, Takeout, Office lunch">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
          </Field>
        </TabsContent>
      </Tabs>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Who’s cooking?" hint="Assigns a kitchen member to this meal.">
          <RecordPicker
            label="Cooks"
            value={cookId}
            onChange={setCookId}
            placeholder="Unassigned"
            clearLabel="Unassigned"
            options={members.map((m) => ({
              value: m.userId,
              label: m.displayName,
              detail: m.role,
            }))}
          />
        </Field>
        <Field label="Servings">
          <Input type="number" min={0.25} step={0.25} max={50} value={servings} onChange={(e) => setServings(Number(e.target.value) || 1)} />
        </Field>
        <Field label="Note" className="col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
        </Field>
      </div>
      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="mb-3 p-0 text-[0.9rem] font-medium">Who’s eating?</legend>
        {diners.map((d) => (
          <div className="flex items-center gap-3" key={d.id}>
            <Checkbox
              id={`${baseId}-${d.id}`}
              checked={dinerIds.includes(d.id)}
              onCheckedChange={(v) => {
                const ids = v === true ? [...dinerIds, d.id] : dinerIds.filter((id) => id !== d.id);
                setDinerIds(ids);
                setServings(diners.filter((x) => ids.includes(x.id)).reduce((n, x) => n + x.portions, 0) || 1);
              }}
            />
            <Label htmlFor={`${baseId}-${d.id}`} className="text-base font-normal">
              {d.name}
            </Label>
          </div>
        ))}
        {!diners.length && <Link to="/community">Add yourself, children or guests in kitchen settings</Link>}
      </fieldset>
    </FormDialog>
  );
}
