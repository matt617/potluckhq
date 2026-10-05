import * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldClasses } from './input';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(fieldClasses, 'min-h-20 resize-y leading-normal', className)} {...props} />;
}

export { Textarea };
