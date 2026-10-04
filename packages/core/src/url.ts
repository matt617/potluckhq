import type { Platform } from './types.js';

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

/** Pull every http(s) URL out of a chat message. */
export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  return [...new Set(found.map((u) => u.replace(/[),.!?;:]+$/, '')))];
}

export function detectPlatform(url: string): Platform {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\.|^m\./, '');
  } catch {
    return 'web';
  }
  if (host.endsWith('tiktok.com')) return 'tiktok';
  if (host.endsWith('instagram.com') || host === 'instagr.am') return 'instagram';
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube';
  if (host.endsWith('facebook.com') || host === 'fb.watch') return 'facebook';
  if (host.endsWith('pinterest.com') || host === 'pin.it') return 'pinterest';
  if (host === 'x.com' || host.endsWith('twitter.com')) return 'x';
  return 'web';
}

export function isVideoPlatform(p: Platform): boolean {
  return p === 'tiktok' || p === 'instagram' || p === 'youtube' || p === 'facebook' || p === 'pinterest' || p === 'x';
}

const TRACKING_PARAMS = /^(utm_|igsh|igshid|si$|feature$|fbclid|gclid|_r$|_t$|is_from_webapp|sender_device|share_|ref$|mibextid|s$|t$)/i;

/**
 * Canonical form used as the global extraction cache key, so the same reel shared with
 * different tracking parameters only hits Gemini once.
 */
export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  u.protocol = 'https:';
  u.hash = '';
  u.hostname = u.hostname.toLowerCase().replace(/^(www|m|vm)\./, (m) => (m === 'vm.' ? 'vm.' : ''));
  const platform = detectPlatform(u.toString());
  if (platform === 'youtube') {
    // youtu.be/ID, /shorts/ID and watch?v=ID all collapse to one key.
    let id: string | null = null;
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1).split('/')[0] ?? null;
    else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/')[2] ?? null;
    else id = u.searchParams.get('v');
    if (id) return `https://youtube.com/watch?v=${id}`;
  }
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  }
  u.searchParams.sort();
  let s = u.toString();
  if (s.endsWith('/') && u.search === '') s = s.slice(0, -1);
  return s;
}

/** Stable non-cryptographic hash (FNV-1a 64-bit, hex). Good enough for cache keys. */
export function hashKey(input: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const ch of new TextEncoder().encode(input)) {
    h ^= BigInt(ch);
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}
