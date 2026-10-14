# Open-Verse – Sicherheits- & Qualitäts-Audit

**Stand:** 2026-10-14 · **Ersetzt:** das Audit vom selben Tag (Commit `e3371f2`), dessen Punkte hier einzeln nachgeprüft wurden.
**Methode:** Code-Review, `tsc`, `knip`, End-to-End-Tests gegen einen Produktions-Build mit PostgreSQL 16 (frische Installation **und** Upgrade einer bestehenden Datenbank) sowie Browser-Tests mit Chromium.

| Prüfung | Vorher (Commit `8d7ffc4`) | Nachher |
| --- | --- | --- |
| API-Tests (`tests/e2e`, 99 Fälle) | 61 / 99 bestanden (38 Fehler) | **99 / 99 bestanden** |
| Browser-Checks (Registrierung, Upload, 22 Seiten) | 23 / 26 bestanden | **26 / 26 bestanden** |
| Sicherheits-Skripte (`tests/security`) | falsche Alarme, 1 Skript defekt | alle korrekt, 0 Fehler unter Last |
| TypeScript-Fehler (`tsc`) | 183 | 154 (keine neuen) |
| Server-Fehler im Log während der Tests | u. a. 100+ fehlgeschlagene Log-/Snapshot-Writes | nur erwartete (413, 403) |

---

## 1. Behoben – kritisch

| # | Problem | Nachweis vorher | Fix |
| --- | --- | --- | --- |
| K1 | **Hintertür-Owner:** `testadmin` / `TestPassword123!` (steht öffentlich im Repo) wurde bei jedem Postgres-Start als **Owner** angelegt, das Passwort zurückgesetzt und ins Log geschrieben. | Login als Owner mit dem Repo-Passwort | `server/db-migrations.ts`: entfernt. Bestehende `testadmin`-Konten mit diesem Passwort erhalten beim Start ein zufälliges Passwort. Erst-Owner nun über `INITIAL_OWNER_USERNAME` / `INITIAL_OWNER_PASSWORD`. |
| K2 | **Rechteausweitung bei Registrierung:** `POST /api/register` mit `"role":"owner"` erzeugte unter Postgres einen Owner. | Test: Rolle `owner` | `shared/schema.ts`: `insertUserSchema` erlaubt nur `username`, `email`, `password`; `server/auth.ts` übergibt nur diese Felder. |
| K3 | **Rechteausweitung per Profil:** `PATCH /api/profile` akzeptierte `role`, `karma`, `isAdmin` und ein **ungehashtes** `password`. | Test: Rolle `owner` | `updateProfileSchema` auf kosmetische Felder beschränkt. |
| K4 | **13 Admin-Routen ohne Rechteprüfung**, u. a. `reset-roles`, Bans anlegen/aufheben, Massen-Aktionen, Auto-Punishment-Regeln, Settings-Seed, Log-Export. | Anonym → HTTP 200/500 statt 401 | `server/routes/admin.ts`: `router.use(isAdmin)` für den ganzen Router plus passende `hasPermission(...)`; `reset-roles` nur für Owner. |
| K5 | **Passwort-Hashes & E-Mails öffentlich:** `GET /api/users/:name`, Registrierungs-Antwort, Follower-Listen, Community-Mitgliederliste, Admin-APIs. | Hash im Response | Hash überall entfernt; E-Mail nur noch für den Nutzer selbst bzw. Admins. |

## 2. Behoben – hoch

