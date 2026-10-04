import { createHmac, timingSafeEqual } from 'node:crypto';
import type { TierId } from '@potluck/core';
import { secrets } from './secrets.js';

/** Encode nested params the way Stripe's form API expects: a[b][0][c]=v. */
export function formEncode(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => {
      if (item && typeof item === 'object') out.push(...formEncode(item as Record<string, unknown>, `${key}[${i}]`));
      else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
    });
    else if (typeof v === 'object') out.push(...formEncode(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export async function stripeApi<T>(method: 'GET' | 'POST', path: string, params?: Record<string, unknown>): Promise<T> {
  const key = (await secrets())['stripe-secret-key'];
  if (!key) throw new Error('Stripe is not configured');
  const body = params ? formEncode(params).join('&') : undefined;
  const res = await fetch(`https://api.stripe.com/v1/${path}${method === 'GET' && body ? `?${body}` : ''}`, {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: method === 'POST' ? body : undefined,
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${json.error?.message ?? 'unknown error'}`);
  return json;
}

/** Verify the Stripe-Signature header (v1 scheme) with a 5 minute tolerance. */
export function verifyStripeSignature(rawBody: string, header: string | undefined, secret: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('=') as [string, string]);
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(nowSec - Number(t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

export async function tierForPrice(priceId: string | undefined): Promise<TierId | undefined> {
  if (!priceId) return undefined;
  const s = await secrets();
  if (priceId === s['stripe-price-plus']) return 'plus';
  if (priceId === s['stripe-price-pro']) return 'pro';
  return undefined;
}

export async function priceForTier(tier: 'plus' | 'pro'): Promise<string | undefined> {
  const s = await secrets();
  return tier === 'plus' ? s['stripe-price-plus'] : s['stripe-price-pro'];
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  metadata?: Record<string, string>;
  items: { data: { price: { id: string } }[] };
}

export interface StripeCheckoutSession {
  id: string;
  mode: 'subscription' | 'payment';
  customer?: string | null;
  subscription?: string | null;
  client_reference_id?: string | null;
  payment_status?: string;
  metadata?: Record<string, string>;
}
