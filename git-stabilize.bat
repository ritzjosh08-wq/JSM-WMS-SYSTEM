@echo off
cd /d "%~dp0"
echo Stabilizing... > git-stabilize.log
echo === removing stale lock/corrupt index === >> git-stabilize.log
if exist ".git\index.lock" del /f /q ".git\index.lock" >> git-stabilize.log 2>&1
if exist ".git\index" del /f /q ".git\index" >> git-stabilize.log 2>&1
echo. >> git-stabilize.log
echo === aborting the stuck rebase (safe, standard git operation) === >> git-stabilize.log
git rebase --abort >> git-stabilize.log 2>&1
echo. >> git-stabilize.log
echo === status after abort === >> git-stabilize.log
git status >> git-stabilize.log 2>&1
echo. >> git-stabilize.log
echo === current branch/HEAD === >> git-stabilize.log
git rev-parse --abbrev-ref HEAD >> git-stabilize.log 2>&1
git log --oneline -3 >> git-stabilize.log 2>&1
echo.
echo DONE - not touching anything else. See git-stabilize.log
type git-stabilize.log
pause
