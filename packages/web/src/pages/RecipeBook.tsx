import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ImportJob, RecipeKind } from '@potluck/core';
import { api } from '../api';
import { AddRecipe, type AddMode } from '../components/AddRecipe';
import { ImportList, isActiveImport, needsAttention } from '../components/ImportList';
import { CookingPot, MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import { Chip, Empty, ErrorNote, PageHeader, Skeleton, Segmented } from '../components/ui';
import { metaBadge } from '../lib/styles';

type KindFilter = 'all' | RecipeKind;
const KIND_LABEL: Record<KindFilter, string> = { all: 'Everything', recipe: 'Recipes', technique: 'Techniques' };
import { useAsync, useInterval } from '../lib/hooks';
import { useCommunity, useSession } from '../lib/session';
import { mediaUrl, minutes } from '../lib/util';
import { kitchenPath } from '../lib/kitchen-context';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Stable warm placeholder tone (0-3) for recipes without a thumbnail. */
function toneOf(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 4;
}

export function RecipeBook() {
  const community = useCommunity();
  const { publicConfig } = useSession();
  const members = useAsync(() => api.community(community.id), [community.id]);
  const recipes = useAsync(() => api.recipes(community.id), [community.id]);
  const imports = useAsync(() => api.imports(), []);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>('all');
  const [addMode, setAddMode] = useState<AddMode | null>(() => (new URLSearchParams(window.location.search).has('add') ? 'link' : null));
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const lastDone = useRef<Set<string>>(new Set());
  const showAdd = addMode !== null;

  const pendingImports: ImportJob[] = useMemo(
    () => (imports.data?.imports ?? []).filter((j) => j.communityId === community.id && needsAttention(j)),
    [imports.data, community.id],
  );
  const anyActive = pendingImports.some(isActiveImport);

  useInterval(
    async () => {
      const next = await api.imports().catch(() => null);
      if (!next) return;
      const newlyDone = next.imports.filter((j) => j.status === 'done' && !lastDone.current.has(j.id));
      imports.setData(next);
      if (newlyDone.length) {
        newlyDone.forEach((j) => lastDone.current.add(j.id));
        void recipes.reload();
        const added = newlyDone.filter((j) => j.communityId === community.id && j.recipeId);
        if (added.length) {
          setJustAdded((prev) => new Set([...prev, ...added.map((j) => j.recipeId!)]));
          toast(added.length === 1 ? 'New recipe added to the book' : `${added.length} new recipes added to the book`);
        }
      }
    },
    4000,
    anyActive,
  );

  // Remember which imports were already done on first load so only new completions trigger a refresh.
  useEffect(() => {
    for (const j of imports.data?.imports ?? []) if (j.status === 'done') lastDone.current.add(j.id);
  }, [imports.data]);

  const list = (recipes.data?.recipes ?? []).filter((r) => showArchived || !r.archived);
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of list) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([t]) => t);
  }, [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter((r) => kind === 'all' || (r.kind ?? 'recipe') === kind)
      .filter((r) => (!tag || r.tags.includes(tag)) && (!q || r.title.toLowerCase().includes(q) || r.tags.some((t) => t.includes(q))))
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }, [list, query, tag, kind]);
  const techniqueCount = list.filter((r) => r.kind === 'technique').length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={recipes.data ? `${list.length} ${list.length === 1 ? 'recipe' : 'recipes'} in the book` : 'Recipe book'}
        title={`${community.name}'s recipes`}
      >
        <button className={buttonVariants({ variant: 'default' })} onClick={() => setAddMode(showAdd ? null : 'link')} aria-expanded={showAdd}>
          {showAdd ? <X size={16} weight="bold" aria-hidden /> : <Plus size={16} weight="bold" aria-hidden />}
          {showAdd ? 'Close' : 'Add recipe'}
        </button>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/library" className={buttonVariants()}>
          My recipes
        </Link>
        <Link className={buttonVariants()} to={kitchenPath('/community', community.id)}>
          Invite someone
        </Link>
      </div>

      {addMode && (
        <AddRecipe key={addMode} communityId={community.id} initialMode={addMode} onQueued={() => void Promise.all([imports.reload(), recipes.reload()])} />
      )}
      <ImportList
        imports={pendingImports}
        onChanged={() => void Promise.all([imports.reload(), recipes.reload()])}
        onUseInstead={(mode) => {
          setAddMode(mode);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
      <label className="flex min-h-[46px] cursor-pointer items-center gap-3">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Show archived recipes
      </label>

      <div className="flex flex-col gap-3">
        <div className="relative [&_input]:min-h-[52px] [&_input]:rounded-full [&_input]:border-border [&_input]:pl-[46px] [&_input]:shadow-paper [&_svg]:pointer-events-none [&_svg]:absolute [&_svg]:top-[50%] [&_svg]:left-[18px] [&_svg]:[transform:translateY(-50%)] [&_svg]:text-muted-foreground">
          <MagnifyingGlass size={18} aria-hidden />
          <input type="search" placeholder="Search recipes or tags" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search recipes" />
        </div>
        {techniqueCount > 0 && (
          <Segmented
            label="Show"
            value={kind}
            onChange={setKind}
            options={(['all', 'recipe', 'technique'] as KindFilter[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          />
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Filter by tag">
            {tags.map((t) => (
              <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                {t}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {recipes.loading && !recipes.data && <Skeleton variant="grid" label="Loading recipes" />}
      <ErrorNote error={recipes.error} onRetry={() => void recipes.reload()} />

      {recipes.data && list.length === 0 && (
        <Empty title="No recipes yet" icon={<CookingPot size={22} weight="duotone" />}>
          <p>Paste a cooking video link, or send one to the Potluck bot from your phone. Recipes usually land in under a minute.</p>
          {!showAdd && (
            <button className={buttonVariants({ variant: 'default' })} onClick={() => setAddMode('link')}>
              Add your first recipe
            </button>
          )}
        </Empty>
      )}

      {filtered.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,248px),1fr))] gap-x-[22px] gap-y-9 p-0" aria-label="Recipes">
          {filtered.map((r, idx) => {
            const thumb = mediaUrl(publicConfig?.mediaBaseUrl, r.thumbnailKey);
            return (
              <li
                key={r.id}
                className="[animation:rise_640ms_var(--ease)_both] [animation-delay:calc(var(--i,_0)_*_45ms)]"
                style={{ '--i': Math.min(idx, 12) } as CSSProperties}
              >
                <Link
                  to={kitchenPath(`/book/${r.id}`, community.id)}
                  className="group/card flex h-full flex-col rounded-lg text-inherit no-underline hover:text-inherit focus-visible:[outline-offset:6px] [&:hover_h3]:text-accent-foreground"
                >
                  <div
                    className="relative isolate grid aspect-[4/3] [place-items:center] overflow-hidden rounded-lg bg-surface-2 text-muted-foreground shadow-paper [transition:box-shadow_400ms_var(--ease),_transform_400ms_var(--ease)] group-hover/card:[transform:translateY(-3px)] group-hover/card:shadow-lift group-active/card:[transform:translateY(-1px)_scale(0.99)] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_rgb(0_0_0_/_0.06)] after:[content:''] [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_img]:[transition:transform_700ms_var(--ease)] group-hover/card:[&_img]:[transform:scale(1.05)] [&[data-tone='0']]:[background:var(--tone-0)] [&[data-tone='1']]:[background:var(--tone-1)] [&[data-tone='2']]:[background:var(--tone-2)] [&[data-tone='3']]:[background:var(--tone-3)]"
                    data-tone={toneOf(r.id)}
                  >
                    {r.kind === 'technique' && (
                      <span className="absolute top-2.5 left-2.5 z-1 rounded-full bg-[color-mix(in_srgb,_var(--ink)_82%,_transparent)] px-2.5 py-[3px] text-[0.72rem] font-semibold tracking-[0.02em] text-ink-foreground [backdrop-filter:blur(6px)]">
                        Technique
                      </span>
                    )}
                    {justAdded.has(r.id) && (
                      <span className="absolute top-2.5 right-2.5 z-1 rounded-full bg-primary px-2.5 py-[3px] text-[0.72rem] font-semibold tracking-[0.02em] text-primary-foreground">
                        Just added
                      </span>
                    )}
                    {thumb ? (
                      <img src={thumb} alt="" loading="lazy" />
                    ) : (
                      <span
                        className="[transform:translateY(-4%)] font-serif text-[5.5rem] leading-[1] font-medium text-(color:--tone-ink) italic [font-variation-settings:'SOFT'_100,_'WONK'_1] [transition:transform_500ms_var(--spring)] group-hover/card:[transform:translateY(-4%)_rotate(-6deg)_scale(1.06)]"
                        aria-hidden
                      >
                        {r.title.trim().charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 px-1 pt-3.5 pb-0 [&_h3]:font-serif [&_h3]:text-[1.22rem] [&_h3]:leading-[1.2] [&_h3]:font-[550] [&_h3]:tracking-[-0.015em] [&_h3]:[font-variation-settings:'SOFT'_50] [&_h3]:[transition:color_200ms_var(--ease)]">
                    <h3>
                      {r.title}
                      {r.archived && <span className={cn(metaBadge, 'ml-1')}>Archived</span>}
                    </h3>
                    <p className="text-[0.875rem] text-muted-foreground">
                      Added by {members.data?.members.find((m) => m.userId === r.addedBy)?.displayName ?? 'a former member'}
                    </p>
                    <p className="text-[0.875rem] text-muted-foreground">
                      {(r.kind === 'technique'
                        ? ['Cooking technique']
                        : [minutes(r.totalMin), `${r.servings} servings`, r.proteinG ? `${Math.round(r.proteinG)} g protein` : '']
                      )
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {r.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {r.tags.slice(0, 3).map((t) => (
                          <span key={t} className={metaBadge}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {recipes.data && list.length > 0 && filtered.length === 0 && <p className="text-muted-foreground">No recipes match that search.</p>}
    </div>
  );
}
