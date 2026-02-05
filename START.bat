@echo off
TITLE QueueTrack Launcher
color 0A

REM Change to the directory where this batch file is located
cd /d "%~dp0"

echo.
echo ========================================
echo    QueueTrack - Production Launcher
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org
    echo Download the LTS version and run this again.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js detected
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [INFO] First time setup - Installing dependencies...
    echo This will take 1-2 minutes...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Installation failed!
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencies installed successfully!
    echo.
)

REM Start the application
echo [INFO] Starting QueueTrack...
echo.
npm start

pause

