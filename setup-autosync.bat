@echo off
title JSM Logistics - Set up GitHub Auto-Sync
echo ============================================================
echo  Setting up daily automatic GitHub sync
echo ============================================================
echo.

set "SCRIPT=%~dp0push-to-github.bat"

echo Registering a Windows scheduled task that runs:
echo   %SCRIPT%
echo every day at 6:00 PM.
echo.

schtasks /create /tn "JSM GitHub AutoSync" /tr "\"%SCRIPT%\"" /sc daily /st 18:00 /f
if errorlevel 1 (
  echo.
  echo ERROR: could not create the scheduled task.
  pause
  exit /b 1
)

echo.
echo ------------------------------------------------------------
echo  Task created. Current definition:
echo ------------------------------------------------------------
schtasks /query /tn "JSM GitHub AutoSync"
echo.
echo ============================================================
echo  Done! Your changes will be pushed to GitHub daily at 6 PM.
echo  (Runs only while your PC is on and you are signed in.)
echo  You can also push anytime by double-clicking push-to-github.bat
echo ============================================================
pause
