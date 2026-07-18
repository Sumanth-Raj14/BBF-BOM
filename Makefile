# Blackbox BOM -- convenience shortcuts around Docker Compose.
#
# Optional: `make` isn't required to run the app (use install.ps1 / the
# `docker compose` commands directly if you don't have `make` on Windows --
# e.g. via Git Bash, WSL, `choco install make`, or `scoop install make`).
#
# Usage:
#   make up        # build + start the stack (same as install.ps1, no browser/health-wait UX)
#   make down      # stop the stack, keep data
#   make uninstall # remove containers/images AND data volumes (asks first)
#   make logs      # tail logs from all services
#   make ps        # show service status
#   make backup    # snapshot DB + uploads + RSA keys to backups/<timestamp>/
#   make restore DIR=backups/20260718-120000
#   make build     # rebuild images without starting
#   make migrate   # run the DB bootstrap manually (normally automatic on start);
#                  # greenfield DBs use create_all+stamp, existing DBs use alembic upgrade head

.PHONY: up down stop uninstall logs ps backup restore build migrate

up:
	docker compose up -d --build

down:
	docker compose down

stop: down

uninstall:
	@echo "WARNING: this will PERMANENTLY DELETE the database, uploaded files, and RSA"
	@echo "signing keys stored in this stack's Docker volumes. This cannot be undone"
	@echo "unless you have a backup (scripts/backup-data.ps1 / scripts/backup-data.sh)."
	@printf "Type YES (all caps) to confirm permanent data deletion: "; \
	read confirm; \
	if [ "$$confirm" != "YES" ]; then echo "Aborted -- no changes made."; exit 1; fi
	docker compose down --volumes --rmi local

logs:
	docker compose logs -f

ps:
	docker compose ps

backup:
	pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/backup-data.ps1 || ./scripts/backup-data.sh

restore:
	@if [ -z "$(DIR)" ]; then echo "Usage: make restore DIR=backups/<timestamp>"; exit 1; fi
	pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/restore-data.ps1 $(DIR) || ./scripts/restore-data.sh $(DIR)

build:
	docker compose build

migrate:
	docker compose exec backend python -m scripts.init_db
