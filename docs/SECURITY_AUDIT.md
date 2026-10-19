# Sicherheits- und Funktions-Audit

Stand: 2026-10-19. Geprüft wurde jede API-Route (automatisch aus dem Code ermittelt), jedes Formular der Oberfläche und – in einer zweiten Runde – gezielte **Angriffsszenarien**: Ein Angreifer verfolgt ein Ziel (Konto übernehmen, Admin werden, fremde Daten lesen, Code im Browser eines Opfers ausführen, den Server lahmlegen) und verkettet dafür mehrere Schritte.

Jeder Test prüft das **sichere** Verhalten. Ein fehlschlagender Test ist ein nachgewiesener Befund und wird grün, sobald der Befund behoben ist.

## Testsuiten

| Datei | Bereich | Tests | Fehlgeschlagen vorher | Fehlgeschlagen nachher |
|---|---|---|---|---|
| `tests/e2e/api.test.ts` | Funktionstests aller Hauptfunktionen | 128 | 0 | – |
| `tests/e2e/auth-account.test.ts` | Registrierung, Login, Sitzungen, Profil, Passwort | 82 | 30 | – |
| `tests/e2e/authz.test.ts` | Zugriffsrechte jeder Route (anonym, Benutzer, jede Admin-Berechtigung, Owner, CSRF, fremde Objekte, kaputte IDs) | 376 | 80 | – |
| `tests/e2e/content.test.ts` | Beiträge, Kommentare, Reaktionen, Meldungen, Feeds, Suche, Uploads | 129 | 55 | – |
| `tests/e2e/social.test.ts` | Folgen, Nachrichten, Benachrichtigungen, Communities, WebSocket | 105 | 37 | – |
| `tests/e2e/input-fuzz.test.ts` | Jede schreibende Route und jeder Query-Parameter mit kaputten, riesigen und bösartigen Eingaben | 189 | 76 | – |
| `tests/attacks/auth.attack.test.ts` | Angriffe: Brute Force, Konto-Übernahme, Sitzungen, CSRF, CORS, Sperren umgehen | 40 | 25 | – |
| `tests/attacks/authz.attack.test.ts` | Angriffe: Rechteausweitung, fremde Daten (IDOR), private Communities, Shadow-Bans | 43 | 18 | – |
| `tests/attacks/inject.attack.test.ts` | Angriffe: SQL, Typ-Verwirrung, Prototype Pollution, ReDoS, riesige Bodies | 36 | 16 | – |
| `tests/attacks/upload.attack.test.ts` | Angriffe: Datei-Uploads (Typen, SVG/HTML, Pfade, Metadaten, Pixel-Bomben) | 16 | 7 | – |
| `tests/attacks/realtime.attack.test.ts` | Angriffe: WebSocket, Verfügbarkeit, Informationslecks, Konfiguration | 16 | 2 | – |
| `tests/attacks/xss.attack.test.ts` | Angriffe: XSS über API-Felder, Sicherheits-Header | 13 | 9 | – |
| **gesamt** | | **1173** | **355** | **–** |

Dazu kommen die Browser-Suiten `tests/browser/forms.test.mjs` (jedes Formular) und `tests/attacks/xss.browser.attack.mjs` (gespeicherte Schadcode-Texte in jedem angezeigten Feld, in Chromium geprüft).

**Ausführen:** Jede Suite gegen einen eigenen Wegwerf-Server mit eigener Datenbank, z. B.

```bash
E2E_BASE_URL=http://127.0.0.1:5099 E2E_ADMIN_USER=<owner> E2E_ADMIN_PASSWORD=<passwort> \
  npx tsx --test --test-reporter=spec tests/attacks/auth.attack.test.ts
```

Die Angriffs- und Admin-Suiten ändern globale Einstellungen, sperren Benutzer und löschen Dateien – **nie gegen die echte Instanz ausführen**.

## Überblick

Eindeutige Befunde (Duplikate aus Runde 2 mit „wie …“ markiert und nicht doppelt gezählt): **154**

| Schwere | Anzahl |
|---|---|
| kritisch | 5 |
| hoch | 22 |
| mittel | 49 |
| niedrig | 62 |
| Hinweis | 16 |

## Runde 1 – Routen und Formulare

### Zugriffsrechte (alle Routen)

