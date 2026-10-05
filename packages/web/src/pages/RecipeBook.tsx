import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ImportJob } from '@potluck/core';
import { api } from '../api';
import { AddRecipe } from '../components/AddRecipe';
import { ImportList } from '../components/ImportList';
import { CookingPot, MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import { Chip, Empty, ErrorNote, PageHeader, Skeleton } from '../components/ui';
import { useAsync, useInterval } from '../lib/hooks';
import { useCommunity, useSession } from '../lib/session';
import { mediaUrl, minutes } from '../lib/util';

const ACTIVE = new Set(['queued', 'downloading', 'extracting']);

/** Stable warm placeholder tone (0-3) for recipes without a thumbnail. */
function toneOf(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 4;
}

export function RecipeBook() {
  const community = useCommunity();
  const { publicConfig } = useSession();
  const recipes = useAsync(() => api.recipes(community.id), [community.id]);
  const imports = useAsync(() => api.imports(), []);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const lastDone = useRef<Set<string>>(new Set());

  const recentImports: ImportJob[] = useMemo(
    () => (imports.data?.imports ?? []).filter((j) => j.communityId === community.id).slice(0, 8),
    [imports.data, community.id],
  );
  const anyActive = recentImports.some((j) => ACTIVE.has(j.status));

  useInterval(
    async () => {
      const next = await api.imports().catch(() => null);
      if (!next) return;
      const newlyDone = next.imports.filter((j) => j.status === 'done' && !lastDone.current.has(j.id));
      imports.setData(next);
      if (newlyDone.length) {
        newlyDone.forEach((j) => lastDone.current.add(j.id));
        void recipes.reload();
      }
    },
    4000,
    anyActive,
  );

  // Remember which imports were already done on first load so only new completions trigger a refresh.
  useEffect(() => {
    for (const j of imports.data?.imports ?? []) if (j.status === 'done') lastDone.current.add(j.id);
  }, [imports.data]);

  const list = recipes.data?.recipes ?? [];
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of list) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([t]) => t);
  }, [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter((r) => (!tag || r.tags.includes(tag)) && (!q || r.title.toLowerCase().includes(q) || r.tags.some((t) => t.includes(q))))
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }, [list, query, tag]);

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow={recipes.data ? `${list.length} ${list.length === 1 ? 'recipe' : 'recipes'} in the book` : 'Recipe book'}
        title={`${community.name}'s recipes`}
      >
        <button className="btn btn-primary" onClick={() => setShowAdd((s) => !s)} aria-expanded={showAdd}>
          {showAdd ? <X size={16} weight="bold" aria-hidden /> : <Plus size={16} weight="bold" aria-hidden />}
          {showAdd ? 'Close' : 'Add recipe'}
        </button>
      </PageHeader>

      {showAdd && <AddRecipe communityId={community.id} onQueued={() => void imports.reload()} />}
      <ImportList imports={recentImports} />

      <div className="stack">
        <div className="search">
          <MagnifyingGlass size={18} aria-hidden />
          <input type="search" placeholder="Search recipes or tags" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search recipes" />
        </div>
        {tags.length > 0 && (
          <div className="chips" aria-label="Filter by tag">
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
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              Add your first recipe
            </button>
          )}
        </Empty>
      )}

      {filtered.length > 0 && (
        <ul className="grid" aria-label="Recipes">
          {filtered.map((r, idx) => {
            const thumb = mediaUrl(publicConfig?.mediaBaseUrl, r.thumbnailKey);
            return (
              <li key={r.id} className="rise" style={{ '--i': Math.min(idx, 12) } as CSSProperties}>
                <Link to={`/book/${r.id}`} className="recipe-card">
                  <div className="thumb" data-tone={toneOf(r.id)}>
                    {thumb ? (
                      <img src={thumb} alt="" loading="lazy" />
                    ) : (
                      <span className="thumb-letter" aria-hidden>
                        {r.title.trim().charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="recipe-card-body">
                    <h3>{r.title}</h3>
                    <p className="muted small">
                      {[minutes(r.totalMin), `${r.servings} servings`, r.proteinG ? `${Math.round(r.proteinG)} g protein` : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {r.tags.length > 0 && (
                      <div className="tags">
                        {r.tags.slice(0, 3).map((t) => (
                          <span key={t} className="badge">
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
      {recipes.data && list.length > 0 && filtered.length === 0 && <p className="muted">No recipes match that search.</p>}
    </div>
  );
}
