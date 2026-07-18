@echo off
REM Double-clickable wrapper for uninstall.ps1. Pass /purge to also delete data:
REM   uninstall.bat /purge
setlocal
cd /d "%~dp0"
set ARGS=%*
if /I "%ARGS%"=="/purge" set ARGS=-Purge
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %ARGS%
pause
