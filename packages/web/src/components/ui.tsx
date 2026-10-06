import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { X } from '@phosphor-icons/react';
import { ApiError, errorMessage } from '../api';
import { useSession } from '../lib/session';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton as SkeletonBlock } from '@/components/ui/skeleton';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { segmentedItemClasses, segmentedListClasses } from '@/components/ui/tabs';

type SkeletonVariant = 'page' | 'grid' | 'list';

/** Loading placeholder shaped like the content it stands in for. */
export function Skeleton({ variant = 'page', label = 'Loading' }: { variant?: SkeletonVariant; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">{label}</span>
      {variant === 'grid' && (
        <div className="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,248px),1fr))] gap-x-[22px] gap-y-9" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="overflow-hidden">
              <SkeletonBlock className="aspect-[4/3] rounded-lg" />
              <div className="flex flex-col gap-2 px-1 py-3.5">
                <SkeletonBlock className="h-[0.9em] rounded-[6px]" style={{ width: `${70 - (i % 3) * 12}%` }} />
                <SkeletonBlock className="h-[0.9em] w-[45%] rounded-[6px]" />
              </div>
            </div>
          ))}
        </div>
      )}
      {variant === 'list' && (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-paper" aria-hidden>
          {Array.from({ length: 7 }, (_, i) => (
            <SkeletonBlock key={i} className="h-[0.9em] rounded-[6px]" style={{ width: `${82 - (i % 4) * 11}%` }} />
          ))}
        </div>
      )}
      {variant === 'page' && (
        <div className="flex flex-col gap-6" aria-hidden>
          <SkeletonBlock className="h-[1.8em] w-[38%] rounded-[6px]" />
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-paper">
            <SkeletonBlock className="h-[0.9em] w-[72%] rounded-[6px]" />
            <SkeletonBlock className="h-[0.9em] w-[58%] rounded-[6px]" />
            <SkeletonBlock className="h-[0.9em] w-[64%] rounded-[6px]" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Full-page loading state used before the app shell exists. */
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="mx-auto flex max-w-[1160px] flex-col gap-5 px-4 py-12">
      <Skeleton label={label} />
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  if (error instanceof ApiError && error.status === 402) return <QuotaNote code={error.code} message={error.message} />;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-destructive-soft px-4 py-3 text-destructive" role="alert">
      <span>{errorMessage(error)}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
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
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-accent px-[18px] py-4"
      role="alert"
    >
      <div>
        <strong className="font-serif text-[1.08rem] font-semibold">{copy.title}</strong>
        <p className="mt-1">{message && code !== 'ai_tier' ? message : copy.body}</p>
      </div>
      {owner ? (
        <Button asChild variant="default" size="sm">
          <Link to="/account#billing">{copy.cta}</Link>
        </Button>
      ) : (
        <p className="m-0 text-sm">Ask this kitchen or circle’s owner to review the shared allowance in settings.</p>
      )}
    </div>
  );
}

/**
 * Two-step inline confirmation for actions that are easy to undo or already reviewed.
 * Destructive actions use ConfirmAction, which asks in a dialog.
 */
