@echo off
title Test Postgres connection
cd /d "%~dp0backend"
echo Testing connection...
call npx prisma db pull --print
pause