| ID | Schwere | Befund | Route | Status |
|---|---|---|---|---|
| AUTHZ-1 | hoch | Any admin (even with no group permission) can create admin groups and assign one to themselves, gaining every permission | `POST /api/admin/groups, POST /api/admin/groups/assign, PATCH/DELETE/GET /api/admin/groups[/:id]` | – |
| AUTHZ-2 | hoch | An admin with the 'users' permission can give themselves any admin group via PATCH /api/admin/users/:id | `PATCH /api/admin/users/:id` | – |
| AUTHZ-3 | hoch | Admins can demote or lock out a platform owner (role change, negative karma) | `PATCH /api/admin/users/:id` | – |
| AUTHZ-4 | hoch | Notifications list exposes the acting user's email and bcrypt password hash | `GET /api/notifications` | – |
| AUTHZ-5 | mittel | Any user can mark-as-read or delete (archive) other users' notifications (IDOR) | `POST /api/notifications/:id/read, DELETE /api/notifications/:id` | – |
| AUTHZ-6 | mittel | Stress tests can be started by any admin without the 'stress_test' permission | `POST /api/security/stress-test/:testName?, GET /api/security/stress-test/available` | – |
| AUTHZ-7 | mittel | 'tickets' permission is not enforced: every admin reads all support tickets and ticket stats | `GET /api/tickets/stats, GET /api/tickets, GET /api/tickets/:id` | – |
| AUTHZ-9 | mittel | CORS reflects any Origin with Access-Control-Allow-Credentials: true | `ALL /api/*` | – |
| AUTHZ-10 | mittel | Community join-request endpoints return raw SQL errors to any logged-in user; admin user delete returns DB error details | `GET /api/communities/:id/requests, POST /api/communities/:id/requests/:userId/approve\|decline, DELETE /api/admin/users/:id` | – |
| AUTHZ-8 | niedrig | Auto-punishment routes check 'security' instead of the 'auto_punishment' permission the UI uses | `GET /api/admin/auto-punishments, POST/PATCH/DELETE /api/admin/auto-punishments/rules[/:id]` | – |
| AUTHZ-11 | niedrig | Malformed or out-of-range numeric ids cause HTTP 500 (or a false success) on ~50 routes | `every route with :id/:userId/:postId/:reportId/:cId (52 of 53 tested)` | – |
| AUTHZ-12 | niedrig | Fractional ids are silently truncated ('169.5' acts on object 169) | `GET /api/posts/:id, POST /api/posts/:id/react\|save, POST /api/comments/:id/like, POST /api/communities/:id/join\|leave, PATCH /api/admin/users/:id, PATCH /api/admin/reports/:id, PATCH /api/reports/:id, PATCH /api/admin/groups/:id, PATCH /api/user/themes/:id, PATCH /api/tickets/:id/comments/:cId …` | – |
| AUTHZ-13 | niedrig | Member list of a private community is visible to any logged-in user | `GET /api/communities/:id/members` | – |
| AUTHZ-14 | niedrig | Admins can delete posts written by an owner (comments are protected, posts are not) | `DELETE /api/posts/:id` | – |
| AUTHZ-15 | niedrig | Login, registration and logout are not CSRF-protected (login CSRF via HTML form) | `POST /api/login, POST /api/register, POST /api/logout` | – |

### Anmeldung, Konto, Sitzungen

| ID | Schwere | Befund | Route | Status |
|---|---|---|---|---|
| AUTH-1 | hoch | PATCH /api/profile does not apply the registration rules to username and email (empty, markup, any length, invalid email) | `PATCH /api/profile` | – |
| AUTH-2 | mittel | Usernames and emails are unique only case-sensitively (impersonation, duplicate accounts per mailbox) | `POST /api/register, PATCH /api/profile` | – |
| AUTH-3 | mittel | CORS reflects any Origin with Access-Control-Allow-Credentials: true | `ALL /api/*` | – |
| AUTH-4 | mittel | Login, register and logout are not CSRF protected (login CSRF via plain HTML form, forced logout) | `POST /api/login, POST /api/register, POST /api/logout` | – |
| AUTH-5 | mittel | Frozen (and IP/device-banned) accounts can still change profile and password | `PATCH /api/profile, PATCH /api/profile/password` | – |
| AUTH-6 | mittel | Public profile and user search leak moderation state and other users' email addresses | `GET /api/users/:username, GET /api/users/search, GET /api/user` | – |
| AUTH-7 | mittel | Changing the password does not end other sessions | `PATCH /api/profile/password` | – |
| AUTH-8 | mittel | PATCH /api/profile never answers on an empty body or a DB error (unhandled rejection, hanging request) | `PATCH /api/profile` | – |
| AUTH-9 | mittel | Private accounts are not private: anonymous visitors get all posts of a private user | `GET /api/users/:username/posts` | – |
| AUTH-10 | mittel | Profile text fields have no length limit and website accepts javascript:/data: URLs | `PATCH /api/profile` | – |
| AUTH-11 | niedrig | Login timing reveals whether a username exists | `POST /api/login` | – |
| AUTH-12 | niedrig | Session cookie is not Secure behind the HTTPS reverse proxy unless REQUIRE_HTTPS is set (default false) | `ALL (Set-Cookie connect.sid)` | – |
| AUTH-13 | niedrig | isPrivate accepts any number (5, -1, 1.5) and stores it | `PATCH /api/profile` | – |
| AUTH-14 | Hinweis | Registration reveals taken usernames/emails; no per-account login limit; no self-service account deletion | `POST /api/register, POST /api/login` | – |

### Inhalte: Beiträge, Kommentare, Meldungen, Uploads

