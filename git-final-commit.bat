@echo off
cd /d "%~dp0"
echo Final commit + push... > git-final-commit.log
echo === safety: abort rebase if somehow still active (harmless no-op otherwise) === >> git-final-commit.log
git rebase --abort >> git-final-commit.log 2>&1
echo. >> git-final-commit.log
echo === branch/HEAD === >> git-final-commit.log
git rev-parse --abbrev-ref HEAD >> git-final-commit.log 2>&1
git log --oneline -1 >> git-final-commit.log 2>&1
echo. >> git-final-commit.log
echo === staging everything currently on disk === >> git-final-commit.log
git add -A >> git-final-commit.log 2>&1
echo. >> git-final-commit.log
echo === committing === >> git-final-commit.log
git commit -m "checkpoint: restore auth/deploy work after stuck-rebase incident" >> git-final-commit.log 2>&1
echo. >> git-final-commit.log
echo === fetching origin === >> git-final-commit.log
git fetch origin >> git-final-commit.log 2>&1
echo. >> git-final-commit.log
echo === merging origin/main, preferring local on conflict === >> git-final-commit.log
git merge -X ours --no-edit origin/main >> git-final-commit.log 2>&1
echo. >> git-final-commit.log
echo === pushing === >> git-final-commit.log
git push origin main >> git-final-commit.log 2>&1
echo. >> git-final-commit.log
echo === final state === >> git-final-commit.log
git log --oneline -3 >> git-final-commit.log 2>&1
echo DONE - see git-final-commit.log
pause
