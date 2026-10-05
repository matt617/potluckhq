import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DAY_NAMES, MEAL_SLOTS, PLAN_CONSTRAINTS, formatUsd, type MealSlot, type PlanConstraint, type SuggestPlanResponse, type TierId } from '@potluck/core';
import { api } from '../api';
import { Chip, ErrorNote, Field } from './ui';

interface Props {
  communityId: string;
  week: string;
  ownerTier: TierId | undefined;
  isOwner: boolean;
  initialConstraints: PlanConstraint[];
  hasEdits: boolean;
  attendance?: Record<string, string[]>;
  onPlan: (res: SuggestPlanResponse) => void;
}

export function AiSuggest({ communityId, week, ownerTier, isOwner, initialConstraints, hasEdits, onPlan, attendance }: Props) {
  const [constraints, setConstraints] = useState<PlanConstraint[]>(initialConstraints);
  const [notes, setNotes] = useState('');
  const [awayDays, setAwayDays] = useState<number[]>([]);
  const [slots, setSlots] = useState<MealSlot[]>(['dinner']);
  const [servings, setServings] = useState(2);
  const [allowNewIdeas, setAllowNewIdeas] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  if (ownerTier === 'free') {
    return (
      <section className="card note-upgrade stack">
        <h2 className="h3">Let AI plan your week</h2>
        <p>Choose quick meals, a budget or planned leftovers, and Potluck will suggest a week from your recipe book. AI planning comes with Plus and Pro.</p>
        {isOwner ? (
          <Link className="btn btn-primary" to="/account#billing">
            See plans
          </Link>
        ) : (
          <p className="muted small">The kitchen owner can upgrade to unlock AI planning for everyone here.</p>
        )}
      </section>
    );
  }

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function suggest() {
    if (hasEdits && !window.confirm('Replace your unsaved meal-plan draft with a new suggestion?')) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await api.suggestPlan(communityId, week, {
        constraints,
        notes: notes.trim() || undefined,
        awayDays,
        slots,
        servings,
        allowNewIdeas,
        attendance,
      });
      onPlan(res);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby="ai-title">
      <h2 id="ai-title" className="h3">
        Suggest a plan with AI
      </h2>
      <div className="chips" role="group" aria-label="This week">
        {PLAN_CONSTRAINTS.filter((c) => c.id !== 'glp1' && c.id !== 'workout').map((c) => (
          <Chip key={c.id} active={constraints.includes(c.id)} title={c.hint} onClick={() => setConstraints((l) => toggle(l, c.id))}>
            {c.label}
          </Chip>
        ))}
      </div>
      <details>
        <summary>Advanced food preferences</summary>
        <div className="chips">
          {PLAN_CONSTRAINTS.filter((c) => c.id === 'glp1' || c.id === 'workout').map((c) => (
            <Chip key={c.id} active={constraints.includes(c.id)} title={c.hint} onClick={() => setConstraints((l) => toggle(l, c.id))}>
              {c.label}
            </Chip>
          ))}
        </div>
        <p className="small muted">Applies to this draft. Shared summaries do not include personal health details.</p>
      </details>
      {constraints.includes('glp1') && <p className="small muted">GLP-1 suggestions favor smaller, protein-forward portions. They are not medical advice.</p>}
      <fieldset className="fieldset">
        <legend>Away or not cooking</legend>
        <div className="chips">
          {DAY_NAMES.map((d, i) => (
            <Chip key={d} active={awayDays.includes(i)} onClick={() => setAwayDays((l) => toggle(l, i))}>
              {d.slice(0, 3)}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset className="fieldset">
        <legend>Meals to plan</legend>
        <div className="chips">
          {MEAL_SLOTS.map((s) => (
            <Chip key={s} active={slots.includes(s)} onClick={() => setSlots((l) => (l.includes(s) && l.length === 1 ? l : toggle(l, s)))}>
              {s}
            </Chip>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <Field label="Servings per meal">
          <input type="number" min={1} max={20} value={servings} onChange={(e) => setServings(Math.max(1, Number(e.target.value) || 1))} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={allowNewIdeas} onChange={(e) => setAllowNewIdeas(e.target.checked)} />
          Suggest new dishes to fill gaps
        </label>
      </div>
      <Field label="Anything else?" hint="e.g. leg day Tue and Thu, kids home Friday, use up the spinach">
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorNote error={error} />
      <div className="row between wrap">
        <button className="btn btn-primary" disabled={busy} onClick={suggest}>
          {busy ? 'Planning…' : 'Suggest plan'}
        </button>
        {hasEdits && <span className="small muted">This replaces unsaved changes in the grid.</span>}
      </div>
    </section>
  );
}

export function AiResult({ res, onDismiss }: { res: SuggestPlanResponse; onDismiss: () => void }) {
  return (
    <section className="card stack ai-result" aria-live="polite">
      <div className="row between">
        <h2 className="h3">AI plan</h2>
        <button className="btn btn-ghost btn-small" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      {res.plan.aiSummary && <p>{res.plan.aiSummary}</p>}
      {res.warnings?.map((w) => (
        <p key={w} className="note">
          {w}
        </p>
      ))}
      {res.newIdeas.length > 0 && (
        <>
          <h3 className="h4">New ideas to find</h3>
          <ul className="ideas">
            {res.newIdeas.map((idea) => (
              <li key={idea.title}>
                <strong>{idea.title}.</strong> <span className="muted">{idea.why}</span>{' '}
                <a href={`https://www.tiktok.com/search?q=${encodeURIComponent(idea.searchQuery)}`} target="_blank" rel="noreferrer">
                  TikTok
                </a>{' '}
                ·{' '}
                <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(idea.searchQuery)}`} target="_blank" rel="noreferrer">
                  YouTube
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="small muted">This suggestion cost {formatUsd(res.costMicros)} of AI allowance. Review the grid below, then save.</p>
    </section>
  );
}
