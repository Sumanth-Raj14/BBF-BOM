"""Production-grade Prometheus metrics with proper exposition format."""

import threading
import time
from collections import defaultdict

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint


class Histogram:
    """Prometheus-style histogram with configurable buckets."""

    BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)

    def __init__(self, name: str, help_text: str, label_names: tuple = ()):
        self.name = name
        self.help_text = help_text
        self.label_names = label_names
        self._lock = threading.Lock()
        self._buckets: dict[str, dict[float, int]] = defaultdict(
            lambda: {b: 0 for b in self.BUCKETS}
        )
        self._sum: dict[str, float] = defaultdict(float)
        self._count: dict[str, int] = defaultdict(int)

    def observe(self, value: float, labels: tuple = ()):
        key = self._label_key(labels)
        with self._lock:
            self._sum[key] += value
            self._count[key] += 1
            for bucket in self.BUCKETS:
                if value <= bucket:
                    self._buckets[key][bucket] += 1

    def _label_key(self, labels: tuple) -> str:
        return "|".join(str(label) for label in labels)

    def export(self) -> str:
        lines = [
            f"# HELP {self.name} {self.help_text}",
            f"# TYPE {self.name} histogram",
        ]
        with self._lock:
            all_keys = set(self._buckets.keys())
            for key in sorted(all_keys):
                labels = (
                    dict(zip(self.label_names, key.split("|"), strict=False))
                    if self.label_names
                    else {}
                )
                label_str = ""
                if labels:
                    parts = [f'{k}="{v}"' for k, v in labels.items()]
                    label_str = "{" + ",".join(parts) + "}"
                suffix = "_bucket" if not label_str else "_bucket"
                for bucket in self.BUCKETS:
                    le = "+Inf" if bucket == self.BUCKETS[-1] else str(bucket)
                    le_suffix = f',le="{le}"' if not label_str else f',le="{le}"'
                    count = (
                        self._buckets[key].get(bucket, 0)
                        if bucket != self.BUCKETS[-1]
                        else self._count[key]
                    )
                    lines.append(f"{self.name}{suffix}{label_str}{le_suffix} {count}")
                lines.append(f"{self.name}_sum{label_str} {self._sum.get(key, 0):.6f}")
                lines.append(f"{self.name}_count{label_str} {self._count.get(key, 0)}")
        return "\n".join(lines) + "\n"


class Counter:
    """Prometheus-style counter."""

    def __init__(self, name: str, help_text: str, label_names: tuple = ()):
        self.name = name
        self.help_text = help_text
        self.label_names = label_names
        self._lock = threading.Lock()
        self._values: dict[str, float] = defaultdict(float)

    def inc(self, value: float = 1.0, labels: tuple = ()):
        key = self._label_key(labels)
        with self._lock:
            self._values[key] += value

    def _label_key(self, labels: tuple) -> str:
        return "|".join(str(label) for label in labels)

    def export(self) -> str:
        lines = [f"# HELP {self.name} {self.help_text}", f"# TYPE {self.name} counter"]
        with self._lock:
            for key, val in sorted(self._values.items()):
                labels = (
                    dict(zip(self.label_names, key.split("|"), strict=False))
                    if self.label_names
                    else {}
                )
                label_str = ""
                if labels:
                    parts = [f'{k}="{v}"' for k, v in labels.items()]
                    label_str = "{" + ",".join(parts) + "}"
                lines.append(f"{self.name}{label_str} {val:.0f}")
        return "\n".join(lines) + "\n"


class Gauge:
    """Prometheus-style gauge."""

    def __init__(self, name: str, help_text: str, label_names: tuple = ()):
        self.name = name
        self.help_text = help_text
        self.label_names = label_names
        self._lock = threading.Lock()
        self._values: dict[str, float] = defaultdict(float)

    def set(self, value: float, labels: tuple = ()):
        key = self._label_key(labels)
        with self._lock:
            self._values[key] = value

    def inc(self, value: float = 1.0, labels: tuple = ()):
        key = self._label_key(labels)
        with self._lock:
            self._values[key] += value

    def dec(self, value: float = 1.0, labels: tuple = ()):
        key = self._label_key(labels)
        with self._lock:
            self._values[key] -= value

    def _label_key(self, labels: tuple) -> str:
        return "|".join(str(label) for label in labels)

    def export(self) -> str:
        lines = [f"# HELP {self.name} {self.help_text}", f"# TYPE {self.name} gauge"]
        with self._lock:
            for key, val in sorted(self._values.items()):
                labels = (
                    dict(zip(self.label_names, key.split("|"), strict=False))
                    if self.label_names
                    else {}
                )
                label_str = ""
                if labels:
                    parts = [f'{k}="{v}"' for k, v in labels.items()]
                    label_str = "{" + ",".join(parts) + "}"
                lines.append(f"{self.name}{label_str} {val:.0f}")
        return "\n".join(lines) + "\n"


