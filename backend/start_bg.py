import subprocess, sys, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
p = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
print(f"Backend started with PID {p.pid}")
