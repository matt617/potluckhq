import { useState } from 'react';
import { useSession } from '../lib/session';
import { CreateKitchenDialog } from './CreateCommunity';
import { useNavigate } from 'react-router-dom';

export function CommunitySwitcher() {
  const { me, community, setCommunityId } = useSession();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const list = me?.communities ?? [];
  if (!community) return null;
  return (
    <div className="switcher">
      <label className="sr-only" htmlFor="community-select">
        Kitchen or recipe circle
      </label>
      <select
        id="community-select"
        value={community.id}
        onChange={(e) => {
          if (!window.dispatchEvent(new Event('potluck:before-navigation', { cancelable: true }))) return;
          if (e.target.value === '__new') setCreating(true);
          else {
            setCommunityId(e.target.value);
            navigate(`/book?kitchen=${encodeURIComponent(e.target.value)}`);
          }
        }}
      >
        {list.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value="__new">+ New kitchen…</option>
      </select>
      {creating && (
        <CreateKitchenDialog
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            navigate(`/week?kitchen=${encodeURIComponent(c.id)}`);
          }}
        />
      )}
    </div>
  );
}
