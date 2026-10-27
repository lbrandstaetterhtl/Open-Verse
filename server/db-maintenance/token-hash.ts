// Bearer tokens (email verification) are stored only as SHA-256 hashes: a database dump or backup does not
// contain a usable token. The clear-text token exists only in the email link.
//   create: storage.createVerificationToken({ token: hashToken(token), userId, expiresAt }) and mail `token`
//   verify: storage.getVerificationToken(hashToken(tokenFromLink)), check expiresAt, then delete it
// The token has 256 random bits, so a fast unsalted hash is sufficient (no guessing, no rainbow tables).
import crypto from "node:crypto";

const HASH_FORMAT = /^[a-f0-9]{64}$/;

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of a token from a link with a stored hash. */
export function tokenMatchesHash(token: string, storedHash: string): boolean {
  if (!HASH_FORMAT.test(storedHash)) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
