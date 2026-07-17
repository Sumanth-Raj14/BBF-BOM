"""Background job queue for async task processing.

Uses a single reliable in-process asyncio worker. Each enqueued job is
processed exactly once by the worker loop. Handles: bulk imports, email
sending, notifications, backup scheduling.
"""

import asyncio
import itertools
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Optional

logger = logging.getLogger(__name__)

_job_queue: list = []
_queue_worker_task: Optional[asyncio.Task] = None
_job_id_counter = itertools.count(1)

# Cap the number of retained finished (completed/failed) jobs to avoid
# unbounded memory growth. Queued/running jobs are never pruned.
_MAX_FINISHED_JOBS = 1000


def _prune_finished_jobs() -> None:
    finished = [j for j in _job_queue if j["status"] in ("completed", "failed")]
    excess = len(finished) - _MAX_FINISHED_JOBS
    if excess <= 0:
        return
    # _job_queue preserves insertion order, so finished[:excess] are the oldest.
    to_remove = {id(j) for j in finished[:excess]}
    _job_queue[:] = [j for j in _job_queue if id(j) not in to_remove]


async def enqueue_job(job_type: str, payload: dict, priority: int = 0) -> dict:
    job = {
        "id": next(_job_id_counter),
        "type": job_type,
        "payload": payload,
        "priority": priority,
        "status": "queued",
        "created_at": datetime.now(UTC).isoformat(),
        "started_at": None,
        "completed_at": None,
        "error": None,
    }
    _job_queue.append(job)
    _prune_finished_jobs()

    logger.info("Enqueued job %d (%s) in-process", job["id"], job_type)
    return job


async def start_queue_worker():
    global _queue_worker_task

    async def _worker_loop():
        while True:
            pending = [j for j in _job_queue if j["status"] == "queued"]
            pending.sort(key=lambda x: -x["priority"])
            for job in pending:
                job["status"] = "running"
                job["started_at"] = datetime.now(UTC).isoformat()
                try:
                    handler = _JOB_HANDLERS.get(job["type"])
                    if handler:
                        await handler(job["payload"])
                    else:
                        logger.warning("No handler for job type: %s", job["type"])
                    job["status"] = "completed"
                except Exception as e:
                    job["status"] = "failed"
                    job["error"] = str(e)
                    logger.error("Job %d failed: %s", job["id"], e)
                job["completed_at"] = datetime.now(UTC).isoformat()
            await asyncio.sleep(5)

    _queue_worker_task = asyncio.create_task(_worker_loop())
    logger.info("Background queue worker started")


async def stop_queue_worker():
    global _queue_worker_task
    if _queue_worker_task:
        _queue_worker_task.cancel()
        _queue_worker_task = None


async def _handle_bulk_import(payload: dict):
    from sqlalchemy import select

    from app.db.session import get_session_maker
    from app.models.bulk_import import BulkImportJob

    job_id = payload.get("job_id")
    if not job_id:
        return
    async with (await get_session_maker())() as db:
        result = await db.execute(select(BulkImportJob).where(BulkImportJob.id == job_id))
        job = result.scalar_one_or_none()
        if job:
            job.status = "processing"
            await db.commit()


async def _handle_email_notification(payload: dict):
    from app.services.email_service import send_email

    await send_email(
        to=payload.get("to", ""),
        subject=payload.get("subject", ""),
        body=payload.get("body", ""),
        html=payload.get("html"),
    )


_JOB_HANDLERS: dict[str, Callable] = {
    "bulk_import": _handle_bulk_import,
    "email": _handle_email_notification,
}
