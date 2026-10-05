'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Toggle as TogglePrimitive } from 'radix-ui';

const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-[5px] rounded-full text-[0.86rem] font-medium whitespace-nowrap text-foreground-2 transition-[background-color,border-color,color,transform] duration-200 ease-smooth outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:border-ink data-[state=on]:bg-ink data-[state=on]:text-ink-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-transparent hover:bg-surface-2',
        outline: 'border border-input bg-transparent hover:border-foreground-2',
      },
      size: {
        default: 'min-h-9 min-w-9 px-3.5 py-1.5',
        sm: 'min-h-8 min-w-8 px-3 py-1',
        lg: 'min-h-10 min-w-10 px-4 py-2',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Toggle({ className, variant, size, ...props }: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return <TogglePrimitive.Root data-slot="toggle" className={cn(toggleVariants({ variant, size, className }))} {...props} />;
}

export { Toggle, toggleVariants };
