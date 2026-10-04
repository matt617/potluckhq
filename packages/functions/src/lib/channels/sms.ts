import { PinpointSMSVoiceV2Client, SendTextMessageCommand } from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { env } from '../env.js';
import { toPlain, truncate } from './format.js';

const client = new PinpointSMSVoiceV2Client({});

export async function sendSms(to: string, text: string): Promise<void> {
  if (!env.smsEnabled || !env.smsOriginationNumber) throw new Error('SMS is not enabled');
  await client.send(new SendTextMessageCommand({
    DestinationPhoneNumber: to,
    OriginationIdentity: env.smsOriginationNumber,
    MessageBody: truncate(toPlain(text), 1200),
    MessageType: 'TRANSACTIONAL',
  }));
}

/** Payload AWS End User Messaging publishes to SNS for an inbound SMS. */
export interface InboundSms {
  originationNumber: string;
  destinationNumber: string;
  messageBody: string;
  inboundMessageId: string;
}
