import bcrypt from "bcrypt";
import { createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const COST = 12;

/**
 * bcrypt only looks at the first 72 bytes of its input, so long passwords that share a 72-byte prefix would be
 * interchangeable. New hashes therefore hash a SHA-256 digest of the full password (base64, 44 bytes) and are
 * stored with this prefix. Plain "$2b$…" hashes from older versions (and scripts) are still accepted.
 */
const PREFIX = "$sha256-bcrypt$";

const prehash = (password: string) => createHash("sha256").update(password, "utf8").digest("base64");

export async function hashPassword(password: string): Promise<string> {
  return PREFIX + (await bcrypt.hash(prehash(password), COST));
}

export type PasswordCheck = { isValid: boolean; needsRehash: boolean };

export async function verifyPassword(supplied: string, stored: string | null | undefined): Promise<PasswordCheck> {
  if (typeof supplied !== "string" || !stored) return { isValid: false, needsRehash: false };
  try {
    if (stored.startsWith(PREFIX)) {
      return { isValid: await bcrypt.compare(prehash(supplied), stored.slice(PREFIX.length)), needsRehash: false };
    }
    if (/^\$2[aby]\$/.test(stored)) {
      const isValid = await bcrypt.compare(supplied, stored);
      // Only re-hash when bcrypt saw the whole password: for a longer one we cannot know whether the supplied
      // text is the real password or just shares its first 72 bytes.
      return { isValid, needsRehash: isValid && Buffer.byteLength(supplied, "utf8") <= 72 };
    }
    // Legacy scrypt "hash.salt"
    const [hashed, salt] = stored.split(".");
    if (!hashed || !salt) return { isValid: false, needsRehash: false };
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    const isValid = hashedBuf.length === suppliedBuf.length && timingSafeEqual(hashedBuf, suppliedBuf);
    return { isValid, needsRehash: isValid };
  } catch {
    return { isValid: false, needsRehash: false };
  }
}

/** Dummy hash so a login for an unknown user costs as much as a wrong password (no timing oracle). */
const DUMMY_HASH = PREFIX + bcrypt.hashSync(prehash("osiris-dummy-password"), COST);
export async function burnPasswordCheck(supplied: unknown): Promise<void> {
  await verifyPassword(typeof supplied === "string" ? supplied : "", DUMMY_HASH);
}

/**
 * Short fingerprint of the stored hash. Sessions remember it at login; when the password changes the hash
 * changes and every older session stops being accepted.
 */
export function passwordStamp(stored: string | null | undefined): string {
  return createHash("sha256").update(String(stored ?? "")).digest("hex").slice(0, 24);
}
