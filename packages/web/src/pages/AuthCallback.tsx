import { useEffect, useRef, useState } from 'react';
import { handleCallback, login } from '../lib/auth';
import { Spinner } from '../components/ui';
import { buttonVariants } from '@/components/ui/button';

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
        <div className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px] flex flex-col gap-3">
          <h1>Sign-in didn't finish</h1>
          <p className="text-muted-foreground">{error}</p>
          <button className={buttonVariants({ variant: 'default' })} onClick={() => void login('/book')}>
            Try again
          </button>
        </div>
      </main>
    );
  }
  return <Spinner label="Signing you in" />;
}