| # | Problem | Fix |
| --- | --- | --- |
| H1 | **Datei-Uploads im Browser kaputt** (HTTP 403 „Invalid CSRF Token“) seit Commit `8d7ffc4`: Das Token wurde als Formularfeld statt als Header gesendet, der Server prüft CSRF aber vor `multer`. | `client/src/lib/queryClient.ts`: Token wieder als Header. |
| H2 | **Activity-Log unter Postgres nie gespeichert** (Unix-Zahl in `timestamp`-Spalte). Damit waren Admin-Log, Monitoring, Anomalie-Erkennung und Auto-Punishment in Produktion funktionslos. | `server/services/activity-logger.ts` schreibt `Date`. |
| H3 | **Anomalie-Erkennung stürzte immer ab** (`nowUnix`/`timeDiff` undefiniert). | `server/services/anomaly-detector.ts` |
| H4 | **Admin-Report-Liste**: Die „N+1-Fix“-Abfrage aus `e3371f2` lieferte 0 Zeilen (SQLite) bzw. HTTP 500 (Postgres). | `inArray()` statt `IN ('1,2,3')` |
| H5 | **Bans**: Admin-Bann → HTTP 500 (`toISOString`), Massen-Bann → `ReferenceError`, Auto-Freeze → `ReferenceError`, eingefrorene Konten tauten nie auf (Sekunden mit Millisekunden verglichen). | `admin.ts`, `bulk-action-service.ts`, `auto-punishment-engine.ts`, `middleware/ban-check.ts` |
| H6 | **Analytics- & Moderator-Snapshots scheiterten immer** (fehlende Unique-Constraints für `ON CONFLICT`, Zahlen in `timestamp`-Spalten). | Migration `migrations/0001_snapshot_unique_constraints.sql` (benötigt **PostgreSQL ≥ 15**), Schema + Services angepasst. |
| H7 | **Passwort ändern unmöglich** (Schema erwartete `password`, Route las `currentPassword`/`newPassword`). | `updatePasswordSchema` |
| H8 | **Fehlgeschlagene Logins ohne IP protokolliert**, IP-basierte Brute-Force-Erkennung damit blind. | `passReqToCallback` in `server/auth.ts` |

## 3. Behoben – mittel/niedrig

- Nutzersuche im Mod-Panel lieferte immer 404 (`/:username` vor `/search` registriert) und hätte danach mit `storage.sanitizeUser is not a function` abgestürzt.
- Community-Reports: Storage-Methode nicht durchgereicht (HTTP 500); `PATCH /api/communities/:id/reports/:reportId` fehlte komplett.
- Ungelesene Nachrichten (HTTP 500) und `reset-roles` unter Postgres (Boolean in Integer-Spalte).
- Admin-Log-Suche fragte die nicht existierende Spalte `admin_email` ab.
- Ticket-Historie rief eine nicht existierende Methode auf.
- „Community erstellen“ stürzte für Admins ab (`motion is not defined`).
- Negativer `offset` führte zu HTTP 500. Paginierung jetzt zentral in `server/utils/pagination.ts`.
- Ungültige Registrierungsdaten gaben HTTP 500 statt 400 zurück.
- Der „Privates Profil“-Schalter im Profilformular wurde abgelehnt (Boolean statt Zahl erwartet).
- Öffentlicher Debug-Endpunkt `/api/users/debug-uploads` entfernt.
- SQLite: Health-Check nutzte `db.execute` (gibt es dort nicht), Settings-Seed stürzte auf frischer DB ab.

## 4. Punkte des alten Audits, die nicht zutrafen

| Alter Punkt | Befund |
| --- | --- |
| #4/#10 SQL-Injection in Analytics | Kein Risiko: Drizzle-`sql`-Templates sind parametrisiert. (Die Kennzahl „aktive Mitglieder“ ist aber immer 0, weil nirgends `community_id` in Log-Metadaten geschrieben wird.) |
| #2 N+1 in `/api/admin/users` | Nur eine Abfrage, kein N+1. |
| #6, #29, #30, #31 Rate-Limits, Body-Limit, Security-Header | Waren bereits vorhanden (Login 20/15 min, Registrierung 5/h, Passwort 5/h, global 1000/15 min, `helmet`, 1 MB Body-Limit). |
| #8 Race Condition bei Passwort-Update, #14 `mkdir`-Fehler, #19 Null-Checks | Kein reales Risiko. |
| „Race Condition bei Likes“ (`tests/security/verify_security.ts`) | Falscher Alarm durch falschen Feldnamen im Skript; in der DB liegt genau ein Like. |
| „Server-Instabilität“ (`tests/security/stress_test.ts`) | Falscher Alarm: Es war das globale Rate-Limit (HTTP 429). |

