@echo off
cd /d "%~dp0"
echo ============================================
echo  JSM - Retry push (remote moved since last attempt)
echo ============================================
if exist ".git\index.lock" del /f /q ".git\index.lock"
git config user.email "ritzjosh08@gmail.com"
git config user.name "Ritvik"

echo.
echo Fetching latest remote state...
git fetch origin

echo.
echo Merging remote into local (keeping local changes on conflict)...
git merge -X ours --no-edit origin/main

echo.
echo Pushing to GitHub...
git push origin main

echo.
echo ============================================
echo DONE. Review the messages above for any errors.
echo If it STILL says rejected, run this file again - GitHub had a newer
echo commit than we merged from. Repeating this is safe.
echo ============================================
pause
