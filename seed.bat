@echo off
cd /d "%~dp0backend"
echo Seeding shared database...
node seed-data.cjs > "%~dp0seed.log" 2>&1
type "%~dp0seed.log"
echo.
echo Done - see seed.log
pause
