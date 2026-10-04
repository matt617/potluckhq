import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { formatUsd, tierConfig, type LinkCodeResponse, type TierId } from '@potluck/core';
import { api } from '../api';
import { ConfirmButton, ErrorNote, Field, Flash, Spinner, useFlash } from '../components/ui';
import { logout } from '../lib/auth';
import { useSession } from '../lib/session';
import { cents, formatDate, splitList } from '../lib/util';

export function Account() {
  const { me, setMe, publicConfig, refreshMe } = useSession();
  const location = useLocation();
  const [flash, setFlash] = useFlash();

  useEffect(() => {
    const id = location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, me]);

  // Returning from Stripe Checkout: refresh tier and credits.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('checkout') === 'success') {
      setFlash('Payment received. Your plan is updated.');
      void refreshMe();
    }
  }, [location.search, refreshMe, setFlash]);

  if (!me) return <Spinner />;
  return (
    <div className="stack-lg">
      <div className="row between wrap">
        <h1>Account</h1>
        <button className="btn btn-ghost" onClick={() => void logout()}>
          Sign out
        </button>
      </div>
      <ProfileSection onSaved={(m) => (setMe(m), setFlash('Saved'))} />
      <ChatsSection />
      <UsageSection />
      {publicConfig && <BillingSection />}
      <Flash message={flash} />
    </div>
  );
}

