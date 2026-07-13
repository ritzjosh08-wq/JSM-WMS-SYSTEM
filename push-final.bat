@echo off
cd /d "%~dp0"
echo Running final push... > push-final.log
echo === current branch === >> push-final.log
git rev-parse --abbrev-ref HEAD >> push-final.log 2>&1
echo. >> push-final.log
echo === checkout main (in case detached) === >> push-final.log
git checkout main >> push-final.log 2>&1
echo. >> push-final.log
echo === push === >> push-final.log
git push origin main >> push-final.log 2>&1
echo. >> push-final.log
echo === final status === >> push-final.log
git status >> push-final.log 2>&1
echo DONE - see push-final.log
type push-final.log
pause
