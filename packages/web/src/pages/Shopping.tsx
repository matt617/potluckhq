import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { addDays, AISLES, shoppingListText, shoppingChanges, weekStartOf, type Aisle, type ShoppingItem, type ShoppingList } from '@potluck/core';
import { api } from '../api';
import { Basket, CaretLeft, CaretRight, X } from '@phosphor-icons/react';
import { Empty, ErrorNote, PageHeader, Skeleton } from '../components/ui';
import { useAsync, useInterval } from '../lib/hooks';
import { useCommunity, useSession } from '../lib/session';
import { copyText, formatDate } from '../lib/util';
import { kitchenPath, useWeek } from '../lib/kitchen-context';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const aisleLabel = (a: Aisle) => AISLES.find((x) => x.id === a)?.label ?? 'Other';


/** Borderless arrows in the week switcher; they lift onto the surface on hover. */
const WEEK_NAV_BUTTON = 'min-w-9 border-0 bg-transparent px-2.5 py-0 hover:bg-card hover:shadow-paper';
export function Shopping() {
  const community = useCommunity();
  const { me } = useSession();
  const [week, setWeek] = useWeek();
  const state = useAsync(() => api.list(community.id, week), [community.id, week]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>();
  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [preview, setPreview] = useState<ShoppingList | null>(null);
  const pending = useRef(0);

  const list: ShoppingList | undefined = state.data?.list;
  const items = list?.items ?? [];

  useInterval(
    async () => {
      if (pending.current > 0) return;
      const next = await api.list(community.id, week).catch(() => null);
      if (next && pending.current === 0) state.setData(next);
    },
    15000,
    !!list,
  );

  const { byAisle, staples, done } = useMemo(() => {
    const open = items.filter((i) => !i.checked && !i.staple);
    const grouped = AISLES.map((a) => ({ aisle: a, items: open.filter((i) => i.aisle === a.id) })).filter((g) => g.items.length);
    return { byAisle: grouped, staples: items.filter((i) => i.staple && !i.checked), done: items.filter((i) => i.checked) };
  }, [items]);

  async function act(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(item: ShoppingItem) {
    const checked = !item.checked;
    pending.current++;
    state.setData((prev) => (prev ? { list: { ...prev.list, items: prev.list.items.map((i) => (i.key === item.key ? { ...i, checked } : i)) } } : prev!));
    try {
      const res = await api.patchListItem(community.id, week, item.key, { checked });
      if (pending.current === 1) state.setData(res);
    } catch (e) {
      setError(e);
      state.setData((prev) =>
        prev ? { list: { ...prev.list, items: prev.list.items.map((i) => (i.key === item.key ? { ...i, checked: !checked } : i)) } } : prev!,
      );
    } finally {
      pending.current--;
    }
  }

  async function removeItem(item: ShoppingItem) {
    await act('remove', async () => state.setData(await api.patchListItem(community.id, week, item.key, { remove: true })));
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await act('add', async () => {
      state.setData(await api.addListItem(community.id, week, { name: newName.trim(), amount: newAmount.trim() || undefined }));
      setNewName('');
      setNewAmount('');
    });
  }

  const hasChannel = (me?.channels.length ?? 0) > 0;

  const row = (i: ShoppingItem) => (
    <li
      key={i.key}
      className={cn(
        'flex items-center justify-between gap-2 [border-bottom:1px_dashed_var(--border)] [transition:color_300ms_var(--ease),_opacity_300ms_var(--ease)] last:[border-bottom:0]',
        i.checked && 'opacity-[0.65]',
      )}
    >
      <label className="flex min-h-[46px] flex-1 cursor-pointer flex-wrap items-center gap-x-3 gap-y-0">
        <input type="checkbox" checked={i.checked} onChange={() => void toggle(i)} />
        <span
          className={cn(
            'font-medium [transition:color_300ms_var(--ease),_opacity_300ms_var(--ease)]',
            i.checked && 'text-muted-foreground line-through decoration-primary decoration-2',
          )}
        >
          {i.name}
        </span>
        {i.display && <span className="ml-[auto] font-mono text-[0.82rem] text-muted-foreground">{i.display}</span>}
      </label>
      {i.manual && (
        <button type="button" className={cn(buttonVariants({ variant: 'ghost' }), 'min-w-9 p-1')} aria-label={`Remove ${i.name}`} onClick={() => void removeItem(i)}>
          <X size={16} weight="bold" aria-hidden />
        </button>
      )}
    </li>
  );

  if (community.kind === 'circle')
    return (
      <div className="flex flex-col gap-3">
        <h1>Shop with your kitchen</h1>
        <p>Recipe circles exchange ideas. Choose a kitchen for meal plans and groceries.</p>
        <Link to="/circles">Your circles</Link>
      </div>
    );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={items.length ? `${items.length - done.length} to get · ${done.length} in the cart` : `Week of ${formatDate(week)}`}
        title="Shopping list"
      >
        <div className="flex items-center flex-nowrap gap-1 p-1 rounded-full bg-surface-2">
          <button className={cn(buttonVariants({ size: 'sm' }), WEEK_NAV_BUTTON)} aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}>
            <CaretLeft size={16} weight="bold" aria-hidden />
          </button>
          <span className="font-semibold text-[0.9rem] min-w-[9em] text-center tabular-nums">Week of {formatDate(week)}</span>
          <button className={cn(buttonVariants({ size: 'sm' }), WEEK_NAV_BUTTON)} aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}>
            <CaretRight size={16} weight="bold" aria-hidden />
          </button>
        </div>
      </PageHeader>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          className={buttonVariants({ variant: 'default' })}
          disabled={!!busy}
          onClick={() => act('preview', async () => setPreview((await api.previewList(community.id, week)).list))}
        >
          {busy === 'preview' ? 'Reviewing…' : items.length ? 'Review plan changes' : 'Build from plan'}
        </button>
        <button
          className={buttonVariants()}
          disabled={!items.length}
          onClick={async () => toast((await copyText(shoppingListText(items, aisleLabel))) ? 'Copied' : 'Copy failed')}
        >
          Copy as text
        </button>
        {hasChannel ? (
          <button
            className={buttonVariants()}
            disabled={!!busy || !items.length}
            onClick={() =>
              act('send', async () => {
                const res = await api.sendList(community.id, week);
                toast(res.sentTo ? `Sent to ${res.sentTo}` : 'Sent');
              })
            }
          >
            {busy === 'send' ? 'Sending…' : 'Send to my chat'}
          </button>
        ) : (
          <Link className={buttonVariants({ variant: 'ghost' })} to="/account#chats">
            Link a chat to send lists
          </Link>
        )}
      </div>
      <ErrorNote error={error} />
      {state.data?.stale && <p className="flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3">Your plan or a recipe changed. Review the shopping update before your next trip.</p>}
      {preview && preview.weekStart === week && preview.communityId === community.id && (
        <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px] flex flex-col gap-3">
          <h2>Review shopping update</h2>
          <p className="text-[0.875rem] text-muted-foreground">
            Manual items stay on your list. Changed quantities are marked as needing a new check, including items you already purchased.
          </p>
          <ul>
            {shoppingChanges(items, preview.items).map((c, i) => (
              <li key={i}>
                <strong>{c.name}</strong>: {c.before} → {c.after}
              </li>
            ))}
          </ul>
          {!shoppingChanges(items, preview.items).length && <p>No ingredient quantities changed.</p>}
          <div className="flex items-center gap-2">
            <button
              className={buttonVariants({ variant: 'default' })}
              disabled={!!busy}
              onClick={() =>
                void act('gen', async () => {
                  state.setData(await api.generateList(community.id, week, preview.planFingerprint!));
                  setPreview(null);
                  toast('Shopping list updated');
                })
              }
            >
              Apply update
            </button>
            <button className={buttonVariants()} onClick={() => setPreview(null)}>
              Keep current list
            </button>
          </div>
        </section>
      )}

      {state.loading && !list && <Skeleton variant="list" label="Loading shopping list" />}
      <ErrorNote error={state.error} onRetry={() => void state.reload()} />

      {list && (
        <>
          <form className="min-w-0 border border-border bg-card shadow-paper flex items-center flex-wrap p-2 rounded-full gap-1.5 [&_input]:border-transparent [&_input]:bg-transparent [&_input]:rounded-full [&_input:hover]:border-transparent [&_input:hover]:bg-surface-2 [&_input:first-child]:flex-[2_1_160px] max-[520px]:rounded-lg" onSubmit={addItem}>
            <input aria-label="Item" placeholder="Add an item" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input aria-label="Amount" placeholder="Amount" className="flex-[1_1_90px]" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
            <button className={buttonVariants()} disabled={!newName.trim() || busy === 'add'}>
              Add
            </button>
          </form>

          {!items.length && (
            <Empty title="Nothing on the list yet" icon={<Basket size={22} weight="duotone" />}>
              <p className="text-muted-foreground">Plan some meals for this week, then build the list. Ingredients are merged across recipes and grouped by aisle.</p>
              <Link to={kitchenPath('/plan', community.id, week)} className={buttonVariants()}>
                Go to plan
              </Link>
            </Empty>
          )}

          {byAisle.map((g) => (
            <section key={g.aisle.id} className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px]" aria-labelledby={`aisle-${g.aisle.id}`}>
              <h2 id={`aisle-${g.aisle.id}`} className="flex items-center gap-2.5 text-[1.25rem] mb-1">
                {g.aisle.label} <span className="font-sans text-[0.75rem] font-semibold min-w-[22px] h-[22px] py-0 px-[7px] inline-grid [place-items:center] rounded-full bg-surface-2 text-muted-foreground tabular-nums">{g.items.length}</span>
              </h2>
              <ul className="mx-0 mt-1.5 mb-0 list-none p-0">{g.items.map(row)}</ul>
            </section>
          ))}

          {staples.length > 0 && (
            <details className="card min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px]">
              <summary>Pantry staples you probably have ({staples.length})</summary>
              <ul className="mx-0 mt-1.5 mb-0 list-none p-0">{staples.map(row)}</ul>
            </details>
          )}

          {done.length > 0 && (
            <details className="card min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px]">
              <summary>In the cart ({done.length})</summary>
              <ul className="mx-0 mt-1.5 mb-0 list-none p-0">{done.map(row)}</ul>
            </details>
          )}
          {list.generatedAt && <p className="text-[0.875rem] text-muted-foreground">Built from the plan {new Date(list.generatedAt).toLocaleString()}.</p>}
        </>
      )}
    </div>
  );
}
