@echo off
setlocal
set "ROOT=%~dp0"

cd /d "%ROOT%frontend"
if errorlevel 1 goto directory_error

echo Building the frontend...
call npm run build
if errorlevel 1 goto build_error

echo.
echo Starting Studio Gear backend in a separate window...
start "" "%ComSpec%" /k "cd /d ""%ROOT%backend"" && set NODE_ENV=development && node index.js"

echo Backend started in a new terminal window.
echo Keep that window open while the system is in use.
echo.
exit /b 0

:build_error
echo.
echo Frontend build failed. Check the error above.
pause
exit /b 1

:directory_error
echo Could not find the project folders. Run this file from the project folder.
pause
exit /b 1