function ProfileSection({ onSaved }: { onSaved: (m: NonNullable<ReturnType<typeof useSession>['me']>) => void }) {
  const { me } = useSession();
  const u = me!.user;
  const [displayName, setDisplayName] = useState(u.displayName);
  const [units, setUnits] = useState(u.units);
  const [defaultCommunityId, setDefaultCommunityId] = useState(u.defaultCommunityId ?? '');
  const [allergies, setAllergies] = useState(u.diet.allergies.join(', '));
  const [diets, setDiets] = useState(u.diet.diets.join(', '));
  const [dislikes, setDislikes] = useState(u.diet.dislikes.join(', '));
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
          allergies: splitList(allergies),
          diets: splitList(diets),
          dislikes: splitList(dislikes),
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
    <section className="card stack" aria-labelledby="profile-title">
      <h2 id="profile-title" className="h3">
        Profile
      </h2>
      <p className="muted small">{u.email}</p>
      <div className="form-grid">
        <Field label="Display name">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
        </Field>
        <Field label="Units">
          <select value={units} onChange={(e) => setUnits(e.target.value as 'us' | 'metric')}>
            <option value="us">US (cups, oz, lb)</option>
            <option value="metric">Metric (ml, g, kg)</option>
          </select>
        </Field>
        <Field label="Default community for chat imports">
          <select value={defaultCommunityId} onChange={(e) => setDefaultCommunityId(e.target.value)}>
            <option value="">First community</option>
            {me!.communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <h3 className="h4">Food profile</h3>
      <p className="muted small">The AI planner uses this to fit suggestions to you.</p>
      <div className="form-grid">
        <Field label="Allergies" hint="Comma separated">
          <input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="peanuts, shellfish" />
        </Field>
        <Field label="Diets" hint="Comma separated">
          <input value={diets} onChange={(e) => setDiets(e.target.value)} placeholder="vegetarian, low-carb" />
        </Field>
        <Field label="Dislikes" hint="Comma separated">
          <input value={dislikes} onChange={(e) => setDislikes(e.target.value)} placeholder="cilantro, olives" />
        </Field>
        <Field label="Daily protein target (g)">
          <input type="number" min={0} value={protein} onChange={(e) => setProtein(e.target.value)} />
        </Field>
      </div>
      <Field label="Goals" hint="e.g. build muscle, lift Mon/Wed/Fri, run long on Sunday">
        <textarea rows={2} value={goals} onChange={(e) => setGoals(e.target.value)} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={glp1} onChange={(e) => setGlp1(e.target.checked)} />
        I take a GLP-1 medication. Favor smaller, protein-forward, fiber-rich portions.
      </label>
      {glp1 && (
        <p className="small muted">
          Potluck's suggestions are general food ideas, not medical advice. Follow your clinician's guidance on diet and dosing.
        </p>
      )}
      <ErrorNote error={error} />
      <div>
        <button className="btn btn-primary" disabled={busy} onClick={save}>
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
    <section id="chats" className="card stack" aria-labelledby="chats-title">
      <h2 id="chats-title" className="h3">
        Linked chats
      </h2>
      <p className="muted small">Link a chat app once, then forward any recipe video to the bot. It lands in your default community.</p>
      {me!.channels.length > 0 ? (
        <ul className="members">
          {me!.channels.map((c) => (
            <li key={`${c.kind}:${c.address}`}>
              <span>
                <span className="badge">{c.kind}</span> {c.address}
              </span>
              <span className="muted small">since {formatDate(c.linkedAt)}</span>
              <ConfirmButton
                className="btn btn-ghost btn-small"
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
        <p className="small">No chats linked yet.</p>
      )}
      {!tg && !wa && !sms && <p className="small muted">No chat channels are configured on this Potluck yet.</p>}
      {(tg || wa || sms) && (
        <div className="stack">
          <button className="btn" disabled={busy} onClick={getCode}>
            {code ? 'Get a new code' : 'Link a chat'}
          </button>
          {code && (
            <div className="link-code stack">
              <p>
                Your code is <code className="code-big">{code.code}</code>, valid until {new Date(code.expiresAt).toLocaleTimeString()}.
              </p>
              <p className="small">{code.instructions}</p>
              <div className="row wrap">
                {tg && (
                  <a className="btn btn-primary" href={`https://t.me/${tg}?start=${encodeURIComponent(code.code)}`} target="_blank" rel="noreferrer">
                    Open Telegram
                  </a>
                )}
                {wa && (
                  <a className="btn btn-primary" href={`https://wa.me/${wa}?text=${encodeURIComponent(`link ${code.code}`)}`} target="_blank" rel="noreferrer">
                    Open WhatsApp
                  </a>
                )}
                {sms && (
                  <a className="btn" href={`sms:${sms}?&body=${encodeURIComponent(`link ${code.code}`)}`}>
                    Send SMS
                  </a>
                )}
              </div>
              <button className="btn btn-ghost btn-small" onClick={() => void refreshMe()}>
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
    <section className="card stack" aria-labelledby="usage-title">
      <h2 id="usage-title" className="h3">
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
            {budget.importsLeft} <span className="muted small">of {tier.importsPerMonth}</span>
          </dd>
        </div>
        {tier.aiFeatures && (
          <>
            <div>
              <dt>AI allowance used</dt>
              <dd>
                {formatUsd(used)} <span className="muted small">of {formatUsd(tier.aiAllowanceMicros)}</span>
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
        <p className="small muted">AI planning and suggestions come with Plus and Pro. Recipe imports are included on every plan.</p>
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
    <section id="billing" className="card stack" aria-labelledby="billing-title">
      <h2 id="billing-title" className="h3">
        Plan and billing
      </h2>
      {!cfg.billingEnabled && <p className="small muted">Billing is not set up on this Potluck yet.</p>}
      <div className="tiers">
        {cfg.tiers.map((t) => (
          <div key={t.id} className={`tier${t.id === current ? ' tier-current' : ''}`}>
            <h3>{t.name}</h3>
            <p className="price">{t.priceCents ? `${cents(t.priceCents)}/mo` : 'Free'}</p>
            <ul>
              <li>
                {t.maxCommunities} {t.maxCommunities === 1 ? 'community' : 'communities'}
              </li>
              <li>Up to {t.maxMembersPerCommunity} people each</li>
              <li>{t.importsPerMonth} recipe imports a month</li>
              <li>{t.aiFeatures ? `AI planning, ${formatUsd(t.aiAllowanceMicros)} AI allowance` : 'No AI planning'}</li>
            </ul>
            {t.id === current ? (
              <span className="badge">Current plan</span>
            ) : t.id !== 'free' && cfg.billingEnabled ? (
              paid ? (
                <button className="btn" disabled={!!busy} onClick={() => go('portal', api.portal)}>
                  Switch in portal
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={!!busy}
                  onClick={() => go(t.id, () => api.checkout({ tier: t.id as Exclude<TierId, 'free'> }))}
                >
                  {busy === t.id ? 'Opening…' : `Upgrade to ${t.name}`}
                </button>
              )
            ) : null}
          </div>
        ))}
      </div>
      {paid && cfg.billingEnabled && (
        <>
          <h3 className="h4">AI credits</h3>
          <p className="small muted">When your monthly AI allowance runs out, credit packs keep AI planning going. Credits never expire.</p>
          <div className="row wrap">
            {cfg.creditPacks.map((p) => (
              <button key={p.id} className="btn" disabled={!!busy} onClick={() => go(p.id, () => api.checkout({ creditPackId: p.id }))}>
                {busy === p.id ? 'Opening…' : `${cents(p.priceCents)} for ${formatUsd(p.creditMicros)} of AI`}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => go('portal', api.portal)}>
            Manage subscription and invoices
          </button>
        </>
      )}
      <ErrorNote error={error} />
    </section>
  );
}
