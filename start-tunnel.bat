@echo off
title JSM Backend Tunnel - DO NOT CLOSE while using the mobile app
echo ============================================
echo Starting a public tunnel to localhost:5001 (backend)
echo This window must stay open for the mobile app to work from anywhere.
echo ============================================
echo.
call npx -y cloudflared tunnel --url http://localhost:5001
