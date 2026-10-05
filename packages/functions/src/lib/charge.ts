import { budgetFor, costMicros, splitCharge, tierConfig, type TokenUsage, type UserProfile } from '@potluck/core';
import { emitMetric } from './metrics.js';
import * as repo from './repo.js';

/**
 * Bill a model call to the paying user. Free-tier imports are absorbed by the platform
 * (tracked, never debited from credits). Paid usage draws the monthly allowance first,
 * then purchased credits.
 */
export async function chargeAi(payer: UserProfile, args: { model: string; usage: TokenUsage; kind: 'import' | 'plan'; ref?: string; actorId?: string; countImport?: boolean }): Promise<number> {
  const micros = costMicros(args.model, args.usage);
  const tier = tierConfig(payer.tier);
  const budget = budgetFor(payer);
  const { fromCreditsMicros } = tier.aiFeatures ? splitCharge(budget, micros) : { fromCreditsMicros: 0 };
  emitMetric('AiCostMicros', micros, 'None', { Kind: args.kind });
  await repo.recordUsage(payer.id, { aiMicros: micros, imports: args.countImport ? 1 : 0, creditMicros: fromCreditsMicros });
  await repo.addLedger(payer.id, {
    kind: tier.aiFeatures ? args.kind : `${args.kind}:platform`,
    micros,
    model: args.model,
    promptTokens: args.usage.promptTokens,
    outputTokens: args.usage.outputTokens,
    ref: args.ref,
    actorId: args.actorId,
  });
  return micros;
}
