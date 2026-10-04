/**
 * Outgoing chat messages are written with *bold* markers (WhatsApp style) and converted
 * per channel. Telegram uses HTML; SMS gets plain text.
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function toTelegramHtml(text: string): string {
  return escapeHtml(text).replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
}

export function toPlain(text: string): string {
  return text.replace(/\*([^*\n]+)\*/g, '$1');
}

export function truncate(text: string, max: number, suffix = '\n…'): string {
  return text.length <= max ? text : text.slice(0, max - suffix.length) + suffix;
}
