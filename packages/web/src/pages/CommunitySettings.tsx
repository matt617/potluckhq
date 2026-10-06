import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tierConfig, type InviteResponse, type Role } from '@potluck/core';
import { api } from '../api';
import { ConfirmAction, ErrorNote, Field, Spinner } from '../components/ui';
import { metaBadge } from '../lib/styles';
import { useAsync } from '../lib/hooks';
import { canAdmin, useCommunity, useSession } from '../lib/session';
import { copyText, formatDate } from '../lib/util';
import { Diners } from '../components/Diners';
import { KitchenAdministration } from '../components/KitchenAdministration';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function CommunitySettings() {
  const community = useCommunity();
  const { me, refreshMe } = useSession();
  const navigate = useNavigate();
  const detail = useAsync(() => api.community(community.id), [community.id]);
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description ?? '');
  const [staples, setStaples] = useState(community.pantryStaples.join('\n'));
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const c = detail.data?.community;
    if (!c) return;
    setName(c.name);
    setDescription(c.description ?? '');
    setStaples(c.pantryStaples.join('\n'));
  }, [detail.data]);

  useEffect(() => setInvite(null), [community.id]);

  const role = detail.data?.role ?? community.role;
  const admin = canAdmin(role);
  const isOwner = role === 'owner';
  const members = detail.data?.members ?? [];
  const limits = tierConfig(detail.data?.ownerTier);
  const memberLimit = community.kind === 'circle' ? 20 : limits.maxMembersPerCommunity;
  const full = members.length >= memberLimit;

  async function act(label: string, fn: () => Promise<void>, done?: string) {
    setBusy(label);
    setError(undefined);
    try {
      await fn();
      if (done) toast(done);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function shareInvite() {
    if (!invite) return;
    const text = `Join ${community.name} on Potluck to ${community.kind === 'circle' ? 'exchange recipes' : 'share recipes, meal plans and shopping lists'}.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Potluck invite', text, url: invite.url });
        return;
      } catch {
        /* cancelled; fall back to copy */
      }
    }
    toast((await copyText(invite.url)) ? 'Invite link copied' : 'Copy failed');
  }

  if (detail.loading && !detail.data) return <Spinner />;

  return (
    <div className="flex flex-col gap-8">
      <h1>{community.name}</h1>
      <ErrorNote error={detail.error} onRetry={() => void detail.reload()} />
      <ErrorNote error={error} />

      <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px] flex flex-col gap-3" aria-labelledby="members-title">
        <div className="flex items-center gap-2 justify-between flex-wrap">
          <h2 id="members-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
            Members
          </h2>
          <span className="text-muted-foreground text-[0.875rem]">
            {members.length} of {memberLimit} on {limits.name}
          </span>
        </div>
        <ul className="list-none m-0 p-0 [&_li]:flex [&_li]:items-center [&_li]:gap-2.5 [&_li]:flex-wrap [&_li]:py-2.5 [&_li]:px-0 [&_li]:[border-bottom:1px_dashed_var(--border)] [&_li:last-child]:[border-bottom:0] [&_li>span:first-child]:flex-1 [&_li>span:first-child]:min-w-[140px] [&_li>span:first-child]:font-medium [&_select]:w-[auto] [&_select]:min-h-[38px]">
          {members.map((m) => {
            const self = m.userId === me?.user.id;
            return (
              <li key={m.userId}>
                <span>
                  {m.displayName || 'Member'}
                  {self && <span className="text-muted-foreground"> (you)</span>}
                </span>
                {isOwner && m.role !== 'owner' ? (
                  <select
                    aria-label={`Role for ${m.displayName}`}
                    value={m.role}
                    onChange={(e) =>
                      act(
                        'role',
                        async () => {
                          await api.setMemberRole(community.id, m.userId, e.target.value as Role);
                          await detail.reload();
                        },
                        'Role updated',
                      )
                    }
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <span className={cn(metaBadge, 'ml-1')}>{m.role}</span>
                )}
                {admin && !self && m.role !== 'owner' && (role === 'owner' || m.role === 'member') && (
                  <ConfirmAction
                    className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    title={`Remove ${m.displayName}?`}
                    description="They lose access to this space’s recipes and plans. You can invite them again later."
                    confirmLabel="Remove"
                    onConfirm={() =>
                      act(
                        'remove',
                        async () => {
                          await api.removeMember(community.id, m.userId);
                          await detail.reload();
                        },
                        'Member removed',
                      )
                    }
                  >
                    Remove
                  </ConfirmAction>
                )}
              </li>
            );
          })}
        </ul>

        {admin && (
          <div className="flex flex-col gap-3 pt-2 [&_select]:w-[auto]">
            <h3 className="mb-1 font-sans text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">Invite someone</h3>
            {full ? (
              <p className="text-muted-foreground text-[0.875rem]">
                {community.kind === 'circle'
                  ? 'This circle has reached its 20-member limit.'
                  : 'This kitchen is full. The owner can upgrade the plan to add more people.'}
              </p>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <select aria-label="Invite role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}>
                  <option value="member">as member</option>
                  <option value="admin">as admin</option>
                </select>
                <button
                  className={buttonVariants({ variant: 'default' })}
                  disabled={busy === 'invite'}
                  onClick={() => act('invite', async () => setInvite(await api.createInvite(community.id, { role: inviteRole })))}
                >
                  Create invite link
                </button>
              </div>
            )}
            {invite && (
              <div className="flex flex-col gap-3">
                <input readOnly value={invite.url} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
                <div className="flex items-center gap-2 flex-wrap">
                  <button className={buttonVariants()} onClick={async () => toast((await copyText(invite.url)) ? 'Copied' : 'Copy failed')}>
                    Copy link
                  </button>
                  <button className={buttonVariants()} onClick={() => void shareInvite()}>
                    Share…
                  </button>
                  <span className="text-muted-foreground text-[0.875rem]">Expires {formatDate(invite.expiresAt)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {community.kind !== 'circle' && <Diners />}
      <KitchenAdministration />
      {admin && (
        <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px] flex flex-col gap-3" aria-labelledby="settings-title">
          <h2 id="settings-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
            Settings
          </h2>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Description">
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
          </Field>
          {community.kind !== 'circle' && (
            <Field label="Pantry staples" hint="One per line. These are tucked away on shopping lists, e.g. salt, olive oil, rice.">
              <textarea rows={6} value={staples} onChange={(e) => setStaples(e.target.value)} />
            </Field>
          )}
          <button
            className={buttonVariants({ variant: 'default' })}
            disabled={busy === 'save' || !name.trim()}
            onClick={() =>
              act(
                'save',
                async () => {
                  await api.updateCommunity(community.id, {
                    name: name.trim(),
                    description: description.trim(),
                    pantryStaples: staples
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  });
                  await Promise.all([refreshMe(), detail.reload()]);
                },
                'Saved',
              )
            }
          >
            Save settings
          </button>
        </section>
      )}

      <section className="min-w-0 rounded-lg border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px] flex flex-col gap-3 border-[color-mix(in_srgb,_var(--danger)_30%,_var(--border))] [&_input]:max-w-[260px]" aria-labelledby="danger-title">
        <h2 id="danger-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
          {isOwner ? 'Delete this kitchen or circle' : 'Leave this kitchen or circle'}
        </h2>
        {isOwner ? (
          <>
            <p className="text-muted-foreground text-[0.875rem]">
              Deletes this shared space and its plans, shopping lists and local recipe versions. Personal saves and independent copies elsewhere remain.
              Transfer ownership above to let the group continue.
            </p>
            <ConfirmAction
              title={`Delete ${community.name}?`}
              description="Its plans, shopping lists and local recipe versions are deleted for everyone. Personal saves and independent copies elsewhere remain. This cannot be undone."
              confirmLabel={`Delete ${community.kind === 'circle' ? 'circle' : 'kitchen'}`}
              onConfirm={() =>
                act('delete', async () => {
                  await api.deleteCommunity(community.id);
                  await refreshMe();
                  navigate('/book');
                })
              }
            >
              Delete {community.kind === 'circle' ? 'circle' : 'kitchen'}
            </ConfirmAction>
          </>
        ) : (
          <ConfirmAction
            title={`Leave ${community.name}?`}
            description="You lose access to its shared recipes and plans until someone invites you again."
            confirmLabel="Leave"
            onConfirm={() =>
              act('leave', async () => {
                if (!me) return;
                await api.removeMember(community.id, me.user.id);
                await refreshMe();
                navigate('/book');
              })
            }
          >
            Leave {community.name}
          </ConfirmAction>
        )}
      </section>
    </div>
  );
}
