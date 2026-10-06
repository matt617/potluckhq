import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatUsd } from '@potluck/core';
import { api } from '../api';
import { useAsync } from '../lib/hooks';
import { canAdmin, useCommunity, useSession } from '../lib/session';
import { ConfirmAction, ConfirmButton, ErrorNote, Field } from './ui';
import { buttonVariants } from '@/components/ui/button';

export function KitchenAdministration() {
  const c = useCommunity(),
    { me, refreshMe } = useSession();
  const state = useAsync(async () => {
    const [detail, allowance, transfer, invites] = await Promise.all([
      api.community(c.id),
      api.allowance(c.id),
      api.transfer(c.id),
      canAdmin(c.role) ? api.invites(c.id) : Promise.resolve({ invites: [] }),
    ]);
    return { ...detail, ...allowance, ...transfer, ...invites };
  }, [c.id]);
  const [target, setTarget] = useState(''),
    [error, setError] = useState<unknown>(),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const participation = useAsync(() => (canAdmin(c.role) ? api.participation(c.id) : Promise.resolve({ weeks: [] })), [c.id, c.role]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      await Promise.all([state.reload(), refreshMe()]);
      setMessage('Saved');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const d = state.data;
  return (
    <>
      <ErrorNote error={error ?? state.error} />
      <p role="status">{message}</p>
      {d && (
        <>
          <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-card wide:px-7 wide:py-[26px] flex flex-col gap-3">
            <h2>Plan and import destination</h2>
            <p>
              <strong>{d.ownerName}</strong> provides the {d.tier.name} plan. {d.budget.importsLeft} imports remain across all kitchens and circles they own.
            </p>
            <p>
              {d.budget.aiFeatures
                ? `${formatUsd(d.budget.allowanceLeftMicros)} monthly AI allowance and ${formatUsd(d.budget.creditMicros)} purchased credit remain. Imports and AI planning both use this account-wide pool.`
                : 'Manual meal planning and shopping are included. AI planning requires the owner’s paid plan.'}
            </p>
            <p>Member limits apply separately to each kitchen. Recipe circles allow 20 members and up to 3 owned circles on every plan.</p>
            {c.ownerId === me?.user.id ? (
              <Link to="/account#billing">Manage my plan and usage</Link>
            ) : (
              <p className="text-[0.875rem] text-muted-foreground">
                If the allowance is exhausted, the owner can add credits. Your personal subscription does not change this kitchen’s allowance.
              </p>
            )}
            {c.kind !== 'circle' && (
              <>
                <p>
                  Chat imports currently go to{' '}
                  <strong>{me?.communities.find((x) => x.id === me.user.defaultCommunityId)?.name ?? 'no selected kitchen'}</strong>. Browsing another kitchen
                  does not change that setting.
                </p>
                <button
                  className={buttonVariants()}
                  disabled={busy || me?.user.defaultCommunityId === c.id}
                  onClick={() => void act(() => api.updateMe({ defaultCommunityId: c.id }))}
                >
                  Send my chat imports here
                </button>
              </>
            )}
          </section>
          {canAdmin(c.role) && (
            <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-card wide:px-7 wide:py-[26px] flex flex-col gap-3">
              <h2>Outstanding invitations</h2>
              <p className="text-[0.875rem] text-muted-foreground">
                Members can save and edit shared recipes, plan meals and shop. Admins also manage invitations and kitchen settings. The owner manages billing
                and ownership.
              </p>
              {!d.invites.length && <p>No outstanding invitations.</p>}
              {d.invites.map((i) => (
                <div className="flex items-center gap-2 justify-between flex-wrap" key={i.token}>
                  <span>
                    {i.role} invitation · expires {new Date(i.expiresAt).toLocaleDateString()}
                  </span>
                  <ConfirmAction
                    className={buttonVariants({ size: 'sm' })}
                    title="Revoke this invitation?"
                    description="The link stops working. Anyone who hasn’t joined yet will need a new invitation."
                    confirmLabel="Revoke"
                    onConfirm={() => act(() => api.revokeInvite(c.id, i.token))}
                  >
                    Revoke
                  </ConfirmAction>
                </div>
              ))}
            </section>
          )}
          {(c.role === 'owner' || d.transfer?.to === me?.user.id) && (
            <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-card wide:px-7 wide:py-[26px] flex flex-col gap-3">
              <h2>Transfer ownership</h2>
              <p>
                The new owner must accept. Their plan and allowance will support this {c.kind === 'circle' ? 'circle' : 'kitchen'} afterward. Subscriptions and
                purchased credits remain with their current account holders.
              </p>
              {d.transfer && (
                <>
                  <p>
                    Pending acceptance by {d.members.find((m) => m.userId === d.transfer!.to)?.displayName}. Expires{' '}
                    {new Date(d.transfer.expiresAt).toLocaleDateString()}.
                  </p>
                  {d.transfer.to === me?.user.id && (
                    <ConfirmButton
                      disabled={busy}
                      className={buttonVariants({ variant: 'default' })}
                      confirmLabel="Accept ownership and use my plan?"
                      onConfirm={() => act(() => api.acceptTransfer(c.id))}
                    >
                      Accept ownership
                    </ConfirmButton>
                  )}
                  <button className={buttonVariants()} disabled={busy} onClick={() => void act(() => api.cancelTransfer(c.id))}>
                    Cancel transfer
                  </button>
                </>
              )}
              {c.role === 'owner' && !d.transfer && (
                <>
                  <Field label="New owner">
                    <select value={target} onChange={(e) => setTarget(e.target.value)}>
                      <option value="">Choose an existing member</option>
                      {d.members
                        .filter((m) => m.userId !== me?.user.id)
                        .map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.displayName}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <button className={buttonVariants()} disabled={!target || busy} onClick={() => void act(() => api.offerTransfer(c.id, target))}>
                    Offer ownership
                  </button>
                </>
              )}
            </section>
          )}
          {canAdmin(c.role) && (
            <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-card wide:px-7 wide:py-[26px] flex flex-col gap-3">
              <h2>Your kitchen’s rhythm</h2>
              <p className="text-[0.875rem] text-muted-foreground">
                Weeks when you saved recipes, planned and shopped together. Only action flags and participant counts are shown; recipe text and food profiles
                are never collected for this report.
              </p>
              <ErrorNote error={participation.error} />
              {participation.data?.weeks.map((w) => (
                <p key={w.week}>
                  <strong>{w.week}</strong> · {w.participants} participant{w.participants === 1 ? '' : 's'} ·{' '}
                  {[w.saved ? 'Recipes saved' : '', w.planned ? 'Meals planned' : '', w.shopped ? 'List built' : '', w.cooked ? 'Meal cooked' : '']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ))}
              {!participation.data?.weeks.length && <p>Your first week’s progress will appear here.</p>}
            </section>
          )}
        </>
      )}
    </>
  );
}