## 5. Offen – Entscheidung oder größere Arbeit nötig

| Prio | Thema | Empfehlung |
| --- | --- | --- |
| **Hoch** | **Hardware-Bann ist kein Hardware-Bann:** Der Fingerprint ist nur `hash(OS + Browser + Sprache)` (`middleware/ban-check.ts`). Ein Hardware-Bann sperrt z. B. *alle* Nutzer mit Windows + Chrome + Deutsch. | Hardware-Bans bis zu einer Neugestaltung nicht verwenden. |
| **Hoch** | **Auto-Punishment und Activity-Log laufen jetzt zum ersten Mal wirklich.** | Anfangs `AUTO_PUNISHMENT_DRY_RUN=true` setzen und die Logs beobachten. Für `activity_logs` eine Aufbewahrungsfrist einführen (Tabelle wächst jetzt). |
| **Hoch** | **Bestehende Server:** Prüfen, ob unbekannte Owner/Admins existieren (K2/K3/K4 waren ausnutzbar). | `SELECT id, username, role FROM users WHERE role IN ('owner','admin');` |
| Mittel | `trust proxy` wird in Produktion immer gesetzt, und docker-compose veröffentlicht Port 5000 nach außen. Wer direkt auf Port 5000 zugreift, kann `X-Forwarded-For` fälschen und IP-Limits/IP-Bans umgehen. | Port in `docker-compose.yml` an `127.0.0.1:5000:5000` binden, wenn Nginx davor läuft. |
| Mittel | **SQLite-Modus** ist auf frischen Datenbanken nicht lauffähig (Tabellen `admin_groups` und `session` fehlen; der SQLite-Treiber schreibt `NULL` statt `DEFAULT`). | SQLite-Modus entfernen oder dessen DDL in `server/db.ts` an `shared/schema.ts` angleichen. |
| Mittel | Kaum Indizes in Postgres (nur `session.expire`). | Indizes auf `posts.author_id`, `posts.community_id`, `comments.post_id`, `followers(*)`, `activity_logs.created_at/user_id`. |
| Mittel | Keine Unique-Constraints auf `post_likes(user_id, post_id)` und `followers` in Postgres. | Vorher Duplikate bereinigen, dann Constraint anlegen. |
| Mittel | `POST /api/tickets` übernimmt den kompletten Request-Body in die Datenbank. | Felder explizit auswählen. |
| Niedrig | Einige Admin-/Ticket-Routen geben `error.message` an den Client weiter. | Generische Fehlermeldung, Details nur ins Log. |
| Niedrig | 154 TypeScript-Fehler (`npm run check` schlägt fehl), Fehlerformat gemischt (`send` vs. `json`), `console` statt `logger`. | Schrittweise abbauen. |
| Niedrig | GIF-Uploads werden nicht neu kodiert; Legacy-scrypt-Fallback; kein Timeout beim SendGrid-Versand. | Bei Gelegenheit. |
| Niedrig | Ungenutzte Abhängigkeiten laut `knip`: `@types/helmet`, `xss`; `drizzle-kit` steht doppelt in `dependencies` und `devDependencies`. | Entfernen. |

## 6. Tests ausführen

```bash
# Server mit Postgres starten (z. B. docker compose up -d), dann:
E2E_BASE_URL=http://127.0.0.1:5000 \
E2E_ADMIN_USER=<owner> E2E_ADMIN_PASSWORD=<passwort> \
npm run test:e2e
```

Die Tests legen eigene Nutzer an und setzen `TRUST_PROXY=true` voraus (jeder Test-Client nutzt eine eigene `X-Forwarded-For`-Adresse, damit sich die Rate-Limits der Tests nicht gegenseitig blockieren). **Nicht gegen die Produktionsdatenbank laufen lassen.**
