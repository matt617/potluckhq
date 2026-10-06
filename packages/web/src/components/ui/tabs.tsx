import * as React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/** Segmented pill: an oat track with the active option lifted onto the paper surface. Shared by Tabs and Segmented. */
export const segmentedListClasses = 'inline-flex w-fit items-center gap-0.5 rounded-full bg-surface-2 p-1';
export const segmentedItemClasses =
  'inline-flex min-h-[34px] cursor-pointer items-center justify-center gap-1.5 rounded-full border-0 bg-transparent px-4 py-1.5 text-[0.88rem] font-medium whitespace-nowrap text-foreground-2 transition-[background-color,color,box-shadow] duration-200 ease-smooth hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-paper data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-paper [&_svg]:pointer-events-none [&_svg]:shrink-0';

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List data-slot="tabs-list" className={cn(segmentedListClasses, className)} {...props} />;
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger data-slot="tabs-trigger" className={cn(segmentedItemClasses, className)} {...props} />;
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
