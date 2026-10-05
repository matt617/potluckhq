import { useState } from 'react';
import type { Diner } from '@potluck/core';
import { api } from '../api';
import { useAsync } from '../lib/hooks';
import { useSession, canAdmin, useCommunity } from '../lib/session';
import { newId } from '../lib/util';
import { ConfirmButton, ErrorNote, Field, Sheet } from './ui';

export function Diners() {
  const c = useCommunity(),
    { me } = useSession();
  const state = useAsync(() => api.diners(c.id), [c.id]);
  const [editing, setEditing] = useState<Diner | null>(null),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  if (c.kind === 'circle') return null;
  const own = state.data?.diners.find((d) => d.userId === me?.user.id);
  function add(self: boolean) {
    setEditing({
      id: newId(),
      name: self ? me!.user.displayName : '',
      userId: self ? me!.user.id : undefined,
      portions: 1,
      usual: true,
      diet: { allergies: [], diets: [], dislikes: [] },
    });
  }
  return (
    <section className="stack card">
      <h2>Who eats here?</h2>
      <p className="muted">
        Diners are separate from members. Children and guests don’t need an account. Only the food requirements you enter here are shared with this kitchen and
        used for its meal suggestions.
      </p>
      <ErrorNote error={error ?? state.error} />
      <ul className="members">
        {state.data?.diners.map((d) => (
          <li key={d.id}>
            <span>
              {d.name} · {d.portions} portions{d.usual ? ' · Usually eating' : ''}
            </span>
            {(d.userId === me?.user.id || (!d.userId && canAdmin(c.role))) && (
              <div className="row">
                <button className="btn btn-small" onClick={() => setEditing(d)}>
                  Edit
                </button>
                <ConfirmButton
                  className="btn btn-small"
                  onConfirm={async () => {
                    try {
                      await api.removeDiner(c.id, d.id);
                      await state.reload();
                    } catch (e) {
                      setError(e);
                    }
                  }}
                >
                  Remove profile
                </ConfirmButton>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="row wrap">
        {!own && (
          <button className="btn" onClick={() => add(true)}>
            Add me as a diner
          </button>
        )}
        {canAdmin(c.role) && (
          <button className="btn" onClick={() => add(false)}>
            Add a child or guest
          </button>
        )}
      </div>
      {editing && (
        <Sheet title="Kitchen diner" onClose={() => setEditing(null)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(undefined);
              try {
                await api.saveDiner(c.id, editing);
                await state.reload();
                setEditing(null);
              } catch (e) {
                setError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Name">
              <input required maxLength={60} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Usual portions">
              <input
                type="number"
                min={0.25}
                max={20}
                step={0.25}
                value={editing.portions}
                onChange={(e) => setEditing({ ...editing, portions: Number(e.target.value) })}
              />
            </Field>
            <label className="check">
              <input type="checkbox" checked={editing.usual} onChange={(e) => setEditing({ ...editing, usual: e.target.checked })} />
              Usually eating with this kitchen
            </label>
            {(['allergies', 'diets', 'dislikes'] as const).map((k) => (
              <Field key={k} label={k} hint="Comma separated; visible to members of this kitchen">
                <input
                  value={editing.diet[k].join(', ')}
                  onChange={(e) => setEditing({ ...editing, diet: { ...editing.diet, [k]: e.target.value.split(',').map((x) => x.trim()) } })}
                />
              </Field>
            ))}
            {editing.userId && (
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setEditing({ ...editing, diet: { allergies: me!.user.diet.allergies, diets: me!.user.diet.diets, dislikes: me!.user.diet.dislikes } })
                }
              >
                Copy my saved food requirements
              </button>
            )}
            <p className="small muted">
              Saving shares these food requirements with this kitchen. Personal goals and medication information are not copied. Remove your profile here to
              stop using it for future suggestions.
            </p>
            <ErrorNote error={error} />
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save kitchen profile'}
            </button>
          </form>
        </Sheet>
      )}
    </section>
  );
}
