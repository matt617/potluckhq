import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { X } from '@phosphor-icons/react';
import { ApiError, errorMessage } from '../api';

type SkeletonVariant = 'page' | 'grid' | 'list';

/** Loading placeholder shaped like the content it stands in for. */
export function Skeleton({ variant = 'page', label = 'Loading' }: { variant?: SkeletonVariant; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="stack">
      <span className="sr-only">{label}</span>
      {variant === 'grid' && (
        <div className="grid" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton-card">
              <span className="skeleton skeleton-thumb" />
              <div className="skeleton-body">
                <span className="skeleton skeleton-line" style={{ width: `${70 - (i % 3) * 12}%` }} />
                <span className="skeleton skeleton-line" style={{ width: '45%' }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {variant === 'list' && (
        <div className="card stack" aria-hidden>
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="skeleton skeleton-line" style={{ width: `${82 - (i % 4) * 11}%` }} />
          ))}
        </div>
      )}
      {variant === 'page' && (
        <div className="stack-lg" aria-hidden>
          <span className="skeleton skeleton-line" style={{ width: '38%', height: '1.8em' }} />
          <div className="card stack">
            <span className="skeleton skeleton-line" style={{ width: '72%' }} />
            <span className="skeleton skeleton-line" style={{ width: '58%' }} />
            <span className="skeleton skeleton-line" style={{ width: '64%' }} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Full-page loading state used before the app shell exists. */
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="skeleton-page">
      <Skeleton label={label} />
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  if (error instanceof ApiError && error.status === 402) return <QuotaNote code={error.code} message={error.message} />;
  return (
    <div className="note note-error" role="alert">
      <span>{errorMessage(error)}</span>
      {onRetry && (
        <button type="button" className="btn btn-small" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

const QUOTA_COPY: Record<string, { title: string; body: string; cta: string }> = {
  ai_tier: {
    title: 'AI planning is a paid feature',
    body: "This community's owner is on the Free plan. Upgrading to Plus or Pro unlocks AI meal plans and suggestions.",
    cta: 'See plans',
  },
  ai_allowance: {
    title: 'AI allowance used up',
    body: 'The monthly AI allowance for this community is spent. The owner can buy an AI credit pack to keep going.',
    cta: 'Buy AI credits',
  },
  import_quota: {
    title: 'Monthly import limit reached',
    body: 'You have used all recipe imports for this month. Upgrade for more, or wait until next month.',
    cta: 'See plans',
  },
  tier_limit: {
    title: 'Plan limit reached',
    body: 'Your plan does not allow more communities or members. Upgrade to raise the limit.',
    cta: 'See plans',
  },
};

export function QuotaNote({ code, message }: { code?: string; message?: string }) {
  const copy = (code && QUOTA_COPY[code]) || { title: 'Plan limit reached', body: message ?? '', cta: 'See plans' };
  return (
    <div className="note note-upgrade" role="alert">
      <div>
        <strong>{copy.title}</strong>
        <p>{message && code !== 'ai_tier' ? message : copy.body}</p>
      </div>
      <Link className="btn btn-primary btn-small" to="/account#billing">
        {copy.cta}
      </Link>
    </div>
  );
}

/** Two-step inline confirmation instead of a blocking browser dialog. */
export function ConfirmButton({
  children,
  confirmLabel = 'Tap again to confirm',
  onConfirm,
  className = 'btn btn-danger',
  disabled,
}: {
  children: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={className}
      disabled={disabled || busy}
      onClick={async () => {
        if (!armed) return setArmed(true);
        setBusy(true);
        try {
          await onConfirm();
        } finally {
          setBusy(false);
          setArmed(false);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onCancel={onClose} aria-label={title}>
      <div className="sheet-head">
        <h2>{title}</h2>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
          <X size={18} weight="bold" aria-hidden />
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}

/** Page title block: small context line, serif title, optional actions on the right. */
export function PageHeader({ eyebrow, title, children }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {children && <div className="page-head-actions">{children}</div>}
    </header>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" className={`chip${active ? ' chip-on' : ''}`} aria-pressed={active} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

export function Empty({ title, icon, children }: { title: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon && (
        <span className="empty-icon" aria-hidden>
          {icon}
        </span>
      )}
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function useFlash(): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 2500);
    return () => window.clearTimeout(t);
  }, [msg]);
  return [msg, setMsg];
}

export function Flash({ message }: { message: string | null }) {
  return (
    <div className="flash" role="status" aria-live="polite">
      {message && <span>{message}</span>}
    </div>
  );
}
