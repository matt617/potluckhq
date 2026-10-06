import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookOpenText, CalendarBlank, Basket, CaretDown } from '@phosphor-icons/react';
import { ApiError } from '../api';
import { login } from '../lib/auth';
import { useSession } from '../lib/session';
import { CommunitySwitcher } from './CommunitySwitcher';
import { ErrorNote, Spinner } from './ui';
import { KitchenOnboarding } from './KitchenOnboarding';
import { kitchenPath } from '../lib/kitchen-context';
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
      <main className="page">
        <ErrorNote error={error ?? new ApiError(0, 'Could not load your account.')} onRetry={() => void refreshMe()} />
      </main>
    );
  }
  if (requested && !me.communities.some((c) => c.id === requested))
    return (
      <main className="page flex flex-col gap-3">
        <ErrorNote error={new Error('You no longer have access to this kitchen or circle.')} />
        <Link to="/library">Open My recipes</Link>
      </main>
    );
  if (requested && community?.id !== requested) return <Spinner label="Opening kitchen" />;

  return (
    <div className="min-h-dvh pb-[calc(96px+env(safe-area-inset-bottom))] wide:pb-0">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="sticky top-0 z-10 flex min-h-16 items-center gap-4 border-b border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-4 py-2.5 backdrop-blur-[14px] backdrop-saturate-[1.4] wide:px-8">
        <NavLink to={destination('/week')} className={brandClasses} aria-label="Potluck home">
          <img src="/icon.svg" alt="" width={28} height={28} className="rounded-[9px] shadow-card transition-transform duration-300 ease-spring group-hover:-rotate-8 group-hover:scale-105" />
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
                  isActive && 'bg-card text-foreground shadow-card',
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
      <main className="page" id="main" tabIndex={-1}>
        {community || pathname === '/account' || pathname === '/library' || pathname === '/circles' || /^\/book\/.+/.test(pathname) ? (
          <div key={`${community?.id ?? 'personal'}:${pathname}`}>
            <Outlet />
          </div>
        ) : (
          <KitchenOnboarding />
        )}
      </main>
      <footer className="mx-auto flex max-w-[1120px] flex-wrap gap-x-[18px] gap-y-1 px-4 pb-6 text-[0.875rem] wide:px-8 wide:pb-8">
        <FooterLinks />
      </footer>
      <nav
        className="fixed right-3 bottom-[calc(10px+env(safe-area-inset-bottom))] left-3 z-10 grid grid-cols-none auto-cols-fr grid-flow-col gap-0 rounded-xl border border-border bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] p-1.5 shadow-[var(--shadow-pop),inset_0_1px_0_rgb(255_255_255/0.25)] backdrop-blur-[16px] backdrop-saturate-[1.4] wide:hidden"
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

/** Wordmark: Fraunces with soft, wonky optical settings; the icon tilts on hover. */
export const brandClasses =
  "group flex items-center gap-[9px] font-serif text-[1.4rem] font-semibold tracking-[-0.03em] text-foreground no-underline [font-variation-settings:'SOFT'_100,'WONK'_1] hover:text-foreground";

export function FooterLinks() {
  const link = 'text-muted-foreground no-underline hover:text-foreground hover:underline';
  return (
    <>
      <Link to="/privacy" className={link}>
        Privacy
      </Link>
      <Link to="/terms" className={link}>
        Terms
      </Link>
      <a href="mailto:support@potluckhq.app" className={link}>
        Support
      </a>
    </>
  );
}
