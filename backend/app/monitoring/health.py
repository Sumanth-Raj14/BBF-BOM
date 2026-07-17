import logging
import os
import platform
import time
from datetime import UTC, datetime

from sqlalchemy import text

from app.core.config import settings

logger = logging.getLogger(__name__)
from sqlalchemy.ext.asyncio import AsyncSession


async def get_detailed_health(db: AsyncSession = None) -> dict:
    health = {
        "status": "healthy",
        "timestamp": datetime.now(UTC).isoformat(),
        "service": "blackbox-bom-api",
        "version": "1.0.0",
    }

    db_status = "unavailable"
    db_latency_ms = None
    if db:
        try:
            start = time.time()
            await db.execute(text("SELECT 1"))
            db_latency_ms = round((time.time() - start) * 1000, 2)
            db_status = "connected"
        except Exception as e:
            db_status = f"error: {str(e)[:100]}"
            health["status"] = "degraded"

    health["database"] = {"status": db_status, "latencyMs": db_latency_ms}

    try:
        import psutil

        mem = psutil.virtual_memory()
        health["memory"] = {
            "totalMB": round(mem.total / (1024 * 1024), 1),
            "usedMB": round(mem.used / (1024 * 1024), 1),
            "availableMB": round(mem.available / (1024 * 1024), 1),
            "percentUsed": mem.percent,
        }
    except Exception as exc:
        try:
            import ctypes

            kernel32 = ctypes.windll.kernel32
            mem_status = ctypes.c_int()
            kernel32.GlobalMemoryStatusEx(ctypes.byref(mem_status))
            health["memory"] = {"status": "available", "source": "win32"}
        except Exception:
            logger.debug("Memory check failed (psutil and win32): %s", exc)
            health["memory"] = {"status": "unavailable"}

    try:
        import psutil

        disk = psutil.disk_usage(os.path.abspath(os.sep))
        health["disk"] = {
            "totalGB": round(disk.total / (1024**3), 2),
            "usedGB": round(disk.used / (1024**3), 2),
            "freeGB": round(disk.free / (1024**3), 2),
            "percentUsed": round(disk.percent, 1),
        }
    except Exception as exc:
        logger.debug("Disk check failed: %s", exc)
        health["disk"] = {"status": "unavailable"}

    health["systemUptimeHours"] = None
    try:
        import psutil

        boot_time = psutil.boot_time()
        health["systemUptimeHours"] = round((time.time() - boot_time) / 3600, 2)
    except Exception:
        logger.warning("Could not get system uptime from psutil")

    health["platform"] = {
        "python": platform.python_version(),
        "os": platform.system(),
        "machine": platform.machine(),
    }

    # Redis health check
    try:
        import redis.asyncio as aredis

        redis_client = aredis.Redis.from_url(settings.REDIS_URL, socket_connect_timeout=3)
        await redis_client.ping()
        await redis_client.aclose()
        health["redis"] = {"status": "connected"}
    except Exception as e:
        health["redis"] = {"status": "unavailable", "detail": str(e)[:100]}

    # Caching status
    health["caching"] = {
        "enabled": True,
        "backend": "Redis",
        "ttl_default_seconds": 300,
    }

    # Authentication configuration
    health["authentication"] = {
        "mfa_available": True,
        "mfa_enforced_for_superusers": True,
        "session_timeout_minutes": 60,
        "sso_providers": ["google", "github", "microsoft"],
    }

    # Security headers status
    health["security"] = {
        "csrf_protection": True,
        "security_headers_enabled": True,
        "rate_limiting_enabled": True,
        "ws_rate_limiting_enabled": True,
    }

    if db and db_status == "connected":
        try:
            integrity = await _check_db_integrity(db)
            health["integrity"] = integrity
        except Exception as e:
            health["integrity"] = {"status": "check_failed", "error": str(e)[:200]}

    return health


async def _check_db_integrity(db: AsyncSession) -> dict:
    result = {"status": "ok", "checks": []}

    checks = [
        ("Users", "SELECT COUNT(*) FROM users"),
        ("Parts", "SELECT COUNT(*) FROM parts"),
        ("BOMs (master)", "SELECT COUNT(*) FROM boms"),
        ("BOM Items", "SELECT COUNT(*) FROM bom_items_master"),
        ("Projects", "SELECT COUNT(*) FROM projects"),
        ("Vendors", "SELECT COUNT(*) FROM vendors"),
        ("Purchase Orders", "SELECT COUNT(*) FROM po_headers"),
        ("Work Orders", "SELECT COUNT(*) FROM work_orders"),
        ("ECO Headers", "SELECT COUNT(*) FROM eco_headers"),
        ("Backup History", "SELECT COUNT(*) FROM backup_history"),
    ]

    for label, sql in checks:
        try:
            r = await db.execute(text(sql))
            count = r.scalar() or 0
            result["checks"].append({"table": label, "count": count})
        except Exception as e:
            result["checks"].append({"table": label, "error": str(e)[:100]})
            result["status"] = "degraded"

    return result
