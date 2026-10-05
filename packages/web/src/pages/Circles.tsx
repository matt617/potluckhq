import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../lib/session';
import { kitchenPath } from '../lib/kitchen-context';
import { ErrorNote, Field } from '../components/ui';

export function Circles() {
  const { me, refreshMe, setCommunityId } = useSession(),
    navigate = useNavigate();
  const [name, setName] = useState(''),
    [source, setSource] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const [created, setCreated] = useState<string | null>(null);
  return (
    <div className="stack-lg">
      <h1>Recipe circles</h1>
      <p className="lead">Exchange recipes with friends, coworkers or family. Everyone keeps their own meal plans, groceries and food profiles.</p>
      <ul className="grid">
        {me?.communities
          .filter((c) => c.kind === 'circle')
          .map((c) => (
            <li className="card stack" key={c.id}>
              <h2 className="h3">
                <Link to={kitchenPath('/book', c.id)}>{c.name}</Link>
              </h2>
              <p>{c.memberCount} members</p>
              <Link to={kitchenPath('/community', c.id)}>Members and nominations</Link>
            </li>
          ))}
      </ul>
      <form
        className="card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            const cid = created ?? (await api.createCommunity({ name, kind: 'circle' })).id;
            setCreated(cid);
            setCommunityId(cid);
            await refreshMe();
            if (source) {
              const recipes = await api.recipes(source);
              for (const r of recipes.recipes.filter((r) => !r.archived)) await api.shareRecipe(r.id, cid);
            }
            navigate(kitchenPath('/book', cid));
          } catch (e) {
            setError(e);
            await refreshMe();
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Start a circle</h2>
        <Field label="Circle name">
          <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Start with recipes from a kitchen" hint="Optional. Copies are independent. The kitchen, plans and grocery lists stay in place.">
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Start empty</option>
            {me?.communities
              .filter((c) => c.kind !== 'circle' && c.role !== 'member')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
        <p className="small muted">
          All plans include up to 3 circles you own, with 20 members each. Sharing saved recipes uses no AI credits. New imports use the circle owner’s account
          allowance.
        </p>
        <ErrorNote error={error} />
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating and copying recipes…' : 'Create circle'}
        </button>
      </form>
    </div>
  );
}
