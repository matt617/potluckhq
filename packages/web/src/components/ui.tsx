import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { X } from '@phosphor-icons/react';
import { ApiError, errorMessage } from '../api';
import { useSession } from '../lib/session';

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
    body: 'This kitchen’s owner is on the Free plan. The owner can upgrade to unlock AI planning for everyone here.',
    cta: 'See plans',
  },
  ai_allowance: {
    title: 'AI allowance used up',
    body: 'The owner’s shared account allowance is spent. The owner can add credits for imports and AI planning.',
    cta: 'Buy AI credits',
  },
  import_quota: {
    title: 'Monthly import limit reached',
    body: 'You have used all recipe imports for this month. Upgrade for more, or wait until next month.',
    cta: 'See plans',
  },
  tier_limit: {
    title: 'Plan limit reached',
    body: 'The owner’s plan has reached a kitchen or member limit. Existing saved data stays available.',
    cta: 'See plans',
  },
};

export function QuotaNote({ code, message }: { code?: string; message?: string }) {
  const { community, me } = useSession();
  const owner = !community || community.ownerId === me?.user.id;
  const copy = (code && QUOTA_COPY[code]) || { title: 'Plan limit reached', body: message ?? '', cta: 'See plans' };
  return (
    <div className="note note-upgrade" role="alert">
      <div>
        <strong>{copy.title}</strong>
        <p>{message && code !== 'ai_tier' ? message : copy.body}</p>
      </div>
      {owner ? (
        <Link className="btn btn-primary btn-small" to="/account#billing">
          {copy.cta}
        </Link>
      ) : (
        <p className="small">Ask this kitchen or circle’s owner to review the shared allowance in settings.</p>
      )}
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
    <dialog
      ref={ref}
      className="sheet"
      onClose={(event) => {
        if (!event.currentTarget.open) onClose();
      }}
      onCancel={onClose}
      aria-label={title}
    >
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
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" id={`${id}-label`} htmlFor={id}>
        {label}
      </label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            id,
            'aria-labelledby': `${id}-label`,
            ...(hint ? { 'aria-describedby': `${id}-hint` } : {}),
          })
        : children}
      {hint && (
        <span id={`${id}-hint`} className="field-hint">
          {hint}
        </span>
      )}
    </div>
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

/**
 * Chip-style list input: Enter, comma or Tab adds an item, Backspace on an empty
 * field removes the last one, and pasted comma/newline lists are split.
 */
export function TagInput({
  value,
  onChange,
  placeholder,
  lowercase,
  id,
  ...aria
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  lowercase?: boolean;
  id?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  function add(text: string) {
    const seen = new Set(value.map((v) => v.toLowerCase()));
    const fresh: string[] = [];
    for (const raw of text.split(/[\n,]/)) {
      const item = lowercase ? raw.trim().toLowerCase() : raw.trim();
      if (item && !seen.has(item.toLowerCase())) {
        seen.add(item.toLowerCase());
        fresh.push(item);
      }
    }
    if (fresh.length) onChange([...value, ...fresh]);
    setDraft('');
  }
  return (
    <div className="tag-input" onClick={() => inputRef.current?.focus()}>
      {value.map((item, i) => (
        <span key={item} className="tag">
          {item}
          <button
            type="button"
            className="tag-remove"
            aria-label={`Remove ${item}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange(value.filter((_, n) => n !== i));
            }}
          >
            <X size={12} weight="bold" aria-hidden />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        {...aria}
        value={draft}
        placeholder={value.length ? undefined : placeholder}
        enterKeyHint="enter"
        onChange={(e) => {
          const text = e.target.value;
          if (/[\n,]/.test(text)) add(text);
          else setDraft(text);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || (e.key === 'Tab' && draft.trim())) {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
      />
    </div>
  );
}
