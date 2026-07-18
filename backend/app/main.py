import asyncio
import json
import logging
import os
import signal
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, WebSocketException, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.api_v1 import api_router
from app.core.audit_middleware import AuditLogMiddleware, RequestIDMiddleware
from app.core.compress import CompressionMiddleware
from app.core.config import settings
from app.core.csrf import CSRFMiddleware
from app.core.rate_limit import init_limiter, limiter
from app.core.sanitize import InputSanitizationMiddleware
from app.core.security_headers import SecurityHeadersMiddleware
from app.core.session_timeout import SessionTimeoutMiddleware
from app.core.ws_auth import authenticate_websocket
from app.models import *
from app.monitoring.metrics import MetricsMiddleware, metrics
from app.monitoring.sentry import init_sentry

logger = logging.getLogger(__name__)

_backup_task = None
_integration_drain_task = None
_zoho_poll_task = None
_INTEGRATION_DRAIN_INTERVAL_SECONDS = 15
# Scheduler tick for the Zoho inbound poll. Faster than the smallest per-tenant
# sync_cadence_seconds (default 300s); the poller gates each connection by its
# own cadence, so this only bounds how quickly a due connection is picked up.
_ZOHO_POLL_TICK_SECONDS = 60


async def _run_integration_drainer(interval: int = _INTEGRATION_DRAIN_INTERVAL_SECONDS):
    """Periodically drain the integration outbox with its OWN DB session.

    Mirrors _run_backup_scheduler: scheduled via asyncio.create_task on startup and
    cancelled on shutdown. Uses an owned async session (not a request dependency).
    """
    from app.integrations.worker import drain_integration_outbox_once

    while True:
        try:
            result = await drain_integration_outbox_once()
            if result and any(result.values()):
                logger.info("Integration outbox drained: %s", result)
        except Exception as e:
            logger.error("Integration outbox drain failed: %s", e)
        await asyncio.sleep(interval)


async def _run_zoho_poll_scheduler(interval: int = _ZOHO_POLL_TICK_SECONDS):
    """Periodically run the Zoho Books INBOUND poll (Books -> tool) with its OWN
    DB session, mirroring the outbox drainer (spec §4.4). Only ENABLED zoho_books
    connections are polled, each gated by its own sync_cadence_seconds; a
    tenant-less run establishes per-tenant context internally (spec §4.0)."""
    from app.integrations.zoho_inbound import poll_zoho_inbound_once

    while True:
        try:
            result = await poll_zoho_inbound_once(respect_cadence=True)
            if result:
                logger.info("Zoho inbound poll: %s", result)
        except Exception as e:
            logger.error("Zoho inbound poll failed: %s", e)
        await asyncio.sleep(interval)


