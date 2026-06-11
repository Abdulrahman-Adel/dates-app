@echo off
rem ── Date Night: one-click database backup ──
rem Double-click me. Everything is saved into the "backups" folder.
cd /d "%~dp0"
node backup.js
echo.
pause
