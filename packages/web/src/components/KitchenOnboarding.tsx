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
    <section className="min-w-0 border border-border shadow-paper max-w-[600px] mt-[6vh] mx-0 mb-0 flex flex-col gap-4 p-8 rounded-xl [background:radial-gradient(110%_80%_at_100%_0%,_color-mix(in_srgb,_var(--accent-soft)_90%,_transparent),_transparent_65%),_var(--surface)] wide:py-11 wide:px-12 flex flex-col">
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
