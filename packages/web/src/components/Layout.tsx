import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookOpenText, CalendarBlank, Basket, CaretDown } from '@phosphor-icons/react';
import { ApiError } from '../api';
import { login } from '../lib/auth';
import { useSession } from '../lib/session';
import { CommunitySwitcher } from './CommunitySwitcher';
import { ErrorNote, Skeleton, Spinner } from './ui';
import { KitchenOnboarding } from './KitchenOnboarding';
import { kitchenPath } from '../lib/kitchen-context';
import { brandClasses } from '../lib/styles';
import { FooterLinks } from './SiteFooter';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const NAV = [
  { to: '/week', label: 'This week', Icon: CalendarBlank },
  { to: '/book', label: 'Recipes', Icon: BookOpenText },
  { to: '/plan', label: 'Plan', Icon: CalendarBlank },
  { to: '/shop', label: 'Shopping', Icon: Basket },
];

export function Layout() {
  const { signedIn, me, loading, error, community, refreshMe, setCommunityId } = useSession();
  const { pathname, search } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const params = new URLSearchParams(search);
  const requested = params.get('kitchen');
  useEffect(() => {
    if (requested && me?.communities.some((c) => c.id === requested)) setCommunityId(requested);
  }, [requested, me, setCommunityId]);
  const nav = community?.kind === 'circle' ? NAV.filter((n) => n.to === '/book') : NAV;
  const destination = (path: string) => (community ? kitchenPath(path, community.id, params.get('week') ?? undefined) : path);

  useEffect(() => {
    if (!signedIn) void login();
  }, [signedIn]);

  if (!signedIn) return <Spinner label="Redirecting to sign in" />;
  if (loading && !me) return <Spinner />;
  if (!me) {
    return (
      <main className="mx-auto max-w-[1160px] px-4 pt-7 pb-[72px] focus:outline-none wide:px-8 wide:pt-12 wide:pb-[112px]">
        <ErrorNote error={error ?? new ApiError(0, 'Could not load your account.')} onRetry={() => void refreshMe()} />
      </main>
    );
  }
  if (requested && !me.communities.some((c) => c.id === requested))
    return (
      <main className="mx-auto max-w-[1160px] px-4 pt-7 pb-[72px] focus:outline-none wide:px-8 wide:pt-12 wide:pb-[112px] flex flex-col gap-3">
        <ErrorNote error={new Error('You no longer have access to this kitchen or circle.')} />
        <Link to="/library">Open My recipes</Link>
      </main>
    );
  if (requested && community?.id !== requested) return <Spinner label="Opening kitchen" />;

  return (
    <div className="min-h-dvh pb-[calc(96px+env(safe-area-inset-bottom))] wide:pb-0">
      <a className="absolute left-3 -top-[60px] z-[var(--z-skip)] bg-ink text-ink-foreground py-2.5 px-4 rounded-full font-medium focus:top-3 focus:text-ink-foreground" href="#main">
        Skip to content
      </a>
      <header className="sticky top-0 z-10 flex min-h-16 items-center gap-4 border-b border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-4 py-2.5 backdrop-blur-[14px] backdrop-saturate-[1.4] wide:px-8">
        <NavLink to={destination('/week')} className={brandClasses} aria-label="Potluck home">
          <img src="/icon.svg" alt="" width={28} height={28} className="rounded-[9px] shadow-paper transition-transform duration-300 ease-spring group-hover:-rotate-8 group-hover:scale-105" />
          <span className="max-[420px]:hidden">Potluck</span>
        </NavLink>
        <CommunitySwitcher />
        <nav className="ml-auto hidden gap-0.5 rounded-full bg-[color-mix(in_srgb,var(--surface-2)_80%,transparent)] p-1 wide:flex" aria-label="Main">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={destination(n.to)}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-[7px] text-[0.9rem] font-medium whitespace-nowrap text-muted-foreground no-underline transition-[background-color,color,box-shadow] duration-200 ease-smooth hover:text-foreground',
                  isActive && 'bg-card text-foreground shadow-paper',
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto wide:ml-0">
              More
              <CaretDown weight="bold" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" aria-label="More pages" className="w-64 p-1.5">
            <nav className="flex flex-col" aria-label="Personal and kitchen settings" onClick={(e) => (e.target as Element).closest('a') && setMenuOpen(false)}>
              {[
                { to: '/library', label: 'My recipes' },
                { to: '/circles', label: 'Recipe circles' },
                ...(community ? [{ to: destination('/community'), label: 'Kitchen settings and invitations' }] : []),
                { to: '/account', label: 'Account and linked chats' },
              ].map((l) => (
                <Link key={l.label} to={l.to} className="rounded-sm px-3 py-2.5 text-[0.94rem] text-foreground no-underline hover:bg-muted focus-visible:bg-muted">
                  {l.label}
                </Link>
              ))}
            </nav>
          </PopoverContent>
        </Popover>
      </header>
      <main className="mx-auto max-w-[1160px] px-4 pt-7 pb-[72px] focus:outline-none wide:px-8 wide:pt-12 wide:pb-[112px]" id="main" tabIndex={-1}>
        {community || pathname === '/account' || pathname === '/library' || pathname === '/circles' || /^\/book\/.+/.test(pathname) ? (
          <div key={`${community?.id ?? 'personal'}:${pathname}`}>
            <Suspense fallback={<Skeleton />}>
              <Outlet />
            </Suspense>
          </div>
        ) : (
          <KitchenOnboarding />
        )}
      </main>
      <footer className="mx-auto flex max-w-[1120px] flex-wrap gap-x-[18px] gap-y-1 px-4 pb-6 text-[0.875rem] wide:px-8 wide:pb-8">
        <FooterLinks />
      </footer>
      <nav
        className="fixed right-3 bottom-[calc(10px+env(safe-area-inset-bottom))] left-3 z-10 grid auto-cols-fr grid-flow-col rounded-xl border border-border bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] p-1.5 shadow-[var(--shadow-pop),inset_0_1px_0_rgb(255_255_255/0.25)] backdrop-blur-[16px] backdrop-saturate-[1.4] wide:hidden"
        aria-label="Main"
      >
        {nav.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={destination(to)}
            className={({ isActive }) =>
              cn(
                'group flex flex-col items-center gap-0.5 rounded-[16px] py-1.5 text-[0.7rem] font-medium text-muted-foreground no-underline transition-[color,background-color] duration-200 ease-smooth',
                isActive && 'bg-accent font-semibold text-accent-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={22}
                  weight={isActive ? 'fill' : 'regular'}
                  className={cn('transition-transform duration-300 ease-spring group-active:scale-[0.88]', isActive && '-translate-y-px')}
                  aria-hidden
                />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

