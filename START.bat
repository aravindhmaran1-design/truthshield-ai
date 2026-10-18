@echo off
echo =============================================================
echo  TruthShield AI - Misinformation Analyzer
echo  Starting Application...
echo =============================================================
echo.

REM Check if .env exists
if not exist "%~dp0backend\.env" (
    echo WARNING: backend\.env not found!
    echo Please copy backend\.env.example to backend\.env
    echo and fill in your GEMINI_API_KEY
    echo.
    pause
)

echo Starting Backend API server on http://localhost:8000 ...
start "TruthShield - Backend" cmd /k "cd /d "%~dp0backend" && python main.py"

timeout /t 3 /nobreak > nul

echo Starting Frontend on http://localhost:5173 ...
start "TruthShield - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 4 /nobreak > nul

echo.
echo =============================================================
echo  TruthShield AI is running!
echo.
echo  Frontend:  http://localhost:5173
echo  Backend:   http://localhost:8000
echo  API Docs:  http://localhost:8000/docs
echo =============================================================
echo.

start http://localhost:5173
