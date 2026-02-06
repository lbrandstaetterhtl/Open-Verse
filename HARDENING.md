
# Hardening Guide

## 1. Content Security Policy (CSP)
**Effort:** Low | **Impact:** High
Enable CSP to mitigate XSS.
*Action:* Remove `contentSecurityPolicy: false` in `server/routes.ts` and configure safe directives.

## 2. Rate Limiting (Global)
**Effort:** Low | **Impact:** Medium
Apply a global rate limiter to all API routes, not just auth.
*Action:* Add `app.use("/api", rateLimit({ windowMs: 15*60*1000, max: 100 }));` in `server/auth.ts` or `index.ts`.

## 3. Upload Limits
**Effort:** Very Low | **Impact:** Medium
Reduce file upload size from 50MB to 10MB to prevent disk exhaustion.
*Action:* Update `limits: { fileSize: 50 * ... }` in `server/routes.ts` to `10 * 1024 * 1024`.

## 4. CSRF Protection
**Effort:** Medium | **Impact:** High
Implement CSRF protection.
*Action:*
1. Add `csurf` or `tiny-csrf` (or custom logic).
2. expose a `/api/csrf-token` endpoint.
3. Client fetches token and includes it in `X-CSRF-Token` header for all mutation requests (`POST`, `PUT`, `DELETE`, `PATCH`).

## 5. Cookie Security
**Effort:** Low | **Impact:** Low
Ensure `secure: true` is set for cookies even in dev if using localhost with HTTPS, or strictly enforced in prod.
*Action:* Verify `process.env.NODE_ENV === 'production'` logic in `server/routes.ts` session config.
