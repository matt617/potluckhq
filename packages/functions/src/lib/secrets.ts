import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { env } from './env.js';

export interface Secrets {
  'gemini-api-key'?: string;
  'telegram-bot-token'?: string;
  'telegram-webhook-secret'?: string;
  'telegram-bot-username'?: string;
  'whatsapp-token'?: string;
  'whatsapp-phone-number-id'?: string;
  'whatsapp-app-secret'?: string;
  'whatsapp-verify-token'?: string;
  'whatsapp-number'?: string;
  'stripe-secret-key'?: string;
  'stripe-webhook-secret'?: string;
  'stripe-price-plus'?: string;
  'stripe-price-pro'?: string;
  /** Optional proxy URLs for video downloads, one per line. Credentials go in the URL. */
  'download-proxies'?: string;
}

const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; value: Promise<Secrets> } | null = null;
let override: Secrets | null = null;
const ssm = new SSMClient({});

async function load(): Promise<Secrets> {
  const out: Record<string, string> = {};
  const path = env.paramPrefix.replace(/\/+$/, '');
  let NextToken: string | undefined;
  do {
    const res = await ssm.send(new GetParametersByPathCommand({ Path: path, Recursive: true, WithDecryption: true, NextToken }));
    for (const p of res.Parameters ?? []) {
      if (p.Name && p.Value !== undefined) out[p.Name.slice(path.length + 1)] = p.Value;
    }
    NextToken = res.NextToken;
  } while (NextToken);
  return out as Secrets;
}

/** All SSM parameters under PARAM_PREFIX, cached for five minutes per container. */
export async function secrets(): Promise<Secrets> {
  if (override) return override;
  if (!cached || Date.now() - cached.at > TTL_MS) {
    const value = load().catch((err) => {
      cached = null;
      throw err;
    });
    cached = { at: Date.now(), value };
  }
  return cached.value;
}

export function setSecretsForTest(s: Secrets | null) {
  override = s;
}
