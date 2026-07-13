@echo off
cd /d "%~dp0"
echo Checkpoint 2... > git-checkpoint2.log
git add -A >> git-checkpoint2.log 2>&1
git commit -m "restore: dashboard redesign, logo, bug fixes rebuilt after rebase incident" >> git-checkpoint2.log 2>&1
git fetch origin >> git-checkpoint2.log 2>&1
git merge -X ours --no-edit origin/main >> git-checkpoint2.log 2>&1
git push origin main >> git-checkpoint2.log 2>&1
echo. >> git-checkpoint2.log
git log --oneline -3 >> git-checkpoint2.log 2>&1
echo DONE
pause
