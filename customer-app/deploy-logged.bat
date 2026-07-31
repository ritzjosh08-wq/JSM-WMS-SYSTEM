@echo off
title JSM Customer Portal - Netlify Deploy (logged)
cd /d "%~dp0"
(
  echo ============================================
  echo Step 1/2: Building the app...
  echo ============================================
  call npm run build
  echo.
  echo ============================================
  echo Step 2/2: Deploying dist/ to Netlify...
  echo ============================================
  call npx -y netlify-cli deploy --prod --dir=dist --site=a1c26c51-4828-454a-8b50-652cf4b39a79
  echo.
  echo ============================================
  echo DEPLOY_SCRIPT_DONE
  echo ============================================
) > deploy.log 2>&1
type deploy.log
