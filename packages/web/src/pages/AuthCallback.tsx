import { useEffect, useRef, useState } from 'react';
import { handleCallback, login } from '../lib/auth';
import { Spinner } from '../components/ui';

export function AuthCallback() {
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    handleCallback(window.location.search)
      // Full navigation so the session provider re-reads the stored tokens.
      .then((next) => window.location.replace(next))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Sign-in failed.'));
  }, []);
  if (error) {
    return (
      <main className="page narrow">
        <div className="card stack">
          <h1>Sign-in didn't finish</h1>
          <p className="muted">{error}</p>
          <button className="btn btn-primary" onClick={() => void login('/book')}>
            Try again
          </button>
        </div>
      </main>
    );
  }
  return <Spinner label="Signing you in" />;
}
