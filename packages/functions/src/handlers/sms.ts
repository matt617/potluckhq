import type { SNSEvent } from 'aws-lambda';
import { handleInbound } from '../lib/bot.js';
import { sendSms, type InboundSms } from '../lib/channels/sms.js';
import * as repo from '../lib/repo.js';

const STOP_WORDS = ['stop', 'unsubscribe', 'cancel', 'end', 'quit', 'stopall'];

/** Inbound SMS from AWS End User Messaging, delivered through SNS. */
export async function handler(event: SNSEvent): Promise<void> {
  for (const record of event.Records) {
    const sms = JSON.parse(record.Sns.Message) as InboundSms;
    if (!(await repo.markEventSeen('sms', sms.inboundMessageId))) continue;
    const text = sms.messageBody.trim();
    // Carrier opt-out keywords are handled by AWS; just unlink the number.
    if (STOP_WORDS.includes(text.toLowerCase())) {
      await repo.deleteChannel('sms', sms.originationNumber);
      continue;
    }
    try {
      const reply = await handleInbound({ channel: 'sms', address: sms.originationNumber, text });
      await sendSms(sms.originationNumber, reply);
    } catch (err) {
      await repo.unmarkEvent('sms', sms.inboundMessageId).catch(() => undefined);
      throw err;
    }
  }
}
