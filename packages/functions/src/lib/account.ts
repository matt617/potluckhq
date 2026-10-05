import { AdminDeleteUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { env } from './env.js';
import * as repo from './repo.js';
import { stripeApi } from './stripe.js';
import * as kr from './kitchen-repo.js';

const cognito = new CognitoIdentityProviderClient({});

/** Everything we hold about a user, for the "Download my data" button. */
export async function exportAccount(userId: string): Promise<Record<string, unknown>> {
  const [profile, channels, memberships, recipes, imports, ledger] = await Promise.all([
    repo.getUser(userId),
    repo.listUserChannels(userId),
    repo.listUserMemberships(userId),
    repo.listUserRecipes(userId),
    repo.listAllUserImports(userId),
    repo.listLedger(userId),
  ]);
  const communities = await Promise.all(
    memberships.map(async (m) => ({
      ...m,
      community: await repo.getCommunity(m.communityId),
      ...(await repo.exportKitchenPlansAndLists(m.communityId)),
      recipes: [...(await repo.batchGetRecipes((await repo.listCommunityRecipes(m.communityId)).map((r) => r.id))).values()],
    })),
  );
  const personalAnnotations = await kr.annotations(userId);
  const sharedContributions = await Promise.all(
    memberships.map(async (m) => ({
      communityId: m.communityId,
      diners: (await kr.diners(m.communityId)).filter((d) => d.userId === userId),
      activity: (await kr.activity(m.communityId)).filter((a) => a.actorId === userId),
    })),
  );
  return {
    exportedAt: new Date().toISOString(),
    service: 'Potluck (potluckhq.app)',
    profile,
    linkedChats: channels,
    communities,
    recipesYouAdded: recipes,
    personalAnnotations,
    sharedContributions,
    imports,
    aiUsage: ledger.map(({ pk, sk, ttl, ...rest }) => (void pk, void sk, void ttl, rest)),
  };
}

export interface DeletionSummary {
  communitiesDeleted: number;
  communitiesLeft: number;
  recipesDeleted: number;
  subscriptionCancelled: boolean;
}

/**
 * Permanently delete a user. Order matters: billing first so nobody is charged for a
 * deleted account, then shared data, then personal records, then the login itself.
 */
export async function deleteAccount(userId: string): Promise<DeletionSummary> {
  const user = await repo.getUser(userId);
  let subscriptionCancelled = false;
  if (user?.stripeSubscriptionId) {
    try {
      await stripeApi('DELETE', `subscriptions/${user.stripeSubscriptionId}`);
      subscriptionCancelled = true;
    } catch (err) {
      // An already-cancelled subscription is fine; anything else must stop the deletion.
      if (!/No such subscription|status of canceled/i.test(String(err))) throw err;
    }
  }

  let communitiesDeleted = 0;
  let communitiesLeft = 0;
  await kr.forgetContributions(userId);
  for (const m of await repo.listUserMemberships(userId)) {
    for (const d of await kr.diners(m.communityId)) if (d.userId === userId) await kr.removeRecord(`COMM#${m.communityId}`, `DINER#${d.id}`);
    for (const a of await kr.activity(m.communityId)) if (a.actorId === userId) await kr.removeRecord(`COMM#${m.communityId}`, `ACTIVITY#${a.id}`);
    const transfer = await kr.transfer(m.communityId);
    if (transfer?.to === userId || transfer?.from === userId) await kr.removeRecord(`COMM#${m.communityId}`, 'TRANSFER');
    if (m.role === 'owner') {
      const others = (await repo.listMembers(m.communityId)).filter((x) => x.userId !== userId);
      await repo.deleteCommunity(m.communityId);
      for (const o of others) {
        const p = await repo.getUser(o.userId);
        if (p?.defaultCommunityId === m.communityId) await repo.updateUser(o.userId, { defaultCommunityId: '' });
      }
      communitiesDeleted++;
    } else {
      await repo.removeMember(m.communityId, userId);
      communitiesLeft++;
    }
  }

  const recipes = await repo.listUserRecipes(userId);
  for (const r of recipes) {
    await repo.deleteRecipe(r);
  }

  for (const c of await repo.listUserChannels(userId)) await repo.deleteChannel(c.kind, c.address);
  await repo.purgeUserRecords(userId, user?.stripeCustomerId);

  if (env.userPoolId) {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: env.userPoolId, Username: userId })).catch((err) => {
      if ((err as { name?: string }).name !== 'UserNotFoundException') throw err;
    });
  }
  return { communitiesDeleted, communitiesLeft, recipesDeleted: recipes.length, subscriptionCancelled };
}
