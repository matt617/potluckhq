import { RecordPicker } from '../components/RecordPicker';
import { useMemo, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatAmount, scaleQuantity, type Ingredient, type Recipe } from '@potluck/core';
import { api } from '../api';
import { RecipeEditor } from '../components/RecipeEditor';
import { TechniqueView } from '../components/TechniqueView';
import { ConfirmAction, ErrorNote, Spinner } from '../components/ui';
import { metaBadge } from '../lib/styles';
import { useAsync } from '../lib/hooks';
import { useCommunity, useSession, canAdmin } from '../lib/session';
import { clock, mediaUrl, minutes, youtubeAt } from '../lib/util';
import { AddToPlan, RecipeParticipation } from '../components/RecipeParticipation';
import { kitchenPath } from '../lib/kitchen-context';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function groupIngredients(list: Ingredient[]): [string, Ingredient[]][] {
  const groups = new Map<string, Ingredient[]>();
  for (const i of list) {
    const g = i.group?.trim() || '';
    groups.set(g, [...(groups.get(g) ?? []), i]);
  }
  return [...groups.entries()];
}

/** Round ± buttons in the servings stepper. */
const STEPPER_BUTTON = 'min-h-8 min-w-8 border-0 bg-card p-0 text-[1.05rem] shadow-paper';
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
      if (done) toast(done);
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
          state.setData((prev) => ({
            canEdit: prev?.canEdit ?? true,
            recipe: r,
            media: prev?.media,
          }));
          setServings(null);
          setEditing(false);
          toast('Recipe saved');
        }}
      />
    );
  }

  return (
    <article className="recipe flex flex-col gap-8">
      <Link
        to="/book"
        className="ml-[-10px] inline-flex items-center gap-1.5 self-start rounded-full py-1.5 pr-3.5 pl-2.5 text-[0.92rem] font-medium text-muted-foreground no-underline [transition:color_160ms_var(--ease),_background-color_160ms_var(--ease)] hover:bg-surface-2 hover:text-foreground [&_svg]:[transition:transform_200ms_var(--ease)] [&:hover_svg]:[transform:translateX(-3px)]"
      >
        <ArrowLeft size={16} weight="bold" aria-hidden />
        {isTechnique ? 'Back to the book' : 'All recipes'}
      </Link>
      {isTechnique ? (
        <TechniqueView recipe={recipe} media={state.data?.media} thumb={thumb} onMediaExpired={refreshMedia} />
      ) : (
        <>
          <header className="grid [animation:rise_700ms_var(--ease)_both] gap-6 min-[760px]:grid-cols-[minmax(0,_1.05fr)_minmax(0,_1fr)] min-[760px]:items-center min-[760px]:gap-12 [&_h1]:text-[clamp(2.2rem,_5vw,_3.6rem)] [&_h1]:tracking-[-0.03em]">
            {thumb && <img className="aspect-[4/3] max-h-[460px] w-full rounded-xl object-cover shadow-lift" src={thumb} alt={recipe.title} />}
            <div className="flex flex-col gap-[14px]">
              <h1>{recipe.title}</h1>
              {recipe.description && <p className="max-w-[58ch] text-[1.12rem] leading-[1.55] text-foreground-2">{recipe.description}</p>}
              <p className="text-muted-foreground">
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
                <div className="flex flex-wrap gap-1">
                  {recipe.tags.map((t) => (
                    <span key={t} className={metaBadge}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {recipe.source.url && (
                <p className="text-[0.875rem]">
                  Source:{' '}
                  <a href={recipe.source.url} target="_blank" rel="noreferrer">
                    {recipe.source.author ? `${recipe.source.author} on ${recipe.source.platform}` : recipe.source.platform}
                  </a>
                </p>
              )}
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-2">
            <AddToPlan recipe={recipe} servings={target} />
            {recipe.archived && <p className="text-muted-foreground">Archived. Existing meal plans retain this recipe.</p>}
          </div>
          <div className="grid gap-5 wide:grid-cols-[minmax(300px,2fr)_3fr] wide:items-start wide:gap-6 wide:[&>:first-child]:sticky wide:[&>:first-child]:top-[88px]">
            <section
              className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px]"
              aria-labelledby="ing-title"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="ing-title">Ingredients</h2>
                <div
                  className="inline-flex items-center gap-1 rounded-full bg-surface-2 p-[3px] text-[0.9rem] font-semibold tabular-nums [&_span]:px-1.5 [&_span]:py-0"
                  aria-label="Servings"
                >
                  <button
                    type="button"
                    className={cn(buttonVariants({ size: 'sm' }), STEPPER_BUTTON)}
                    aria-label="Fewer servings"
                    onClick={() => setServings(Math.max(1, target - 1))}
                  >
                    −
                  </button>
                  <span>
                    {target} {target === 1 ? 'serving' : 'servings'}
                  </span>
                  <button
                    type="button"
                    className={cn(buttonVariants({ size: 'sm' }), STEPPER_BUTTON)}
                    aria-label="More servings"
                    onClick={() => setServings(target + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
              {groups.map(([group, items]) => (
                <div key={group || 'main'}>
                  {group && <h3 className="mb-1 font-sans text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">{group}</h3>}
                  <ul className="m-0 list-none p-0 [&_li]:grid [&_li]:grid-cols-[6.5em_1fr] [&_li]:gap-2.5 [&_li]:px-0 [&_li]:py-2.5 [&_li]:[border-bottom:1px_dashed_var(--border-strong)] [&_li:last-child]:[border-bottom:0]">
                    {items.map((i, idx) => (
                      <li key={`${i.name}-${idx}`}>
                        <span className="pt-[1px] font-mono text-[0.88rem] font-medium text-accent-foreground tabular-nums">
                          {formatAmount(scaleQuantity(i.quantity, recipe.servings, target), i.unit)}
                        </span>
                        <span>
                          {i.name}
                          {i.note && <span className="text-muted-foreground">, {i.note}</span>}
                          {i.estimated && (
                            <span
                              className={cn(metaBadge, 'ml-1 bg-warning-soft text-warning-foreground')}
                              title="The video did not say how much; this amount is estimated."
                            >
                              est.
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {anyEstimated && <p className="text-[0.875rem] text-muted-foreground">Amounts marked "est." were not stated in the video and were estimated.</p>}
              {recipe.equipment && recipe.equipment.length > 0 && (
                <p className="text-[0.875rem]">
                  <strong>Equipment:</strong> {recipe.equipment.join(', ')}
                </p>
              )}
            </section>

            <section
              className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px]"
              aria-labelledby="steps-title"
            >
              <h2 id="steps-title">Steps</h2>
              <ol className="m-0 flex list-none flex-col gap-[22px] p-0 [counter-reset:step] [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:rounded-[6px] [&_a]:bg-surface-2 [&_a]:px-2 [&_a]:py-0.5 [&_a]:font-mono [&_a]:text-[0.8rem] [&_a]:font-medium [&_a]:text-foreground-2 [&_a]:no-underline [&_a:hover]:bg-accent [&_a:hover]:text-accent-foreground [&_li]:relative [&_li]:min-h-[2.4rem] [&_li]:max-w-[70ch] [&_li]:pl-[3.4rem] [&_li]:[counter-increment:step] [&_li::before]:absolute [&_li::before]:top-[-0.1rem] [&_li::before]:left-0 [&_li::before]:grid [&_li::before]:h-[2.4rem] [&_li::before]:w-[2.4rem] [&_li::before]:[place-items:center] [&_li::before]:rounded-full [&_li::before]:bg-accent [&_li::before]:font-serif [&_li::before]:text-[1.2rem] [&_li::before]:font-semibold [&_li::before]:text-accent-foreground [&_li::before]:italic [&_li::before]:[content:counter(step)] [&_li>p+p]:mt-1 [&_li>p+p:empty]:hidden [&_li>p:first-child]:text-[1.02rem] [&_li>p:first-child]:leading-[1.65] [&_li>p:first-child]:text-foreground">
                {recipe.steps.map((s, idx) => (
                  <li key={idx}>
                    <p>{s.text}</p>
                    <p className="text-[0.875rem] text-muted-foreground">
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
                  <h3 className="mb-1 font-sans text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">Tips</h3>
                  <ul className="m-0 rounded-md bg-warning-soft py-3.5 pr-[18px] pl-[34px] text-foreground-2">
                    {recipe.tips.map((t, idx) => (
                      <li key={idx}>{t}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>

          {recipe.nutrition && (
            <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px]" aria-labelledby="nut-title">
              <h2 id="nut-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
                Nutrition per serving <span className={cn(metaBadge, 'ml-1')}>AI estimate</span>
              </h2>
              <dl className="mx-0 mt-3.5 mb-0 grid grid-cols-[repeat(auto-fit,_minmax(120px,_1fr))] gap-2.5 [&_dd]:mx-0 [&_dd]:mt-0.5 [&_dd]:mb-0 [&_dd]:font-serif [&_dd]:text-[1.9rem] [&_dd]:leading-[1.1] [&_dd]:font-medium [&_dd]:tracking-[-0.03em] [&_dd]:[font-variant-numeric:tabular-nums_lining-nums] [&_div]:rounded-md [&_div]:bg-surface-2 [&_div]:px-4 [&_div]:py-3.5 [&_dt]:text-[0.8rem] [&_dt]:font-medium [&_dt]:text-muted-foreground">
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

      <section
        className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px]"
        aria-label="Recipe actions"
      >
        <ErrorNote error={error} />
        <div className="flex flex-wrap items-center gap-2">
          {recipe.archived && community && canAdmin(community.role) && (
            <button
              className={buttonVariants()}
              onClick={() =>
                void run(async () => {
                  const next = await api.updateRecipe(recipe.id, {
                    updatedAt: recipe.updatedAt,
                    archived: false,
                  });
                  state.setData(next);
                }, 'Restored to the recipe book')
              }
            >
              Restore recipe
            </button>
          )}
          {canEdit && (
            <button className={buttonVariants()} onClick={() => setEditing(true)}>
              Edit {isTechnique ? 'technique' : 'recipe'}
            </button>
          )}
          {shareable.length > 0 && (
            <div className="flex max-w-full min-w-0 items-center gap-2">
              <RecordPicker
                label="Save to kitchen or circle"
                value={shareTo}
                onChange={setShareTo}
                placeholder="Save an independent copy to…"
                options={shareable.map((c) => ({
                  value: c.id,
                  label: c.name,
                  detail: `${c.kind === 'circle' ? 'Recipe circle' : 'Kitchen'} · ${c.memberCount} members`,
                }))}
              />
              <button
                className={buttonVariants()}
                disabled={!shareable.some((c) => c.id === shareTo)}
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
            <ConfirmAction
              className={buttonVariants()}
              title={`Archive in ${community.name}?`}
              description="It leaves this space’s recipe book and future plans. Copies people saved elsewhere stay."
              confirmLabel="Archive"
              onConfirm={() =>
                run(async () => {
                  await api.removeFromCommunity(community.id, recipe.id);
                  navigate('/book');
                })
              }
            >
              Archive in {community.name}
            </ConfirmAction>
          )}
          {isOwner && (
            <ConfirmAction
              title={`Delete ${recipe.title}?`}
              description="It is removed everywhere it appears. Independent copies other people saved stay. This cannot be undone."
              confirmLabel={`Delete ${isTechnique ? 'technique' : 'recipe'}`}
              onConfirm={() =>
                run(async () => {
                  await api.deleteRecipe(recipe.id);
                  navigate('/book');
                })
              }
            >
              Delete {isTechnique ? 'technique' : 'recipe'}
            </ConfirmAction>
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
    </article>
  );
}
