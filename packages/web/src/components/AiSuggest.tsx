import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DAY_NAMES, MEAL_SLOTS, PLAN_CONSTRAINTS, formatUsd, type MealSlot, type PlanConstraint, type SuggestPlanResponse, type TierId } from '@potluck/core';
import { api } from '../api';
import { Chip, ErrorNote, Field } from './ui';
import { buttonVariants } from '@/components/ui/button';

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
      <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-accent px-[18px] py-4 shadow-paper [&_p]:mt-1 [&_strong]:font-serif [&_strong]:text-[1.08rem] [&_strong]:font-semibold">
        <h2 className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">Let AI plan your week</h2>
        <p>Choose quick meals, a budget or planned leftovers, and Potluck will suggest a week from your recipe book. AI planning comes with Plus and Pro.</p>
        {isOwner ? (
          <Link className={buttonVariants({ variant: 'default' })} to="/account#billing">
            See plans
          </Link>
        ) : (
          <p className="text-muted-foreground text-[0.875rem]">The kitchen owner can upgrade to unlock AI planning for everyone here.</p>
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
    <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px] flex flex-col gap-3" aria-labelledby="ai-title">
      <h2 id="ai-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
        Suggest a plan with AI
      </h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="This week">
        {PLAN_CONSTRAINTS.filter((c) => c.id !== 'glp1' && c.id !== 'workout').map((c) => (
          <Chip key={c.id} active={constraints.includes(c.id)} title={c.hint} onClick={() => setConstraints((l) => toggle(l, c.id))}>
            {c.label}
          </Chip>
        ))}
      </div>
      <details>
        <summary>Advanced food preferences</summary>
        <div className="flex flex-wrap gap-2">
          {PLAN_CONSTRAINTS.filter((c) => c.id === 'glp1' || c.id === 'workout').map((c) => (
            <Chip key={c.id} active={constraints.includes(c.id)} title={c.hint} onClick={() => setConstraints((l) => toggle(l, c.id))}>
              {c.label}
            </Chip>
          ))}
        </div>
        <p className="text-[0.875rem] text-muted-foreground">Applies to this draft. Shared summaries do not include personal health details.</p>
      </details>
      {constraints.includes('glp1') && <p className="text-[0.875rem] text-muted-foreground">GLP-1 suggestions favor smaller, protein-forward portions. They are not medical advice.</p>}
      <fieldset className="m-0 border-0 p-0 [&_legend]:mb-2 [&_legend]:p-0 [&_legend]:text-[0.9rem] [&_legend]:font-medium">
        <legend>Away or not cooking</legend>
        <div className="flex flex-wrap gap-2">
          {DAY_NAMES.map((d, i) => (
            <Chip key={d} active={awayDays.includes(i)} onClick={() => setAwayDays((l) => toggle(l, i))}>
              {d.slice(0, 3)}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset className="m-0 border-0 p-0 [&_legend]:mb-2 [&_legend]:p-0 [&_legend]:text-[0.9rem] [&_legend]:font-medium">
        <legend>Meals to plan</legend>
        <div className="flex flex-wrap gap-2">
          {MEAL_SLOTS.map((s) => (
            <Chip key={s} active={slots.includes(s)} onClick={() => setSlots((l) => (l.includes(s) && l.length === 1 ? l : toggle(l, s)))}>
              {s}
            </Chip>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-end gap-3">
        <Field label="Servings per meal">
          <input type="number" min={1} max={20} value={servings} onChange={(e) => setServings(Math.max(1, Number(e.target.value) || 1))} />
        </Field>
        <label className="flex min-h-[46px] cursor-pointer items-center gap-3">
          <input type="checkbox" checked={allowNewIdeas} onChange={(e) => setAllowNewIdeas(e.target.checked)} />
          Suggest new dishes to fill gaps
        </label>
      </div>
      <Field label="Anything else?" hint="e.g. leg day Tue and Thu, kids home Friday, use up the spinach">
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorNote error={error} />
      <div className="flex items-center gap-2 justify-between flex-wrap">
        <button className={buttonVariants({ variant: 'default' })} disabled={busy} onClick={suggest}>
          {busy ? 'Planning…' : 'Suggest plan'}
        </button>
        {hasEdits && <span className="text-[0.875rem] text-muted-foreground">This replaces unsaved changes in the grid.</span>}
      </div>
    </section>
  );
}

export function AiResult({ res, onDismiss }: { res: SuggestPlanResponse; onDismiss: () => void }) {
  return (
    <section className="min-w-0 rounded-lg border p-5 shadow-paper wide:px-7 wide:py-[26px] flex flex-col gap-3 border-[color-mix(in_srgb,_var(--accent)_45%,_var(--border))] [background:radial-gradient(100%_120%_at_0%_0%,_color-mix(in_srgb,_var(--accent-soft)_80%,_transparent),_transparent_60%),_var(--surface)]" aria-live="polite">
      <div className="flex items-center gap-2 justify-between">
        <h2 className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">AI plan</h2>
        <button className={buttonVariants({ variant: 'ghost', size: 'sm' })} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      {res.plan.aiSummary && <p>{res.plan.aiSummary}</p>}
      {res.warnings?.map((w) => (
        <p key={w} className="flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3">
          {w}
        </p>
      ))}
      {res.newIdeas.length > 0 && (
        <>
          <h3 className="mb-1 font-sans text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">New ideas to find</h3>
          <ul className="m-0 pl-[1.2em] flex flex-col gap-1.5">
            {res.newIdeas.map((idea) => (
              <li key={idea.title}>
                <strong>{idea.title}.</strong> <span className="text-muted-foreground">{idea.why}</span>{' '}
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
      <p className="text-[0.875rem] text-muted-foreground">This suggestion cost {formatUsd(res.costMicros)} of AI allowance. Review the grid below, then save.</p>
    </section>
  );
}
