import { randomBytes, randomUUID } from 'node:crypto';

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

/** Short URL-safe id, ~71 bits of entropy. */
export function newId(len = 14): string {
  const bytes = randomBytes(len);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export function newToken(): string {
  return randomUUID().replace(/-/g, '') + newId(8);
}

/** Six character code users type into a chat to link it. No ambiguous characters. */
export function newLinkCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

export function nowIso(): string {
  return new Date().toISOString();
}
