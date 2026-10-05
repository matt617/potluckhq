import { useMemo, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatAmount, scaleQuantity, type Ingredient, type Recipe } from '@potluck/core';
import { api } from '../api';
import { RecipeEditor } from '../components/RecipeEditor';
import { TechniqueView } from '../components/TechniqueView';
import { ConfirmButton, ErrorNote, Flash, Spinner, useFlash } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { useCommunity, useSession, canAdmin } from '../lib/session';
import { clock, mediaUrl, minutes, youtubeAt } from '../lib/util';
import { AddToPlan, RecipeParticipation } from '../components/RecipeParticipation';
import { kitchenPath } from '../lib/kitchen-context';

function groupIngredients(list: Ingredient[]): [string, Ingredient[]][] {
  const groups = new Map<string, Ingredient[]>();
  for (const i of list) {
    const g = i.group?.trim() || '';
    groups.set(g, [...(groups.get(g) ?? []), i]);
  }
  return [...groups.entries()];
}

export function RecipeDetail() {
  const { rid = '' } = useParams();
  const { me, publicConfig, community } = useSession();
  const navigate = useNavigate();
  const state = useAsync(() => api.recipe(rid), [rid]);
  const [servings, setServings] = useState<number | null>(() => {
    const n = Number(new URLSearchParams(window.location.search).get('servings'));
    return Number.isFinite(n) && n >= 0.25 && n <= 100 ? n : null;
  });
  const [editing, setEditing] = useState(false);
  const [shareTo, setShareTo] = useState('');
  const [error, setError] = useState<unknown>();
  const [flash, setFlash] = useFlash();

  const recipe = state.data?.recipe;
  const target = servings ?? recipe?.servings ?? 1;
  const groups = useMemo(() => groupIngredients(recipe?.ingredients ?? []), [recipe]);

  if (state.loading && !recipe) return <Spinner />;
  if (state.error || !recipe) return <ErrorNote error={state.error ?? new Error('Recipe not found.')} onRetry={() => void state.reload()} />;

  const canEdit = state.data?.canEdit ?? false;
  const isOwner = recipe.ownerId === me?.user.id;
  const shareable = (me?.communities ?? []).filter((c) => !recipe.communityIds.includes(c.id));
  const inThisCommunity = Boolean(community && recipe.communityIds.includes(community.id));
  const thumb = mediaUrl(publicConfig?.mediaBaseUrl, recipe.source.thumbnailKey);
  const anyEstimated = recipe.ingredients.some((i) => i.estimated);
  const isTechnique = recipe.kind === 'technique';
  // Playback URLs are signed for an hour; fetch fresh ones once if a video fails to load after that.
  const refreshMedia = () => {
    const expires = state.data?.media?.expiresAt;
    if (expires && Date.parse(expires) - Date.now() < 5 * 60_000) void state.reload();
  };

  async function run(fn: () => Promise<unknown>, done?: string) {
    setError(undefined);
    try {
      await fn();
      if (done) setFlash(done);
    } catch (e) {
      setError(e);
    }
  }

  if (editing) {
    return (
      <RecipeEditor
        recipe={recipe}
        onCancel={() => setEditing(false)}
        onSaved={(r: Recipe) => {
          state.setData((prev) => ({ canEdit: prev?.canEdit ?? true, recipe: r, media: prev?.media }));
          setServings(null);
          setEditing(false);
          setFlash('Recipe saved');
        }}
      />
    );
  }

  return (
    <article className="stack-lg recipe">
      <Link to="/book" className="back">
        <ArrowLeft size={16} weight="bold" aria-hidden />
        {isTechnique ? 'Back to the book' : 'All recipes'}
      </Link>
      {isTechnique ? (
        <TechniqueView recipe={recipe} media={state.data?.media} thumb={thumb} onMediaExpired={refreshMedia} />
      ) : (
        <>
          <header className="recipe-head">
            {thumb && <img className="recipe-hero" src={thumb} alt={recipe.title} />}
            <div className="stack">
              <h1>{recipe.title}</h1>
              {recipe.description && <p className="lead">{recipe.description}</p>}
              <p className="muted">
                {[
                  recipe.prepMin ? `Prep ${minutes(recipe.prepMin)}` : '',
                  recipe.cookMin ? `Cook ${minutes(recipe.cookMin)}` : '',
                  recipe.totalMin ? `Total ${minutes(recipe.totalMin)}` : '',
                  recipe.cuisine ?? '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {recipe.tags.length > 0 && (
                <div className="tags">
                  {recipe.tags.map((t) => (
                    <span key={t} className="badge">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {recipe.source.url && (
                <p className="small">
                  Source:{' '}
                  <a href={recipe.source.url} target="_blank" rel="noreferrer">
                    {recipe.source.author ? `${recipe.source.author} on ${recipe.source.platform}` : recipe.source.platform}
                  </a>
                </p>
              )}
            </div>
          </header>

          <div className="row wrap">
            <AddToPlan recipe={recipe} servings={target} />
            {recipe.archived && <p className="muted">Archived. Existing meal plans retain this recipe.</p>}
          </div>
          <div className="recipe-cols">
            <section className="card stack" aria-labelledby="ing-title">
              <div className="row between wrap">
                <h2 id="ing-title">Ingredients</h2>
                <div className="stepper" aria-label="Servings">
                  <button type="button" className="btn btn-small" aria-label="Fewer servings" onClick={() => setServings(Math.max(1, target - 1))}>
                    −
                  </button>
                  <span>
                    {target} {target === 1 ? 'serving' : 'servings'}
                  </span>
                  <button type="button" className="btn btn-small" aria-label="More servings" onClick={() => setServings(target + 1)}>
                    +
                  </button>
                </div>
              </div>
              {groups.map(([group, items]) => (
                <div key={group || 'main'}>
                  {group && <h3 className="h4">{group}</h3>}
                  <ul className="ingredients">
                    {items.map((i, idx) => (
                      <li key={`${i.name}-${idx}`}>
                        <span className="amount">{formatAmount(scaleQuantity(i.quantity, recipe.servings, target), i.unit)}</span>
                        <span>
                          {i.name}
                          {i.note && <span className="muted">, {i.note}</span>}
                          {i.estimated && (
                            <span className="badge badge-warn" title="The video did not say how much; this amount is estimated.">
                              est.
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {anyEstimated && <p className="small muted">Amounts marked "est." were not stated in the video and were estimated.</p>}
              {recipe.equipment && recipe.equipment.length > 0 && (
                <p className="small">
                  <strong>Equipment:</strong> {recipe.equipment.join(', ')}
                </p>
              )}
            </section>

            <section className="card stack" aria-labelledby="steps-title">
              <h2 id="steps-title">Steps</h2>
              <ol className="steps">
                {recipe.steps.map((s, idx) => (
                  <li key={idx}>
                    <p>{s.text}</p>
                    <p className="small muted">
                      {typeof s.timestampSec === 'number' && recipe.source.url && (
                        <a href={youtubeAt(recipe.source.url, s.timestampSec)} target="_blank" rel="noreferrer">
                          ▶ {clock(s.timestampSec)} in video
                        </a>
                      )}
                      {s.durationMin ? `  ·  ${minutes(s.durationMin)}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
              {recipe.tips && recipe.tips.length > 0 && (
                <>
                  <h3 className="h4">Tips</h3>
                  <ul className="tips">
                    {recipe.tips.map((t, idx) => (
                      <li key={idx}>{t}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>

          {recipe.nutrition && (
            <section className="card" aria-labelledby="nut-title">
              <h2 id="nut-title" className="h3">
                Nutrition per serving <span className="badge">AI estimate</span>
              </h2>
              <dl className="nutrition">
                <div>
                  <dt>Calories</dt>
                  <dd>{Math.round(recipe.nutrition.calories)}</dd>
                </div>
                <div>
                  <dt>Protein</dt>
                  <dd>{Math.round(recipe.nutrition.proteinG)} g</dd>
                </div>
                <div>
                  <dt>Carbs</dt>
                  <dd>{Math.round(recipe.nutrition.carbsG)} g</dd>
                </div>
                <div>
                  <dt>Fat</dt>
                  <dd>{Math.round(recipe.nutrition.fatG)} g</dd>
                </div>
                <div>
                  <dt>Fiber</dt>
                  <dd>{Math.round(recipe.nutrition.fiberG)} g</dd>
                </div>
              </dl>
            </section>
          )}
        </>
      )}

      <section className="card stack" aria-label="Recipe actions">
        <ErrorNote error={error} />
        <div className="row wrap">
          {recipe.archived && community && canAdmin(community.role) && (
            <button
              className="btn"
              onClick={() =>
                void run(async () => {
                  const next = await api.updateRecipe(recipe.id, { updatedAt: recipe.updatedAt, archived: false });
                  state.setData(next);
                }, 'Restored to the recipe book')
              }
            >
              Restore recipe
            </button>
          )}
          {canEdit && (
            <button className="btn" onClick={() => setEditing(true)}>
              Edit {isTechnique ? 'technique' : 'recipe'}
            </button>
          )}
          {shareable.length > 0 && (
            <div className="row">
              <select aria-label="Save to kitchen or circle" value={shareTo} onChange={(e) => setShareTo(e.target.value)}>
                <option value="">Save an independent copy to…</option>
                {shareable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                disabled={!shareTo}
                onClick={() =>
                  run(async () => {
                    const result = await api.shareRecipe(recipe.id, shareTo);
                    navigate(kitchenPath(`/book/${result.recipe.id}`, shareTo));
                    setShareTo('');
                  }, 'Shared')
                }
              >
                Save copy
              </button>
            </div>
          )}
          {inThisCommunity && community && (isOwner || canAdmin(community.role)) && (
            <ConfirmButton
              className="btn"
              onConfirm={() =>
                run(async () => {
                  await api.removeFromCommunity(community.id, recipe.id);
                  navigate('/book');
                })
              }
            >
              Archive in {community.name}
            </ConfirmButton>
          )}
          {isOwner && (
            <ConfirmButton
              confirmLabel="Delete everywhere?"
              onConfirm={() =>
                run(async () => {
                  await api.deleteRecipe(recipe.id);
                  navigate('/book');
                })
              }
            >
              Delete {isTechnique ? 'technique' : 'recipe'}
            </ConfirmButton>
          )}
        </div>
      </section>
      <RecipeParticipation
        key={recipe.id}
        recipe={recipe}
        onUpdated={(recipe) => {
          state.setData((prev) => ({ ...prev, recipe, canEdit }));
          void state.reload();
        }}
      />
      <Flash message={flash} />
    </article>
  );
}
