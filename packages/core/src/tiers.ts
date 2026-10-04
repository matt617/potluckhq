import type { TierId } from './types.js';

export interface TierConfig {
  id: TierId;
  name: string;
  /** Monthly price in US cents. */
  priceCents: number;
  maxCommunities: number;
  /** Members per community, owner included. */
  maxMembersPerCommunity: number;
  /** Hard cap on recipe imports per month, a safety net on top of AI dollars. */
  importsPerMonth: number;
  /** Planning, suggestions and other generative features. */
  aiFeatures: boolean;
  /** Raw model spend included per month, in micro-USD (1 USD = 1,000,000). */
  aiAllowanceMicros: number;
}

export const TIERS: Record<TierId, TierConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    priceCents: 0,
    maxCommunities: 1,
    maxMembersPerCommunity: 2,
    importsPerMonth: 15,
    aiFeatures: false,
    aiAllowanceMicros: 0,
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    priceCents: 400,
    maxCommunities: 3,
    maxMembersPerCommunity: 6,
    importsPerMonth: 300,
    aiFeatures: true,
    aiAllowanceMicros: 2_000_000,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceCents: 900,
    maxCommunities: 10,
    maxMembersPerCommunity: 20,
    importsPerMonth: 1000,
    aiFeatures: true,
    aiAllowanceMicros: 2_000_000,
  },
};

export const TIER_ORDER: TierId[] = ['free', 'plus', 'pro'];

/** Credit packs sold once the monthly allowance is spent. */
export interface CreditPack {
  id: string;
  priceCents: number;
  /** Raw model spend the pack covers, in micro-USD. */
  creditMicros: number;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'credits_5', priceCents: 500, creditMicros: 2_500_000 },
  { id: 'credits_10', priceCents: 1000, creditMicros: 5_500_000 },
];

export function defaultTier(): TierConfig {
  return TIERS.free;
}

export function tierConfig(tier: TierId | undefined): TierConfig {
  return TIERS[tier ?? 'free'] ?? TIERS.free;
}
