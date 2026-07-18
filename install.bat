@echo off
REM Double-clickable wrapper for install.ps1 -- lets a non-technical user
REM just double-click this file in File Explorer instead of opening
REM PowerShell manually. See INSTALL.md for the full guide.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
if %ERRORLEVEL% neq 0 (
    echo.
    echo Install did not finish successfully -- see the messages above.
    pause
    exit /b %ERRORLEVEL%
)
pause
