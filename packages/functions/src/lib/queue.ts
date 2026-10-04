import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { env } from './env.js';

const sqs = new SQSClient({});

export interface IngestMessage { importId: string }

export async function enqueueImport(importId: string): Promise<void> {
  await sqs.send(new SendMessageCommand({ QueueUrl: env.ingestQueueUrl, MessageBody: JSON.stringify({ importId } satisfies IngestMessage) }));
}
