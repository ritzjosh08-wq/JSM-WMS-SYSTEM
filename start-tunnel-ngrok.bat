@echo off
title JSM Backend Tunnel (ngrok) - DO NOT CLOSE while a worker's laptop is using the app
cd /d "%~dp0"

echo ============================================
echo Starting a STABLE public tunnel to localhost:5001 (backend)
echo This window must stay open for the worker's laptop to reach the backend.
echo ============================================
echo.
echo First-time setup (once per laptop):
echo   1. Sign up free:  https://dashboard.ngrok.com/signup
echo   2. Install ngrok, then run:  ngrok config add-authtoken YOUR_TOKEN
echo   3. Copy your free permanent domain from the ngrok dashboard
echo      (Universal Gateway -^> Domains) - looks like abc-123.ngrok-free.dev
echo   4. Edit this file's NGROK_DOMAIN line below to match it, just once.
echo.

:: ── Edit this line once, after step 3 above ──────────────────────────────
set NGROK_DOMAIN=YOUR-NGROK-DOMAIN.ngrok-free.dev

if "%NGROK_DOMAIN%"=="YOUR-NGROK-DOMAIN.ngrok-free.dev" (
  echo [!] You haven't set your ngrok domain yet - see the steps above.
  echo     Edit start-tunnel-ngrok.bat and replace NGROK_DOMAIN, then rerun this.
  pause
  exit /b 1
)

echo Using domain: %NGROK_DOMAIN%
echo.
ngrok http --domain=%NGROK_DOMAIN% 5001
