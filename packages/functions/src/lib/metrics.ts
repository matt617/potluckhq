import { env } from './env.js';

/**
 * Publish a CloudWatch metric through the Embedded Metric Format: a structured log line
 * that CloudWatch turns into a metric. No API calls, no extra latency.
 */
export function emitMetric(name: string, value: number, unit: 'Count' | 'None' | 'Milliseconds', dims: Record<string, string> = {}): void {
  const dimensionKeys = ['Stage', ...Object.keys(dims)];
  console.log(JSON.stringify({
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [{ Namespace: 'Potluck', Dimensions: [['Stage'], ...(Object.keys(dims).length ? [dimensionKeys] : [])], Metrics: [{ Name: name, Unit: unit }] }],
    },
    Stage: env.stage,
    ...dims,
    [name]: value,
  }));
}
