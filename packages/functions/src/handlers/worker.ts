import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import type { IngestMessage } from '../lib/queue.js';
import { processImport } from '../lib/ingest.js';

/** Must match maxReceiveCount on the queue's redrive policy. */
const MAX_RECEIVES = 3;

/** SQS consumer for recipe imports. Batch size is 1; failures go back to the queue, then the DLQ. */
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failures: SQSBatchResponse['batchItemFailures'] = [];
  for (const record of event.Records) {
    try {
      const msg = JSON.parse(record.body) as IngestMessage;
      const receives = Number(record.attributes.ApproximateReceiveCount ?? '1');
      await processImport(msg.importId, { finalAttempt: receives >= MAX_RECEIVES });
    } catch (err) {
      console.error('Import will be retried', record.messageId, err);
      failures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: failures };
}
