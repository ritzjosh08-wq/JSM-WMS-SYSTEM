@echo off
cd /d "%~dp0"
echo Stopping node processes to release the database lock...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 3 /nobreak >nul
(
  echo === push-now %DATE% %TIME% ===
  if exist ".git\index.lock" del /f /q ".git\index.lock"
  echo --- merge origin/main keep ours ---
  git merge -X ours origin/main -m "Merge origin/main"
  echo --- keep dev.db untracked ---
  git rm --cached backend/prisma/dev.db
  git add -A
  git commit --no-edit
  echo --- push ---
  git push origin main
  echo --- final ---
  git --no-pager log --oneline -5
  git status --short
  echo === DONE ===
) > push-now.log 2>&1
type push-now.log
echo.
echo Finished - see push-now.log
pause
