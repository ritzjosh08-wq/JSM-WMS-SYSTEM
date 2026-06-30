@echo off
cd /d "%~dp0"
(
  echo === finish-sync %DATE% %TIME% ===
  if exist ".git\index.lock" del /f /q ".git\index.lock"
  git checkout HEAD -- customer-app
  findstr /x "backend/prisma/dev.db" .gitignore >nul 2>&1 || echo backend/prisma/dev.db>> .gitignore
  git rm --cached backend/prisma/dev.db
  echo --- staging + commit ---
  git add -A
  git commit -m "Customer portal: inventory carries inward/outward details, worker dropdown, multi-warehouse scope; untrack runtime dev.db; keep WH-DEFAULT cleanup"
  echo --- merge origin/main keep ours ---
  git merge -X ours origin/main -m "Merge origin/main"
  echo --- resolve dev.db keep-untracked ---
  git rm --cached backend/prisma/dev.db
  git add -A
  git commit --no-edit
  echo --- push ---
  git push origin main
  echo --- final state ---
  git --no-pager log --oneline -4
  git status --short
  echo === DONE ===
) > finish-sync.log 2>&1
type finish-sync.log
echo.
echo Finished - see finish-sync.log
pause
