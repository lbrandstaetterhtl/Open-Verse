# Proof of Concept Runbook

## SEC-001: Stored XSS via File Upload

**Purpose:** Demonstrate that a file with `.html` contents can be uploaded as `image/jpeg` and executed by the browser.
**Script:** `poc/SEC-001.sh`
**Environment Variables:**
-   `TARGET_URL`: Base URL of the application (default: http://localhost:5000)
-   `AUTH_COOKIE`: A valid `connect.sid` cookie from an authenticated session.

**Steps:**
1.  Login to the application manually.
2.  Copy the `connect.sid` cookie value.
3.  Run: `./poc/SEC-001.sh`
4.  Observe the output URL.
5.  Open the URL in a browser. Alert box "XSS" should appear.

## SEC-002: Admin Password Leak

**Purpose:** Show that admin API returns password hashes.
**Script:** Manual verification via `curl`.
**Command:**
```bash
curl -H "Cookie: connect.sid=ADMIN_COOKIE" http://localhost:5000/api/admin/users
```
**Expected Output:** JSON response containing `"password": "..."` fields.

## SEC-003: Banned User Persistence

**Purpose:** Verify a banned user can still access API.
**Script:** Manual verification.
**Steps:**
1.  Login as User A. Keep session open.
2.  Login as Admin in incognito.
3.  Set User A karma to -100 (Ban).
4.  User A (in original session) makes a request (e.g., `POST /api/posts`).
5.  **Expected:** Request succeeds (Status 201).
6.  **Fixed Behavior:** Request fails (Status 401/403).
