import { secrets } from '../secrets.js';
import { toTelegramHtml, truncate } from './format.js';

async function token(): Promise<string> {
  const t = (await secrets())['telegram-bot-token'];
  if (!t) throw new Error('Telegram is not configured');
  return t;
}

export async function sendTelegram(chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${await token()}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: truncate(toTelegramHtml(text), 4000), parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
  });
  if (!res.ok) console.error('Telegram send failed', res.status, await res.text());
}

/** Download a file a user sent to the bot. Bot API downloads are limited to 20 MB. */
export async function downloadTelegramFile(fileId: string): Promise<{ bytes: Uint8Array; path: string }> {
  const t = await token();
  const meta = await fetch(`https://api.telegram.org/bot${t}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const json = (await meta.json()) as { ok: boolean; result?: { file_path: string } };
  if (!json.ok || !json.result) throw new Error('Telegram getFile failed');
  const res = await fetch(`https://api.telegram.org/file/bot${t}/${json.result.file_path}`);
  if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), path: json.result.file_path };
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
    caption?: string;
    photo?: { file_id: string; file_size?: number; width: number }[];
    video?: { file_id: string; file_size?: number; mime_type?: string; duration?: number };
    document?: { file_id: string; mime_type?: string; file_size?: number };
  };
}
