@echo off
cd /d "%~dp0"
echo ============================================
echo  JSM - Sync with remote and push
echo ============================================
if exist ".git\index.lock" del /f /q ".git\index.lock"
echo Fetching remote...
git fetch origin
echo Merging remote history (keeping our customer-app changes on conflict)...
git merge -X ours --no-edit origin/main
echo Pushing to GitHub...
git push origin main
echo.
echo DONE. Review the messages above, then press any key to close.
pause
