@echo off
cd /d "C:\Users\Ritvik\Downloads\JSM-LOGISTICS-FINAL-SOFTWARE-main (3)\JSM-LOGISTICS-FINAL-SOFTWARE-main\backend"
echo Starting backend (if not already running)... > tunnel-setup.log
start "JSM Backend" cmd /k "npm run dev"
timeout /t 10 /nobreak >> tunnel-setup.log
echo Starting Cloudflare tunnel... >> tunnel-setup.log
start "Cloudflare Tunnel" cmd /k "npx --yes cloudflared tunnel --url http://localhost:5001 > tunnel-output.log 2>&1"
timeout /t 20 /nobreak >> tunnel-setup.log
echo Done - check tunnel-output.log for the public URL >> tunnel-setup.log
