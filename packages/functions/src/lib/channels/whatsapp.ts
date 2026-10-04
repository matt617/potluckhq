import { createHmac, timingSafeEqual } from 'node:crypto';
import { secrets } from '../secrets.js';
import { truncate } from './format.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

export function verifyWhatsAppSignature(rawBody: string, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const given = header.slice(7);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'));
}

export async function sendWhatsApp(to: string, text: string): Promise<void> {
  const s = await secrets();
  if (!s['whatsapp-token'] || !s['whatsapp-phone-number-id']) throw new Error('WhatsApp is not configured');
  const res = await fetch(`${GRAPH}/${s['whatsapp-phone-number-id']}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s['whatsapp-token']}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: truncate(text, 4000), preview_url: false } }),
  });
  if (!res.ok) console.error('WhatsApp send failed', res.status, await res.text());
}

export async function downloadWhatsAppMedia(mediaId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const s = await secrets();
  const auth = { authorization: `Bearer ${s['whatsapp-token']}` };
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: auth });
  const info = (await meta.json()) as { url?: string; mime_type?: string };
  if (!info.url) throw new Error('WhatsApp media lookup failed');
  const res = await fetch(info.url, { headers: auth });
  if (!res.ok) throw new Error(`WhatsApp media download failed: ${res.status}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: info.mime_type ?? res.headers.get('content-type') ?? 'application/octet-stream' };
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  video?: { id: string; mime_type?: string; caption?: string };
}

export interface WhatsAppWebhook {
  object?: string;
  entry?: { changes?: { value?: { messages?: WhatsAppMessage[]; contacts?: { profile?: { name?: string }; wa_id?: string }[] } }[] }[];
}
