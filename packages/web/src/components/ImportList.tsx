import { Link } from 'react-router-dom';
import type { ImportJob, ImportStatus } from '@potluck/core';
import { timeAgo } from '../lib/util';

const LABEL: Record<ImportStatus, string> = {
  queued: 'Queued',
  downloading: 'Downloading video',
  extracting: 'Reading recipe',
  done: 'Added',
  failed: 'Failed',
};

export function ImportList({ imports }: { imports: ImportJob[] }) {
  if (!imports.length) return null;
  return (
    <section className="card" aria-labelledby="imports-title">
      <h2 id="imports-title" className="h3">
        Recent imports
      </h2>
      <ul className="imports">
        {imports.map((job) => (
          <li key={job.id}>
            <span className={`status status-${job.status}`}>
              {(job.status === 'queued' || job.status === 'downloading' || job.status === 'extracting') && <span className="pulse" aria-hidden />}
              {LABEL[job.status]}
            </span>
            <span className="import-src">
              {job.url ? (
                <a href={job.url} target="_blank" rel="noreferrer">
                  {job.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}
                </a>
              ) : job.kind === 'image' ? (
                `${job.imageKeys?.length ?? 0} photo(s)`
              ) : job.kind === 'video' ? (
                'Uploaded video'
              ) : (
                'Pasted text'
              )}
              {job.channel !== 'web' && <span className="badge">{job.channel}</span>}
              {job.error && <span className="error-text"> {job.error}</span>}
            </span>
            <span className="import-meta">
              {job.status === 'done' && job.recipeId ? <Link to={`/book/${job.recipeId}`}>Open</Link> : timeAgo(job.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
