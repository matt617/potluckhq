import { Skeleton as SkeletonBlock } from '@/components/ui/skeleton';

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
