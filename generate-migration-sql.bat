@echo off
title Generate migration SQL from Prisma schema (no DB connection needed)
cd /d "%~dp0backend"
echo ============================================
echo Generating SQL DDL from prisma/schema.prisma...
echo ============================================
call npx prisma migrate diff --from-empty --to-schema-datamodel prisma\schema.prisma --script > migration.sql
echo.
echo ============================================
echo DONE. migration.sql written to backend\migration.sql
echo ============================================
type migration.sql
pause
