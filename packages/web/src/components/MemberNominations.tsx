import { useNavigate } from 'react-router-dom';
import { kitchenPath } from '../lib/kitchen-context';
import { useState } from 'react';
import type { MemberCandidate } from '@potluck/core';
import { api } from '../api';
import { useAsync, useInterval } from '../lib/hooks';
import { useCommunity, useSession } from '../lib/session';
import { formatDate } from '../lib/util';
import { ErrorNote, Field } from './ui';
import { toast } from 'sonner';

export function MemberNominations({ full }: { full: boolean }) {
  const c = useCommunity();
  const pending = useAsync(() => api.nominations(c.id), [c.id]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MemberCandidate[]>([]);
  const [searched, setSearched] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [selected, setSelected] = useState<MemberCandidate>();
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  async function search(more = false) {
    setBusy(true);
    setError(undefined);
    setSelected(undefined);
    try {
      const result = await api.searchMembers(c.id, query.trim(), more ? cursor : undefined);
      setResults((prev) => (more ? [...new Map([...prev, ...result.members].map((m) => [m.userId, m])).values()] : result.members));
      setSearched(query.trim());
      setCursor(result.cursor);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function act(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await pending.reload();
      setSelected(undefined);
      setResults([]);
      setSearched('');
      toast(message);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack invite-box">
      <h3 className="h4">Nominate a member</h3>
      <p className="small muted">
        Search people from your kitchens and circles by name, or find another Potluck member by their complete email address. They receive a
        nomination here in Potluck and must accept before gaining access.
      </p>
      {full ? (
        <p role="status">This space is full. The owner can manage members or change their plan before adding someone.</p>
      ) : (
        <>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <Field label="Find a member" hint="Names search your shared spaces. Email lookup requires the full address.">
              <input
                type="search"
                value={query}
                disabled={busy}
                maxLength={254}
                autoComplete="off"
                placeholder="Name or complete email address"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(undefined);
                  setResults([]);
                  setSearched('');
                  setCursor(undefined);
                }}
              />
            </Field>
            <button className="btn" disabled={busy || query.trim().length < 2}>
              {busy ? 'Working…' : 'Search members'}
            </button>
          </form>
          {searched && (
            <div className="stack" aria-live="polite">
              {!results.length && (
                <p>
                  {cursor
                    ? 'No match in this batch. Continue searching the member database.'
                    : 'No matching member found. Check the full email address, or use an invitation link below for someone new.'}
                </p>
              )}
              {results.map((m) => (
                <div className="row between wrap" key={m.userId}>
                  <span>
                    <strong>{m.displayName}</strong>
                    <span className="block small muted">{m.context}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={busy || m.status !== 'available'}
                    aria-pressed={selected?.userId === m.userId}
                    onClick={() => {
                      setSelected(m);
                      setRole('member');
                    }}
                  >
                    {m.status === 'member'
                      ? 'Already a member'
                      : m.status === 'pending'
                        ? 'Nomination pending'
                        : selected?.userId === m.userId
                          ? 'Selected'
                          : `Select ${m.displayName}`}
                  </button>
                </div>
              ))}
              {cursor && (
                <button className="btn" disabled={busy} onClick={() => void search(true)}>
                  Continue searching
                </button>
              )}
            </div>
          )}
          {selected && (
            <div className="stack rounded-md border border-border p-4">
              <p>
                Nominate <strong>{selected.displayName}</strong> to <strong>{c.name}</strong>.
              </p>
              {c.role === 'owner' && (
                <Field label="Role after acceptance">
                  <select disabled={busy} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </Field>
              )}
              <p className="small muted">
                {role === 'admin'
                  ? 'Admins can also manage members and settings.'
                  : c.kind === 'circle'
                    ? 'Members can save and exchange recipes.'
                    : 'Members can edit shared recipes, plan meals and shop.'}{' '}
                Their private food profile stays private.
              </p>
              <div className="row wrap">
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void act(() => api.nominate(c.id, selected.userId, role), `Nomination sent to ${selected.displayName}`)}
                >
                  {busy ? 'Nominating…' : `Nominate ${selected.displayName}`}
                </button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => setSelected(undefined)}>
                  Change member
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <ErrorNote error={error ?? pending.error} />
      <h4>Pending nominations</h4>
      {pending.loading && <p role="status">Loading nominations…</p>}
      {!pending.loading && !pending.error && !pending.data?.nominations.length && <p className="small muted">No nominations awaiting acceptance.</p>}
      {pending.data?.nominations.map((n) => (
        <div className="row between wrap" key={n.userId}>
          <span>
            <strong>{n.displayName}</strong> · {n.role}
            <span className="block small muted">Awaiting acceptance · expires {formatDate(n.expiresAt)}</span>
          </span>
          <button
            className="btn btn-small"
            disabled={busy}
            onClick={() => void act(() => api.cancelNomination(c.id, n.userId), 'Nomination withdrawn')}
          >
            Withdraw
          </button>
        </div>
      ))}
      <button className="btn btn-ghost btn-small" disabled={busy || pending.loading} onClick={() => void pending.reload()}>
        Refresh nominations
      </button>
    </div>
  );
}

/** Available even before the recipient has joined their first kitchen. */
export function NominationInbox() {
  const { refreshMe, setCommunityId, setMe } = useSession();
  const navigate = useNavigate();
  const state = useAsync(() => api.myNominations(), []);
  useInterval(() => void state.reload(), 30000, true);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [dismissed, setDismissed] = useState<string[]>([]);
  async function respond(cid: string, userId: string, expiresAt: string, accept: boolean) {
    setBusy(cid);
    setError(undefined);
    try {
      if (accept) {
        const community = await api.acceptNomination(cid);
        const next = await refreshMe();
        const nomination = state.data?.nominations.find((n) => n.communityId === cid);
        // Membership lookup uses an eventually consistent index. Show the confirmed membership immediately.
        if (next && nomination && !next.communities.some((c) => c.id === cid))
          setMe({
            ...next,
            communities: [...next.communities, { ...community, role: nomination.role }],
          });
        setCommunityId(cid);
        navigate(kitchenPath('/community', cid));
      } else await api.cancelNomination(cid, userId);
      setDismissed((prev) => [...prev, `${cid}:${expiresAt}`]);
      await state.reload();
      toast(accept ? 'Nomination accepted. You’re now a member.' : 'Nomination declined');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(undefined);
    }
  }
  const nominations = state.data?.nominations.filter((n) => !dismissed.includes(`${n.communityId}:${n.expiresAt}`)) ?? [];
  if (!nominations.length && !error && !state.error) return null;
  return (
    <section className="card stack mb-6" aria-label="Your membership nominations">
      <h2 className="h3">Your nominations</h2>
      <ErrorNote error={error ?? state.error} onRetry={() => void state.reload()} />
      {nominations.map((n) => (
        <div className="stack" key={n.communityId}>
          <p>
            <strong>{n.nominatedByName}</strong> nominated you to <strong>{n.communityName}</strong> as {n.role === 'admin' ? 'an admin' : 'a member'}
            .
          </p>
          <p className="small muted">
            Accept to access this space’s shared recipes and {n.role === 'admin' ? 'manage its members and settings' : 'participate with its members'}
            . Your private food profile is not shared. Expires {formatDate(n.expiresAt)}.
          </p>
          <div className="row wrap">
            <button className="btn btn-primary" disabled={!!busy} onClick={() => void respond(n.communityId, n.userId, n.expiresAt, true)}>
              {busy === n.communityId ? 'Saving…' : 'Accept nomination'}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => void respond(n.communityId, n.userId, n.expiresAt, false)}>
              Decline
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