| ID | Schwere | Befund | Route | Status |
|---|---|---|---|---|
| CONTENT-1 | kritisch | Truncated multipart request crashes the whole server process (DoS) | `POST /api/posts (also every other multer route: /api/profile-upload, /api/user/themes/background)` | – |
| CONTENT-2 | hoch | Private community posts and comments are readable by anyone (anonymous included) through many routes | `GET /api/posts/:id, GET /api/posts?communityId=, GET /api/posts/:id/comments, GET /api/users/:username/posts, GET /api/users/:username/comments, GET /api/users/:username/liked` | – |
| CONTENT-3 | hoch | Non-members can post, comment, react, save and like comments inside a private community | `POST /api/posts (communityId), POST /api/comments, POST /api/posts/:id/react, POST /api/posts/:id/save, POST /api/comments/:id/like` | – |
| CONTENT-4 | hoch | Other users' email addresses and moderation fields are exposed (post author, user search) | `GET /api/posts/:id, GET /api/search, GET /api/users/search` | – |
| CONTENT-5 | mittel | Community membership and community bans are not enforced when posting | `POST /api/posts (communityId)` | – |
| CONTENT-6 | mittel | Comments can be created for posts that do not exist or were deleted | `POST /api/comments` | – |
| CONTENT-7 | mittel | Report creation accepts no target, several targets, non-existent targets, self-reports, duplicates and unlimited reasons | `POST /api/reports` | – |
| CONTENT-8 | mittel | Shadow-ban filter is missing on the comments endpoint and the profile post list | `GET /api/posts/:id/comments, GET /api/users/:username/posts` | – |
| CONTENT-22 | mittel | Parallel likes from one user create duplicate reactions and inflate the author's karma | `POST /api/posts/:id/react (same pattern: POST /api/comments/:id/like)` | – |
| CONTENT-9 | niedrig | Post input is barely validated (types, whitespace, length, category) | `POST /api/posts` | – |
| CONTENT-10 | niedrig | Invalid ids, null bytes and object query params cause HTTP 500 | `GET/DELETE /api/posts/:id, GET /api/posts/:id/comments, POST /api/posts/:id/react, DELETE /api/comments/:id, POST /api/comments/:id/like, POST /api/posts, POST /api/comments, GET /api/posts, GET /api/search` | – |
| CONTENT-11 | niedrig | Post cooldown can be bypassed with parallel requests | `POST /api/posts` | – |
| CONTENT-12 | niedrig | Profanity filter blocks ordinary words that contain a banned substring | `POST /api/posts` | – |
| CONTENT-13 | niedrig | Upload errors (file too large, malformed multipart) answer 500 instead of 413/400 | `POST /api/posts` | – |
| CONTENT-14 | niedrig | Images whose bytes cannot be decoded are stored unsanitised | `POST /api/posts` | – |
| CONTENT-15 | niedrig | Post images are re-encoded to WebP but served with the original JPEG/PNG content type | `POST /api/posts → GET /uploads/<file>` | – |
| CONTENT-16 | niedrig | Unsupported media (e.g. SVG) is silently dropped and the post is published without it | `POST /api/posts` | – |
| CONTENT-17 | niedrig | Client controls the stored mediaType of an upload | `POST /api/posts` | – |
| CONTENT-18 | niedrig | Comment lists are silently capped at 100 without order or pagination | `GET /api/posts/:id, GET /api/posts/:id/comments` | – |
| CONTENT-19 | niedrig | LIKE wildcards in user search are not escaped | `GET /api/search, GET /api/users/search` | – |
| CONTENT-20 | Hinweis | Uploaded files are orphaned in several cases | `POST /api/posts` | – |
| CONTENT-21 | Hinweis | Smaller content notes from code review | `various` | – |

### Soziales: Folgen, Chat, Benachrichtigungen, Communities

