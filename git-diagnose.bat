@echo off
cd /d "%~dp0"
echo Running diagnostics... > git-diagnose.log
echo === git remote -v === >> git-diagnose.log
git remote -v >> git-diagnose.log 2>&1
echo. >> git-diagnose.log
echo === git fetch -v origin === >> git-diagnose.log
git fetch -v origin >> git-diagnose.log 2>&1
echo. >> git-diagnose.log
echo === local HEAD === >> git-diagnose.log
git rev-parse HEAD >> git-diagnose.log 2>&1
echo. >> git-diagnose.log
echo === origin/main after fetch === >> git-diagnose.log
git rev-parse origin/main >> git-diagnose.log 2>&1
echo. >> git-diagnose.log
echo === git log local vs origin/main (ahead/behind) === >> git-diagnose.log
git rev-list --left-right --count HEAD...origin/main >> git-diagnose.log 2>&1
echo. >> git-diagnose.log
echo === last 3 commits on origin/main === >> git-diagnose.log
git log --oneline -3 origin/main >> git-diagnose.log 2>&1
echo. >> git-diagnose.log
echo === last 3 commits on local HEAD === >> git-diagnose.log
git log --oneline -3 HEAD >> git-diagnose.log 2>&1
echo. >> git-diagnose.log
echo DONE - see git-diagnose.log
type git-diagnose.log
pause
