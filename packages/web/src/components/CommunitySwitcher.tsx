import { useState } from 'react';
import { useSession } from '../lib/session';
import { CreateCommunityForm } from './CreateCommunity';
import { Sheet } from './ui';

export function CommunitySwitcher() {
  const { me, community, setCommunityId } = useSession();
  const [creating, setCreating] = useState(false);
  const list = me?.communities ?? [];
  if (!community) return null;
  return (
    <div className="switcher">
      <label className="sr-only" htmlFor="community-select">
        Community
      </label>
      <select
        id="community-select"
        value={community.id}
        onChange={(e) => {
          if (e.target.value === '__new') setCreating(true);
          else setCommunityId(e.target.value);
        }}
      >
        {list.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value="__new">+ New community…</option>
      </select>
      {creating && (
        <Sheet title="New community" onClose={() => setCreating(false)}>
          <CreateCommunityForm onCreated={() => setCreating(false)} />
        </Sheet>
      )}
    </div>
  );
}
