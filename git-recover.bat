@echo off
cd /d "%~dp0"
echo Recovering... > git-recover.log
echo === before: current branch/HEAD === >> git-recover.log
git rev-parse --abbrev-ref HEAD >> git-recover.log 2>&1
git rev-parse HEAD >> git-recover.log 2>&1
echo. >> git-recover.log
echo === forcing local main to point at the commit with today's work === >> git-recover.log
git branch -f main 97f49f13f5a7a71237bc57d7bb1c28f7797e182c >> git-recover.log 2>&1
echo. >> git-recover.log
echo === checking out main (this restores the files on disk) === >> git-recover.log
git checkout main >> git-recover.log 2>&1
echo. >> git-recover.log
echo === status after checkout === >> git-recover.log
git status >> git-recover.log 2>&1
echo. >> git-recover.log
echo === verifying package.json has bcryptjs (should say a match) === >> git-recover.log
findstr /C:"bcryptjs" backend\package.json >> git-recover.log 2>&1
echo. >> git-recover.log
echo === pushing === >> git-recover.log
git push origin main >> git-recover.log 2>&1
echo. >> git-recover.log
echo === final log === >> git-recover.log
git log --oneline -3 >> git-recover.log 2>&1
echo DONE - see git-recover.log
type git-recover.log
pause
