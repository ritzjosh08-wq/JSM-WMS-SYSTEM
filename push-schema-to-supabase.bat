@echo off
title JSM - Push Prisma schema to Supabase Postgres
cd /d "%~dp0backend"
echo ============================================
echo Generating Prisma client for PostgreSQL...
echo ============================================
call npx prisma generate
echo.
echo ============================================
echo Pushing schema to Supabase (creates all tables)...
echo ============================================
call npx prisma db push
echo.
echo ============================================
echo DONE. Scroll up to check for errors.
echo ============================================
pause
