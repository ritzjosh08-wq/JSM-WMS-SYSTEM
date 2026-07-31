@echo off
title JSM Logistics - Worker App
cd /d "%~dp0frontend"

echo ========================================
echo   JSM Logistics WMS - Worker App
echo ========================================
echo.
echo This does NOT need the backend running on this laptop - it talks to
echo Ritvik's laptop over the internet (see frontend\.env.worker for the URL).
echo Make sure Ritvik has both start-app.bat AND start-tunnel-ngrok.bat running
echo on his laptop before you use this.
echo.

:: Install dependencies on first run only
if not exist "node_modules" (
  echo [setup] Installing dependencies - first run only, please wait...
  call npm install
)

echo [start] Launching worker app on http://localhost:5180 ...
start "" http://localhost:5180
call npx vite --mode worker --port 5180

pause
