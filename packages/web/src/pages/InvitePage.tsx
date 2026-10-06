import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { ErrorNote, Spinner } from '../components/ui';
import { login } from '../lib/auth';
import { useAsync } from '../lib/hooks';
import { useSession } from '../lib/session';
import { formatDate } from '../lib/util';
import { buttonVariants } from '@/components/ui/button';

export function InvitePage() {
  const { token = '' } = useParams();
  const { signedIn, refreshMe, setCommunityId } = useSession();
  const navigate = useNavigate();
  const preview = useAsync(() => api.invitePreview(token), [token]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  async function accept() {
    setBusy(true);
    setError(undefined);
    try {
      const c = await api.acceptInvite(token);
      await refreshMe();
      setCommunityId(c.id);
      navigate(`${c.kind === 'circle' ? '/book' : '/week'}?kitchen=${encodeURIComponent(c.id)}`, { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-[540px] px-4 pt-[10vh] pb-[72px] focus:outline-none wide:px-8 wide:pb-[112px]">
      <div className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-paper wide:px-7 wide:py-[26px] flex flex-col gap-3">
        {preview.loading && <Spinner />}
        <ErrorNote error={preview.error} />
        {preview.data && (
          <>
            <p className="font-serif italic [font-variation-settings:'SOFT'_100] text-[1.05rem] font-[450] text-accent-foreground tracking-[-0.005em]">You're invited</p>
            <h1>Join {preview.data.communityName}</h1>
            <p className="text-muted-foreground">
              {preview.data.invitedByName} invited you to{' '}
              {preview.data.kind === 'circle'
                ? 'exchange recipes in a private circle. Your kitchen, groceries and food profile stay separate.'
                : 'save recipes, plan meals and shop together. Your personal food profile stays private until you choose what to share.'}{' '}
              This invite expires {formatDate(preview.data.expiresAt, { month: 'long', day: 'numeric' })}.
            </p>
            {preview.data.full ? (
              <div className="flex items-center justify-between gap-3 flex-wrap bg-accent border border-[color-mix(in_srgb,_var(--accent)_25%,_transparent)] rounded-lg py-4 px-[18px] [&_strong]:font-serif [&_strong]:font-semibold [&_strong]:text-[1.08rem] [&_p]:mt-1">This group has reached its member limit. The owner can review membership or kitchen plan options.</div>
            ) : signedIn ? (
              <button className={buttonVariants({ variant: 'default', size: 'lg' })} disabled={busy} onClick={accept}>
                {busy ? 'Joining…' : 'Accept invite'}
              </button>
            ) : (
              <button className={buttonVariants({ variant: 'default', size: 'lg' })} onClick={() => void login(`/invite/${token}`)}>
                Sign in to accept
              </button>
            )}
            <ErrorNote error={error} />
          </>
        )}
      </div>
    </main>
  );
}
