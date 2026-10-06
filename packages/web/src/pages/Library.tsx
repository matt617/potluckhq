import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAsync } from '../lib/hooks';
import { Empty, ErrorNote, Field, Skeleton } from '../components/ui';
import { buttonVariants } from '@/components/ui/button';

export function Library() {
  const state = useAsync(api.library, []);
  const [query, setQuery] = useState(''),
    [collection, setCollection] = useState('');
  const collections = [...new Set(state.data?.annotations.flatMap((a) => a.collections) ?? [])];
  const recipes = (state.data?.recipes ?? []).filter(
    (r) =>
      r.title.toLowerCase().includes(query.toLowerCase()) &&
      (!collection || state.data?.annotations.find((a) => a.recipeId === r.id)?.collections.includes(collection)),
  );
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1>My recipes</h1>
        <p className="text-muted-foreground">Your personal collection stays with you when you leave a kitchen. Notes here are private.</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Link to="/book" className={buttonVariants()}>
          Kitchen recipes
        </Link>
        <Link to="/circles" className={buttonVariants()}>
          Recipe circles
        </Link>
      </div>
      <Field label="Search your recipes">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </Field>
      <Field label="Collection">
        <select value={collection} onChange={(e) => setCollection(e.target.value)}>
          <option value="">All collections</option>
          {collections.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <ErrorNote error={state.error} onRetry={() => void state.reload()} />
      {state.loading && <Skeleton variant="grid" />}
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,248px),1fr))] gap-x-[22px] gap-y-9 p-0">
        {recipes.map((r) => (
          <li className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-card wide:px-7 wide:py-[26px] flex flex-col gap-3" key={r.id}>
            <Link to={`/book/${r.id}`}>
              <h2 className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">{r.title}</h2>
            </Link>
            <p className="text-muted-foreground">
              {r.kind === 'technique' ? 'Cooking technique' : `${r.servings} servings`}
              {r.totalMin ? ` · ${r.totalMin} min` : ''}
            </p>
          </li>
        ))}
      </ul>
      {state.data && !recipes.length && (
        <Empty title="Keep your favorites here">
          <p>Imported recipes are saved here automatically. You can also save an independent copy from a kitchen or circle.</p>
          <Link className={buttonVariants({ variant: 'default' })} to="/book?add=1">
            Save a recipe
          </Link>
        </Empty>
      )}
    </div>
  );
}
