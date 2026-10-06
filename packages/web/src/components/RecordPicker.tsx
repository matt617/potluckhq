import { useId, useState } from 'react';
import { Check, CaretUpDown } from '@phosphor-icons/react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from './ui/command';

export interface RecordOption {
  value: string;
  label: string;
  detail?: string;
}

/** Search changes the result list; only choosing a record changes the stored relationship. */
export function RecordPicker({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  empty = 'No matches.',
  clearLabel,
  disabled,
  id,
  'aria-describedby': describedBy,
  'aria-labelledby': labelledBy,
  'aria-invalid': invalid,
}: {
  label: string;
  value: string;
  options: RecordOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  empty?: string;
  clearLabel?: string;
  disabled?: boolean;
  id?: string;
  'aria-describedby'?: string;
  'aria-labelledby'?: string;
  'aria-invalid'?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          role="combobox"
          aria-label={label}
          aria-labelledby={labelledBy}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          disabled={disabled}
          className="w-full min-w-0 shrink justify-between text-left font-normal"
        >
          <span className="truncate">{selected?.label ?? (value ? 'Selection unavailable — choose again' : placeholder)}</span>
          <CaretUpDown className="shrink-0" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        onEscapeKeyDown={(e) => e.stopPropagation()}
        align="start"
        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] min-w-64 p-0"
      >
        <Command>
          <CommandInput aria-label={`Search ${label.toLowerCase()}`} placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList id={listId}>
            <CommandEmpty>{empty}</CommandEmpty>
            {clearLabel && (
              <CommandItem
                value={clearLabel}
                onSelect={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                {clearLabel}
              </CommandItem>
            )}
            {options.map((o) => (
              <CommandItem
                key={o.value}
                value={o.value}
                keywords={[o.label, o.detail ?? '']}
                onSelect={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block">{o.label}</span>
                  {o.detail && <span className="block text-xs text-muted-foreground">{o.detail}</span>}
                </span>
                {value === o.value && <Check aria-label="Selected" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
