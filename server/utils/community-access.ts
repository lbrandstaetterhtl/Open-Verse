import { storage } from "../storage";

const isStaff = (user: any) => user && (user.role === "owner" || user.role === "admin");

/**
 * Who may see content of a community: everyone for public ones; for private ones only members and site staff.
 * `communityId` null/undefined means "not in a community" → visible.
 */
export async function canViewCommunity(user: any, communityId: number | null | undefined): Promise<boolean> {
  if (!communityId) return true;
  const community = await storage.getCommunity(communityId);
  if (!community) return false;
  if (!community.isPrivate) return true;
  if (!user) return false;
  if (isStaff(user)) return true;
  return !!(await storage.getCommunityMember(communityId, user.id));
}

/** Who may post, comment or react in a community: members that are not banned (site staff always). */
export async function canParticipateInCommunity(user: any, communityId: number | null | undefined): Promise<boolean> {
  if (!communityId) return true;
  if (!user) return false;
  const community = await storage.getCommunity(communityId);
  if (!community) return false;
  if (isStaff(user)) return true;
  if (await storage.isUserBannedFromCommunity(communityId, user.id)) return false;
  return !!(await storage.getCommunityMember(communityId, user.id));
}

/** Ids of private communities the user may not see — for filtering lists. */
export async function hiddenCommunityIds(user: any): Promise<Set<number>> {
  if (isStaff(user)) return new Set();
  const memberOf = new Set<number>(user ? (await storage.getUserCommunities(user.id)).map((c: any) => c.id) : []);
  const hidden = new Set<number>();
  // Page through all communities (getCommunities is paginated)
  for (let offset = 0; ; offset += 500) {
    const page = (await storage.getCommunities({ limit: 500, offset })) as any[];
    for (const c of page) if (c.isPrivate && !memberOf.has(c.id)) hidden.add(c.id);
    if (page.length < 500) break;
  }
  return hidden;
}
