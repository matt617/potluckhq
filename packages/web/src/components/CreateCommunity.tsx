import { useState, type FormEvent } from 'react';
import type { Community } from '@potluck/core';
import { api } from '../api';
import { useSession } from '../lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorNote, Field, FormDialog } from './ui';

export function CreateKitchenDialog({ onClose, onCreated }: { onClose: () => void; onCreated?: (c: Community) => void }) {
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
      onCreated?.(c);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      title="New kitchen"
      description="The people you plan meals and groceries with."
      onClose={onClose}
      onSubmit={submit}
      footer={
        <Button type="submit" variant="default" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create kitchen'}
        </Button>
      }
    >
      <Field label="Kitchen name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="The Smith kitchen" maxLength={60} required />
      </Field>
      <Field label="Description (optional)">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
      </Field>
      <ErrorNote error={error} />
    </FormDialog>
  );
}
