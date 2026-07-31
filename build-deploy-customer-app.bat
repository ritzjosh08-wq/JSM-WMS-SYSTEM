@echo off
title Build and deploy customer-app (new logo)
cd /d "%~dp0customer-app"
echo ============================================
echo Building customer-app with new logo/icons...
echo ============================================
call npm run build
if errorlevel 1 (
  echo BUILD FAILED
  pause
  exit /b 1
)
echo ============================================
echo Deploying to Netlify (production)...
echo ============================================
call npx netlify deploy --prod --dir=dist
echo ============================================
echo DONE.
echo ============================================
pause
