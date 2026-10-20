import i18n from "./i18n";

/**
 * Maximum lengths of free-text inputs. They mirror the server-side zod limits (shared/schema.ts and the route
 * schemas), so a user is stopped at the input (maxLength) instead of getting a 400 after submitting.
 */
export const LIMITS = {
  postTitle: 300,
  postContent: 20000,
  comment: 10000,
  displayName: 50,
  bio: 160,
  location: 100,
  website: 200,
  chatMessage: 5000,
  communityName: 100,
  communityDescription: 1000,
  communityImageUrl: 2048,
  themeName: 60,
  ticketTitle: 200,
  ticketDescription: 10000,
  ticketComment: 5000,
  ticketUrl: 2048,
} as const;

/** Translated "<field> is required", using the same texts as server validation errors. */
export function requiredMessage(field: string): string {
  return i18n.t("server:validation.required", { field });
}

/** Translated "<field> can be at most <max> characters long". */
export function tooLongMessage(field: string, max: number): string {
  return i18n.t("server:validation.too_long", { field, max });
}

/** Translated "<field> must be at least <min> characters long". */
export function tooShortMessage(field: string, min: number): string {
  return i18n.t("server:validation.too_short", { field, min });
}

/** Translated "<field> is not a valid URL". */
export function invalidUrlMessage(field: string): string {
  return i18n.t("server:validation.invalid_url", { field });
}
