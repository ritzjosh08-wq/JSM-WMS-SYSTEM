@echo off
title JSM Logistics - Startup

echo ========================================
echo   JSM Logistics WMS - Starting...
echo ========================================
echo.

:: Start Backend
echo [1/2] Starting Backend (port 5000)...
cd /d "%~dp0backend"
start "JSM Backend" cmd /k "npx prisma generate && npm run dev"

:: Small delay so backend starts first
timeout /t 4 /nobreak > nul

:: Start Frontend
echo [2/2] Starting Frontend (port 5173)...
cd /d "%~dp0frontend"
start "JSM Frontend" cmd /k "npm run dev"

:: Wait for frontend to boot then open browser
timeout /t 5 /nobreak > nul
echo.
echo Opening app in browser...
start http://localhost:5173

echo.
echo Both servers are starting. Check the two terminal windows for status.
echo.
pause
