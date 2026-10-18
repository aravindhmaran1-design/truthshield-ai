@echo off
echo =============================================================
echo  TruthShield AI - Misinformation Analyzer
echo  Setup Script
echo =============================================================
echo.

echo [1/3] Installing Python backend dependencies...
cd /d "%~dp0backend"
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install Python dependencies.
    echo Make sure Python 3.10+ and pip are installed.
    pause
    exit /b 1
)

echo.
echo [2/3] Installing frontend dependencies...
cd /d "%~dp0frontend"
npm install
if errorlevel 1 (
    echo ERROR: Failed to install Node.js dependencies.
    echo Make sure Node.js 18+ is installed.
    pause
    exit /b 1
)

echo.
echo [3/3] Setup complete!
echo.
echo ─────────────────────────────────────────────────────────────
echo  IMPORTANT: Configure your API keys!
echo ─────────────────────────────────────────────────────────────
echo  1. Copy backend\.env.example  to  backend\.env
echo  2. Edit backend\.env and add your:
echo     - GEMINI_API_KEY  (from https://aistudio.google.com/)
echo.
echo  Then run:  START.bat
echo.
pause
