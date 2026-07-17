import os
import datetime
import subprocess
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL", "")
BACKUP_DIR = Path(__file__).parent.parent.parent / "backups"

def backup_db():
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUP_DIR / f"bom_tool_backup_{timestamp}.sql"
    
    if not DATABASE_URL or "postgresql" not in DATABASE_URL:
        print("DATABASE_URL is not set to a PostgreSQL database. Skipping backup.")
        return

    print(f"Starting backup to {backup_file}...")
    
    # Use pg_dump via subprocess
    try:
        # Assuming pg_dump is in PATH
        env = os.environ.copy()
        # Extract connection details if needed, but pg_dump accepts connection strings directly in newer versions
        # pg_dump --dbname=DATABASE_URL -F c -f backup_file
        subprocess.run(
            ["pg_dump", "--dbname", DATABASE_URL, "-F", "c", "-f", str(backup_file)],
            env=env,
            check=True
        )
        print("Backup completed successfully!")
        
        # Retention Policy: keep last 30 backups
        backups = sorted(BACKUP_DIR.glob("*.sql"), key=os.path.getmtime)
        if len(backups) > 30:
            for old_backup in backups[:-30]:
                print(f"Removing old backup: {old_backup}")
                old_backup.unlink()
                
    except subprocess.CalledProcessError as e:
        print(f"Backup failed: {e}")
    except FileNotFoundError:
        print("pg_dump is not installed or not in PATH. Please install PostgreSQL client tools.")

if __name__ == "__main__":
    backup_db()
