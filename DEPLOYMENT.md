# VPS Deployment Guide: Open-Verse

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
