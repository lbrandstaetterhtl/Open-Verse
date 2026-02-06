
# Vulnerability Report

## SEC-001: Password Hash Leak in Public API

- **Status:** VALIDATED
- **Severity:** CRITICAL
- **Risk:** High (Likelihood: Certain × Impact: Critical)
- **Category:** Sensitive Data Exposure
- **Affected Code:** `server/routes.ts:235` (GET /api/posts/:id)
- **Description:** 
  The endpoint `GET /api/posts/:id` retrieves a post and its author using `storage.getUser`. In the SQLite implementation, `storage.getUser` returns the raw user row, including the `password` field (which contains the scrypt hash). This user object is spread directly into the JSON response without sanitization.
- **Exploit Scenario:**
  1. Attacker queries `GET /api/posts`.
  2. Attacker gets a list of Post IDs.
  3. Attacker queries `GET /api/posts/{id}` for each ID.
  4. Response JSON contains `author: { username: "...", password: "..." }`.
  5. Attacker compiles a database of username/hash pairs and cracks them offline.
- **Remediation:**
  Ensure `sanitizeUser` is called on the author object before responding, or modify `storage.getUser` (if safe for internal use) to assume safe defaults. Recommended fix is to patch the route handler.

## SEC-002: Missing CSRF Protection

- **Status:** VERIFIED
- **Severity:** HIGH
- **Risk:** High (Likelihood: High × Impact: Medium)
- **Category:** Broken Access Control
- **Affected Code:** Entire Application (`server/index.ts`, `server/routes.ts`)
- **Description:**
  The application uses cookie-based sessions (`express-session`) but implements no Anti-CSRF mechanism (like `csurf` or Double-Submit Cookie).
- **Exploit Scenario:**
  Attacker convinces an authenticated Admin to visit a malicious site. The site submits a hidden form to `POST /api/admin/users/1` with `verified: false`. The browser sends the session cookie automatically, and the server processes the request.
- **Remediation:**
  Implement a CSRF protection middleware or use the `SameSite` attribute strictly (currently `lax`, which is good but not a complete replacement for state-changing operations in older browsers or specific top-level navigation scenarios). Using a Double-Submit Cookie pattern is recommended for SPAs.

## SEC-003: Content Security Policy Disabled

- **Status:** VERIFIED
- **Severity:** MEDIUM
- **Risk:** Medium
- **Category:** Security Misconfiguration
- **Affected Code:** `server/routes.ts:71`
- **Description:**
  `helmet` is configured with `contentSecurityPolicy: false`.
- **Exploit Scenario:**
  If an XSS vulnerability is found (e.g., in `innerHTML` usage in React, though React allows safe defaults), the browser will execute the script because no CSP prohibits it.
- **Remediation:**
  Enable CSP and configure it to allow only necessary scripts (e.g., `self` and specific CDNs).

## SEC-004: Inconsistent Profile Update Logic

- **Status:** VERIFIED
- **Severity:** LOW
- **Risk:** Low
- **Category:** Logic Error
- **Affected Code:** `server/routes.ts:686` and `server/auth.ts:245`
- **Description:**
  Two different endpoints (`PATCH /api/profile`) exist. One in `routes.ts` allows updating `username`/`email` without uniqueness checks. The other in `auth.ts` includes checks.
- **Remediation:**
  Remove the duplicate route in `server/routes.ts` or merge logic to ensure validation consistency.

## SEC-005: Unrestricted File Upload Size (DoS)

- **Status:** VERIFIED
- **Severity:** MEDIUM
- **Risk:** Low (requires authenticated user)
- **Category:** Denial of Service
- **Affected Code:** `server/routes.ts:123`
- **Description:**
  `postUpload` allows files up to 50MB. While type is restricted, size is large.
- **Remediation:**
  Reduce limit to 10MB or 20MB unless 50MB is a strict business requirement.

## Appendix: Findings Log
- **SEC-001 (CRITICAL):** Validated. Leaks password hash.
- **SEC-002 (HIGH):** Verified. No CSRF logic found.
- **SEC-003 (MEDIUM):** Verified. `contentSecurityPolicy: false` in code.
- **SEC-004 (LOW):** Verified. Duplicate routes found.
- **SEC-005 (MEDIUM):** Verified. 50MB limit is high.
- **SEC-006 (UNVERIFIED):** `getReports` API. Logic seems to only return IDs in SQLite mode, meaning strictly no leak, but functional bug. Not a security vulnerability but a quality issue.
