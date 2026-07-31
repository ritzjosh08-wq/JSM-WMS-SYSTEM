@echo off
cd /d "C:\Users\Ritvik\Downloads\JSM-LOGISTICS-FINAL-SOFTWARE-main (3)\JSM-LOGISTICS-FINAL-SOFTWARE-main\backend"
railway up --service backend --environment production --detach > deploy-backend.log 2>&1
echo DEPLOY_DONE >> deploy-backend.log
