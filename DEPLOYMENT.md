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
> - `POSTGRES_PASSWORD` → starkes, zufälliges Passwort
> - `SESSION_SECRET` → langer zufälliger String (mind. 64 Zeichen)
>   ```bash
>   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
>   ```
> - `TRUST_PROXY=true` (da Nginx als Reverse Proxy läuft)

### 3. Container starten

```bash
docker compose up -d
```

Der Start-Ablauf:
1. PostgreSQL-Datenbankcontainer startet
2. App-Container wartet auf DB (Health Check)
3. App startet und ist unter Port 5000 erreichbar

### 4. Datenbank-Schema initialisieren (erster Start)

```bash
docker compose exec app node -e "
const { execSync } = require('child_process');
execSync('npx drizzle-kit push', { stdio: 'inherit' });
"
```

> [!NOTE]
> Alternativ kann `drizzle-kit push` auch im Builder-Stage ausgeführt werden,
> falls du eine Init-Migration bevorzugst.

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
docker compose build app
docker compose up -d
```

---

## 🌐 Nginx als Reverse Proxy (Docker)

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
