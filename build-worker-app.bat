@echo off
title JSM Logistics - Build Worker App Link
cd /d "%~dp0frontend"

echo ========================================
echo   Building the Worker App (static site)
echo ========================================
echo.
echo This builds a static version of the app using frontend\.env.worker
echo (make sure you've already set your ngrok domain in that file - see
echo WORKER-LAPTOP-SETUP.md if you haven't).
echo.

if not exist "node_modules" (
  echo [setup] Installing dependencies - first run only, please wait...
  call npm install
)

call npx vite build --mode worker
if errorlevel 1 (
  echo.
  echo [!] Build failed - see errors above.
  pause
  exit /b 1
)

echo.
echo [ok] Built to frontend\dist
echo.
echo Next: go to https://dash.cloudflare.com -^> Workers ^& Pages -^> Create -^>
echo Pages -^> Upload assets, and drag in the "dist" folder above. Cloudflare
echo gives you a permanent link like https://your-project.pages.dev - that's
echo the link to share with the worker. Full steps in WORKER-LAPTOP-SETUP.md.
echo.
start "" "%~dp0frontend\dist"
pause