| ID | Schwere | Befund | Route | Status |
|---|---|---|---|---|
| SOCIAL-1 | kritisch | GET /api/notifications returns the actor's full user row incl. bcrypt password hash and email | `GET /api/notifications` | – |
| SOCIAL-2 | kritisch | Unauthenticated WebSocket upgrade with an unparsable Origin header (e.g. 'Origin: null') crashes the whole server | `GET /ws (HTTP upgrade)` | – |
| SOCIAL-3 | hoch | Posts of private communities are readable by anyone, including anonymous visitors | `GET /api/posts?communityId=:id, GET /api/posts/:id` | – |
| SOCIAL-4 | hoch | Anyone can post into a private community; banned users can still post and comment in their community | `POST /api/posts (communityId), POST /api/comments` | – |
| SOCIAL-5 | mittel | IDOR: any user can mark read or delete (archive) any other user's notification | `POST /api/notifications/:id/read, DELETE /api/notifications/:id` | – |
| SOCIAL-6 | mittel | Notification preferences: mass assignment of userId lets a user take over another user's preferences; bad types cause 500 | `PATCH /api/notifications/preferences` | – |
| SOCIAL-7 | mittel | Approve endpoint adds any user without a pending request (incl. declined, banned and non-existent users) and duplicates memberships | `POST /api/communities/:id/requests/:userId/approve` | – |
| SOCIAL-8 | mittel | Community bans can be bypassed: banned users can be invited, approved or made moderator again | `POST /api/communities/:id/invite, POST /api/communities/:id/moderators, POST /api/communities/:id/requests/:userId/approve` | – |
| SOCIAL-9 | mittel | Join-request routes return raw SQL (query text and parameters) in 500 error bodies | `GET /api/communities/:id/requests, POST /api/communities/:id/requests/:userId/approve\|decline` | – |
| SOCIAL-10 | mittel | Member list of a private community is readable by any logged-in non-member | `GET /api/communities/:id/members` | – |
| SOCIAL-11 | mittel | Community moderators receive reporters' IP addresses (and reporter ids) in community reports | `GET /api/communities/:id/reports` | – |
| SOCIAL-12 | mittel | Comments in private communities are broadcast over WebSocket to every connected user | `POST /api/comments (WebSocket broadcast new_comment)` | – |
| SOCIAL-13 | mittel | Private profiles ('Only members can see your content') are not enforced: posts are served to anonymous visitors | `GET /api/users/:username/posts` | – |
| SOCIAL-14 | niedrig | Follower/following lists expose other users' moderation state (shadow ban, freeze reason, admin group) | `GET /api/followers, GET /api/following` | – |
| SOCIAL-15 | niedrig | WebSocket keeps delivering a user's notifications after logout | `GET /ws, POST /api/logout` | – |
| SOCIAL-16 | niedrig | Only one WebSocket per user: closing an older tab silently stops notifications in the remaining tab | `GET /ws` | – |
| SOCIAL-17 | niedrig | Direct messages accept empty, whitespace-only and arbitrarily long (100k+) content | `POST /api/messages` | – |
| SOCIAL-18 | niedrig | Messages are never marked read: the unread count only grows | `GET /api/messages/:userId, GET /api/messages/unread/count` | – |
| SOCIAL-19 | niedrig | Conversation endpoint returns the oldest 100 messages, so newer messages never show | `GET /api/messages/:userId` | – |
| SOCIAL-20 | niedrig | new_message notifications have no actor (sender) and bypass user preferences/WebSocket push | `POST /api/messages` | – |
| SOCIAL-21 | niedrig | Saving notification preferences before they were ever loaded returns an empty 200 and saves nothing | `PATCH /api/notifications/preferences` | – |
| SOCIAL-22 | niedrig | Non-numeric or out-of-range ids crash social routes with HTTP 500 | `POST\|DELETE /api/follow/:userId, GET /api/messages/:userId, POST /api/notifications/:id/read, DELETE /api/notifications/:id, GET /api/notifications?offset=-1, /api/communities/:id/* (join, leave, members, bans, reports, requests, kick, role, unban, invite, moderators)` | – |
| SOCIAL-23 | niedrig | Community creation: client can choose the primary key; names/descriptions have no length limit; javascript: image URLs accepted | `POST /api/communities` | – |
| SOCIAL-24 | niedrig | Names without ASCII letters/digits produce an empty slug: the first one creates an unreachable community, all later ones are refused as 'already exists' | `POST /api/communities` | – |
| SOCIAL-25 | niedrig | Follow/unfollow toggling creates a new notification every time (notification spam) | `POST /api/follow/:userId` | – |
| SOCIAL-26 | niedrig | Error answers of social routes are sent as text/html | `POST /api/follow/:userId (and every res.status(...).send('text') in users.ts, messages.ts, communities.ts)` | – |
| SOCIAL-27 | Hinweis | WebSocket origin check accepts any localhost origin on any port | `GET /ws` | – |

### Eingaben aller Routen (Fuzzing)

