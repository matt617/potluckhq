import { useMemo, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatAmount, scaleQuantity, type Ingredient, type Recipe } from '@potluck/core';
import { api } from '../api';
import { RecipeEditor } from '../components/RecipeEditor';
import { ConfirmButton, ErrorNote, Flash, Spinner, useFlash } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { useCommunity, useSession, canAdmin } from '../lib/session';
import { clock, mediaUrl, minutes, youtubeAt } from '../lib/util';

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
  const community = useCommunity();
  const { me, publicConfig } = useSession();
  const navigate = useNavigate();
  const state = useAsync(() => api.recipe(rid), [rid]);
  const [servings, setServings] = useState<number | null>(null);
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
  const inThisCommunity = recipe.communityIds.includes(community.id);
  const thumb = mediaUrl(publicConfig?.mediaBaseUrl, recipe.source.thumbnailKey);
  const anyEstimated = recipe.ingredients.some((i) => i.estimated);

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
          state.setData((prev) => ({ canEdit: prev?.canEdit ?? true, recipe: r }));
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
        All recipes
      </Link>
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

      <section className="card stack" aria-label="Recipe actions">
        <ErrorNote error={error} />
        <div className="row wrap">
          {canEdit && (
            <button className="btn" onClick={() => setEditing(true)}>
              Edit recipe
            </button>
          )}
          {shareable.length > 0 && (
            <div className="row">
              <select aria-label="Share to community" value={shareTo} onChange={(e) => setShareTo(e.target.value)}>
                <option value="">Share to another community…</option>
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
                    await api.shareRecipe(recipe.id, shareTo);
                    state.setData((prev) => (prev ? { ...prev, recipe: { ...prev.recipe, communityIds: [...prev.recipe.communityIds, shareTo] } } : prev!));
                    setShareTo('');
                  }, 'Shared')
                }
              >
                Share
              </button>
            </div>
          )}
          {inThisCommunity && (isOwner || canAdmin(community.role)) && (
            <ConfirmButton
              className="btn"
              onConfirm={() =>
                run(async () => {
                  await api.removeFromCommunity(community.id, recipe.id);
                  navigate('/book');
                })
              }
            >
              Remove from {community.name}
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
              Delete recipe
            </ConfirmButton>
          )}
        </div>
      </section>
      <Flash message={flash} />
    </article>
  );
}
