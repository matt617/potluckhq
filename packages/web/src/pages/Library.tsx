import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAsync } from '../lib/hooks';
import { Empty, ErrorNote, Field, Skeleton } from '../components/ui';

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
    <div className="stack-lg">
      <div>
        <h1>My recipes</h1>
        <p className="muted">Your personal collection stays with you when you leave a kitchen. Notes here are private.</p>
      </div>
      <div className="row wrap">
        <Link to="/book" className="btn">
          Kitchen recipes
        </Link>
        <Link to="/circles" className="btn">
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
      <ul className="grid">
        {recipes.map((r) => (
          <li className="card stack" key={r.id}>
            <Link to={`/book/${r.id}`}>
              <h2 className="h3">{r.title}</h2>
            </Link>
            <p className="muted">
              {r.kind === 'technique' ? 'Cooking technique' : `${r.servings} servings`}
              {r.totalMin ? ` · ${r.totalMin} min` : ''}
            </p>
          </li>
        ))}
      </ul>
      {state.data && !recipes.length && (
        <Empty title="Keep your favorites here">
          <p>Imported recipes are saved here automatically. You can also save an independent copy from a kitchen or circle.</p>
          <Link className="btn btn-primary" to="/book?add=1">
            Save a recipe
          </Link>
        </Empty>
      )}
    </div>
  );
}
