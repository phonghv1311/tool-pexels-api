@echo off
title Pexels Video Studio Web Tool
echo =======================================================
echo   Pexels Video Studio - Batch Downloader & Merger
echo =======================================================
echo.
echo Checking dependencies...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not found in PATH!
    pause
    exit /b
)

echo Starting web server on http://localhost:3050 ...
start http://localhost:3050
node server.js
pause
