@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0.."
set SESSION_SECRET=dev-secret-key
set USE_SQLITE=true
set PORT=5007
npx tsx server/index.ts
