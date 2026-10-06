import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretUpDown, Check, Plus } from '@phosphor-icons/react';
import { useSession } from '../lib/session';
import { CreateKitchenDialog } from './CreateCommunity';
import { cn } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** Kitchen and circle picker in the top bar. Search appears once there are enough spaces to need it. */
export function CommunitySwitcher() {
  const { me, community, setCommunityId } = useSession();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const list = me?.communities ?? [];
  if (!community) return null;
  const kitchens = list.filter((c) => c.kind !== 'circle');
  const circles = list.filter((c) => c.kind === 'circle');

  function choose(id: string) {
    setOpen(false);
    if (id === community?.id) return;
    if (!window.dispatchEvent(new Event('potluck:before-navigation', { cancelable: true }))) return;
    setCommunityId(id);
    navigate(`/book?kitchen=${encodeURIComponent(id)}`);
  }

  const item = (c: (typeof list)[number]) => (
    <CommandItem key={c.id} value={`${c.name} ${c.id}`} onSelect={() => choose(c.id)}>
      <span className="min-w-0 flex-1 truncate">{c.name}</span>
      <Check weight="bold" className={cn('text-primary', c.id === community.id ? 'opacity-100' : 'opacity-0')} aria-hidden />
    </CommandItem>
  );

  return (
    <div className="max-w-60 min-w-0 flex-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label={`Kitchen or recipe circle: ${community.name}`}
            className="flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-full border border-transparent bg-surface-2 px-3.5 py-2.5 text-[0.92rem] leading-[1.6] font-medium text-foreground transition-colors hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border-strong))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="truncate">{community.name}</span>
            <CaretUpDown size={14} weight="bold" className="shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" aria-label="Choose a kitchen or recipe circle" className="w-[min(280px,calc(100vw-32px))] p-0">
          <Command>
            {list.length > 6 && <CommandInput placeholder="Find a kitchen or circle" />}
            <CommandList>
              <CommandEmpty>No match.</CommandEmpty>
              {kitchens.length > 0 && <CommandGroup heading="Kitchens">{kitchens.map(item)}</CommandGroup>}
              {circles.length > 0 && <CommandGroup heading="Recipe circles">{circles.map(item)}</CommandGroup>}
              <CommandGroup className="border-t border-border">
                <CommandItem
                  value="new kitchen"
                  onSelect={() => {
                    setOpen(false);
                    if (window.dispatchEvent(new Event('potluck:before-navigation', { cancelable: true }))) setCreating(true);
                  }}
                >
                  <Plus weight="bold" aria-hidden />
                  New kitchen
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {creating && (
        <CreateKitchenDialog
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            navigate(`/week?kitchen=${encodeURIComponent(c.id)}`);
          }}
        />
      )}
    </div>
  );
}
