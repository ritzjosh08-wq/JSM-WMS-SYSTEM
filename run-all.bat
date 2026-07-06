@echo off
title JSM - Run All (Backend + WMS + Customer App)
echo ================================================
echo   JSM Logistics - Starting everything cleanly
echo ================================================
echo.
echo Freeing ports 5001 / 5173 / 5174 (stopping stale Node)...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo.
echo [1/3] Backend API on http://localhost:5001 ...
cd /d "%~dp0backend"
:: run dev even if prisma generate has a hiccup (client is already generated)
start "JSM Backend" cmd /k "(npx prisma generate || echo prisma generate skipped) && npm run dev"
timeout /t 10 /nobreak >nul
echo [2/3] WMS Frontend on http://localhost:5173 ...
cd /d "%~dp0frontend"
start "JSM WMS Frontend" cmd /k "npm run dev"
timeout /t 3 /nobreak >nul
echo [3/3] Customer Portal on http://localhost:5174 ...
cd /d "C:\Users\Ritvik\Claude\Projects\JSM customer app"
start "JSM Customer Portal" cmd /k "npm run dev"
timeout /t 7 /nobreak >nul
echo.
echo Opening both apps in the browser...
start http://localhost:5173
start http://localhost:5174
echo.
echo All three servers are running in their own windows.
echo The "JSM Backend" window should say: Backend server running on http://localhost:5001
echo Keep those windows open. You can close THIS window.
pause