async def _run_backup_scheduler():
    while True:
        try:
            from app.core.backup import run_backup_pipeline

            logger.info("Running scheduled backup...")
            result = await run_backup_pipeline()
            status = "ok" if result.get("verified") else "unverified"
            logger.info(
                f"Scheduled backup complete: status={status}, size={result.get('full', {}).get('size')}"
            )
        except Exception as e:
            logger.error(f"Scheduled backup failed: {e}")
        await asyncio.sleep(settings.BACKUP_SCHEDULE_HOURS * 3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.db.base import Base
    from app.db.session import init_engine

    engine = await init_engine()
    if os.environ.get("SKIP_CREATE_ALL", "").lower() not in ("true", "1"):
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.warning(
            "Base.metadata.create_all() is DEPRECATED after Migration 022. "
            "All tables should be created via Alembic. "
            "Set SKIP_CREATE_ALL=true env var to suppress this call."
        )
    else:
        logger.info("SKIP_CREATE_ALL=true — skipping Base.metadata.create_all()")

    from app.core.tenant_events import register_tenant_listeners

    register_tenant_listeners()
    logger.info("Tenant isolation event listeners registered")

    from app.core.job_queue import start_queue_worker

    await start_queue_worker()
    logger.info("Background job queue worker started")

    # Initialize Redis-backed rate limiter
    try:
        redis_limiter = await init_limiter()
        app.state.limiter = redis_limiter
        logger.info("Rate limiter initialized with Redis-backed storage")
    except Exception as e:
        logger.warning("Failed to initialize Redis rate limiter: %s", e)

    from scripts.startup_health_check import check_backup_system, check_database

    db_health = await check_database()
    backup_health = await check_backup_system()
    if db_health.get("status") == "unhealthy":
        logger.error("DATABASE HEALTH CHECK FAILED: %s", db_health.get("error"))
    elif db_health.get("status") == "degraded":
        logger.warning(
            "Database health degraded: %s",
            [c for c in db_health.get("checks", []) if c.get("status") != "ok"],
        )
    else:
        logger.info(
            "Database health check passed (%d tables, WAL=%s, archive=%s)",
            next(
                (c.get("count") for c in db_health.get("checks", []) if c["check"] == "tables"), 0
            ),
            next(
                (c.get("value") for c in db_health.get("checks", []) if c["check"] == "wal_level"),
                "?",
            ),
            next(
                (
                    c.get("value")
                    for c in db_health.get("checks", [])
                    if c["check"] == "archive_mode"
                ),
                "?",
            ),
        )
    if backup_health.get("status") != "ok":
        logger.warning(
            "Backup system issue: %s",
            [c for c in backup_health.get("checks", []) if c.get("status") != "ok"],
        )
    else:
        backup_count = next(
            (
                c.get("count")
                for c in backup_health.get("checks", [])
                if c["check"] == "existing_backups"
            ),
            0,
        )
        logger.info("Backup system OK (%d existing backups)", backup_count)

    global _backup_task, _integration_drain_task, _zoho_poll_task
    _backup_task = asyncio.create_task(_run_backup_scheduler())
    _integration_drain_task = asyncio.create_task(_run_integration_drainer())
    logger.info("Integration outbox drainer scheduled (every %ds)", _INTEGRATION_DRAIN_INTERVAL_SECONDS)
    _zoho_poll_task = asyncio.create_task(_run_zoho_poll_scheduler())
    logger.info("Zoho Books inbound poll scheduled (tick %ds)", _ZOHO_POLL_TICK_SECONDS)

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(
                sig, lambda s=sig: logger.info("Received %s, shutting down...", s.name)
            )
        except (NotImplementedError, ValueError):
            logger.warning("Could not register signal handler for %s", sig.name)

    yield
    from app.core.audit_middleware import drain_pending_audit_tasks

    await drain_pending_audit_tasks()
    from app.core.job_queue import stop_queue_worker

    await stop_queue_worker()
    if _backup_task:
        _backup_task.cancel()
    if _integration_drain_task:
        _integration_drain_task.cancel()
    if _zoho_poll_task:
        _zoho_poll_task.cancel()
    try:
        from app.db.session import get_engine

        engine = get_engine()
        await engine.dispose()
        logger.info("Database connections closed")
    except Exception:
        logger.debug("No database engine to dispose")


app = FastAPI(
    title=settings.PROJECT_NAME,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    servers=[{"url": "http://localhost:8000", "description": "Local dev"}],
    lifespan=lifespan,
)
app.state.limiter = limiter


async def _rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    retry_after = 60
    if hasattr(exc, "retry_after") and exc.retry_after:
        retry_after = int(exc.retry_after)
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Rate limit exceeded",
            "request_id": getattr(request.state, "request_id", None),
        },
        headers={"Retry-After": str(retry_after)},
    )


app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "request_id": getattr(request.state, "request_id", None),
        },
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "request_id": getattr(request.state, "request_id", None),
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "request_id": getattr(request.state, "request_id", None),
        },
    )


init_sentry()

app.add_middleware(SessionTimeoutMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(CompressionMiddleware)
app.add_middleware(InputSanitizationMiddleware)
app.add_middleware(CSRFMiddleware, secret=settings.SECRET_KEY)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(AuditLogMiddleware)
app.add_middleware(MetricsMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-API-Key",
        "X-CSRF-Token",
        "X-Request-ID",
        "Accept",
        "Origin",
        "Referer",
        "User-Agent",
    ],
)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.ALLOWED_HOSTS,
)
# TenantIsolationMiddleware intentionally NOT registered here:
# Tenant context is set in deps.py after authentication completes.
# Registering it here would require JWT decoding before DI has run,
# which is handled by the tenant_middleware module but is redundant
# with the per-request tenant isolation in deps.py get_current_user.

app.include_router(api_router, prefix=settings.API_V1_STR)


