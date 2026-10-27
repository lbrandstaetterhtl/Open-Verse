import { z } from "zod";
import { parseId } from "./params";

/**
 * Small zod building blocks for the admin, ticket and theme routes. Postgres rejects text containing
 * NUL characters, and int4 columns overflow above 2^31-1 — both used to end in a 500.
 */

const NO_NUL = (s: string) => !s.includes("\u0000");

/** Trimmed text between `min` and `max` characters without NUL characters. */
export const text = (max: number, min = 0) =>
  z.string().trim().min(min).max(max).refine(NO_NUL, { message: "Invalid characters" });

/** Optional text where "" and null mean "no value" (stored as null). */
export const optionalText = (max: number) =>
  z.union([text(max), z.null()]).optional().transform((v) => (v === "" ? null : v));

/** A database id: a positive integer (or its decimal string) that fits an int4 column. */
export const dbId = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const id = parseId(v);
  if (id === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid id" });
    return z.NEVER;
  }
  return id;
});

/** Boolean flags stored as 0/1 integers: accepts true/false/0/1 only. */
export const flag = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => (v === true || v === 1 ? 1 : 0));

/** http(s) URL (the only schemes that may be rendered as links), "" / null = none. */
export const httpUrl = (max = 2048) =>
  z
    .union([
      z
        .string()
        .trim()
        .max(max)
        .refine((s) => s === "" || (/^https?:\/\//i.test(s) && URL.canParse(s) && /^https?:$/.test(new URL(s).protocol)), {
          message: "Only http(s) links are allowed",
        }),
      z.null(),
    ])
    .optional()
    .transform((v) => (v ? v : null));

/** An ISO date string (or null) inside the range a timestamp column and the UI can handle. */
export const isoDate = z.string().max(40).transform((s, ctx) => {
  const d = new Date(s);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1970 || d.getUTCFullYear() > 9999) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
    return z.NEVER;
  }
  return d;
});

/** Plain-object body check: arrays, strings, numbers and null are not a valid JSON body. */
export const isPlainBody = (body: unknown): body is Record<string, unknown> =>
  !!body && typeof body === "object" && !Array.isArray(body);

/**
 * A single query-string value: undefined when absent, the string when it is one, and `false` when it
 * is malformed (array from ?a=1&a=2, object from ?a[b]=1, or longer than `max`).
 */
export function queryString(value: unknown, max = 200): string | undefined | false {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.length > max || value.includes("\u0000")) return false;
  return value;
}

/** Positive integer from the query within [min, max]; `fallback` when absent, null when malformed. */
export function queryInt(value: unknown, fallback: number, min: number, max: number): number | null {
  if (value === undefined || value === "") return fallback;
  if (typeof value !== "string" || !/^\d{1,10}$/.test(value)) return null;
  const n = Number(value);
  return n < min || n > max ? null : n;
}
