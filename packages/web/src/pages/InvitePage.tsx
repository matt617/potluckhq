import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { ErrorNote, Spinner } from '../components/ui';
import { login } from '../lib/auth';
import { useAsync } from '../lib/hooks';
import { useSession } from '../lib/session';
import { formatDate } from '../lib/util';

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
      navigate('/book', { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <div className="card stack">
        {preview.loading && <Spinner />}
        <ErrorNote error={preview.error} />
        {preview.data && (
          <>
            <p className="eyebrow">You're invited</p>
            <h1>Join {preview.data.communityName}</h1>
            <p className="muted">
              {preview.data.invitedByName} invited you to share recipes, meal plans and shopping lists. This invite expires{' '}
              {formatDate(preview.data.expiresAt, { month: 'long', day: 'numeric' })}.
            </p>
            {preview.data.full ? (
              <div className="note note-upgrade">
                This community is full on its current plan. Ask {preview.data.invitedByName} to upgrade, then try again.
              </div>
            ) : signedIn ? (
              <button className="btn btn-primary btn-large" disabled={busy} onClick={accept}>
                {busy ? 'Joining…' : 'Accept invite'}
              </button>
            ) : (
              <button className="btn btn-primary btn-large" onClick={() => void login(`/invite/${token}`)}>
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
