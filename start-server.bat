@echo off
setlocal
title Studio Gear - Shared Server

cd /d "%~dp0frontend"
if errorlevel 1 goto directory_error

echo Building the frontend...
call npm run build
if errorlevel 1 goto build_error

cd /d "%~dp0backend"
if errorlevel 1 goto directory_error

set "NODE_ENV=development"
echo.
echo Starting Studio Gear server on port 3000...
echo Keep this window open while others use the system.
node index.js
echo.
echo The server has stopped.
pause
exit /b

:build_error
echo.
echo Frontend build failed. Check the error above.
pause
exit /b 1

:directory_error
echo Could not find the project folders. Run this file from the project folder.
pause
exit /b 1
