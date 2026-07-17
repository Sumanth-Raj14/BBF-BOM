@echo off
echo Stopping Blackbox BOM Servers...
for /f "tokens=5" %%a in ('netstat -ano ^| find ":3000 " ^| find "LISTEN"') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| find ":8000 " ^| find "LISTEN"') do taskkill /F /PID %%a 2>nul
echo Servers stopped.
