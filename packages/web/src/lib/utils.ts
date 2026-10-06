import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge the theme in theme.css, so cn() knows that e.g. border-border-strong
// replaces border-transparent and shadow-lift replaces shadow-paper.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ['background', 'foreground', 'foreground-2', 'card', 'card-foreground', 'popover', 'popover-foreground', 'primary', 'primary-hover', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'destructive-soft', 'destructive-foreground', 'border', 'border-strong', 'input', 'ring', 'surface', 'surface-2', 'surface-3', 'ink', 'ink-hover', 'ink-foreground', 'success', 'success-soft', 'warning-soft', 'warning-foreground', 'info-soft', 'info-foreground'],
      ease: ['smooth', 'spring'],
      breakpoint: ['wide'],
    },
    classGroups: {
      shadow: [{ shadow: ['paper', 'lift', 'float', 'glow'] }],
    },
  },
});

/** Joins class names and lets later Tailwind utilities override earlier conflicting ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