| ID | Schwere | Befund | Route | Status |
|---|---|---|---|---|
| INPUT-1 | hoch | Notification list returns the actor's full user row including bcrypt password hash and email | `GET /api/notifications` | – |
| INPUT-2 | hoch | One dislike from any user locks a new account out (karma < 0 is treated as a ban) | `POST /api/posts/:id/react` | – |
| INPUT-3 | mittel | Notification preferences update writes the raw request body (mass assignment of userId and id) | `PATCH /api/notifications/preferences` | – |
| INPUT-4 | mittel | Notification settings toggles always fail: booleans (and any non-integer) give HTTP 500 | `PATCH /api/notifications/preferences` | – |
| INPUT-5 | mittel | Report creation answers 500 with the full SQL query in the body | `POST /api/reports` | – |
| INPUT-6 | mittel | Profile update never answers on an empty update or any database error (request hangs) | `PATCH /api/profile` | – |
| INPUT-7 | mittel | Profile edit bypasses all username/email rules of registration (empty, spaces, HTML, 300+ chars, invalid email, 200k bio) | `PATCH /api/profile` | – |
| INPUT-8 | niedrig | NUL bytes (\u0000) in any text input cause HTTP 500 (or a hang) on nearly every route | `POST /api/login, POST /api/posts, POST /api/comments, POST /api/messages, POST /api/reports, POST /api/communities, POST /api/tickets, POST/PATCH /api/user/themes, GET /api/posts?category, GET /api/users/search?q, GET /api/tickets?status\|priority\|type\|search, admin routes` | – |
| INPUT-9 | niedrig | Ids outside the int4 range or non-numeric ids reach the database and give HTTP 500 (public routes) | `POST /api/comments, POST /api/communities/:id/ban\|invite\|moderators, POST /api/posts, PATCH /api/tickets/:id, GET /api/posts, GET /api/feed/communities, GET /api/tickets` | – |
| INPUT-10 | niedrig | Non-string values reach string methods and crash handlers (TypeError → 500) | `POST /api/tickets, POST /api/tickets/:id/comments, PATCH /api/tickets/:id/comments/:cId, POST /api/ai/generate, GET /api/posts, PATCH /api/user/themes/:id` | – |
| INPUT-11 | niedrig | Client-chosen primary keys and timestamps reach INSERT/UPDATE (createInsertSchema includes id/createdAt; tickets spread req.body) | `POST /api/user/themes, PATCH /api/user/themes/:id, POST /api/communities, POST /api/tickets, POST /api/admin/auto-punishments/rules` | – |
| INPUT-12 | niedrig | No length limits: 200 000-character strings are stored by most text fields | `POST /api/posts, POST /api/messages, POST /api/reports, POST /api/tickets, POST/PATCH /api/tickets/:id/comments, POST/PATCH /api/user/themes, POST /api/communities, PATCH /api/profile, POST /api/ai/generate, POST /api/admin/groups` | – |
| INPUT-13 | niedrig | Admin write routes without input validation answer 500 for malformed bodies | `POST /api/admin/bans, PATCH /api/admin/groups/:id, POST /api/admin/groups/assign, PATCH /api/admin/users/:id, PATCH /api/admin/reports/:id, POST /api/admin/analytics/compute, POST /api/admin/performance/snapshot` | – |
| INPUT-14 | niedrig | Admin query parameters are not validated: unknown sortBy, NaN ids, negative pages and huge days answer 500 | `GET /api/admin/performance/leaderboard, GET /api/admin/logs, GET /api/admin/monitoring/activity-logs, GET /api/admin/analytics/overview, GET /api/admin/logs/export` | – |

### Admin, Tickets, Themes, KI

