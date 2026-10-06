import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { addDays, DAY_NAMES, formatUsd, weekStartOf, batchPortions, type PlanEntry } from '@potluck/core';
import { api } from '../api';
import { useAsync, useInterval } from '../lib/hooks';
import { useCommunity, useSession } from '../lib/session';
import { kitchenPath, useWeek } from '../lib/kitchen-context';
import { Empty, ErrorNote, Skeleton } from '../components/ui';
import { buttonVariants } from '@/components/ui/button';

export function ThisWeek() {
  const c = useCommunity(),
    { me } = useSession(),
    [week, setWeek] = useWeek();
  const state = useAsync(async () => {
    const [plan, list, recipes, detail, activity, people, allowance] = await Promise.all([
      api.plan(c.id, week),
      api.list(c.id, week),
      api.recipes(c.id),
      api.community(c.id),
      api.activity(c.id),
      api.diners(c.id),
      api.allowance(c.id),
    ]);
    return { ...plan, ...list, catalog: recipes.recipes, ...detail, ...activity, ...people, ...allowance };
  }, [c.id, week]);
  const [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  useInterval(() => void state.reload(), 15000, !busy);
  if (c.kind === 'circle') return <Navigate to={kitchenPath('/book', c.id)} replace />;
  const d = state.data;
  const today = (new Date().getDay() + 6) % 7;
  const title = (e: PlanEntry) => d?.catalog.find((r) => r.id === e.recipeId)?.title ?? e.label ?? 'Meal';
  async function claim(e: PlanEntry) {
    if (!d || !me) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.savePlan(c.id, week, {
        entries: d.plan.entries.map((x) => (x.id === e.id ? { ...x, cookId: x.cookId === me.user.id ? undefined : me.user.id } : x)),
        revision: d.plan.revision ?? 0,
      });
      await state.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-2 justify-between flex-wrap">
        <div>
          <h1>This week in {c.name}</h1>
          <p className="text-muted-foreground">Decide together. Cook together.</p>
        </div>
        <Link className={buttonVariants()} to={kitchenPath('/community', c.id)}>
          Invite someone
        </Link>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button className={buttonVariants()} onClick={() => setWeek(addDays(week, -7))}>
          Previous week
        </button>
        <span>Week of {week}</span>
        <button className={buttonVariants()} onClick={() => setWeek(addDays(week, 7))}>
          Next week
        </button>
      </div>
      <ErrorNote error={error ?? state.error} onRetry={() => void state.reload()} />
      {!d && state.loading && <Skeleton />}
      {d && (
        <>
          <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px] flex flex-col gap-3">
            <h2>{week === weekStartOf() ? 'Tonight' : 'This week’s dinner'}</h2>
            <p>
              {d.plan.entries
                .filter((e) => e.day === (week === weekStartOf() ? today : 0) && e.slot === 'dinner')
                .map(title)
                .join(' · ') || 'Dinner is still open. Choose something from your recipe book.'}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Link className={buttonVariants()} to={kitchenPath('/plan', c.id, week)}>
                Choose meals
              </Link>
              <Link className={buttonVariants({ variant: 'default' })} to={kitchenPath('/shop', c.id, week)}>
                {d.list.items.filter((i) => i.checked).length} of {d.list.items.length} groceries purchased
              </Link>
            </div>
            {d.stale && <p className="text-[0.875rem] text-muted-foreground">Your plan changed. Review the shopping update.</p>}
          </section>
          <section className="flex flex-col gap-3">
            <h2>Meals and cooks</h2>
            {!d.plan.entries.length && (
              <Empty title="Choose your first dinner">
                <p>Save a recipe, pick a night, then build your list.</p>
                <Link className={buttonVariants({ variant: 'default' })} to={kitchenPath('/book', c.id) + '&add=1'}>
                  Save a recipe
                </Link>
              </Empty>
            )}
            {DAY_NAMES.map((day, index) => (
              <div key={day} className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px] flex flex-col gap-3">
                <div className="flex items-center gap-2 justify-between">
                  <h3>
                    {day}
                    {index === today && week === weekStartOf() ? '· Today' : ''}
                  </h3>
                  <Link to={kitchenPath('/plan', c.id, week)}>{d.plan.entries.some((e) => e.day === index) ? 'Edit meals' : 'Choose dinner'}</Link>
                </div>
                {d.plan.entries
                  .filter((e) => e.day === index)
                  .map((e) => (
                    <div className="flex items-center gap-2 justify-between flex-wrap" key={e.id}>
                      <div>
                        <strong>{e.slot}: </strong>
                        {e.recipeId ? (
                          <Link
                            to={kitchenPath(`/book/${e.recipeId}`, c.id, week) + `&servings=${e.leftoverOf ? e.servings : batchPortions(d.plan.entries, e.id)}`}
                          >
                            {title(e)}
                          </Link>
                        ) : (
                          title(e)
                        )}
                        <p className="text-[0.875rem] text-muted-foreground">
                          {e.servings} portions ·{' '}
                          {e.dinerIds
                            ?.map((id) => d.diners.find((p) => p.id === id)?.name)
                            .filter(Boolean)
                            .join(', ') || 'Attendance not set'}
                          {e.leftoverOf ? '· Leftovers' : ''}
                        </p>
                        {!e.leftoverOf && batchPortions(d.plan.entries, e.id) > e.servings && (
                          <p>
                            Cook {batchPortions(d.plan.entries, e.id)} portions; eat {e.servings} and save {batchPortions(d.plan.entries, e.id) - e.servings}{' '}
                            for later.
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span>{e.cookId ? (d.members.find((m) => m.userId === e.cookId)?.displayName ?? 'Former member') : 'No cook yet'}</span>
                        {(!e.cookId || e.cookId === me?.user.id) && !e.leftoverOf && (
                          <button className={buttonVariants({ size: 'sm' })} disabled={busy} onClick={() => void claim(e)}>
                            {e.cookId ? 'Unassign me' : 'I’ll cook'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            ))}
          </section>
          <section className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px] flex flex-col gap-3">
            <h2>Shopping</h2>
            <p>
              {d.list.items.filter((i) => i.checked).length} of {d.list.items.length} items purchased.
              {d.stale ? 'Your plan changed; review the list update.' : ''}
            </p>
            <Link className={buttonVariants({ variant: 'default' })} to={kitchenPath('/shop', c.id, week)}>
              Open shopping list
            </Link>
          </section>
          <section className="flex flex-col gap-3">
            <h2>Recently added</h2>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,248px),1fr))] gap-x-[22px] gap-y-9 p-0">
              {d.catalog
                .filter((r) => !r.archived)
                .slice(0, 4)
                .map((r) => (
                  <li key={r.id} className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px]">
                    <Link to={kitchenPath(`/book/${r.id}`, c.id)}>{r.title}</Link>
                    <p className="text-[0.875rem] text-muted-foreground">Added by {d.members.find((m) => m.userId === r.addedBy)?.displayName ?? 'a former member'}</p>
                  </li>
                ))}
            </ul>
          </section>
          <section className="flex flex-col gap-3">
            <h2>From your kitchen</h2>
            {!d.activity.length && <p className="text-muted-foreground">Mark a recipe “Want to try” or leave a note after cooking it.</p>}
            {d.activity.slice(0, 8).map((a) => (
              <article key={a.id} className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px]">
                <p>
                  <strong>{a.actorName}</strong> {a.kind === 'made' ? 'made' : a.kind === 'want' ? 'wants to try' : 'left a note on'}{' '}
                  <Link to={kitchenPath(`/book/${a.recipeId}`, c.id)}>{a.recipeTitle}</Link>
                </p>
                {a.note && <p>{a.note}</p>}
                <time className="text-[0.875rem] text-muted-foreground">{new Date(a.at).toLocaleDateString()}</time>
              </article>
            ))}
          </section>
          <p className="text-[0.875rem] text-muted-foreground">
            {d.ownerName} provides this kitchen’s {d.tier.name} plan. {d.budget.importsLeft} imports remain across their kitchens.
            {d.budget.aiFeatures
              ? ` ${formatUsd(d.budget.allowanceLeftMicros)} of the monthly AI allowance remains; imports and planning both use it.`
              : 'Manual planning and shopping are included.'}{' '}
            <Link to={kitchenPath('/community', c.id)}>Kitchen settings</Link>
          </p>
        </>
      )}
    </div>
  );
}
