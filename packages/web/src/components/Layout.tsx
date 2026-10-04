import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookOpenText, CalendarBlank, Basket, UsersThree, UserCircle } from '@phosphor-icons/react';
import { ApiError } from '../api';
import { login } from '../lib/auth';
import { useSession } from '../lib/session';
import { CommunitySwitcher } from './CommunitySwitcher';
import { CreateCommunityForm } from './CreateCommunity';
import { ErrorNote, Spinner } from './ui';

const NAV = [
  { to: '/book', label: 'Recipes', Icon: BookOpenText },
  { to: '/plan', label: 'Plan', Icon: CalendarBlank },
  { to: '/shop', label: 'Shopping', Icon: Basket },
  { to: '/community', label: 'Community', Icon: UsersThree },
  { to: '/account', label: 'Account', Icon: UserCircle },
];

export function Layout() {
  const { signedIn, me, loading, error, community, refreshMe } = useSession();
  const { pathname } = useLocation();

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

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <NavLink to="/book" className="brand" aria-label="Potluck home">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>Potluck</span>
        </NavLink>
        <CommunitySwitcher />
        <nav className="topnav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="page" id="main" tabIndex={-1}>
        {community || pathname === '/account' ? (
          <Outlet />
        ) : (
          <section className="card onboarding">
            <h1>Welcome to Potluck, {me.user.displayName || 'friend'}</h1>
            <p className="muted">
              Start a community for your household, office or friends. Everyone in it shares one recipe book, meal plan and shopping list.
            </p>
            <CreateCommunityForm />
          </section>
        )}
      </main>
      <nav className="tabbar" aria-label="Main">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to}>
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
