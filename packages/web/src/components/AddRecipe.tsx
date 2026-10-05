import { useRef, useState, type FormEvent } from 'react';
import { api, uploadToPresigned } from '../api';
import { useSession } from '../lib/session';
import { ErrorNote, Field } from './ui';

export type AddMode = 'link' | 'photos' | 'text';

export function AddRecipe({ communityId, initialMode = 'link', onQueued }: { communityId: string; initialMode?: AddMode; onQueued: () => void }) {
  const { publicConfig, me } = useSession();
  const [mode, setMode] = useState<AddMode>(initialMode);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<unknown>();
  const fileInput = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      if (mode === 'link') {
        await api.createImport({ communityId, url: url.trim() });
        setUrl('');
      } else if (mode === 'text') {
        await api.createImport({ communityId, text: text.trim() });
        setText('');
      } else {
        const video = files.find((f) => f.type.startsWith('video/'));
        if (video && video.size > 200 * 1024 * 1024) throw new Error('Videos must be under 200 MB.');
        const toSend = video ? [video] : files;
        const keys: string[] = [];
        for (const [i, file] of toSend.entries()) {
          setProgress(video ? 'Uploading video' : `Uploading photo ${i + 1} of ${toSend.length}`);
          const { key, uploadUrl } = await api.uploadUrl(file.type || 'image/jpeg');
          await uploadToPresigned(uploadUrl, file);
          keys.push(key);
        }
        setProgress('');
        await api.createImport({ communityId, imageKeys: keys });
        setFiles([]);
        if (fileInput.current) fileInput.current.value = '';
      }
      onQueued();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  const valid = mode === 'link' ? /^https?:\/\/\S+$/i.test(url.trim()) : mode === 'text' ? text.trim().length >= 40 : files.length > 0;
  const tg = publicConfig?.telegramBotUsername;

  return (
    <section className="card stack" aria-labelledby="add-recipe-title">
      <div className="row between wrap">
        <h2 id="add-recipe-title">Add a recipe</h2>
        <div className="segmented" role="tablist" aria-label="Import type">
          {(['link', 'photos', 'text'] as AddMode[]).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {m === 'link' ? 'Link' : m === 'photos' ? 'Upload' : 'Text'}
            </button>
          ))}
        </div>
      </div>
      <form className="stack" onSubmit={submit}>
        <p className="small muted">
          Saving to <strong>{me?.communities.find((c) => c.id === communityId)?.name}</strong> and My recipes. Imports use this group owner’s account allowance.
        </p>
        {mode === 'link' && (
          <Field label="Video or recipe link" hint="TikTok, Instagram, YouTube, Facebook, Pinterest or a recipe website.">
            <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@chef/video/…" />
          </Field>
        )}
        {mode === 'photos' && (
          <Field
            label="Photos or a video"
            hint="Cookbook pages, a handwritten card, screenshots of comments that list the ingredients, or one saved cooking video."
          >
            <input
              ref={fileInput}
              type="file"
              accept="image/*,video/mp4,video/quicktime,video/webm"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 6))}
            />
          </Field>
        )}
        {mode === 'text' && (
          <Field label="Recipe text" hint="Paste a recipe from anywhere. Potluck will structure it.">
            <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}
        <ErrorNote error={error} />
        <div className="row between wrap">
          <button className="btn btn-primary" disabled={busy || !valid}>
            {busy ? progress || 'Sending…' : 'Import recipe'}
          </button>
          {tg && (
            <a className="muted small" href={`https://t.me/${tg}`} target="_blank" rel="noreferrer">
              Tip: send links to @{tg} on Telegram
            </a>
          )}
        </div>
      </form>
    </section>
  );
}
