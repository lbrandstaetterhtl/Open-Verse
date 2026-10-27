/**
 * What other people may see about a user. Everything not listed here (email, password hash, moderation
 * state like shadow ban / freeze, admin group, email verification, the legacy isAdmin flag) stays on the
 * server or in admin views. "role" stays: the UI shows the owner badge and decides who may delete content.
 */
const PUBLIC_FIELDS = [
  "id", "username", "displayName", "bio", "avatarUrl", "profilePictureUrl", "coverUrl", "location", "website",
  "role", "verified", "karma", "isPrivate", "createdAt",
] as const;

export type PublicUser = Partial<Record<(typeof PUBLIC_FIELDS)[number], unknown>>;

export function toPublicUser<T extends Record<string, any> | null | undefined>(user: T): PublicUser | null {
  if (!user) return null;
  const out: PublicUser = {};
  for (const f of PUBLIC_FIELDS) if (f in user) out[f] = (user as any)[f];
  return out;
}

/** The logged-in user's own account: public fields plus their email and email status, still no moderation internals. */
export function toSelfUser<T extends Record<string, any> | null | undefined>(user: T) {
  if (!user) return null;
  return {
    ...toPublicUser(user),
    email: (user as any).email,
    emailVerified: (user as any).emailVerified,
    isFrozen: (user as any).isFrozen,
    frozenUntil: (user as any).frozenUntil,
    adminGroupId: (user as any).adminGroupId,
    adminGroup: (user as any).adminGroup,
  };
}
