import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatUsd, tierConfig, type LinkCodeResponse, type TierId } from '@potluck/core';
import { api } from '../api';
import { ConfirmAction, ConfirmButton, ErrorNote, Field, Spinner, TagInput } from '../components/ui';
import { logout } from '../lib/auth';
import { useSession } from '../lib/session';
import { cents, formatDate } from '../lib/util';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';

export function Account() {
  const { me, setMe, publicConfig, refreshMe } = useSession();
  const location = useLocation();

  useEffect(() => {
    const id = location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, me]);

  // Returning from Stripe Checkout: refresh tier and credits.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('checkout') === 'success') {
      toast('Payment received. Your plan is updated.');
      void refreshMe();
    }
  }, [location.search, refreshMe]);

  if (!me) return <Spinner />;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-2 justify-between flex-wrap">
        <h1>Account</h1>
        <button className={buttonVariants({ variant: 'ghost' })} onClick={() => void logout()}>
          Sign out
        </button>
      </div>
      <ProfileSection onSaved={(m) => (setMe(m), toast('Saved'))} />
      <ChatsSection />
      <UsageSection />
      {publicConfig && <BillingSection />}
      <DangerZone />
    </div>
  );
}

function ProfileSection({ onSaved }: { onSaved: (m: NonNullable<ReturnType<typeof useSession>['me']>) => void }) {
  const { me } = useSession();
  const u = me!.user;
  const [displayName, setDisplayName] = useState(u.displayName);
  const [units, setUnits] = useState(u.units);
  const [defaultCommunityId, setDefaultCommunityId] = useState(u.defaultCommunityId ?? '');
  const [allergies, setAllergies] = useState(u.diet.allergies);
  const [diets, setDiets] = useState(u.diet.diets);
  const [dislikes, setDislikes] = useState(u.diet.dislikes);
  const [goals, setGoals] = useState(u.diet.goals ?? '');
  const [glp1, setGlp1] = useState(!!u.diet.glp1);
  const [protein, setProtein] = useState(u.diet.dailyProteinTargetG?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await api.updateMe({
        displayName: displayName.trim(),
        units,
        defaultCommunityId: defaultCommunityId || undefined,
        diet: {
          allergies,
          diets,
          dislikes,
          goals: goals.trim() || undefined,
          glp1,
          dailyProteinTargetG: protein.trim() ? Math.max(0, Number(protein) || 0) : null,
        },
      });
      onSaved(res);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-card wide:px-7 wide:py-[26px] flex flex-col gap-3" aria-labelledby="profile-title">
      <h2 id="profile-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
        Profile
      </h2>
      <p className="text-muted-foreground text-[0.875rem]">{u.email}</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-end gap-3">
        <Field label="Display name">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
        </Field>
        <Field label="Units">
          <select value={units} onChange={(e) => setUnits(e.target.value as 'us' | 'metric')}>
            <option value="us">US (cups, oz, lb)</option>
            <option value="metric">Metric (ml, g, kg)</option>
          </select>
        </Field>
        <Field label="Default kitchen for chat imports" hint="Browsing another kitchen does not change this destination.">
          <select value={defaultCommunityId} onChange={(e) => setDefaultCommunityId(e.target.value)}>
            <option value="">Choose a kitchen</option>
            {me!.communities
              .filter((c) => c.kind !== 'circle')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <h3 className="mb-1 font-sans text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">Food profile</h3>
      <p className="text-muted-foreground text-[0.875rem]">
        These preferences are private. In each kitchen’s settings, choose which food requirements to share as a diner. Joining a kitchen or circle does not
        share them automatically.
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-end gap-3">
        <Field label="Allergies">
          <TagInput value={allergies} onChange={setAllergies} placeholder="peanuts, shellfish" />
        </Field>
        <Field label="Diets">
          <TagInput value={diets} onChange={setDiets} placeholder="vegetarian, low-carb" />
        </Field>
        <Field label="Dislikes">
          <TagInput value={dislikes} onChange={setDislikes} placeholder="cilantro, olives" />
        </Field>
        <Field label="Daily protein target (g)">
          <input type="number" min={0} value={protein} onChange={(e) => setProtein(e.target.value)} />
        </Field>
      </div>
      <Field label="Goals" hint="e.g. build muscle, lift Mon/Wed/Fri, run long on Sunday">
        <textarea rows={2} value={goals} onChange={(e) => setGoals(e.target.value)} />
      </Field>
      <label className="flex min-h-[46px] cursor-pointer items-center gap-3">
        <input type="checkbox" checked={glp1} onChange={(e) => setGlp1(e.target.checked)} />I take a GLP-1 medication. Favor smaller, protein-forward,
        fiber-rich portions.
      </label>
      {glp1 && (
        <p className="text-[0.875rem] text-muted-foreground">Potluck's suggestions are general food ideas, not medical advice. Follow your clinician's guidance on diet and dosing.</p>
      )}
      <ErrorNote error={error} />
      <div>
        <button className={buttonVariants({ variant: 'default' })} disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </section>
  );
}

function ChatsSection() {
  const { me, publicConfig, refreshMe } = useSession();
  const [code, setCode] = useState<LinkCodeResponse | null>(null);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const tg = publicConfig?.telegramBotUsername;
  const wa = publicConfig?.whatsappNumber?.replace(/\D/g, '');
  const sms = publicConfig?.smsNumber;

  async function getCode() {
    setBusy(true);
    setError(undefined);
    try {
      setCode(await api.linkCode());
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="chats" className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-card wide:px-7 wide:py-[26px] flex flex-col gap-3" aria-labelledby="chats-title">
      <h2 id="chats-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
        Linked chats
      </h2>
      <p className="text-muted-foreground text-[0.875rem]">
        Link a private chat with the bot, then forward a recipe. It lands in your chosen kitchen. The bot receives direct messages; it does not join your group
        chat.
      </p>
      {me!.channels.length > 0 ? (
        <ul className="members">
          {me!.channels.map((c) => (
            <li key={`${c.kind}:${c.address}`}>
              <span>
                <span className="badge">{c.kind}</span> {c.address}
              </span>
              <span className="text-muted-foreground text-[0.875rem]">since {formatDate(c.linkedAt)}</span>
              <ConfirmButton
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                confirmLabel="Unlink?"
                onConfirm={async () => {
                  try {
                    await api.unlinkChannel(c.kind, c.address);
                    await refreshMe();
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                Unlink
              </ConfirmButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[0.875rem]">No chats linked yet.</p>
      )}
      {!tg && !wa && !sms && <p className="text-[0.875rem] text-muted-foreground">No chat channels are configured on this Potluck yet.</p>}
      {(tg || wa || sms) && (
        <div className="flex flex-col gap-3">
          <button className={buttonVariants()} disabled={busy} onClick={getCode}>
            {code ? 'Get a new code' : 'Link a chat'}
          </button>
          {code && (
            <div className="link-code flex flex-col gap-3">
              <p>
                Your code is <code className="code-big">{code.code}</code>, valid until {new Date(code.expiresAt).toLocaleTimeString()}.
              </p>
              <p className="text-[0.875rem]">{code.instructions}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {tg && (
                  <a className={buttonVariants({ variant: 'default' })} href={`https://t.me/${tg}?start=${encodeURIComponent(code.code)}`} target="_blank" rel="noreferrer">
                    Open Telegram
                  </a>
                )}
                {wa && (
                  <a className={buttonVariants({ variant: 'default' })} href={`https://wa.me/${wa}?text=${encodeURIComponent(`link ${code.code}`)}`} target="_blank" rel="noreferrer">
                    Open WhatsApp
                  </a>
                )}
                {sms && (
                  <a className={buttonVariants()} href={`sms:${sms}?&body=${encodeURIComponent(`link ${code.code}`)}`}>
                    Send SMS
                  </a>
                )}
              </div>
              <button className={buttonVariants({ variant: 'ghost', size: 'sm' })} onClick={() => void refreshMe()}>
                I've sent it, refresh
              </button>
            </div>
          )}
        </div>
      )}
      <ErrorNote error={error} />
    </section>
  );
}

function UsageSection() {
  const { me } = useSession();
  const { user, budget } = me!;
  const tier = tierConfig(user.tier);
  const used = Math.max(0, tier.aiAllowanceMicros - budget.allowanceLeftMicros);
  const pct = tier.aiAllowanceMicros ? Math.min(100, Math.round((used / tier.aiAllowanceMicros) * 100)) : 0;
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-card wide:px-7 wide:py-[26px] flex flex-col gap-3" aria-labelledby="usage-title">
      <h2 id="usage-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
        This month
      </h2>
      <dl className="stats">
        <div>
          <dt>Plan</dt>
          <dd>{tier.name}</dd>
        </div>
        <div>
          <dt>Imports left</dt>
          <dd>
            {budget.importsLeft} <span className="text-muted-foreground text-[0.875rem]">of {tier.importsPerMonth}</span>
          </dd>
        </div>
        {tier.aiFeatures && (
          <>
            <div>
              <dt>AI allowance used</dt>
              <dd>
                {formatUsd(used)} <span className="text-muted-foreground text-[0.875rem]">of {formatUsd(tier.aiAllowanceMicros)}</span>
              </dd>
            </div>
            <div>
              <dt>AI credits</dt>
              <dd>{formatUsd(budget.creditMicros)}</dd>
            </div>
          </>
        )}
      </dl>
      {tier.aiFeatures ? (
        <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="AI allowance used">
          <span style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <p className="text-[0.875rem] text-muted-foreground">AI planning and suggestions come with Plus and Pro. Recipe imports are included on every plan.</p>
      )}
    </section>
  );
}

function BillingSection() {
  const { me, publicConfig } = useSession();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState<string | null>(null);
  const cfg = publicConfig!;
  const current = me!.user.tier;
  const paid = current !== 'free';

  async function go(label: string, fn: () => Promise<{ url: string }>) {
    setBusy(label);
    setError(undefined);
    try {
      const { url } = await fn();
      window.location.assign(url);
    } catch (e) {
      setError(e);
      setBusy(null);
    }
  }

  return (
    <section id="billing" className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-card wide:px-7 wide:py-[26px] flex flex-col gap-3" aria-labelledby="billing-title">
      <h2 id="billing-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
        Plan and billing
      </h2>
      {!cfg.billingEnabled && <p className="text-[0.875rem] text-muted-foreground">Billing is not set up on this Potluck yet.</p>}
      <div className="tiers">
        {cfg.tiers.map((t) => (
          <div key={t.id} className={`tier${t.id === current ? ' tier-current' : ''}`}>
            <h3>{t.name}</h3>
            <p className="price">{t.priceCents ? `${cents(t.priceCents)}/mo` : 'Free'}</p>
            <ul>
              <li>
                {t.maxCommunities} {t.maxCommunities === 1 ? 'owned kitchen' : 'owned kitchens'}
              </li>
              <li>Up to {t.maxMembersPerCommunity} people each</li>
              <li>{t.importsPerMonth} recipe imports a month</li>
              <li>{t.aiFeatures ? `AI planning, ${formatUsd(t.aiAllowanceMicros)} AI allowance` : 'No AI planning'}</li>
            </ul>
            {t.id === current ? (
              <span className="badge">Current plan</span>
            ) : t.id !== 'free' && cfg.billingEnabled ? (
              paid ? (
                <button className={buttonVariants()} disabled={!!busy} onClick={() => go('portal', api.portal)}>
                  Switch in portal
                </button>
              ) : (
                <button className={buttonVariants({ variant: 'default' })} disabled={!!busy} onClick={() => go(t.id, () => api.checkout({ tier: t.id as Exclude<TierId, 'free'> }))}>
                  {busy === t.id ? 'Opening…' : `Upgrade to ${t.name}`}
                </button>
              )
            ) : null}
          </div>
        ))}
      </div>
      {paid && cfg.billingEnabled && (
        <>
          <h3 className="mb-1 font-sans text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">AI credits</h3>
          <p className="text-[0.875rem] text-muted-foreground">
            Imports and AI planning share your account’s allowance across all kitchens and circles you own. Credit packs extend both. Credits stay with your
            account when you transfer a kitchen.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {cfg.creditPacks.map((p) => (
              <button key={p.id} className={buttonVariants()} disabled={!!busy} onClick={() => go(p.id, () => api.checkout({ creditPackId: p.id }))}>
                {busy === p.id ? 'Opening…' : `${cents(p.priceCents)} for ${formatUsd(p.creditMicros)} of AI`}
              </button>
            ))}
          </div>
          <button className={buttonVariants({ variant: 'ghost' })} disabled={!!busy} onClick={() => go('portal', api.portal)}>
            Manage subscription and invoices
          </button>
        </>
      )}
      <ErrorNote error={error} />
    </section>
  );
}

function DangerZone() {
  const { me } = useSession();
  const [confirmText, setConfirmText] = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<unknown>();
  const owned = (me?.communities ?? []).filter((c) => c.role === 'owner');

  async function download() {
    setExporting(true);
    setError(undefined);
    try {
      const data = await api.exportMe();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `potluck-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e);
    } finally {
      setExporting(false);
    }
  }

  async function remove() {
    setError(undefined);
    try {
      await api.deleteMe();
      await logout();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <section id="data" className="min-w-0 rounded-lg border bg-card p-5 shadow-card wide:px-7 wide:py-[26px] flex flex-col gap-3 danger-zone" aria-labelledby="danger-zone-title">
      <h2 id="danger-zone-title">Your data</h2>
      <div className="flex flex-col gap-3">
        <h3 className="mb-1 font-sans text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">Download my data</h3>
        <p className="text-[0.875rem] text-muted-foreground">
          A JSON file with your profile, personal recipes and notes, kitchens and circles, shared recipes, meal plans, shopping lists and linked chats.
        </p>
        <div>
          <button type="button" className={buttonVariants()} disabled={exporting} onClick={() => void download()}>
            {exporting ? 'Preparing file' : 'Download my data'}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-3 danger-delete">
        <h3 className="mb-1 font-sans text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">Delete account</h3>
        <p className="text-[0.875rem]">Deleting your account is permanent and cannot be undone. When you delete it:</p>
        <ul className="text-[0.875rem] danger-list">
          <li>Your personal recipes, private notes and shared contributions are deleted. Independent recipe copies already saved by others remain.</li>
          <li>You leave every kitchen and circle you belong to.</li>
          {owned.length > 0 ? (
            <li>
              Kitchens and circles you own are deleted for everyone in them: <strong>{owned.map((c) => c.name).join(', ')}</strong>.
            </li>
          ) : (
            <li>Kitchens and circles you own are deleted for everyone in them. You do not own any right now.</li>
          )}
          <li>Any paid subscription is cancelled immediately, with no refund.</li>
          <li>Remaining AI credits are forfeited.</li>
          <li>Linked Telegram, WhatsApp and SMS chats are unlinked.</li>
        </ul>
        {owned.length > 0 && (
          <p className="text-[0.875rem]">
            To keep a group going, offer ownership in its settings and wait for the recipient to accept before deleting your account.{' '}
            <Link to="/community">Open settings</Link>
          </p>
        )}
        <Field label="Type DELETE to confirm">
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" spellCheck={false} aria-describedby="delete-help" />
        </Field>
        <p id="delete-help" className="text-[0.875rem] text-muted-foreground">
          The delete button unlocks when the box says DELETE.
        </p>
        <div>
          <ConfirmAction
            disabled={confirmText.trim() !== 'DELETE'}
            title="Delete your account?"
            description="Your profile, personal recipes and notes are deleted. Kitchens you own are deleted for everyone. This cannot be undone."
            confirmLabel="Delete forever"
            onConfirm={remove}
          >
            Delete my account
          </ConfirmAction>
        </div>
      </div>
      <ErrorNote error={error} />
    </section>
  );
}
