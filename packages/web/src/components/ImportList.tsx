import { useState } from 'react';
import { ArrowSquareOut, WarningCircle } from '@phosphor-icons/react';
import { detectPlatform, type ChannelKind, type ImportJob, type ImportStatus, type Platform } from '@potluck/core';
import { api } from '../api';
import { timeAgo } from '../lib/util';
import { ErrorNote } from './ui';
import { metaBadge } from '../lib/styles';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type AlternativeMode = 'photos' | 'text';

const ACTIVE_LABEL: Partial<Record<ImportStatus, string>> = {
  queued: 'Waiting to start',
  downloading: 'Downloading video',
  extracting: 'Reading recipe',
};

const PLATFORM_NAME: Partial<Record<Platform, string>> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  pinterest: 'Pinterest',
  x: 'X',
};

const CHANNEL_NAME: Record<ChannelKind, string> = { telegram: 'Telegram', whatsapp: 'WhatsApp', sms: 'text message', web: 'web' };

export function isActiveImport(job: ImportJob): boolean {
  return job.status in ACTIVE_LABEL;
}

/** Imports worth showing above the book: running ones and failures the user has not dismissed. */
export function needsAttention(job: ImportJob): boolean {
  return isActiveImport(job) || (job.status === 'failed' && !job.dismissedAt);
}

function platformName(url: string): string | undefined {
  const p = detectPlatform(url);
  return PLATFORM_NAME[p];
}

/** A human name for what was imported, e.g. "TikTok video" or "seriouseats.com". */
function sourceLabel(job: ImportJob): string {
  if (job.kind === 'url' && job.url) {
    const name = platformName(job.url);
    if (name) return `${name} video`;
    try {
      return new URL(job.url).hostname.replace(/^www\./, '');
    } catch {
      return 'Recipe page';
    }
  }
  if (job.kind === 'image') {
    const n = job.imageKeys?.length ?? 0;
    return n === 1 ? '1 photo' : `${n || 'Some'} photos`;
  }
  if (job.kind === 'video') return 'Uploaded video';
  return 'Pasted text';
}

/** Web wording for a failure. Server messages are written for chat bots, so known codes get their own copy. */
function failureMessage(job: ImportJob): string {
  const who = (job.url && platformName(job.url)) ?? 'The site';
  switch (job.errorCode) {
    case 'blocked':
      return `${who} wouldn't let us download this video. It may be private or need a login.`;
    case 'too_long':
      return 'This video is longer than 20 minutes, which is too long to read.';
    case 'unsupported':
      return "We can't import from this link. TikTok, Instagram, YouTube, Facebook and Pinterest links work.";
    case 'download':
      return "We couldn't download this. It may be a temporary problem.";
    case 'busy':
      return 'The recipe reader was too busy to get to this one.';
    case 'internal':
      return 'Something went wrong while reading this recipe.';
    default:
      return job.error ?? 'This import failed.';
  }
}

interface Action {
  label: string;
  run: () => void | Promise<void>;
  primary?: boolean;
}

export function ImportList({
  imports,
  onChanged,
  onUseInstead,
}: {
  imports: ImportJob[];
  onChanged: () => void;
  onUseInstead: (mode: AlternativeMode) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>();
  if (!imports.length) return null;

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setError(undefined);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  function actionsFor(job: ImportJob): Action[] {
    const actions: Action[] = [];
    const rerunnable = job.kind === 'url' || job.kind === 'text';
    const code = job.errorCode;
    const retryable = rerunnable && (code === undefined || code === 'download' || code === 'busy' || code === 'internal');
    if (retryable) actions.push({ label: 'Try again', primary: true, run: () => act(job.id, () => api.retryImport(job.id)) });
    if (job.kind === 'url' && (code === 'blocked' || code === 'download')) {
      actions.push({ label: 'Upload the video', primary: !retryable, run: () => onUseInstead('photos') });
      actions.push({ label: 'Paste the caption', run: () => onUseInstead('text') });
    } else if (job.kind === 'url' && (code === 'too_long' || code === 'unsupported' || code === 'not_recipe')) {
      actions.push({ label: 'Paste the recipe', primary: true, run: () => onUseInstead('text') });
    } else if (job.kind === 'image' || job.kind === 'video') {
      actions.push({ label: 'Upload again', primary: true, run: () => onUseInstead('photos') });
    }
    actions.push({ label: 'Dismiss', run: () => act(job.id, () => api.dismissImport(job.id)) });
    return actions;
  }

  const failed = imports.filter((j) => j.status === 'failed').length;
  const title = failed === imports.length ? (failed === 1 ? "Couldn't import" : `${failed} imports failed`) : failed ? 'Imports' : 'Importing';

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px] imports-card" aria-labelledby="imports-title">
      <h2 id="imports-title" className="font-serif text-[1.25rem] font-[550] tracking-[-0.012em] [font-variation-settings:'SOFT'_50,'WONK'_0]">
        {title}
      </h2>
      <ul className="list-none mt-2 mx-0 mb-0 p-0 flex flex-col" aria-live="polite">
        {imports.map((job) => {
          const isFailed = job.status === 'failed';
          return (
            <li key={job.id} className="grid grid-cols-[22px_1fr] items-start gap-3 border-t border-border px-0 py-3 text-[0.92rem]">
              <span className={cn('grid h-[22px] place-items-center', isFailed ? 'text-destructive' : 'text-warning-foreground')} aria-hidden>
                {isFailed ? <WarningCircle size={20} weight="fill" /> : <span className="w-2 h-2 rounded-full bg-current [animation:import-pulse_1.2s_ease-in-out_infinite]" />}
              </span>
              <div className="min-w-0">
                <div className="flex min-h-[22px] flex-wrap items-center gap-x-2 gap-y-1">
                  <strong className="font-semibold">{sourceLabel(job)}</strong>
                  {job.channel !== 'web' && <span className={metaBadge}>via {CHANNEL_NAME[job.channel]}</span>}
                  {job.url && (
                    <a className="inline-grid [place-items:center] text-muted-foreground rounded-[4px] hover:text-foreground" href={job.url} target="_blank" rel="noreferrer" aria-label="Open the original">
                      <ArrowSquareOut size={15} aria-hidden />
                    </a>
                  )}
                  <span className="text-muted-foreground text-[0.82rem]">
                    {isFailed ? 'Failed' : ACTIVE_LABEL[job.status]} · {timeAgo(job.createdAt)}
                  </span>
                </div>
                {isFailed && (
                  <>
                    <p className="mt-1 mx-0 mb-0 text-foreground-2 leading-[1.45]">{failureMessage(job)}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {actionsFor(job).map((a) => (
                        <button
                          key={a.label}
                          type="button"
                          className={buttonVariants({ variant: a.primary ? 'outline' : 'ghost', size: 'sm' })}
                          disabled={busy === job.id}
                          onClick={() => void a.run()}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <ErrorNote error={error} />
    </section>
  );
}
