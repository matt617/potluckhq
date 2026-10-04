/** Storage access that never throws (private windows, blocked site data). */
export function readStore(key: string, area: 'local' | 'session' = 'local'): string | null {
  try {
    return (area === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string | null, area: 'local' | 'session' = 'local'): void {
  try {
    const s = area === 'local' ? window.localStorage : window.sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* storage unavailable; the app still works for this page load */
  }
}
