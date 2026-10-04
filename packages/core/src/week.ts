/** Week helpers. Weeks start on Monday and are keyed by ISO date (YYYY-MM-DD). */

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weekStartOf(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dow = d.getUTCDay();
  const diff = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return toIsoDate(d);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function isWeekKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && weekStartOf(s) === s;
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
