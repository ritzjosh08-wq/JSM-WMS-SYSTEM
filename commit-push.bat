@echo off
cd /d "%~dp0"
echo ============================================
echo  JSM - Commit and push todays work
echo ============================================
if exist ".git\index.lock" del /f /q ".git\index.lock"
git config user.email "ritzjosh08@gmail.com"
git config user.name "Ritvik"
echo Staging changes...
git add customer-app backend run-all.bat
echo Committing...
git commit -m "feat: app Reports + Warehouse Map, Cycle Count/Material Master analytics, 2nd Chennai worker (CM36), backend JSON error guards, run-all.bat"
echo Fetching + merging remote...
git fetch origin
git merge -X ours --no-edit origin/main
echo Pushing to GitHub...
git push origin main
echo.
echo DONE. Review the messages above, then press any key to close.
pause
