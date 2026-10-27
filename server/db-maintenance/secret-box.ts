// Encryption at rest for secret admin settings (e.g. email.smtp_password): AES-256-GCM with a key derived
// (HKDF-SHA256) from SESSION_SECRET, so the key never lives in the database. Stored format:
//   enc:v1:<iv base64url>.<auth tag base64url>.<ciphertext base64url>
// Values without the prefix are legacy clear text and are returned unchanged (and re-encrypted on startup).
// Changing SESSION_SECRET makes stored values unreadable: they then read as empty and must be entered again.
import crypto from "node:crypto";

const PREFIX = "enc:v1:";
const INFO = "open-verse admin_settings v1";
const SALT = "open-verse-settings";

function key(): Buffer | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return Buffer.from(crypto.hkdfSync("sha256", secret, SALT, INFO, 32));
}

export function isEncryptedSecret(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypts a value; "" stays "" (nothing to protect). Throws if SESSION_SECRET is missing. */
export function encryptSecret(plain: string): string {
  if (plain === "") return "";
  const k = key();
  if (!k) throw new Error("SESSION_SECRET is required to store secret settings");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
}

/** Decrypts a stored value; legacy clear text is returned as is; undecryptable values return null. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  if (!isEncryptedSecret(stored)) return stored;
  const k = key();
  if (!k) return null;
  try {
    const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(".");
    const decipher = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
