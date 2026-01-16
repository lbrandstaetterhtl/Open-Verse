@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0../.."
npx tsx scripts/db/check-db.cjs