| ID | Schwere | Befund | Route | Status |
|---|---|---|---|---|
| ADMIN-1 | kritisch | Path traversal in theme background delete: any user can delete arbitrary writable files | `DELETE /api/user/themes/background/:fileRef` | – |
| ADMIN-2 | kritisch | Anyone who can see a ticket can edit/delete any ticket comment (incl. other users' and internal ones) | `PATCH/DELETE /api/tickets/:id/comments/:cId` | – |
| ADMIN-3 | hoch | Bulk user action trusts its input: a string user_ids is iterated per character ("12" banned users 1 and 2 incl. the owner), unknown actions create bans, owners/self can be banned, SQL leaks in errors | `POST /api/admin/bulk/users` | – |
| ADMIN-4 | hoch | Admin groups only require the admin role: any admin can create a group with all permissions and assign it to themselves; PATCH passes the body to the DB | `/api/admin/groups*` | – |
| ADMIN-5 | hoch | Device bans are far too broad: fingerprint = OS + browser family + language | `ban-check middleware` | – |
| ADMIN-6 | mittel | PATCH /api/admin/users/:id accepts any role string and lets non-owner admins edit owners and set adminGroupId | `PATCH /api/admin/users/:id` | – |
| ADMIN-7 | mittel | Ticket creation copies the whole body (e.g. assignedTo); relatedUrl accepts javascript: and is rendered as a link | `POST /api/tickets` | – |
| ADMIN-8 | mittel | Temporary account bans never expire (karma -9999 + login rejects karma<0) | `POST /api/admin/bans` | – |
| ADMIN-9 | mittel | Stress tests and ticket admin views only check the admin role, not stress_test / tickets permissions | `/api/security/stress-test*, /api/tickets*` | – |
| ADMIN-10 | niedrig | Many admin endpoints answer 500 on bad input (report PATCH, logs adminId, monitoring page/userId, ban without type, revoke 'abc', rules/groups with bad ids, performance sortBy, analytics days/date, AI non-string topic, duplicate username) | `various admin routes` | – |
| ADMIN-11 | niedrig | Revoking a non-existent ban returns 200; revoking resets karma to 0; report status accepts any string | `PATCH /api/admin/bans/:id/revoke, PATCH /api/admin/reports/:id` | – |
| ADMIN-12 | niedrig | Rule toggle in the UI sends booleans the server rejects; frozenUntil cannot be set from JSON | `PATCH /api/admin/auto-punishments/rules/:id, PATCH /api/admin/users/:id` | – |
| ADMIN-13 | niedrig | Bulk endpoints count missing ids as success; action 'hide' on posts deletes them permanently | `POST /api/admin/bulk/*` | – |
| ADMIN-14 | niedrig | Logs: CSV Admin column always 'undefined'; target/old/new values never stored; monitoring limit uncapped; report resolution doesn't set resolvedBy/At; ticket list page ignored; stats avg resolution always 0 | `admin logs/reports/tickets` | – |
| ADMIN-15 | Hinweis | Settings stored but never enforced: registration_enabled, admin_ip_allowlist, max_login_attempts, session_timeout_minutes, require_email_verification, max_usernames_per_ip, max_upload_size_mb, default_user_karma; CSV export does not neutralise =+-@ (not exploitable today) | `admin settings` | – |

### Browser: Formulare und Darstellung

| ID | Schwere | Befund | Route | Status |
|---|---|---|---|---|
| UI-1 | hoch | Ticket 'Externe URL' accepts javascript: and the ticket page renders it as a clickable <a href="javascript:…"> for the owner/admin | `POST /api/tickets → GET /tickets/:id (TicketDetailPage)` | – |
| UI-2 | hoch | Deleting the newest ticket makes every following ticket creation fail with 500 (ticket number collision); parallel creates collide too | `DELETE /api/tickets/:id, POST /api/tickets` | – |
| UI-3 | mittel | Discussion form fails silently: empty submit (400) and posting during the cooldown (429) show nothing | `POST /api/posts (client/src/pages/post/discussions.tsx)` | – |
| UI-4 | mittel | Empty news/entertainment submit creates a post ('New Post', empty content) | `POST /api/posts (multipart)` | – |
| UI-5 | mittel | Comment over 10 000 characters is lost silently: input cleared before the request, 400 not shown | `POST /api/comments (client/src/pages/feed/post-view.tsx)` | – |
| UI-6 | mittel | Theme import gives no feedback: malformed / invalid JSON is ignored silently, success is not confirmed either | `client only (theme builder 'Importieren')` | – |
| UI-7 | mittel | Admin 'Vollständig löschen' permanently deletes a user with one click, no confirmation | `DELETE /api/admin/users/:id (client/src/pages/admin/dashboard.tsx)` | – |
| UI-8 | niedrig | Admin groups: duplicate name → silent 500; whitespace-only name accepted | `POST /api/admin/groups` | – |
| UI-9 | niedrig | Free-text inputs have no length limit (no maxLength, no server max): post title, bio (UI says 'Max. 160 Zeichen'), display name, chat message, community name, theme name | `POST /api/posts, PATCH /api/profile, POST /api/messages, POST /api/communities, POST /api/user/themes` | – |
| UI-10 | niedrig | Create community sends an empty name; the server would create a community with empty name and slug '' | `POST /api/communities` | – |
| UI-11 | niedrig | Theme with an empty/whitespace name can be saved | `POST /api/user/themes` | – |
| UI-12 | niedrig | Profile website accepts any text (no URL validation) | `PATCH /api/profile` | – |
| UI-13 | niedrig | Mod panel user search does not URL-encode the query | `GET /api/users/search` | – |
| UI-14 | niedrig | The same post can be reported repeatedly by the same user | `POST /api/reports` | – |
| UI-15 | Hinweis | No password change form in the client although PATCH /api/profile/password exists | `PATCH /api/profile/password` | – |
| UI-16 | Hinweis | Ticket form checks description >= 20 characters, server requires 50 (message says 50) | `POST /api/tickets` | – |
| UI-17 | Hinweis | Registration under a near-simultaneous double submit: second request 500, user sees 'Registrierung fehlgeschlagen' although the account was created | `POST /api/register` | – |

## Runde 2 – Angriffsszenarien

### Konto-Übernahme und Sitzungen

| ID | Schwere | Befund | Route | Status |
|---|---|---|---|---|
| ATK-AUTH-1 | hoch | Unlimited password brute force against any account by rotating X-Forwarded-For (per-IP limiter and per-account anomaly detection both bypassed, no lockout) | `POST /api/login` | wie AUTH-14 |
| ATK-AUTH-2 | mittel | Registration and password-change rate limits are also per-IP and bypassed by X-Forwarded-For rotation (mass account creation; current-password brute force with a stolen session) | `POST /api/register, PATCH /api/profile/password` | – |
| ATK-AUTH-3 | mittel | Login, register and logout have no CSRF protection (login CSRF, forced logout) | `POST /api/login, POST /api/register, POST /api/logout` | wie AUTH-4 |
| ATK-AUTH-4 | mittel | CORS reflects any Origin (including 'null') with Access-Control-Allow-Credentials: true | `ALL /api/*` | wie AUTH-3 |
| ATK-AUTH-5 | mittel | IP/device bans do not cover the auth routes: a banned client can still register and log in | `POST /api/register, POST /api/login` | wie AUTH-5 |
| ATK-AUTH-6 | mittel | A frozen account can still change its own profile and password | `PATCH /api/profile, PATCH /api/profile/password` | wie AUTH-5 |
| ATK-AUTH-7 | mittel | Changing the password does not invalidate the user's other sessions | `PATCH /api/profile/password` | wie AUTH-7 |
| ATK-AUTH-8 | mittel | bcrypt 72-byte truncation: passwords sharing their first 72 bytes are interchangeable | `POST /api/login, POST /api/register` | – |
| ATK-AUTH-9 | mittel | registration_enabled setting is never enforced — registration cannot actually be disabled | `POST /api/register` | – |
| ATK-AUTH-11 | mittel | Public profile exposes other users' moderation and internal fields | `GET /api/users/:username` | wie AUTH-6 |
| ATK-AUTH-12 | mittel | User search leaks other users' email addresses | `GET /api/users/search` | wie AUTH-6 |
| ATK-AUTH-13 | mittel | Usernames/emails are unique only case-sensitively, enabling impersonation and per-mailbox duplicates | `POST /api/register` | wie AUTH-2 |
| ATK-AUTH-10 | niedrig | Maintenance mode fails to block registration and profile/password edits | `POST /api/register, PATCH /api/profile, PATCH /api/profile/password` | – |
| ATK-AUTH-14 | niedrig | Session cookie is not marked Secure behind the HTTPS reverse proxy | `ALL (Set-Cookie connect.sid)` | wie AUTH-12 |
| ATK-AUTH-15 | niedrig | No password strength policy — weak/common passwords are accepted | `POST /api/register, PATCH /api/profile/password` | – |
| ATK-AUTH-16 | Hinweis | Registration reveals whether a username or email is already taken (enumeration) | `POST /api/register` | wie AUTH-14 |
| ATK-AUTH-17 | Hinweis | INITIAL_OWNER bootstrap can be squatted: pre-registering the owner username blocks owner creation | `server/db-migrations.ts seedInitialOwner()` | – |

### Rechteausweitung und fremde Daten

| ID | Schwere | Befund | Route | Status |
|---|---|---|---|---|
| ATK-AUTHZ-1 | hoch | Any logged-in user can rewrite the content of any support-ticket comment (including staff/owner-internal ones) via a ticket they own | `PATCH /api/tickets/:id/comments/:cId` | – |
| ATK-AUTHZ-2 | hoch | Any logged-in user can delete any support-ticket comment via a ticket they own (IDOR) | `DELETE /api/tickets/:id/comments/:cId` | – |
| ATK-AUTHZ-6 | hoch | Admin with no permissions escalates to all permissions by creating an admin group and assigning it to themselves | `POST /api/admin/groups, POST /api/admin/groups/assign` | wie AUTHZ-1 |
| ATK-AUTHZ-7 | hoch | Admin with only the 'users' permission escalates to all permissions by editing their own adminGroupId | `PATCH /api/admin/users/:id` | wie AUTHZ-2 |
| ATK-AUTHZ-8 | hoch | A non-owner admin can demote or lock out a platform owner | `PATCH /api/admin/users/:id` | wie AUTHZ-3 |
| ATK-AUTHZ-9 | hoch | Notifications expose the acting user's email and bcrypt password hash | `GET /api/notifications` | wie AUTHZ-4 |
| ATK-AUTHZ-3 | mittel | Non-member can read posts of a private community (feed filter and single-post view) | `GET /api/posts?communityId=:id, GET /api/posts/:id` | – |
| ATK-AUTHZ-10 | mittel | Any user can mark-as-read or delete (archive) other users' notifications (IDOR) | `POST /api/notifications/:id/read, DELETE /api/notifications/:id` | wie AUTHZ-5 |
| ATK-AUTHZ-12 | mittel | The 'tickets' permission is not enforced: every admin reads ticket stats and other users' tickets | `GET /api/tickets/stats, GET /api/tickets, GET /api/tickets/:id` | wie AUTHZ-7 |
| ATK-AUTHZ-4 | niedrig | Shadow-banned user's comments leak through GET /api/posts/:postId/comments | `GET /api/posts/:postId/comments` | – |
| ATK-AUTHZ-5 | niedrig | Shadow-banned user's posts leak through their public profile (GET /api/:username/posts) | `GET /api/:username/posts (also /api/user[s]/:username/posts)` | – |
| ATK-AUTHZ-11 | niedrig | Member list of a private community is visible to any logged-in non-member | `GET /api/communities/:id/members` | wie AUTHZ-13 |
| ATK-AUTHZ-13 | niedrig | Admins can delete posts written by an owner (comments are protected, posts are not) | `DELETE /api/posts/:id` | wie AUTHZ-14 |

### Eingaben auf dem Server

| ID | Schwere | Befund | Route | Status |
|---|---|---|---|---|
| ATK-INJECT-1 | mittel | Array/object/duplicate query parameters crash the notifications list (type confusion → 500 DoS) | `GET /api/notifications` | – |
| ATK-INJECT-2 | mittel | Public posts feed crashes (500) on object-valued query parameters | `GET /api/posts` | wie CONTENT-10 |
| ATK-INJECT-3 | mittel | Admin log/monitoring/leaderboard endpoints crash (500) on object/array query values and unknown sortBy | `GET /api/admin/logs, GET /api/admin/monitoring/activity-logs, GET /api/admin/performance/leaderboard` | wie INPUT-14 |
| ATK-INJECT-4 | mittel | Numeric path parameters without validateIdParams crash routes with 500 (out-of-range / non-numeric / NUL) | `GET /api/messages/:userId, GET /api/tickets/:id/history, GET /api/communities/:id/members, GET /api/admin/performance/moderator/:id, GET /api/users/:username/posts` | wie SOCIAL-22 |
| ATK-INJECT-6 | mittel | Oversized email bypasses profile validation and hangs the request forever (connection-exhaustion DoS) | `PATCH /api/profile` | wie INPUT-6 |
| ATK-INJECT-7 | mittel | Notification preferences write the raw body; an object-valued flag reaches the DB (500) | `PATCH /api/notifications/preferences` | wie INPUT-4 |
| ATK-INJECT-5 | niedrig | Negative pagination offset reaches SQL OFFSET on the notifications list (500) | `GET /api/notifications` | wie SOCIAL-22 |
| ATK-INJECT-8 | niedrig | Profanity filter is a raw substring match: unicode (zero-width / fullwidth / homoglyph) evades it | `POST /api/posts (also POST /api/comments via the same checkContent)` | – |

### Schadcode im Browser

| ID | Schwere | Befund | Route | Status |
|---|---|---|---|---|
| ATK-XSS-1 | hoch | Stored javascript:/data: URL in ticket relatedUrl is rendered as a clickable link in the owner/admin ticket view (stored XSS targeting staff) | `POST /api/tickets -> GET /tickets/:id (TicketDetailPage)` | wie UI-1 |
| ATK-XSS-2 | niedrig | Profile 'website' external link opens with target=_blank but no rel=noopener/noreferrer (reverse tabnabbing); server stores unvalidated URL scheme | `PATCH /api/profile -> GET /users/:username (ProfileHeader)` | wie AUTH-10 |
| ATK-XSS-4 | niedrig | Inconsistent CSP: /api/* responses ship a weaker Content-Security-Policy (script-src 'unsafe-inline' 'unsafe-eval', frame-ancestors 'self') than the app document | `GET / (app document) vs GET /api/* (JSON)` | – |
| ATK-XSS-3 | Hinweis | Theme background gradient and image-URL values are written into inline styles without URL validation (CSS url() fetch), contained only by CSP and self-apply scope | `client theme engine (localStorage customTheme / GET /api/user/themes) -> ThemeBackground / applyTheme` | – |

### Datei-Uploads

| ID | Schwere | Befund | Route | Status |
|---|---|---|---|---|
| ATK-UPLOAD-1 | hoch | Path traversal in theme-background DELETE allows deleting any server-writable file | `DELETE /api/user/themes/background/:fileRef` | – |
| ATK-UPLOAD-2 | hoch | Missing file-ownership check lets a user delete another user's uploaded background | `DELETE /api/user/themes/background/:fileRef` | – |
| ATK-UPLOAD-3 | mittel | Decompression/pixel bomb: huge-dimension images decoded without an input-pixel limit | `POST /api/posts (postUpload.any) and POST /api/user/themes/background` | – |
| ATK-UPLOAD-4 | mittel | Rejected uploads leave orphan files on disk (no cleanup on early returns) | `POST /api/posts` | – |
| ATK-UPLOAD-5 | niedrig | No per-user upload quota or count limit (disk-exhaustion hardening) | `POST /api/posts, POST /api/profile-upload, POST /api/user/themes/background` | – |
| ATK-UPLOAD-6 | niedrig | Uploaded GIFs are stored byte-for-byte (not re-encoded); metadata and polyglot payloads persist | `POST /api/posts (and POST /api/user/themes/background, which also accept image/gif)` | – |
| ATK-UPLOAD-7 | Hinweis | Post images keep their original extension while their bytes are re-encoded to WebP | `POST /api/posts` | – |

### WebSocket, Verfügbarkeit, Konfiguration

| ID | Schwere | Befund | Route | Status |
|---|---|---|---|---|
| ATK-RT-1 | hoch | Any logged-in user crashes the entire server with one malformed WebSocket frame | `WS /ws` | – |
| ATK-RT-2 | niedrig | new_comment is broadcast with full content to every connected socket regardless of relationship | `POST /api/comments (fan-out over WS /ws)` | – |
| ATK-RT-6 | niedrig | Production dependencies have known high/critical advisories (npm audit --omit=dev) | `(dependencies) package-lock.json` | – |
| ATK-RT-3 | Hinweis | WebSocket server sets no maxPayload; a single frame may buffer up to 100 MiB | `WS /ws` | – |
| ATK-RT-4 | Hinweis | WebSocket Origin check is skipped entirely when the Origin header is absent | `WS /ws` | – |
| ATK-RT-5 | Hinweis | Upgrade requests to any path other than /ws leak the socket (never destroyed) | `HTTP upgrade (WS)` | – |
| ATK-RT-7 | Hinweis | CSP connect-src allows WebSocket connections to any host (ws:/wss: scheme-only) | `(config) server/index.ts / server/routes/index.ts (helmet CSP)` | – |
| ATK-RT-8 | Hinweis | Stress-test endpoint takes unvalidated duration/intensity/config (admin self-DoS tool) | `POST /api/security/stress-test/:testName?` | – |

