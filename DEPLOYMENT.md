# VPS Deployment Guide: Open-Verse

---

## 🐳 Option A: Docker (Empfohlen)

Der einfachste Weg, Open-Verse auf einem Ubuntu-Server zu betreiben.

### Voraussetzungen

```bash
# Docker & Docker Compose installieren
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # danach neu einloggen
```

### 1. Repository klonen

```bash
git clone https://github.com/lbrandstaetterhtl/Open-Verse.git
cd Open-Verse
```

### 2. Umgebungsvariablen konfigurieren

```bash
cp .env.example .env
nano .env
```

> [!IMPORTANT]
> Folgende Werte **müssen** gesetzt werden:
> - `POSTGRES_PASSWORD` → starkes, zufälliges Passwort (nur Buchstaben und Ziffern, es steht in einer Verbindungs-URL)
>   ```bash
>   openssl rand -hex 24
>   ```
> - `SESSION_SECRET` → langer zufälliger String (mind. 32 Zeichen)
>   ```bash
>   openssl rand -hex 32
>   ```
> - `TRUST_PROXY=true` (da Nginx als Reverse Proxy läuft)
>
> Platzhalter aus `.env.example` (`change-me-…`) oder zu kurze Werte verhindern den Start nicht, aber die App
> meldet sie bei jedem Start: `docker compose logs app | grep -i "weak secret"`.
>
> Empfohlen zusätzlich: `DB_APP_PASSWORD` (eigene Datenbankrolle mit minimalen Rechten, siehe
> [Datenbank-Rollen](#datenbank-rollen-least-privilege-optional)).

### 3. Container starten

```bash
docker compose up -d
```

Der Start-Ablauf:
1. PostgreSQL-Datenbankcontainer startet (benötigt **PostgreSQL ≥ 15**, das Compose-Image nutzt 16)
2. Der einmalige Container `migrate` wartet auf die DB (Health Check), wendet die SQL-Migrationen aus
   `migrations/` an und beendet sich (Status `Exited (0)` in `docker compose ps -a` ist normal).
   Jede Migrationsdatei läuft in einer eigenen Transaktion und wird in der Tabelle
   `openverse_schema_migrations` vermerkt, also nur einmal ausgeführt.
3. Erst danach startet der App-Container und ist unter Port 5000 erreichbar. Schlägt eine Migration fehl,
   startet die App nicht: `docker compose logs migrate` zeigt den Grund.

### 4. Ersten Owner anlegen

Beim allerersten Start in `.env` setzen:

```env
INITIAL_OWNER_USERNAME=deinname
INITIAL_OWNER_PASSWORD=<mindestens 12 Zeichen>
```

Danach `docker compose up -d` und prüfen, was passiert ist:

```bash
docker compose logs app | grep -i "initial owner"
```

| Log-Meldung | Bedeutung |
|---|---|
| `account "deinname" created` | Owner angelegt, Login möglich |
| `existing account "deinname" is now owner` | Name gab es schon mit diesem Passwort, jetzt Owner |
| `already exists and is owner` | nichts zu tun |
| `already exists with a different password` | Name gibt es schon mit anderem Passwort, nichts geändert (siehe unten) |
| `email … already belongs to …` | E-Mail ist vergeben, anderes `INITIAL_OWNER_EMAIL` setzen |
| `must be at least 12 characters` | Passwort zu kurz |
| keine Meldung | Variablen kommen nicht im Container an: `docker compose exec app printenv \| grep INITIAL_OWNER` |

**Zugang zurückholen:** Existiert der Name schon mit unbekanntem Passwort, einmal mit `INITIAL_OWNER_RESET_PASSWORD=true` starten. Dann wird `INITIAL_OWNER_PASSWORD` gesetzt und das Konto zum Owner. Danach den Wert wieder auf `false` setzen.

Das Passwort wird nie geloggt. Nach dem ersten erfolgreichen Start können die Werte aus `.env` entfernt werden.

> [!WARNING]
> Ältere Versionen haben bei jedem Start ein Owner-Konto `testadmin` mit dem öffentlich bekannten Passwort `TestPassword123!` angelegt. Ab dieser Version bekommt dieses Konto beim Start ein zufälliges Passwort. Wer sich bisher damit eingeloggt hat, legt über `INITIAL_OWNER_*` ein eigenes Owner-Konto an. Prüfe außerdem, ob unbekannte Admins existieren:
> ```bash
> docker compose exec db psql -U openverse -d openverse -c "SELECT id, username, role FROM users WHERE role IN ('owner','admin');"
> ```

### 5. Auto-Punishment einführen

Activity-Log, Anomalie-Erkennung und Auto-Punishment schreiben ab dieser Version tatsächlich in die Datenbank. Standardmäßig läuft das Auto-Punishment im Beobachtungsmodus (`AUTO_PUNISHMENT_DRY_RUN=true`): Es protokolliert nur, was es tun würde. Nach einer Beobachtungsphase in `.env` auf `false` stellen. Mit `AUTO_PUNISHMENT_WHITELIST=1,2` werden Nutzer-IDs von automatischen Strafen ausgenommen.

### Nützliche Docker-Befehle

```bash
# Logs anzeigen
docker compose logs -f app
docker compose logs -f db

# Container-Status
docker compose ps

# Neustart
docker compose restart app

# Stoppen (Daten bleiben erhalten)
docker compose down

# Stoppen UND alle Daten löschen (ACHTUNG!)
docker compose down -v
```

### Upgrade auf neue Version

```bash
git pull
docker compose build --no-cache
docker compose up -d
```

Daten (Datenbank-Volume `postgres_data`, Uploads-Volume `uploads_data`) bleiben dabei erhalten; Migrationen laufen beim Start automatisch (Service `migrate`). Gespeicherte Themes der Nutzer werden im Browser auf das neue Design umgestellt, eigene Farben bleiben erhalten.

> [!NOTE]
> **Upgrade auf die Version mit Migrations-Journal (Oktober 2026)** – mit der bestehenden `.env`, ohne neue Pflichtwerte:
> - Neu ist der Container `migrate` (läuft vor jedem App-Start einmal und beendet sich).
> - Beim ersten Start werden die bisherigen Migrationen `0000`/`0001` als „bereits angewendet“ im neuen
>   Journal `openverse_schema_migrations` vermerkt, `0002`–`0005` laufen (idempotent) und danach nie wieder.
> - `0004` legt Indizes auf die häufig abgefragten Tabellen an (Activity-Log, Bans, Posts, Nachrichten …).
>   Bei einem sehr großen `activity_logs` dauert dieser erste Start entsprechend länger.
> - `0005` löscht die gespeicherten IP-Adressen der Meldungen (`reports.ip_address`) und die alten, nie
>   nutzbaren E-Mail-Bestätigungs-Tokens.
> - Ein im Admin-Bereich eingetragenes SMTP-Passwort wird verschlüsselt gespeichert.
> - Activity-Logs und Anomalien älter als 90 Tage werden ab jetzt täglich gelöscht (siehe
>   [Datenaufbewahrung](#datenaufbewahrung)).
> - Docker begrenzt die Container-Logs ab jetzt auf 5 × 10 MB je Container.
> - Bei schwachen Secrets erscheint eine Warnung im Log (`Weak secret: …`); die App startet trotzdem.

> [!IMPORTANT]
> **Einmalig beim Upgrade von einer Version vor Oktober 2026:** Falls du dich bisher als `testadmin` eingeloggt hast, setze vor `docker compose up -d` in `.env` `INITIAL_OWNER_USERNAME` und `INITIAL_OWNER_PASSWORD` (siehe Abschnitt 4). Sonst hast du nach dem Upgrade keinen Owner-Zugang mehr, weil das öffentlich bekannte `testadmin`-Passwort deaktiviert wird.

### Datenbank-Rollen (Least Privilege, optional)

Ohne weitere Einstellung verbindet sich die App mit `POSTGRES_USER`. Dieser Benutzer ist im offiziellen
Postgres-Image **Superuser**: eine Sicherheitslücke in der App hätte damit volle Kontrolle über die Datenbank
(und über `COPY … TO PROGRAM` auch über den DB-Container).

Mit `DB_APP_PASSWORD` in `.env` bekommt die App eine eigene Rolle `openverse_app`:

```bash
echo "DB_APP_PASSWORD=$(openssl rand -hex 24)" >> .env
docker compose up -d
```

- Der Container `migrate` (mit `POSTGRES_USER`/`POSTGRES_PASSWORD`) legt die Rolle an bzw. setzt ihr
  Passwort neu und vergibt nur `SELECT/INSERT/UPDATE/DELETE` auf alle Tabellen und `USAGE/SELECT` auf die
  Sequenzen (auch für künftige Tabellen). Kein DDL, kein `TRUNCATE`, keine Superuser-Rechte; zusätzlich
  gelten serverseitig `statement_timeout` und `idle_in_transaction_session_timeout` für die Rolle.
- Der App-Container erhält **nur** noch Benutzer `openverse_app` und `DB_APP_PASSWORD`, nicht mehr
  `POSTGRES_PASSWORD`, und führt selbst keine Schemaänderungen mehr aus.
- Funktioniert bei neuen Installationen und bei bestehenden (vorhandenes Volume): einfach den Wert setzen
  und `docker compose up -d` ausführen. Zurück zum alten Verhalten: Zeile entfernen, `docker compose up -d`
  (die Rolle bleibt bestehen und stört nicht; entfernen mit
  `docker compose exec db psql -U openverse -d openverse -c "DROP OWNED BY openverse_app; DROP ROLE openverse_app;"`).
- Prüfen: `docker compose logs migrate | grep -i role` und
  `docker compose exec db psql -U openverse -d openverse -c "SELECT usename, application_name FROM pg_stat_activity WHERE datname = current_database();"`
  (die App erscheint als `openverse_app` / `open-verse`).

Ohne Docker (eigene Postgres-Instanz): `DATABASE_URL` mit dem Owner-Benutzer und `DB_APP_PASSWORD` setzen.
Die App führt die Migrationen dann mit `DATABASE_URL` aus und nutzt für alle Anfragen `openverse_app`
(`DATABASE_URL`-Benutzer braucht `CREATEROLE`). Migrationen lassen sich auch separat ausführen:
`npm run db:migrate`.

### Passwörter ändern

- **`POSTGRES_PASSWORD`**: wird nur beim allerersten Start (leeres Volume) gesetzt. Später zuerst in der
  Datenbank ändern, dann in `.env`:
  ```bash
  docker compose exec db psql -U openverse -d openverse -c "ALTER ROLE openverse PASSWORD '<neues-passwort>';"
  # .env: POSTGRES_PASSWORD=<neues-passwort>
  docker compose up -d
  ```
- **`DB_APP_PASSWORD`**: nur in `.env` ändern und `docker compose up -d` – `migrate` setzt es neu.
- **`SESSION_SECRET`**: in `.env` ändern und `docker compose up -d`. Alle Nutzer werden abgemeldet, und ein
  im Admin-Bereich gespeichertes SMTP-Passwort muss neu eingegeben werden (es ist mit einem daraus
  abgeleiteten Schlüssel verschlüsselt).

### Datenbank-Timeouts

Die App bricht einzelne Abfragen nach 15 s ab (`DB_STATEMENT_TIMEOUT_MS`), beendet Transaktionen, die 30 s
untätig offen sind (`DB_IDLE_IN_TRANSACTION_TIMEOUT_MS`), und wartet höchstens 10 s auf eine Verbindung
(`DB_CONNECTION_TIMEOUT_MS`); Poolgröße `DB_POOL_MAX` (10). Migrationen sind davon ausgenommen. Ein Neustart
oder kurzer Ausfall von Postgres beendet die App nicht mehr: Anfragen schlagen in der Zeit fehl, danach
verbindet sich die App von selbst neu.

### Datenaufbewahrung

- Activity-Logs und Anomalie-Ereignisse (mit IP-Adressen und User-Agents) werden täglich gelöscht, sobald sie
  älter als **90 Tage** sind. Einstellbar im Admin-Bereich unter *Settings → Security → Activity Log Retention
  (Days)*; `0` = unbegrenzt aufbewahren. Anomalien, auf die ein Bann verweist, bleiben erhalten.
- Abgelaufene Sitzungen und E-Mail-Bestätigungs-Tokens werden ebenfalls täglich entfernt.
- Meldungen speichern keine IP-Adresse mehr; E-Mail-Bestätigungs-Tokens nur als SHA-256-Hash.
- Wird ein Konto gelöscht, werden seine Activity-Logs und Anomalien gelöscht (Admin-Aktionen von Moderatoren
  bleiben als Protokoll, aber ohne E-Mail, IP, User-Agent und Gerät), seine Meldungen, Sitzungen und Tokens
  entfernt; Banns bleiben bestehen, verlieren aber IP und Geräte-ID, sofern es Konto-Banns sind.

### Logs

- `docker compose logs` zeigt Warnungen und Fehler; Docker rotiert die Container-Logs (5 × 10 MB je
  Container, `logging:` in `docker-compose.yml`). Die Einstellung greift für Container, die nach dem Update
  neu erstellt werden (`docker compose up -d` erledigt das).
- Im Container schreibt die App zusätzlich Dateien nach `/app/logs` (Rechte `0640`, je Datei max.
  `LOG_MAX_SIZE_MB` = 50 MB × 5 Rotationen); sie gehen beim Neuerstellen des Containers verloren.
- Logs enthalten keine Abfrageparameter, Passwörter, Tokens oder Request-Bodies mehr; E-Mail-Adressen werden
  maskiert (`a***@example.com`). Zugriffs-Logs enthalten weiterhin IP und User-Agent (gekürzt auf 256 Zeichen).
- Für Postgres niemals `log_statement=all` oder `log_min_duration_statement` ohne
  `log_parameter_max_length=0` aktivieren: die Parameter enthalten Passwort-Hashes und E-Mail-Adressen.

### Backups

```bash
# Datenbank (komprimiertes Custom-Format), z. B. täglich per cron:
docker compose exec -T db pg_dump -U openverse -d openverse -Fc > openverse-$(date +%F).dump
# Uploads:
docker run --rm -v open-verse_uploads_data:/data -v "$PWD":/backup alpine tar czf /backup/uploads-$(date +%F).tgz -C /data .
# Wiederherstellen (in eine leere Datenbank):
docker compose exec -T db pg_restore -U openverse -d openverse --clean --if-exists < openverse-YYYY-MM-DD.dump
```

Backups enthalten Passwort-Hashes, E-Mail-Adressen und Sitzungen: verschlüsselt und nicht auf demselben
Server aufbewahren, Wiederherstellung regelmäßig testen. (Der Volume-Name hängt vom Projektnamen ab:
`docker volume ls`.)

### SQLite (nur Entwicklung)

Mit `USE_SQLITE=true` liegt die Datenbank in `./local.db` bzw. `SQLITE_PATH`. Die Datei wird mit Rechten
`0600` angelegt; ein Pfad im öffentlich ausgelieferten Ordner `uploads/` wird abgelehnt (die App startet
dann nicht). Im Docker-Image ist dafür `/app/data` vorgesehen (`SQLITE_PATH=/app/data/local.db` und ein
Volume auf `/app/data`). Backup: `sqlite3 local.db ".backup backup.db"`.

---

## ✅ Nach dem Deployment testen

Die End-to-End-Tests laufen gegen einen gestarteten Server und legen eigene Testnutzer an, also **nur gegen eine Test-Instanz**, nicht gegen die Produktionsdatenbank:

```bash
E2E_BASE_URL=http://127.0.0.1:5000 E2E_ADMIN_USER=<owner> E2E_ADMIN_PASSWORD=<passwort> npm run test:e2e
```

---

## 🌐 Nginx als Reverse Proxy (Docker)

> [!TIP]
> Wenn Nginx auf demselben Host läuft, in `docker-compose.yml` den Port auf `"127.0.0.1:5000:5000"` setzen. Sonst ist Port 5000 von außen direkt erreichbar, und Clients können über einen gefälschten `X-Forwarded-For`-Header die IP-basierten Limits umgehen.

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

SSL mit Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Option B: Manuell ohne Docker

This guide outlines the steps to deploy and manage Open-Verse on a Linux-based VPS (Ubuntu/Debian recommended).

## Prerequisites

1.  **Node.js**: Install Node.js 20 or higher.
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    ```
2.  **Git**: To clone the repository.
3.  **Reverse Proxy**: Nginx is highly recommended for SSL (HTTPS) and port forwarding.

---

## 🚀 Deployment Steps

### 1. Clone & Install
```bash
git clone https://github.com/your-username/open-verse.git
cd open-verse
npm install
```

### 2. Configuration
Copy the template and fill in your production values:
```bash
cp .env.example .env
nano .env
```
> [!IMPORTANT]
> Make sure to set a strong `SESSION_SECRET` and set `TRUST_PROXY=true` if you are using Nginx.

### 3. Build the Project
```bash
npm run build
```
This will generate the `dist/` directory containing both the backend and frontend assets.

---

## 🛡️ Production Management

### Option A: PM2 (Recommended)
PM2 is a production process manager that handles restarts and monitoring.
```bash
sudo npm install -g pm2
pm2 start dist/index.js --name open-verse
pm2 save
pm2 startup
```

### Option B: Systemd
Create a service file at `/etc/systemd/system/open-verse.service`:
```ini
[Unit]
Description=Open-Verse Social Platform
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/open-verse
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```
Enable and start:
```bash
sudo systemctl enable open-verse
sudo systemctl start open-verse
```

---

## 🌐 Nginx Configuration (Example)
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
