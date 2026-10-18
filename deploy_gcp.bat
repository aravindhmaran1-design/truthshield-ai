@echo off
echo =============================================================
echo  TruthShield AI - Google Cloud Run Deployment
echo =============================================================
echo.

set /p PROJECT_ID="Enter your GCP Project ID: "
set REGION=us-central1
set SERVICE_NAME=truthshield-ai

echo.
echo [1/3] Enabling Google Cloud APIs...
call gcloud services enable run.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com storage.googleapis.com bigquery.googleapis.com speech.googleapis.com texttospeech.googleapis.com translate.googleapis.com --project %PROJECT_ID%

echo.
echo [2/3] Building and Deploying to Google Cloud Run...
call gcloud run deploy %SERVICE_NAME% --source . --region %REGION% --platform managed --allow-unauthenticated --project %PROJECT_ID%

echo.
echo =============================================================
echo Deployment complete! Check the Cloud Run URL above.
echo =============================================================
pause
