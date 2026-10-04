import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
});

export function ttlIn(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

export const DAY = 86_400;

export function isConditionalFailure(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === 'ConditionalCheckFailedException' || name === 'TransactionCanceledException';
}

/** Strip key attributes before returning an item to callers. */
export function clean<T>(item: Record<string, unknown> | undefined): T | undefined {
  if (!item) return undefined;
  const { pk, sk, gsi1pk, gsi1sk, ttl, version, ...rest } = item;
  void pk; void sk; void gsi1pk; void gsi1sk; void ttl; void version;
  return rest as T;
}
