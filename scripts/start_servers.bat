@echo off
echo Starting Blackbox BOM Servers...

:: Kill any existing processes on ports 3000 and 8000
for /f "tokens=5" %%a in ('netstat -ano ^| find ":3000 " ^| find "LISTEN"') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| find ":8000 " ^| find "LISTEN"') do taskkill /F /PID %%a 2>nul
timeout /t 2 /nobreak >nul

:: Start Backend (port 8000)
start "Blackbox-Backend" /min cmd /c "cd /d "%~dp0..\backend" && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

:: Start Frontend (port 3000)
start "Blackbox-Frontend" /min cmd /c "cd /d "%~dp0..\frontend" && python serve.py"

echo Done. Backend=http://localhost:8000 Frontend=http://localhost:3000
