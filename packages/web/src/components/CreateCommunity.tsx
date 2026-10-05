import { useState, type FormEvent } from 'react';
import type { Community } from '@potluck/core';
import { api } from '../api';
import { useSession } from '../lib/session';
import { ErrorNote, Field } from './ui';

export function CreateCommunityForm({ onCreated }: { onCreated?: (c: Community) => void }) {
  const { refreshMe, setCommunityId } = useSession();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const c = await api.createCommunity({ name: name.trim(), description: description.trim() || undefined });
      await refreshMe();
      setCommunityId(c.id);
      setName('');
      setDescription('');
      onCreated?.(c);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <Field label="Kitchen name" hint="The people you plan meals and groceries with.">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="The Smith kitchen" maxLength={60} required />
      </Field>
      <Field label="Description (optional)">
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
      </Field>
      <ErrorNote error={error} />
      <button className="btn btn-primary" disabled={busy || !name.trim()}>
        {busy ? 'Creating…' : 'Create kitchen'}
      </button>
    </form>
  );
}