class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}
        self.user_connections: dict[int, list[WebSocket]] = {}
        self.channel_presence: dict[str, set[int]] = {}  # channel -> set of user_ids
        self.channel_cursors: dict[str, dict[int, dict]] = {}  # channel -> {user_id: cursor_pos}
        self.doc_locks: dict[str, int] = {}  # document_id -> user_id holding lock

    async def connect(self, ws: WebSocket, channel: str, user_id: int = None):
        await ws.accept()
        if channel not in self.active:
            self.active[channel] = []
        self.active[channel].append(ws)
        if user_id:
            ws.user_id = user_id
            if user_id not in self.user_connections:
                self.user_connections[user_id] = []
            self.user_connections[user_id].append(ws)
            if channel not in self.channel_presence:
                self.channel_presence[channel] = set()
            self.channel_presence[channel].add(user_id)
            await self._broadcast_presence(channel)
        self._update_ws_metric()

    def disconnect(self, ws: WebSocket, channel: str):
        if channel in self.active:
            self.active[channel] = [c for c in self.active[channel] if c != ws]
        user_id = getattr(ws, "user_id", None)
        if user_id and user_id in self.user_connections:
            self.user_connections[user_id] = [c for c in self.user_connections[user_id] if c != ws]
            if channel in self.channel_presence and user_id in self.channel_presence[channel]:
                self.channel_presence[channel].discard(user_id)
                if not self.channel_presence[channel]:
                    del self.channel_presence[channel]
                else:
                    asyncio.ensure_future(self._broadcast_presence(channel))
            if channel in self.channel_cursors and user_id in self.channel_cursors[channel]:
                del self.channel_cursors[channel][user_id]
        self._update_ws_metric()

    def _update_ws_metric(self):
        total = sum(len(conns) for conns in self.active.values())
        metrics.set_websocket_connections(total)

    async def broadcast(self, channel: str, message: dict):
        if channel in self.active:
            dead = []
            for ws in self.active[channel]:
                try:
                    await ws.send_json(message)
                except Exception:
                    logger.debug("WS send failed, marking dead connection")
                    dead.append(ws)
            for ws in dead:
                self.active[channel] = [c for c in self.active[channel] if c != ws]

    async def broadcast_except(self, channel: str, message: dict, exclude_user_id: int):
        if channel in self.active:
            dead = []
            for ws in self.active[channel]:
                if getattr(ws, "user_id", None) == exclude_user_id:
                    continue
                try:
                    await ws.send_json(message)
                except Exception:
                    logger.debug("WS send failed in broadcast_except, marking dead")
                    dead.append(ws)
            for ws in dead:
                self.active[channel] = [c for c in self.active[channel] if c != ws]

    async def _broadcast_presence(self, channel: str):
        if channel in self.channel_presence:
            await self.broadcast(
                channel,
                {
                    "type": "presence",
                    "users": list(self.channel_presence[channel]),
                    "count": len(self.channel_presence[channel]),
                },
            )

    async def send_to_user(self, user_id: int, message: dict):
        if user_id in self.user_connections:
            dead = []
            for ws in self.user_connections[user_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    logger.debug("WS send_to_user failed, marking dead")
                    dead.append(ws)
            for ws in dead:
                self.user_connections[user_id] = [
                    c for c in self.user_connections[user_id] if c != ws
                ]

    async def send_mention_notifications(
        self, mentioned_user_ids: list[int], message: dict, channel: str
    ):
        # Only notify users who are actually present in the sender's (tenant-scoped)
        # channel. This prevents a client from pushing notifications to arbitrary
        # user_ids in other channels/tenants.
        members = self.channel_presence.get(channel, set())
        for uid in mentioned_user_ids:
            if uid in members:
                await self.send_to_user(uid, message)

    async def handle_collab_message(self, msg: dict, user_id: int, channel: str):
        msg_type = msg.get("type", "")
        if msg_type == "cursor":
            if channel not in self.channel_cursors:
                self.channel_cursors[channel] = {}
            self.channel_cursors[channel][user_id] = {
                "position": msg.get("position"),
                "selection": msg.get("selection"),
            }
            await self.broadcast_except(
                channel,
                {
                    "type": "cursor",
                    "user_id": user_id,
                    "position": msg.get("position"),
                    "selection": msg.get("selection"),
                },
                user_id,
            )

        elif msg_type == "typing":
            await self.broadcast_except(
                channel,
                {
                    "type": "typing",
                    "user_id": user_id,
                    "is_typing": msg.get("is_typing", True),
                },
                user_id,
            )

        elif msg_type == "lock":
            doc_id = msg.get("document_id")
            action = msg.get("action")
            if action == "acquire":
                if doc_id in self.doc_locks and self.doc_locks[doc_id] != user_id:
                    await self.send_to_user(
                        user_id,
                        {
                            "type": "lock_error",
                            "document_id": doc_id,
                            "held_by": self.doc_locks[doc_id],
                            "message": "Document is locked by another user",
                        },
                    )
                    return
                self.doc_locks[doc_id] = user_id
                await self.broadcast(
                    channel,
                    {
                        "type": "lock",
                        "document_id": doc_id,
                        "user_id": user_id,
                        "action": "acquired",
                    },
                )
            elif action == "release":
                if doc_id in self.doc_locks and self.doc_locks[doc_id] == user_id:
                    del self.doc_locks[doc_id]
                    await self.broadcast(
                        channel,
                        {
                            "type": "lock",
                            "document_id": doc_id,
                            "user_id": user_id,
                            "action": "released",
                        },
                    )

        elif msg_type == "doc_update":
            doc_id = msg.get("document_id")
            if doc_id in self.doc_locks and self.doc_locks[doc_id] != user_id:
                await self.send_to_user(
                    user_id,
                    {
                        "type": "error",
                        "message": "Document is locked by another user",
                    },
                )
                return
            await self.broadcast_except(
                channel,
                {
                    "type": "doc_update",
                    "document_id": doc_id,
                    "user_id": user_id,
                    "patch": msg.get("patch"),
                    "version": msg.get("version"),
                },
                user_id,
            )


ws_manager = ConnectionManager()

# Per-IP WebSocket rate limiter (Redis-backed with in-memory fallback)
_ws_rate_limit: dict[str, list[float]] = {}
_WS_RATE_LIMIT_MAX_IPS = 1000
_WS_RATE_LIMIT_PER_MINUTE = 30
_WS_RATE_LIMIT_WINDOW = 60.0
_WS_RATE_LIMIT_REDIS_PREFIX = "ratelimit:ws:"


async def _check_ws_redis_rate_limit(client_ip: str) -> Optional[bool]:
    try:
        from app.core.cache import get_redis

        r = await get_redis()
        if r is not None:
            key = f"{_WS_RATE_LIMIT_REDIS_PREFIX}{client_ip}"
            now = int(time.time())
            window_start = now - _WS_RATE_LIMIT_WINDOW
            pipe = r.pipeline()
            pipe.zremrangebyscore(key, 0, window_start)
            pipe.zcard(key)
            pipe.zadd(key, {str(now): now})
            pipe.expire(key, int(_WS_RATE_LIMIT_WINDOW))
            results = await pipe.execute()
            count = results[1]
            return not count >= _WS_RATE_LIMIT_PER_MINUTE
    except Exception as e:
        logger.debug("Redis WS rate limit unavailable, using in-memory: %s", e)
    return None


async def _check_ws_rate_limit(client_ip: str) -> bool:
    if client_ip == "unknown":
        return True
    redis_result = await _check_ws_redis_rate_limit(client_ip)
    if redis_result is not None:
        return redis_result
    now = time.time()
    window_start = now - _WS_RATE_LIMIT_WINDOW
    if client_ip not in _ws_rate_limit:
        if len(_ws_rate_limit) >= _WS_RATE_LIMIT_MAX_IPS:
            _ws_rate_limit.clear()
        _ws_rate_limit[client_ip] = []
    timestamps = _ws_rate_limit[client_ip]
    _ws_rate_limit[client_ip] = [t for t in timestamps if t > window_start]
    if len(_ws_rate_limit[client_ip]) >= _WS_RATE_LIMIT_PER_MINUTE:
        return False
    _ws_rate_limit[client_ip].append(now)
    return True


@app.websocket("/ws/{channel}")
async def websocket_endpoint(websocket: WebSocket, channel: str):
    try:
        payload = await authenticate_websocket(websocket)
        user_id = int(payload.get("sub", 0))
        user_tenant = payload.get("tenantId")
    except WebSocketException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Rate limit by client IP
    client_ip = websocket.client.host if websocket.client else "unknown"
    if not await _check_ws_rate_limit(client_ip):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        logger.warning("WebSocket rate limit exceeded from IP %s", client_ip)
        return

    # Tenant-scoped channel names to prevent cross-tenant leakage
    scoped_channel = f"tenant_{user_tenant}:{channel}" if user_tenant else f"superuser:{channel}"

    await ws_manager.connect(websocket, scoped_channel, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            if len(data) > 65536:
                await websocket.send_json({"type": "error", "message": "Message too large"})
                continue
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                msg = {"text": data}
            msg["channel"] = channel
            msg["user_id"] = user_id

            # Route collaboration messages to dedicated handler
            collab_types = {"cursor", "typing", "lock", "doc_update"}
            if msg.get("type") in collab_types:
                await ws_manager.handle_collab_message(msg, user_id, channel)
            else:
                mentioned = msg.get("mentions", [])
                if mentioned and isinstance(mentioned, list):
                    await ws_manager.send_mention_notifications(
                        mentioned,
                        {
                            "type": "mention",
                            "channel": channel,
                            "from": user_id,
                            "text": msg.get("text", msg.get("content", "")),
                        },
                        scoped_channel,
                    )

                await ws_manager.broadcast(scoped_channel, msg)
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, scoped_channel)


@app.get("/")
async def root():
    return {"message": "Welcome to Blackbox BOM API"}


@app.get("/health")
async def health_check():
    from scripts.startup_health_check import check_backup_system, check_database

    db = await check_database()
    backup = await check_backup_system()
    overall = (
        "healthy" if db.get("status") == "healthy" and backup.get("status") == "ok" else "degraded"
    )

    return {
        "status": overall,
        "database": db.get("status"),
        "backup": backup.get("status"),
        "timestamp": datetime.utcnow().isoformat(),
    }
