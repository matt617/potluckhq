import { Link } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { useSession } from '../lib/session';

export function NotFound() {
  const { signedIn } = useSession();
  return (
    <main className="not-found" id="main">
      <p className="muted mono">404</p>
      <h1>This page isn't on the menu.</h1>
      <p className="muted">The link may be old, or the recipe was removed from your community.</p>
      <Link className="btn btn-primary" to={signedIn ? '/book' : '/'}>
        <ArrowLeft size={16} weight="bold" aria-hidden />
        {signedIn ? 'Back to your recipes' : 'Back to Potluck'}
      </Link>
    </main>
  );
}
