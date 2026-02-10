# Security Hardening Guide

## 1. Content Security Policy (CSP) Improvement
**Priority:** High
**Effort:** Low
Remove `'unsafe-inline'` from the CSP. This requires moving any inline scripts to external files or using a Nonce system. This is the single most effective mitigation against XSS.

## 2. Secure Cookie Attributes
**Priority:** Medium
**Effort:** Low
Ensure cookies are set with `Secure`, `HttpOnly`, and `SameSite: Strict` (or Lax).
Current config has `SameSite: 'lax'`, which is decent, but `Strict` is better for critical applications.
`Secure` is currently set based on `NODE_ENV === 'production'`. Ensure production is always HTTPS.

## 3. Rate Limiting Granularity
**Priority:** Medium
**Effort:** Medium
The current rate limiter (100 req / 15 min) is per IP. Consider implementing user-based rate limiting for authenticated routes to prevent compromised accounts from abusing the API.

## 4. Input Validation strictness
**Priority:** Low
**Effort:** Medium
Zod schemas are used, which is excellent. Ensure `strip()` is used to remove unknown keys (default in Zod, but explicit `strict()` is safer).

## 5. Security Headers
**Priority:** Low
**Effort:** Low
Add `HSTS` (HTTP Strict Transport Security) header in production (`helmet` can do this).
Add `X-Content-Type-Options: nosniff` (Helmet enables this by default).

## 6. Dependency Scanning
**Priority:** Medium
**Effort:** Low
Integrate `npm audit` into the build/CI pipeline to catch vulnerable dependencies (like `verify_output.txt` references or old packages).
