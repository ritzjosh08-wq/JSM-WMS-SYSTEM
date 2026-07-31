@echo off
cd /d "C:\Users\Ritvik\Downloads\JSM-LOGISTICS-FINAL-SOFTWARE-main (3)\JSM-LOGISTICS-FINAL-SOFTWARE-main\frontend"
netlify deploy --build --prod --site f61c56a7-b8cf-42a5-b334-7f1884406533 > deploy-frontend.log 2>&1
echo DEPLOY_DONE >> deploy-frontend.log
