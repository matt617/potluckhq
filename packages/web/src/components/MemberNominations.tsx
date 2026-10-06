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
import { buttonVariants } from '@/components/ui/button';

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
    <div className="flex flex-col gap-3 pt-2 [&_select]:w-[auto]">
      <h3 className="mb-1 font-sans text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">Nominate a member</h3>
      <p className="text-[0.875rem] text-muted-foreground">
        Search people from your kitchens and circles by name, or find another Potluck member by their complete email address. They receive a nomination here in
        Potluck and must accept before gaining access.
      </p>
      {full ? (
        <p role="status">This space is full. The owner can manage members or change their plan before adding someone.</p>
      ) : (
        <>
          <form
            className="flex flex-col gap-3"
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
            <button className={buttonVariants()} disabled={busy || query.trim().length < 2}>
              {busy ? 'Working…' : 'Search members'}
            </button>
          </form>
          {searched && (
            <div className="flex flex-col gap-3" aria-live="polite">
              {!results.length && (
                <p>
                  {cursor
                    ? 'No match in this batch. Continue searching the member database.'
                    : 'No matching member found. Check the full email address, or use an invitation link below for someone new.'}
                </p>
              )}
              {results.map((m) => (
                <div className="flex flex-wrap items-center justify-between gap-2" key={m.userId}>
                  <span>
                    <strong>{m.displayName}</strong>
                    <span className="block text-[0.875rem] text-muted-foreground">{m.context}</span>
                  </span>
                  <button
                    type="button"
                    className={buttonVariants({ size: 'sm' })}
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
                <button className={buttonVariants()} disabled={busy} onClick={() => void search(true)}>
                  Continue searching
                </button>
              )}
            </div>
          )}
          {selected && (
            <div className="flex flex-col gap-3 rounded-md border border-border p-4">
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
              <p className="text-[0.875rem] text-muted-foreground">
                {role === 'admin'
                  ? 'Admins can also manage members and settings.'
                  : c.kind === 'circle'
                    ? 'Members can save and exchange recipes.'
                    : 'Members can edit shared recipes, plan meals and shop.'}{' '}
                Their private food profile stays private.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className={buttonVariants({ variant: 'default' })}
                  disabled={busy}
                  onClick={() => void act(() => api.nominate(c.id, selected.userId, role), `Nomination sent to ${selected.displayName}`)}
                >
                  {busy ? 'Nominating…' : `Nominate ${selected.displayName}`}
                </button>
                <button className={buttonVariants({ variant: 'ghost' })} disabled={busy} onClick={() => setSelected(undefined)}>
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
      {!pending.loading && !pending.error && !pending.data?.nominations.length && (
        <p className="text-[0.875rem] text-muted-foreground">No nominations awaiting acceptance.</p>
      )}
      {pending.data?.nominations.map((n) => (
        <div className="flex flex-wrap items-center justify-between gap-2" key={n.userId}>
          <span>
            <strong>{n.displayName}</strong> · {n.role}
            <span className="block text-[0.875rem] text-muted-foreground">Awaiting acceptance · expires {formatDate(n.expiresAt)}</span>
          </span>
          <button
            className={buttonVariants({ size: 'sm' })}
            disabled={busy}
            onClick={() => void act(() => api.cancelNomination(c.id, n.userId), 'Nomination withdrawn')}
          >
            Withdraw
          </button>
        </div>
      ))}
      <button className={buttonVariants({ variant: 'ghost', size: 'sm' })} disabled={busy || pending.loading} onClick={() => void pending.reload()}>
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
    <section
      className="mb-6 flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px]"
      aria-label="Your membership nominations"
    >
      <h2 className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">Your nominations</h2>
      <ErrorNote error={error ?? state.error} onRetry={() => void state.reload()} />
      {nominations.map((n) => (
        <div className="flex flex-col gap-3" key={n.communityId}>
          <p>
            <strong>{n.nominatedByName}</strong> nominated you to <strong>{n.communityName}</strong> as {n.role === 'admin' ? 'an admin' : 'a member'}.
          </p>
          <p className="text-[0.875rem] text-muted-foreground">
            Accept to access this space’s shared recipes and {n.role === 'admin' ? 'manage its members and settings' : 'participate with its members'}. Your
            private food profile is not shared. Expires {formatDate(n.expiresAt)}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={buttonVariants({ variant: 'default' })}
              disabled={!!busy}
              onClick={() => void respond(n.communityId, n.userId, n.expiresAt, true)}
            >
              {busy === n.communityId ? 'Saving…' : 'Accept nomination'}
            </button>
            <button className={buttonVariants()} disabled={!!busy} onClick={() => void respond(n.communityId, n.userId, n.expiresAt, false)}>
              Decline
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
