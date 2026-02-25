@echo off
setlocal

:: Move to the directory where the script is located
cd /d "%~dp0"

echo.
echo ========================================================
echo   B^&R PO Extractor - Direct Node Launch
echo ========================================================
echo.
echo Trying to bypass the ampersand issue by calling node directly...
echo.

:: Check for node_modules
if not exist "node_modules\vite\bin\vite.js" (
    echo [!] Vite not found in node_modules.
    echo Running npm install...
    call npm install
)

:: Run node directly on the vite script. 
:: We use the absolute path of the current directory to be safe.
set "VITE_PATH=%~dp0node_modules\vite\bin\vite.js"

echo Executing: node "%VITE_PATH%"
echo.

node "%VITE_PATH%"

if %ERRORLEVEL% neq 0 (
    echo.
    echo [!] Server failed to start.
    echo.
    echo If you see "'R' is not recognized", the only solution is to:
    echo 1. Close this window.
    echo 2. Rename the "B&R Products" folder to "BR Products".
    echo 3. Try again.
    pause
)

pause
endlocal