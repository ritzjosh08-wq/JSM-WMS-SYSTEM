@echo off
cd /d "%~dp0"

echo ============================================
echo  JSM Logistics - Git Commit Helper
echo ============================================
echo.

echo [0/5] Removing git lock file if present...
if exist ".git\index.lock" (
    del /f ".git\index.lock"
    echo     Deleted .git\index.lock
) else (
    echo     No lock file found.
)

echo [1/5] Removing node_modules from git tracking (this takes a minute)...
git rm -r --cached node_modules --quiet 2>nul
git rm -r --cached frontend/node_modules --quiet 2>nul
git rm -r --cached backend/node_modules --quiet 2>nul
git rm -r --cached backend/dist --quiet 2>nul
git rm -r --cached frontend/dist --quiet 2>nul
git rm -r --cached desktop.ini --quiet 2>nul

echo [2/5] Staging all source file changes...
git add -A

echo [3/5] Current status:
git status --short

echo.
echo [4/5] Committing...
git commit -m "feat: MaterialMaster warehouse charts (CM35 floor+rack, FG05), activity line chart, RM pie cleanup"

echo.
echo [5/5] Pushing to GitHub...
git push origin main

echo.
echo ============================================
echo  Done! Check GitHub to verify the push.
echo ============================================
pause
