@echo off
title JSM Customer Portal - Netlify Deploy
cd /d "%~dp0"

echo ============================================
echo Step 1/3: Building the app (with tunnel API URL baked in)...
echo ============================================
call npm run build
if errorlevel 1 (
  echo BUILD FAILED. See errors above.
  pause
  exit /b 1
)

echo.
echo ============================================
echo Step 2/3: Netlify login (should be instant if already authorized)
echo ============================================
call npx -y netlify-cli login

echo.
echo ============================================
echo Step 3/3: Deploying dist/ to Netlify (site: jsm-logistics-portal)
echo ============================================
call npx -y netlify-cli deploy --prod --dir=dist --site=a1c26c51-4828-454a-8b50-652cf4b39a79

echo.
echo ============================================
echo DONE. Copy the "Website URL" printed above.
echo ============================================
pause
