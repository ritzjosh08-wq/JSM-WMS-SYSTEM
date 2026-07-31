@echo off
title JSM Backend Tunnel (logged) - DO NOT CLOSE
cd /d "%~dp0"
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 2 /nobreak >nul
call npx -y cloudflared tunnel --url http://localhost:5001 > tunnel.log 2>&1
