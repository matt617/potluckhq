import { cn } from '@/lib/utils';

/** Oat-toned block with a slow shimmer, shaped by the caller. */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'block animate-shimmer rounded-md bg-[linear-gradient(90deg,var(--surface-2)_0%,var(--surface-3)_50%,var(--surface-2)_100%)] bg-[length:200%_100%] motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
