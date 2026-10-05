/**
 * Rewrite a received email so SES can forward it from our own domain.
 * SES only sends from verified identities, so the original sender moves to Reply-To and
 * the From becomes "<original name> via Potluck <forwarder@domain>". Headers that would
 * break authentication on the second hop (DKIM signatures, Return-Path) are dropped.
 */
export function rewriteForForward(raw: string, opts: { forwardFrom: string; recipientLabel: string }): string {
  const sep = raw.match(/\r?\n\r?\n/);
  const splitAt = sep?.index ?? raw.length;
  const headerBlock = raw.slice(0, splitAt);
  const body = raw.slice(splitAt);
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';

  // Unfold continuation lines so each header is one entry.
  const headers: string[] = [];
  for (const line of headerBlock.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && headers.length) headers[headers.length - 1] += eol + line;
    else headers.push(line);
  }
  const name = (h: string) => h.slice(0, h.indexOf(':')).trim().toLowerCase();
  const value = (h: string) => h.slice(h.indexOf(':') + 1).trim();

  const from = headers.find((h) => name(h) === 'from');
  const hasReplyTo = headers.some((h) => name(h) === 'reply-to');
  const fromValue = from ? value(from) : 'unknown sender';
  const display = (fromValue.match(/^"?([^"<]+?)"?\s*</)?.[1] ?? fromValue.replace(/[<>]/g, '')).replace(/["\r\n]/g, '').trim();

  const DROP = new Set(['dkim-signature', 'domainkey-signature', 'return-path', 'sender', 'message-id', 'from']);
  const kept = headers.filter((h) => h.includes(':') && !DROP.has(name(h)));
  kept.unshift(`From: "${display} via Potluck ${opts.recipientLabel}" <${opts.forwardFrom}>`);
  if (!hasReplyTo && from) kept.push(`Reply-To: ${fromValue}`);
  kept.push(`X-Potluck-Forwarded-For: ${opts.recipientLabel}`);
  return kept.join(eol) + body;
}
