@echo off
title JSM Logistics - Customer Portal

echo ========================================
echo   JSM Logistics - Customer Portal
echo ========================================
echo.
echo NOTE: Start the WMS backend first - start-app.bat in the WMS repo
echo       so the API is available on http://localhost:5001
echo.

cd /d "%~dp0"

:: Install dependencies on first run
if not exist "node_modules" goto install
goto run

:install
echo [setup] Installing dependencies - first run only, please wait...
call npm install
goto run

:run
echo [start] Launching customer portal on http://localhost:5174 ...
start "" http://localhost:5174
call npm run dev

pause
