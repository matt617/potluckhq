import type { ChannelKind } from '@potluck/core';
import { sendSms } from './sms.js';
import { sendTelegram } from './telegram.js';
import { sendWhatsApp } from './whatsapp.js';

/** Send a message to a linked chat. Errors are logged, never thrown, so replies can't break a job. */
export async function sendToChannel(kind: ChannelKind, address: string, text: string): Promise<boolean> {
  try {
    if (kind === 'telegram') await sendTelegram(address, text);
    else if (kind === 'whatsapp') await sendWhatsApp(address, text);
    else if (kind === 'sms') await sendSms(address, text);
    else return false;
    return true;
  } catch (err) {
    console.error(`Failed to send ${kind} message`, err);
    return false;
  }
}
