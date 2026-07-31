@echo off
title Stop backend (freeing port 5001)
echo Freeing port 5001...
for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":5001 " ^| findstr "LISTENING"') do (
  taskkill /F /PID %%A >nul 2>&1
  echo Killed PID %%A
)
timeout /t 2 /nobreak >nul
echo Done.
pause