export function ConfirmButton({
  children,
  confirmLabel = 'Tap again to confirm',
  onConfirm,
  className = buttonVariants(),
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

/** Destructive action behind a confirmation dialog. The dialog stays open, disabled, until onConfirm settles. */
export function ConfirmAction({
  children,
  title,
  description,
  confirmLabel,
  onConfirm,
  className = buttonVariants({ variant: 'destructive' }),
  disabled,
}: {
  children: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <button type="button" className={className} disabled={disabled}>
          {children}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            disabled={busy}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
                setOpen(false);
              }
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Centered dialog for a short task. The header and footer stay in view while the body scrolls.
 * Pass onSubmit to make body and footer one form, so Enter submits and the footer button can be type="submit".
 */
export function FormDialog({
  title,
  description,
  onClose,
  onSubmit,
  footer,
  children,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  // Opened from state rather than a DialogTrigger, so remember the opener to hand focus back on close.
  const [opener] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)));
  const inner = (
    <>
      <DialogBody>{children}</DialogBody>
      {footer && <DialogFooter>{footer}</DialogFooter>}
    </>
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Without a description, tell Radix there is none rather than leaving a dangling reference. */}
      <DialogContent
        {...(description ? {} : { 'aria-describedby': undefined })}
        onCloseAutoFocus={(e) => {
          if (opener?.isConnected) {
            e.preventDefault();
            opener.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {onSubmit ? (
          <form className="flex min-h-0 flex-col" onSubmit={onSubmit}>
            {inner}
          </form>
        ) : (
          inner
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Page title block: small context line, serif title, optional actions on the right. */
export function PageHeader({ eyebrow, title, children }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex animate-rise flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-border pb-[22px] motion-reduce:animate-none">
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow && <p className="font-serif italic [font-variation-settings:'SOFT'_100] text-[1.05rem] font-[450] text-accent-foreground tracking-[-0.005em]">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/** Label, control, hint and error, wired together for assistive technology. The single child control receives the id. */
export function Field({ label, hint, error, className, children }: { label: string; hint?: string; error?: string; className?: string; children: ReactNode }) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label id={`${id}-label`} htmlFor={id} className="leading-[1.6]">
        {label}
      </Label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            id,
            'aria-labelledby': `${id}-label`,
            ...(describedBy ? { 'aria-describedby': describedBy } : {}),
            ...(error ? { 'aria-invalid': true } : {}),
          })
        : children}
      {hint && (
        <span id={`${id}-hint`} className="text-[0.8rem] text-muted-foreground">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="text-[0.8rem] text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

/** Small lowercase label for metadata (tags, "archived", "AI estimate"). Add ml-1 when it follows inline text. */
export const metaBadge = 'inline-block rounded-[6px] bg-surface-2 px-2 py-0.5 align-middle text-[0.74rem] leading-[1.5] font-medium text-foreground-2 lowercase';

/** Single-choice filter drawn as a segmented pill. Always has a selection. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <ToggleGroupPrimitive.Root type="single" value={value} onValueChange={(v) => v && onChange(v as T)} aria-label={label} className={segmentedListClasses}>
      {options.map((o) => (
        <ToggleGroupPrimitive.Item key={o.value} value={o.value} className={segmentedItemClasses}>
          {o.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

export function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <Toggle variant="outline" className="capitalize" pressed={active} onPressedChange={onClick} title={title}>
      {children}
    </Toggle>
  );
}

export function Empty({ title, icon, children }: { title: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex max-w-[680px] flex-col items-start gap-3.5 rounded-xl bg-[radial-gradient(120%_90%_at_100%_0%,color-mix(in_srgb,var(--accent-soft)_85%,transparent),transparent_60%),var(--surface-2)] px-7 py-14 md:px-12 md:py-16 [&_p]:max-w-[50ch] [&_p]:text-foreground-2">
      {icon && (
        <span className="grid size-14 -rotate-4 place-items-center rounded-[18px] bg-card text-primary shadow-paper [&_svg]:size-7" aria-hidden>
          {icon}
        </span>
      )}
      <h3 className="m-0 font-serif text-[1.6rem] font-[550] tracking-[-0.02em]">{title}</h3>
      {children}
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
    <div
      className="flex min-h-[46px] cursor-text flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-[7px] transition-[border-color,box-shadow] duration-150 ease-smooth hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border-strong))] focus-within:border-ring focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_18%,transparent)]"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((item, i) => (
        <Badge key={item} className="gap-0.5 border-0 py-[3px] pr-1 pl-2.5 text-[0.86rem] leading-[1.3]">
          {item}
          <button
            type="button"
            className="inline-grid size-5 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-inherit opacity-70 hover:bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] hover:opacity-100"
            aria-label={`Remove ${item}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange(value.filter((_, n) => n !== i));
            }}
          >
            <X size={12} weight="bold" aria-hidden />
          </button>
        </Badge>
      ))}
      <input
        ref={inputRef}
        id={id}
        {...aria}
        value={draft}
        placeholder={value.length ? undefined : placeholder}
        enterKeyHint="enter"
        className="min-h-[30px] w-auto min-w-0 flex-[1_0_8ch] border-0 bg-transparent px-1 py-0 shadow-none outline-none focus-visible:shadow-none"
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