class MetricsCollector:
    """Production-grade Prometheus metrics collector."""

    def __init__(self):
        self._start_time = time.time()
        self._lock = threading.Lock()

        self.http_requests_total = Counter(
            "http_requests_total",
            "Total number of HTTP requests",
            ("method", "path", "status"),
        )
        self.http_request_duration_seconds = Histogram(
            "http_request_duration_seconds",
            "HTTP request latency in seconds",
            ("method", "path"),
        )
        self.db_queries_total = Counter(
            "db_queries_total",
            "Total number of database queries",
        )
        self.db_query_duration_seconds = Histogram(
            "db_query_duration_seconds",
            "Database query duration in seconds",
        )
        self.active_websocket_connections = Gauge(
            "active_websocket_connections",
            "Number of active WebSocket connections",
        )
        self.errors_total = Counter(
            "errors_total",
            "Total errors by type",
            ("type",),
        )
        self.active_users = Gauge("active_users", "Number of active users")
        self.uptime_seconds = Gauge("app_uptime_seconds", "Application uptime in seconds")

        # Backup metrics
        self.backup_total = Counter(
            "backup_total",
            "Total number of backups created",
            ("status", "type"),
        )
        self.backup_last_size_bytes = Gauge(
            "backup_last_size_bytes",
            "Size of the last backup in bytes",
        )
        self.backup_last_duration_seconds = Gauge(
            "backup_last_duration_seconds",
            "Duration of the last backup in seconds",
        )
        self.backup_old_removed_total = Counter(
            "backup_old_removed_total",
            "Total number of old backups removed by cleanup",
        )
        self.backup_last_timestamp = Gauge(
            "backup_last_timestamp",
            "Unix timestamp of the last backup attempt",
        )

    def record_request(self, method: str, path: str, status: int, duration: float):
        self.http_requests_total.inc(labels=(method, path, str(status)))
        self.http_request_duration_seconds.observe(duration, labels=(method, path))

    def record_db_query(self, duration: float):
        self.db_queries_total.inc()
        self.db_query_duration_seconds.observe(duration)

    def record_error(self, error_type: str):
        self.errors_total.inc(labels=(error_type,))

    def set_websocket_connections(self, count: int):
        self.active_websocket_connections.set(float(count))

    def set_active_users(self, count: int):
        self.active_users.set(float(count))

    def record_backup(
        self,
        status: str,
        backup_type: str,
        size_bytes: int = 0,
        duration_seconds: float = 0,
    ):
        self.backup_total.inc(labels=(status, backup_type))
        if size_bytes:
            self.backup_last_size_bytes.set(float(size_bytes))
        if duration_seconds:
            self.backup_last_duration_seconds.set(duration_seconds)
        self.backup_last_timestamp.set(time.time())

    def record_backup_cleanup(self, count: int):
        if count:
            self.backup_old_removed_total.inc(count)

    def export_prometheus(self) -> str:
        self.uptime_seconds.set(time.time() - self._start_time)
        parts = []
        parts.append(self.http_requests_total.export())
        parts.append(self.http_request_duration_seconds.export())
        parts.append(self.db_queries_total.export())
        parts.append(self.db_query_duration_seconds.export())
        parts.append(self.active_websocket_connections.export())
        parts.append(self.errors_total.export())
        parts.append(self.active_users.export())
        parts.append(self.uptime_seconds.export())
        parts.append(self.backup_total.export())
        parts.append(self.backup_last_size_bytes.export())
        parts.append(self.backup_last_duration_seconds.export())
        parts.append(self.backup_old_removed_total.export())
        parts.append(self.backup_last_timestamp.export())
        return "".join(parts)


metrics = MetricsCollector()


class MetricsMiddleware(BaseHTTPMiddleware):
    """ASGI middleware that records Prometheus metrics for every request."""

    # Paths to exclude from metrics (e.g. the /metrics endpoint itself)
    EXCLUDED_PATHS: frozenset = frozenset({"/metrics", "/health", "/health/detailed"})

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        method = request.method
        start = time.time()
        status_code = 500

        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        except Exception:
            metrics.record_error("unhandled_exception")
            raise
        finally:
            duration = time.time() - start
            if path not in self.EXCLUDED_PATHS:
                metrics.record_request(method, path, status_code, duration)
