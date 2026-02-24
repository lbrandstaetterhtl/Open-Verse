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

export function checkContent(text: string): { allowed: boolean; reason?: string } {
  const lowerText = text.toLowerCase();

  for (const word of BANNED_WORDS) {
    // Check for whole words or words within text (simplified for now)
    if (lowerText.includes(word)) {
      return { allowed: false, reason: "Content violates community guidelines." };
    }
  }

  return { allowed: true };
}
