export const BANNED_WORDS = [
  // English - NSFW
  "porn",
  "sex",
  "nude",
  "naked",
  "xxx",
  "erotic",
  "hentai",
  "fuck",
  "dick",
  "pussy",
  "vagina",
  "penis",
  "sexual",
  "incest",
  // German - NSFW
  "porno",
  "sex",
  "nackt",
  "gefickt",
  "schwanz",
  "muschi",
  "ficken",
  "hure",
  "nutte",
  "fotze",
  "wichser",
  "arschloch",
  // Hate Speech / Violence (Basic list)
  "nazi",
  "hitler",
  "kill",
  "suicide",
  "murder",
  "mord",
  "töten",
  "selbstmord",
];

import { SettingsService } from "./settings";

// Ordinary words that start with a banned word (the filter matches word starts, see checkContent).
const ALLOWED_WORDS = [
  "dickens", "dickinson", "dickerson", "dickey", "sextant", "sextet", "sexton", "sextillion", "mordor", "morden",
  "mordecai", "killarney", "killian",
];

// Letters from other scripts that look like Latin ones (Cyrillic, Greek) — used to disguise banned words.
const HOMOGLYPHS: Record<string, string> = {
  "а": "a", "в": "b", "е": "e", "ё": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "с": "c", "т": "t",
  "у": "y", "х": "x", "ѕ": "s", "і": "i", "ї": "i", "ј": "j", "ԁ": "d", "ӏ": "l", "һ": "h", "ԛ": "q", "ԝ": "w",
  "α": "a", "β": "b", "ε": "e", "η": "n", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "υ": "u",
  "χ": "x", "ɡ": "g", "ı": "i",
};
const COMBINING_RE = new RegExp("\\p{M}+", "gu");
const NON_WORD_RE = new RegExp("[^\\p{L}\\p{N}]+", "u");
const HOMOGLYPH_RE = new RegExp(`[${Object.keys(HOMOGLYPHS).join("")}]`, "g");
// Invisible characters that can be put between letters: soft hyphen, zero-width space/joiners, word joiner, BOM …
const INVISIBLE_RE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g;

/**
 * Brings text into one comparable form: compatibility forms (fullwidth, ligatures) folded by NFKC, accents and
 * invisible characters removed, lower case, look-alike letters mapped to Latin.
 */
export function normalizeForModeration(text: string): string {
  return text
    .normalize("NFKC")
    .replace(INVISIBLE_RE, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_RE, "")
    .replace(HOMOGLYPH_RE, (c) => HOMOGLYPHS[c] ?? c);
}

const NORMALIZED_BANNED = Array.from(new Set(BANNED_WORDS.map(normalizeForModeration)));
const NORMALIZED_ALLOWED = ALLOWED_WORDS.map(normalizeForModeration);

/** The first banned word found in the text, or null. A word counts when a word of the text starts with it. */
export function findBannedWord(text: string): string | null {
  const words = normalizeForModeration(text).split(NON_WORD_RE);
  for (const word of words) {
    if (!word) continue;
    for (const banned of NORMALIZED_BANNED) {
      // Word starts only: "skills" (kill) and "Essex" (sex) are fine, "killer" and "sexy" are not.
      if (word.startsWith(banned) && !NORMALIZED_ALLOWED.some((a) => word.startsWith(a))) return banned;
    }
  }
  return null;
}

export async function checkContent(text: string): Promise<{ allowed: boolean; reason?: string }> {
  const isEnabled = await SettingsService.get("content", "profanity_filter_enabled", true);
  if (!isEnabled) return { allowed: true };

  if (findBannedWord(text)) {
    return { allowed: false, reason: "Content violates community guidelines." };
  }

  return { allowed: true };
}
