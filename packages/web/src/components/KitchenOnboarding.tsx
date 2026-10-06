import { useState } from 'react';
import { api } from '../api';
import { useSession } from '../lib/session';
import { ErrorNote } from './ui';
import { buttonVariants } from '@/components/ui/button';

export function KitchenOnboarding() {
  const { refreshMe, setCommunityId } = useSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <section className="min-w-0 border border-border shadow-paper onboarding flex flex-col">
      <h1>Start with a recipe you love</h1>
      <p>Save a video, a recipe link, a cookbook photo or recipe text. Then choose a night to cook it and build your shopping list.</p>
      <button
        className={buttonVariants({ variant: 'default' })}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            const c = await api.startKitchen();
            await refreshMe();
            setCommunityId(c.id);
            window.location.assign(`/book?kitchen=${encodeURIComponent(c.id)}&add=1`);
          } catch (e) {
            setError(e);
            setBusy(false);
          }
        }}
      >
        {busy ? 'Opening your kitchen…' : 'Save my first recipe'}
      </button>
      <p className="text-[0.875rem] text-muted-foreground">We’ll start you with “My kitchen.” Rename it or invite someone whenever you’re ready.</p>
      <ErrorNote error={error} />
    </section>
  );
}
