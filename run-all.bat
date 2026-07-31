@echo off
title JSM - Run All (Backend + WMS + Customer App)
echo ================================================
echo   JSM Logistics - Starting everything cleanly
echo ================================================
echo.
echo Freeing ports 5001 / 5173 / 5174 (stopping stale Node)...
:: Only kill whatever is actually LISTENING on our three ports, instead of every
:: node.exe on the system. A blanket "taskkill /IM node.exe" also kills the
:: Cloudflare tunnel (it runs via npx, which is a node.exe process) even though
:: the tunnel doesn't touch these ports at all -- that was silently breaking the
:: mobile app's connection to the backend every time this script ran.
for %%P in (5001 5173 5174) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%A >nul 2>&1
  )
)
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
cd /d "%~dp0customer-app"
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
