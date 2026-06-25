@echo off
title JSM Logistics - Full Setup
echo ==========================================
echo   JSM Logistics WMS - Full Setup
echo ==========================================
echo.

cd /d "%~dp0"

echo [1/4] Installing root dev tools...
call npm install --no-audit --no-fund
if %errorlevel% neq 0 ( echo ERROR: root npm install failed & pause & exit /b 1 )
echo Done.
echo.

echo [2/4] Installing backend dependencies...
cd /d "%~dp0backend"
call npm install --no-audit --no-fund
if %errorlevel% neq 0 ( echo ERROR: backend npm install failed & pause & exit /b 1 )
echo Generating Prisma client...
call npx prisma generate
if %errorlevel% neq 0 ( echo ERROR: prisma generate failed & pause & exit /b 1 )
echo Creating / updating local database...
call npx prisma db push
if %errorlevel% neq 0 ( echo ERROR: prisma db push failed & pause & exit /b 1 )
echo Done.
echo.

echo [3/4] Installing frontend dependencies...
cd /d "%~dp0frontend"
call npm install --no-audit --no-fund
if %errorlevel% neq 0 ( echo ERROR: frontend npm install failed & pause & exit /b 1 )
echo Done.
echo.

echo [4/4] Setup complete!
echo ==========================================
echo   SETUP COMPLETE - you can close this.
echo   Next: double-click start-app.bat
echo ==========================================
echo SETUP_FINISHED_OK
pause
