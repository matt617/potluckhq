import type { SESEvent } from 'aws-lambda';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { rewriteForForward } from '../lib/mailforward.js';

const s3 = new S3Client({});
const ses = new SESv2Client({});

/** Forward mail sent to support@, privacy@ and legal@ to the operator's inbox. */
export async function handler(event: SESEvent): Promise<void> {
  const bucket = process.env.MAIL_BUCKET!;
  const forwardTo = process.env.FORWARD_TO!;
  const forwardFrom = process.env.FORWARD_FROM!;
  for (const record of event.Records) {
    const { mail, receipt } = record.ses;
    if (receipt.spamVerdict.status === 'FAIL' || receipt.virusVerdict.status === 'FAIL') {
      console.log(JSON.stringify({ event: 'mail_dropped', messageId: mail.messageId, spam: receipt.spamVerdict.status, virus: receipt.virusVerdict.status }));
      continue;
    }
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `inbound/${mail.messageId}` }));
    const raw = await obj.Body!.transformToString('utf8');
    const recipient = receipt.recipients[0] ?? 'mail';
    const rewritten = rewriteForForward(raw, { forwardFrom, recipientLabel: recipient.split('@')[0]! });
    await ses.send(new SendEmailCommand({
      FromEmailAddress: forwardFrom,
      Destination: { ToAddresses: [forwardTo] },
      Content: { Raw: { Data: new TextEncoder().encode(rewritten) } },
    }));
    console.log(JSON.stringify({ event: 'mail_forwarded', messageId: mail.messageId, recipient }));
  }
}
