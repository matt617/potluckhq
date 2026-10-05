import * as React from 'react';
import { cn } from '@/lib/utils';

/** Shared field chrome for inputs, textareas and select triggers: 46px, 12px radius, paprika focus halo. */
export const fieldClasses =
  'w-full min-w-0 rounded-md border border-input bg-card px-3.5 py-2.5 text-base text-foreground transition-[border-color,box-shadow,background-color] duration-150 ease-smooth outline-none placeholder:text-muted-foreground hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border-strong))] focus-visible:border-ring focus-visible:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:shadow-[0_0_0_4px_color-mix(in_srgb,var(--danger)_18%,transparent)]';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(fieldClasses, 'min-h-[46px]', className)} {...props} />;
}

export { Input };
