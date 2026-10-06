import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

// Cookbook buttons: fully round, 44px tall by default, paprika primary with a warm glow.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center [font-family:inherit] leading-[inherit] justify-center gap-[7px] rounded-full border text-[0.94rem] font-medium whitespace-nowrap no-underline transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-smooth outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'border-primary bg-primary font-semibold text-primary-foreground shadow-[var(--shadow-accent),inset_0_1px_0_rgb(255_255_255/0.18)] hover:-translate-y-px hover:border-primary-hover hover:bg-primary-hover active:translate-y-0',
        danger: 'border-destructive bg-destructive font-semibold text-destructive-foreground hover:bg-[color-mix(in_srgb,var(--danger)_88%,var(--text))]',
        destructive: 'border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-card text-destructive hover:bg-destructive-soft',
        outline: 'border-input bg-card text-foreground hover:bg-surface-2',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-surface-3',
        ghost: 'border-transparent bg-transparent text-foreground hover:bg-surface-2',
        ink: 'border-ink bg-ink text-ink-foreground hover:border-ink-hover hover:bg-ink-hover',
        link: 'h-auto min-h-0 border-transparent px-0 text-accent-foreground underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-11 px-[18px] py-2',
        sm: 'min-h-9 px-3.5 py-1 text-sm',
        lg: 'min-h-[52px] px-[26px] py-3 text-[1.02rem]',
        icon: 'size-9 min-h-9 p-1',
        'icon-sm': 'size-8 min-h-8 p-1',
        'icon-lg': 'size-11 min-h-11 p-1',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'outline',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" data-variant={variant} data-size={size} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
