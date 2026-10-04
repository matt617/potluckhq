import type { Community, Membership, Recipe, UserProfile } from '@potluck/core';
import { forbidden, notFound } from './http.js';
import * as repo from './repo.js';

export async function requireMember(communityId: string, userId: string): Promise<{ community: Community; membership: Membership }> {
  const [community, membership] = await Promise.all([repo.getCommunity(communityId), repo.getMembership(communityId, userId)]);
  if (!community) throw notFound('Community not found');
  if (!membership) throw forbidden('You are not a member of this community');
  return { community, membership };
}

export async function requireAdmin(communityId: string, userId: string) {
  const r = await requireMember(communityId, userId);
  if (r.membership.role === 'member') throw forbidden('Only community admins can do that');
  return r;
}

/** The owner pays for a community: their tier sets limits and their budget funds AI. */
export async function payerFor(community: Community): Promise<UserProfile> {
  const owner = await repo.getUser(community.ownerId);
  if (!owner) throw notFound('Community owner not found');
  return owner;
}

/** A user can read a recipe they own or one shared into any community they belong to. */
export async function canReadRecipe(recipe: Recipe, userId: string): Promise<boolean> {
  if (recipe.ownerId === userId) return true;
  for (const cid of recipe.communityIds) {
    if (await repo.getMembership(cid, userId)) return true;
  }
  return false;
}
