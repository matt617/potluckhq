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

const aisleLabel = (a: Aisle) => AISLES.find((x) => x.id === a)?.label ?? 'Other';

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
    <li key={i.key} className={i.checked ? 'checked' : ''}>
      <label className="check">
        <input type="checkbox" checked={i.checked} onChange={() => void toggle(i)} />
        <span className="item-name">{i.name}</span>
        {i.display && <span className="item-amount">{i.display}</span>}
      </label>
      {i.manual && (
        <button type="button" className="btn btn-ghost btn-icon" aria-label={`Remove ${i.name}`} onClick={() => void removeItem(i)}>
          <X size={16} weight="bold" aria-hidden />
        </button>
      )}
    </li>
  );

  if (community.kind === 'circle')
    return (
      <div className="stack">
        <h1>Shop with your kitchen</h1>
        <p>Recipe circles exchange ideas. Choose a kitchen for meal plans and groceries.</p>
        <Link to="/circles">Your circles</Link>
      </div>
    );

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow={items.length ? `${items.length - done.length} to get · ${done.length} in the cart` : `Week of ${formatDate(week)}`}
        title="Shopping list"
      >
        <div className="row week-nav">
          <button className="btn btn-small" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}>
            <CaretLeft size={16} weight="bold" aria-hidden />
          </button>
          <span className="week-label">Week of {formatDate(week)}</span>
          <button className="btn btn-small" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}>
            <CaretRight size={16} weight="bold" aria-hidden />
          </button>
        </div>
      </PageHeader>

      <div className="row wrap">
        <button
          className="btn btn-primary"
          disabled={!!busy}
          onClick={() => act('preview', async () => setPreview((await api.previewList(community.id, week)).list))}
        >
          {busy === 'preview' ? 'Reviewing…' : items.length ? 'Review plan changes' : 'Build from plan'}
        </button>
        <button
          className="btn"
          disabled={!items.length}
          onClick={async () => toast((await copyText(shoppingListText(items, aisleLabel))) ? 'Copied' : 'Copy failed')}
        >
          Copy as text
        </button>
        {hasChannel ? (
          <button
            className="btn"
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
          <Link className="btn btn-ghost" to="/account#chats">
            Link a chat to send lists
          </Link>
        )}
      </div>
      <ErrorNote error={error} />
      {state.data?.stale && <p className="note">Your plan or a recipe changed. Review the shopping update before your next trip.</p>}
      {preview && preview.weekStart === week && preview.communityId === community.id && (
        <section className="card stack">
          <h2>Review shopping update</h2>
          <p className="small muted">
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
          <div className="row">
            <button
              className="btn btn-primary"
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
            <button className="btn" onClick={() => setPreview(null)}>
              Keep current list
            </button>
          </div>
        </section>
      )}

      {state.loading && !list && <Skeleton variant="list" label="Loading shopping list" />}
      <ErrorNote error={state.error} onRetry={() => void state.reload()} />

      {list && (
        <>
          <form className="card row wrap add-item" onSubmit={addItem}>
            <input aria-label="Item" placeholder="Add an item" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input aria-label="Amount" placeholder="Amount" className="amount-input" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
            <button className="btn" disabled={!newName.trim() || busy === 'add'}>
              Add
            </button>
          </form>

          {!items.length && (
            <Empty title="Nothing on the list yet" icon={<Basket size={22} weight="duotone" />}>
              <p className="muted">Plan some meals for this week, then build the list. Ingredients are merged across recipes and grouped by aisle.</p>
              <Link to={kitchenPath('/plan', community.id, week)} className="btn">
                Go to plan
              </Link>
            </Empty>
          )}

          {byAisle.map((g) => (
            <section key={g.aisle.id} className="card" aria-labelledby={`aisle-${g.aisle.id}`}>
              <h2 id={`aisle-${g.aisle.id}`} className="aisle-title">
                {g.aisle.label} <span className="aisle-count num">{g.items.length}</span>
              </h2>
              <ul className="shop-list">{g.items.map(row)}</ul>
            </section>
          ))}

          {staples.length > 0 && (
            <details className="card">
              <summary>Pantry staples you probably have ({staples.length})</summary>
              <ul className="shop-list">{staples.map(row)}</ul>
            </details>
          )}

          {done.length > 0 && (
            <details className="card">
              <summary>In the cart ({done.length})</summary>
              <ul className="shop-list">{done.map(row)}</ul>
            </details>
          )}
          {list.generatedAt && <p className="small muted">Built from the plan {new Date(list.generatedAt).toLocaleString()}.</p>}
        </>
      )}
    </div>
  );
}
