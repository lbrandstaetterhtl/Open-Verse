import type { Response } from "express";
import type { ZodError, ZodIssue } from "zod";
import { logger } from "../logger";

/**
 * Error responses the browser can translate. Every error body has an English `error` text (looked up in
 * client/public/locales/<lang>/server.json); messages with variable parts or several problems add a `code`
 * (and `params` / `issues`) that the client turns into a sentence in the UI language.
 */

type IssueOut = {
  path: string;
  code: string;
  minimum?: number;
  maximum?: number;
  type?: string;
  validation?: string;
  received?: string;
  options?: string[];
  /** zod's English text: "Required" or a custom schema message (translated in server.json) */
  message?: string;
};

const toIssue = (i: ZodIssue): IssueOut => {
  const out: IssueOut = { path: i.path.join("."), code: i.code, message: i.message };
  const any = i as any;
  if (typeof any.minimum === "number" || typeof any.minimum === "bigint") out.minimum = Number(any.minimum);
  if (typeof any.maximum === "number" || typeof any.maximum === "bigint") out.maximum = Number(any.maximum);
  if (typeof any.type === "string") out.type = any.type;
  if (typeof any.validation === "string") out.validation = any.validation;
  if (typeof any.received === "string") out.received = any.received;
  if (Array.isArray(any.options)) out.options = any.options.map(String).slice(0, 20);
  return out;
};

/** 400 for a failed zod validation: { error, code: "VALIDATION_ERROR", issues: [{ path, code, minimum, … }] }. */
export function sendValidationError(res: Response, error: ZodError) {
  return res.status(400).json({ error: "Invalid input", code: "VALIDATION_ERROR", issues: error.issues.slice(0, 10).map(toIssue) });
}

/** 500 without internal details (database errors, stack traces) — the cause only goes to the log. */
export function sendInternalError(res: Response, err: unknown, context: string) {
  logger.error("system", context, err instanceof Error ? err : new Error(String(err)));
  if (res.headersSent) return;
  return res.status(500).json({ error: "Internal server error" });
}

export const isZodError = (e: unknown): e is ZodError =>
  !!e && typeof e === "object" && (e as any).name === "ZodError" && Array.isArray((e as any).issues);
