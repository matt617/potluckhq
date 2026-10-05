import { NominationInbox } from './MemberNominations';
import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookOpenText, CalendarBlank, Basket } from '@phosphor-icons/react';
import { ApiError } from '../api';
import { login } from '../lib/auth';
import { useSession } from '../lib/session';
import { CommunitySwitcher } from './CommunitySwitcher';
import { ErrorNote, Spinner } from './ui';
import { KitchenOnboarding } from './KitchenOnboarding';
import { kitchenPath } from '../lib/kitchen-context';

const NAV = [
  { to: '/week', label: 'This week', Icon: CalendarBlank },
  { to: '/book', label: 'Recipes', Icon: BookOpenText },
  { to: '/plan', label: 'Plan', Icon: CalendarBlank },
  { to: '/shop', label: 'Shopping', Icon: Basket },
];

export function Layout() {
  const { signedIn, me, loading, error, community, refreshMe, setCommunityId } = useSession();
  const { pathname, search } = useLocation();
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
      <main className="page stack">
        <ErrorNote error={new Error('You no longer have access to this kitchen or circle.')} />
        <Link to="/library">Open My recipes</Link>
      </main>
    );
  if (requested && community?.id !== requested) return <Spinner label="Opening kitchen" />;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <NavLink to={destination('/week')} className="brand" aria-label="Potluck home">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>Potluck</span>
        </NavLink>
        <CommunitySwitcher />
        <nav className="topnav" aria-label="Main">
          {nav.map((n) => (
            <NavLink key={n.to} to={destination(n.to)}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <details className="kitchen-menu">
          <summary>More</summary>
          <nav className="card stack" aria-label="Personal and kitchen settings">
            <Link to="/library">My recipes</Link>
            <Link to="/circles">Recipe circles</Link>
            {community && <Link to={destination('/community')}>Kitchen settings and members</Link>}
            <Link to="/account">Account and linked chats</Link>
          </nav>
        </details>
      </header>
      <main className="page" id="main" tabIndex={-1}>
        <NominationInbox />
        {community || pathname === '/account' || pathname === '/library' || pathname === '/circles' || /^\/book\/.+/.test(pathname) ? (
          <div key={`${community?.id ?? 'personal'}:${pathname}`}>
            <Outlet />
          </div>
        ) : (
          <KitchenOnboarding />
        )}
      </main>
      <footer className="app-footer small">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <a href="mailto:support@potluckhq.app">Support</a>
      </footer>
      <nav className="tabbar" aria-label="Main">
        {nav.map(({ to, label, Icon }) => (
          <NavLink key={to} to={destination(to)}>
            {({ isActive }) => (
              <>
                <Icon size={22} weight={isActive ? 'fill' : 'regular'} aria-hidden />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
