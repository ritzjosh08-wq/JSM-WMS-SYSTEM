@echo off
REM ============================================================
REM  JSM Logistics - GitHub Sync
REM  Commits local changes and pushes them to GitHub.
REM  Safe to run manually OR from the scheduled task.
REM  All output is logged to github-sync.log (gitignored).
REM ============================================================
cd /d "%~dp0"
call :run >> "%~dp0github-sync.log" 2>&1
echo Sync finished. Details written to github-sync.log
exit /b

:run
echo.
echo ============================================================
echo  Sync run: %DATE% %TIME%
echo ============================================================
set "REMOTE=https://github.com/shameerfarveaz/JSM-LOGISTICS-FINAL-SOFTWARE.git"

if exist ".git" goto haverepo
echo Initializing git repository...
git init
git branch -M main
git remote add origin %REMOTE%
echo Fetching existing history from GitHub...
git fetch origin
echo Adopting remote history - local files are kept untouched...
git reset --mixed origin/main
:haverepo

git remote get-url origin >nul 2>&1
if errorlevel 1 git remote add origin %REMOTE%

git config user.email >nul 2>&1
if errorlevel 1 git config user.email "ritzjosh08@gmail.com"
git config user.name >nul 2>&1
if errorlevel 1 git config user.name "Ritvik"

if exist ".git\index.lock" del /f /q ".git\index.lock"
echo Staging all changes...
git add -A

echo Checking for changes...
git diff --cached --quiet
if errorlevel 1 git commit -m "Customer portal: inventory carries inward/outward details; worker dropdown; remove inward/outward modules for customers; multi-warehouse scope"

echo Pulling latest from GitHub via rebase...
git pull --rebase origin main
if errorlevel 1 goto rebasefail

echo Pushing to GitHub...
git push origin main
if errorlevel 1 goto pushfail

echo SUCCESS: pushed to GitHub.
exit /b 0

:rebasefail
echo WARNING: rebase hit a conflict. Resolve it manually, then run this again.
exit /b 1

:pushfail
echo ERROR: push failed. You may need to sign in to GitHub, or you may not have write access to this repo.
exit /b 1
