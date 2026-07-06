@echo off
cd /d "%~dp0"
echo ============================================
echo  JSM - Push customer-app UI redesign
echo ============================================
echo Removing stale git lock if present...
if exist ".git\index.lock" del /f /q ".git\index.lock"
git config user.email "ritzjosh08@gmail.com"
git config user.name "Ritvik"
echo Staging customer-app...
git add customer-app
echo Committing...
git commit -m "feat(customer-app): advanced professional UI redesign + JSM Logistics logo"
echo Pushing to GitHub...
git push origin main
echo.
echo DONE. Review the messages above, then press any key to close.
pause
