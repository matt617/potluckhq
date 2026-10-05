import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DAY_NAMES, MEAL_SLOTS, weekStartOf, isWeekKey, ingredientConflicts, type MealSlot, type Recipe } from '@potluck/core';
import { api } from '../api';
import { useSession } from '../lib/session';
import { useAsync } from '../lib/hooks';
import { kitchenPath } from '../lib/kitchen-context';
import { newId } from '../lib/util';
import { ConfirmButton, ErrorNote, Field, Sheet } from './ui';

export function AddToPlan({ recipe, servings }: { recipe: Recipe; servings: number }) {
  const { me, community, refreshMe, setCommunityId } = useSession(),
    navigate = useNavigate();
  const [open, setOpen] = useState(false),
    [cid, setCid] = useState(
      me?.communities.find((c) => c.id === recipe.kitchenId && c.kind !== 'circle')?.id ?? (community?.kind !== 'circle' ? community?.id : '') ?? '',
    );
  const [week, setWeek] = useState(new URLSearchParams(window.location.search).get('week') ?? weekStartOf()),
    [day, setDay] = useState(0),
    [slot, setSlot] = useState<MealSlot>('dinner');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={recipe.archived}>
        Cook this week
      </button>
      {open && (
        <Sheet title="Add to meal plan" onClose={() => setOpen(false)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(undefined);
              try {
                const kitchen = cid || (await api.startKitchen()).id;
                const saved = recipe.kitchenId === kitchen ? recipe : (await api.shareRecipe(recipe.id, kitchen)).recipe;
                const [{ plan }, { diners }] = await Promise.all([api.plan(kitchen, week), api.diners(kitchen)]);
                await api.savePlan(kitchen, week, {
                  revision: plan.revision ?? 0,
                  entries: [
                    ...plan.entries,
                    {
                      id: newId(),
                      day,
                      slot,
                      recipeId: saved.id,
                      servings,
                      dinerIds: diners.length ? diners.filter((d) => d.usual).map((d) => d.id) : undefined,
                    },
                  ],
                });
                await refreshMe();
                setCommunityId(kitchen);
                navigate(kitchenPath('/plan', kitchen, week));
              } catch (e) {
                setError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Kitchen">
              <select value={cid} onChange={(e) => setCid(e.target.value)}>
                <option value="">My kitchen</option>
                {me?.communities
                  .filter((c) => c.kind !== 'circle')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Week starting Monday">
              <input type="date" value={week} onChange={(e) => setWeek(e.target.value)} required />
            </Field>
            <Field label="Day">
              <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
                {DAY_NAMES.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Meal">
              <select value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>
                {MEAL_SLOTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <p>{servings} portions. Adjust servings on the recipe before adding it.</p>
            <ErrorNote error={error} />
            <button className="btn btn-primary" disabled={busy || !isWeekKey(week)}>
              {busy ? 'Adding…' : 'Add meal'}
            </button>
          </form>
        </Sheet>
      )}
    </>
  );
}

export function RecipeParticipation({ recipe, onUpdated }: { recipe: Recipe; onUpdated: (r: Recipe) => void }) {
  const { me, community } = useSession(),
    navigate = useNavigate();
  const personal = recipe.ownerId === me?.user.id && !recipe.kitchenId;
  const cid = community && recipe.communityIds.includes(community.id) ? community.id : recipe.kitchenId;
  const activity = useAsync(async () => (cid ? api.activity(cid) : { activity: [] }), [cid]);
  const library = useAsync(async () => (personal ? api.library() : { recipes: [], annotations: [] }), [personal, recipe.id]);
  const origin = useAsync(() => api.origin(recipe.id), [recipe.id, recipe.updatedAt]);
  const people = useAsync(
    () =>
      recipe.kitchenId && me?.communities.find((c) => c.id === recipe.kitchenId)?.kind !== 'circle'
        ? api.diners(recipe.kitchenId)
        : Promise.resolve({ diners: [] }),
    [recipe.kitchenId],
  );
  const [ingredientIndex, setIngredientIndex] = useState(0),
    [replacement, setReplacement] = useState(''),
    [replacementAmount, setReplacementAmount] = useState(''),
    [replacementUnit, setReplacementUnit] = useState('');
  const [note, setNote] = useState(''),
    [privateNote, setPrivateNote] = useState<string | null>(null),
    [collections, setCollections] = useState<string | null>(null),
    [review, setReview] = useState(false),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const annotation = library.data?.annotations.find((a) => a.recipeId === recipe.id);
  async function act(fn: () => Promise<unknown>, message = 'Saved') {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      setMessage(message);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <h2>Keep and share</h2>
      <p className="small muted">Saved copies can be edited independently. Removing an original does not remove copies others already saved.</p>
      <ErrorNote error={error} />
      <p role="status">{message}</p>
      {(personal || cid) && (
        <ConfirmButton
          className="btn"
          disabled={busy}
          confirmLabel="Share this version with people who saved copies?"
          onConfirm={() => act(() => api.publishRecipe(recipe.id), 'Recipe update published for review')}
        >
          Publish an update to saved copies
        </ConfirmButton>
      )}
      {!personal && (
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const { recipe: r } = await api.savePersonal(recipe.id);
              navigate(`/book/${r.id}`);
            })
          }
        >
          Save to My recipes
        </button>
      )}
      {personal && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              () =>
                api.annotate(recipe.id, {
                  collections: (collections ?? annotation?.collections.join(', ') ?? '')
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                  note: privateNote ?? annotation?.note ?? '',
                }),
              'Private notes saved',
            );
          }}
        >
          <Field label="Collections" hint="Comma separated">
            <input value={collections ?? annotation?.collections.join(', ') ?? ''} onChange={(e) => setCollections(e.target.value)} />
          </Field>
          <Field label="Private note">
            <textarea value={privateNote ?? annotation?.note ?? ''} onChange={(e) => setPrivateNote(e.target.value)} maxLength={2000} />
          </Field>
          <button className="btn" disabled={busy}>
            Save private notes
          </button>
        </form>
      )}
      {(personal || recipe.kitchenId) && recipe.ingredients.length > 0 && (
        <details>
          <summary>Review an ingredient substitution</summary>
          <div className="stack">
            <Field label="Ingredient to replace">
              <select value={ingredientIndex} onChange={(e) => setIngredientIndex(Number(e.target.value))}>
                {recipe.ingredients.map((i, n) => (
                  <option key={n} value={n}>
                    {i.quantity} {i.unit} {i.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Replacement ingredient">
              <input value={replacement} onChange={(e) => setReplacement(e.target.value)} maxLength={120} />
            </Field>
            <div className="form-grid">
              <Field label="Replacement quantity">
                <input type="number" min={0} step="any" value={replacementAmount} onChange={(e) => setReplacementAmount(e.target.value)} />
              </Field>
              <Field label="Replacement unit">
                <input value={replacementUnit} onChange={(e) => setReplacementUnit(e.target.value)} maxLength={20} />
              </Field>
            </div>
            <p className="small muted">
              Review the quantity and cooking steps. This only changes this saved version. Known ingredient conflicts are screened again when planning;
              substitutions are not verified allergy-safe.
            </p>
            <ConfirmButton
              className="btn"
              disabled={busy || !replacement.trim() || !replacementAmount || Number(replacementAmount) < 0}
              confirmLabel="Apply this substitution?"
              onConfirm={() =>
                act(async () => {
                  const ingredients = recipe.ingredients.map((i, n) =>
                    n === ingredientIndex
                      ? { ...i, name: replacement.trim(), quantity: Number(replacementAmount), unit: replacementUnit.trim(), note: undefined, estimated: false }
                      : i,
                  );
                  const conflicts = ingredientConflicts(
                    { ...recipe, ingredients },
                    (people.data?.diners ?? []).filter((d) => d.usual).map((d) => d.diet),
                  );
                  if (conflicts.length)
                    throw new Error(
                      'This version still contains a known conflict with the usual diners. Review the ingredients and their shared requirements.',
                    );
                  const result = await api.updateRecipe(recipe.id, { updatedAt: recipe.updatedAt, ingredients });
                  onUpdated(result.recipe);
                  setReplacement('');
                  setReplacementAmount('');
                }, 'Substitution saved. Review the cooking steps and update any affected shopping list.')
              }
            >
              Apply substitution to this version
            </ConfirmButton>
          </div>
        </details>
      )}
      {cid && (
        <>
          <h3>Cooking together</h3>
          <Field label="Cooking note" hint="Shared with members of this kitchen or circle">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </Field>
          <div className="row wrap">
            {(['want', 'made', 'note'] as const).map((kind) => (
              <button
                key={kind}
                className="btn"
                disabled={busy || (kind === 'note' && !note.trim())}
                onClick={() =>
                  void act(async () => {
                    await api.addActivity(cid, { recipeId: recipe.id, kind, note });
                    setNote('');
                    await activity.reload();
                  })
                }
              >
                {kind === 'want' ? 'Want to try' : kind === 'made' ? 'Made it' : 'Share note'}
              </button>
            ))}
          </div>
          <ErrorNote error={activity.error} />
          {activity.data?.activity
            .filter((a) => a.recipeId === recipe.id)
            .map((a) => (
              <article key={a.id}>
                <p>
                  <strong>{a.actorName}</strong> {a.kind === 'want' ? 'wants to try this' : a.kind === 'made' ? 'made this' : 'shared a note'} ·{' '}
                  {new Date(a.at).toLocaleDateString()}
                </p>
                {a.note && <p>{a.note}</p>}
                {(a.actorId === me?.user.id || community?.role !== 'member') && (
                  <ConfirmButton
                    className="btn btn-small"
                    onConfirm={() =>
                      act(async () => {
                        await api.removeActivity(cid, a.id);
                        await activity.reload();
                      })
                    }
                  >
                    Remove
                  </ConfirmButton>
                )}
              </article>
            ))}
        </>
      )}
      {origin.data?.changed && (
        <button className="btn" onClick={() => setReview(true)}>
          Review changes to the original
        </button>
      )}
      {review && origin.data?.recipe && (
        <Sheet title="Review original recipe changes" onClose={() => setReview(false)}>
          <div className="stack">
            <p>This replaces the recipe ingredients and steps. Your private and kitchen notes remain.</p>
            {[recipe, origin.data.recipe].map((r, i) => (
              <section key={i}>
                <h3>
                  {i ? 'Original now' : 'Your saved version'}: {r.title}
                </h3>
                <h4>Ingredients</h4>
                <ul>
                  {r.ingredients.map((x, j) => (
                    <li key={j}>
                      {x.quantity} {x.unit} {x.name} {x.note}
                    </li>
                  ))}
                </ul>
                <h4>Steps</h4>
                <ol>
                  {r.steps.map((x, j) => (
                    <li key={j}>{x.text}</li>
                  ))}
                </ol>
              </section>
            ))}
            <ErrorNote error={error} />
            <ConfirmButton
              disabled={busy}
              className="btn btn-primary"
              confirmLabel="Replace my saved version?"
              onConfirm={() =>
                act(async () => {
                  const result = await api.applyOrigin(recipe.id, recipe.updatedAt, origin.data!.recipe!.updatedAt);
                  onUpdated(result.recipe);
                  setReview(false);
                })
              }
            >
              Apply original updates
            </ConfirmButton>
          </div>
        </Sheet>
      )}
    </section>
  );
}
