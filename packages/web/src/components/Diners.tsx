import { useId, useState } from 'react';
import type { Diner } from '@potluck/core';
import { api } from '../api';
import { useAsync } from '../lib/hooks';
import { useSession, canAdmin, useCommunity } from '../lib/session';
import { newId } from '../lib/util';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmAction, ErrorNote, Field, FormDialog, TagInput } from './ui';

const DIET_FIELDS = [
  ['allergies', 'Allergies', 'peanuts, shellfish'],
  ['diets', 'Diets', 'vegetarian, low-carb'],
  ['dislikes', 'Dislikes', 'cilantro, olives'],
] as const;

export function Diners() {
  const c = useCommunity(),
    { me } = useSession();
  const state = useAsync(() => api.diners(c.id), [c.id]);
  const [editing, setEditing] = useState<Diner | null>(null),
    [isNew, setIsNew] = useState(false),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const usualId = useId();
  if (c.kind === 'circle') return null;
  const own = state.data?.diners.find((d) => d.userId === me?.user.id);
  function add(self: boolean) {
    setIsNew(true);
    setEditing({
      id: newId(),
      name: self ? me!.user.displayName : '',
      userId: self ? me!.user.id : undefined,
      portions: 1,
      usual: true,
      diet: { allergies: [], diets: [], dislikes: [] },
    });
  }
  return (
    <section className="flex flex-col gap-3 min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px]">
      <h2>Who eats here?</h2>
      <p className="text-muted-foreground">
        Diners are separate from members. Children and guests don’t need an account. Only the food requirements you enter here are shared with this kitchen and
        used for its meal suggestions.
      </p>
      <ErrorNote error={error ?? state.error} />
      <ul className="list-none m-0 p-0 [&_li]:flex [&_li]:items-center [&_li]:gap-2.5 [&_li]:flex-wrap [&_li]:py-2.5 [&_li]:px-0 [&_li]:[border-bottom:1px_dashed_var(--border)] [&_li:last-child]:[border-bottom:0] [&_li>span:first-child]:flex-1 [&_li>span:first-child]:min-w-[140px] [&_li>span:first-child]:font-medium [&_select]:w-[auto] [&_select]:min-h-[38px]">
        {state.data?.diners.map((d) => (
          <li key={d.id}>
            <span>
              {d.name} · {d.portions} portions{d.usual ? ' · Usually eating' : ''}
            </span>
            {(d.userId === me?.user.id || (!d.userId && canAdmin(c.role))) && (
              <div className="flex items-center gap-2">
                <button
                  className={buttonVariants({ size: 'sm' })}
                  onClick={() => {
                    setIsNew(false);
                    setEditing(d);
                  }}
                >
                  Edit
                </button>
                <ConfirmAction
                  className={buttonVariants({ size: 'sm' })}
                  title={`Remove ${d.name}?`}
                  description="Their portions and food requirements stop being used for this kitchen’s plans and suggestions."
                  confirmLabel="Remove profile"
                  onConfirm={async () => {
                    try {
                      await api.removeDiner(c.id, d.id);
                      await state.reload();
                    } catch (e) {
                      setError(e);
                    }
                  }}
                >
                  Remove profile
                </ConfirmAction>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 flex-wrap">
        {!own && (
          <button className={buttonVariants()} onClick={() => add(true)}>
            Add me as a diner
          </button>
        )}
        {canAdmin(c.role) && (
          <button className={buttonVariants()} onClick={() => add(false)}>
            Add a child or guest
          </button>
        )}
      </div>
      {editing && (
        <FormDialog
          title={isNew ? (editing.userId ? 'Add me as a diner' : 'Add a child or guest') : `Edit ${editing.name || 'diner'}`}
          description="Saved food requirements are shared with this kitchen. Personal goals and medication details are never copied."
          onClose={() => setEditing(null)}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(undefined);
            try {
              await api.saveDiner(c.id, editing);
              await state.reload();
              setEditing(null);
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
          footer={
            <>
              {editing.userId && (
                <Button
                  type="button"
                  className="sm:mr-auto"
                  onClick={() =>
                    setEditing({ ...editing, diet: { allergies: me!.user.diet.allergies, diets: me!.user.diet.diets, dislikes: me!.user.diet.dislikes } })
                  }
                >
                  Copy my saved requirements
                </Button>
              )}
              <Button type="submit" variant="default" disabled={busy}>
                {busy ? 'Saving…' : 'Save kitchen profile'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field label="Name">
              <Input required maxLength={60} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Usual portions">
              <Input
                type="number"
                min={0.25}
                max={20}
                step={0.25}
                value={editing.portions}
                onChange={(e) => setEditing({ ...editing, portions: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Checkbox id={usualId} checked={editing.usual} onCheckedChange={(v) => setEditing({ ...editing, usual: v === true })} />
            <Label htmlFor={usualId}>Usually eating with this kitchen</Label>
          </div>
          <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
            <legend className="mb-3 p-0 font-serif text-lg font-semibold">Food requirements</legend>
            {DIET_FIELDS.map(([k, label, placeholder]) => (
              <Field key={k} label={label}>
                <TagInput value={editing.diet[k]} onChange={(next) => setEditing({ ...editing, diet: { ...editing.diet, [k]: next } })} placeholder={placeholder} />
              </Field>
            ))}
          </fieldset>
          <ErrorNote error={error} />
        </FormDialog>
      )}
    </section>
  );
}
