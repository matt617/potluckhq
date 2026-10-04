import type { TierId, UserProfile } from './types.js';
import { tierConfig } from './tiers.js';

/**
 * Models users may run. Only cheap, fast models are allowed; anything else is rejected
 * server-side regardless of configuration. Prices are USD per 1M tokens.
 */
export interface ModelPrice {
  inputPerM: number;
  outputPerM: number;
}

export const ALLOWED_MODELS: Record<string, ModelPrice> = {
  'gemini-flash-lite-latest': { inputPerM: 0.1, outputPerM: 0.4 },
  'gemini-2.5-flash-lite': { inputPerM: 0.1, outputPerM: 0.4 },
  'gemini-2.0-flash-lite': { inputPerM: 0.075, outputPerM: 0.3 },
  'gemini-flash-latest': { inputPerM: 0.3, outputPerM: 2.5 },
  'gemini-2.5-flash': { inputPerM: 0.3, outputPerM: 2.5 },
};

export const DEFAULT_MODEL = 'gemini-flash-lite-latest';

export function assertAllowedModel(model: string): ModelPrice {
  const price = ALLOWED_MODELS[model];
  if (!price) throw new Error(`Model ${model} is not on the cheap-model allowlist`);
  return price;
}

export interface TokenUsage {
  promptTokens: number;
  outputTokens: number;
}

/** Cost of a call in micro-USD, rounded up so we never under-bill. */
export function costMicros(model: string, usage: TokenUsage): number {
  const p = assertAllowedModel(model);
  const usd = (usage.promptTokens * p.inputPerM + usage.outputTokens * p.outputPerM) / 1_000_000;
  return Math.ceil(usd * 1_000_000);
}

export function monthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

/** Usage counters reset lazily when the stored month differs from the current one. */
export function currentUsage(user: Pick<UserProfile, 'usageMonth' | 'aiUsedMicros' | 'importsUsed'>, now = new Date()) {
  const month = monthKey(now);
  if (user.usageMonth !== month) return { month, aiUsedMicros: 0, importsUsed: 0 };
  return { month, aiUsedMicros: user.aiUsedMicros ?? 0, importsUsed: user.importsUsed ?? 0 };
}

export type AiGate =
  | { ok: true; fromAllowanceMicros: number; fromCreditsMicros: number }
  | { ok: false; reason: 'tier' | 'allowance_exhausted' | 'import_quota' };

/** Minimum headroom required before starting a generative call. */
export const MIN_HEADROOM_MICROS = 5_000;

export interface Budget {
  tier: TierId;
  allowanceLeftMicros: number;
  creditMicros: number;
  importsLeft: number;
  aiFeatures: boolean;
}

export function budgetFor(user: UserProfile, now = new Date()): Budget {
  const t = tierConfig(user.tier);
  const u = currentUsage(user, now);
  return {
    tier: t.id,
    allowanceLeftMicros: Math.max(0, t.aiAllowanceMicros - u.aiUsedMicros),
    creditMicros: Math.max(0, user.aiCreditMicros ?? 0),
    importsLeft: Math.max(0, t.importsPerMonth - u.importsUsed),
    aiFeatures: t.aiFeatures,
  };
}

/** Whether a generative planning feature may run for this payer. */
export function canUseAiFeatures(b: Budget): AiGate {
  if (!b.aiFeatures) return { ok: false, reason: 'tier' };
  if (b.allowanceLeftMicros + b.creditMicros < MIN_HEADROOM_MICROS) return { ok: false, reason: 'allowance_exhausted' };
  return { ok: true, fromAllowanceMicros: 0, fromCreditsMicros: 0 };
}

/**
 * Whether a recipe import may run. Free users get a fixed number of imports that the
 * platform absorbs. Paid users are bounded by both the import cap and their AI dollars.
 */
export function canImport(b: Budget): AiGate {
  if (b.importsLeft <= 0) return { ok: false, reason: 'import_quota' };
  if (b.aiFeatures && b.allowanceLeftMicros + b.creditMicros < MIN_HEADROOM_MICROS) {
    return { ok: false, reason: 'allowance_exhausted' };
  }
  return { ok: true, fromAllowanceMicros: 0, fromCreditsMicros: 0 };
}

/** Split a charge between the monthly allowance and purchased credits, allowance first. */
export function splitCharge(b: Budget, micros: number): { fromAllowanceMicros: number; fromCreditsMicros: number } {
  const fromAllowance = Math.min(b.allowanceLeftMicros, micros);
  return { fromAllowanceMicros: fromAllowance, fromCreditsMicros: micros - fromAllowance };
}

export function formatUsd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}
