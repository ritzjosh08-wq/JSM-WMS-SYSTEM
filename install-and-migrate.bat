@echo off
echo ==========================================
echo  JSM Logistics - Backend Setup
echo ==========================================
echo.

cd /d "%~dp0backend"

echo [1/2] Installing xlsx package...
call npm install xlsx
if %errorlevel% neq 0 (
  echo ERROR: npm install failed
  pause
  exit /b 1
)
echo Done.
echo.

echo [2/2] Applying database migration (adding inwardDate column)...
call npx prisma db push
if %errorlevel% neq 0 (
  echo ERROR: prisma db push failed
  pause
  exit /b 1
)
echo Done.
echo.

echo ==========================================
echo  Setup complete! You can close this window.
echo ==========================================
pause
