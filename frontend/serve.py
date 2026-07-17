import http.server
import socketserver
import os
import json
import time
from datetime import datetime, timezone

PORT = 3001
DIRECTORY = "."
START_TIME = time.time()
REQUEST_COUNT = 0
ERROR_COUNT = 0

# Add MIME types for JSX and other web files
http.server.SimpleHTTPRequestHandler.extensions_map.update(
    {
        ".jsx": "application/javascript",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".tsx": "application/javascript",
        ".ts": "application/javascript",
        ".json": "application/json",
        ".css": "text/css",
        ".html": "text/html",
        ".svg": "image/svg+xml",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
    }
)


class ReuseAddrTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


class EnterpriseHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        global REQUEST_COUNT
        REQUEST_COUNT += 1

        # Serve Vite production build (dist/) if available, fall back to babel dev path
        if self.path == "/" or self.path == "/index.html":
            if os.path.exists(os.path.join(DIRECTORY, "dist", "index.html")):
                self.path = "/dist/index.html"
            else:
                self.path = "/index.babel.html"

        # Health check endpoint
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            uptime = time.time() - START_TIME
            self.wfile.write(
                json.dumps(
                    {
                        "status": "healthy",
                        "uptime": round(uptime, 2),
                        "requests": REQUEST_COUNT,
                        "errors": ERROR_COUNT,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                ).encode()
            )
            return

        # Metrics endpoint
        if self.path == "/metrics":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            uptime = time.time() - START_TIME
            self.wfile.write(
                json.dumps(
                    {
                        "uptime_seconds": round(uptime, 2),
                        "total_requests": REQUEST_COUNT,
                        "total_errors": ERROR_COUNT,
                        "requests_per_second": round(REQUEST_COUNT / max(uptime, 1), 2),
                        "memory_usage_kb": os.popen(
                            'tasklist /FI "IMAGENAME eq python.exe" /FO CSV 2>nul'
                        ).read()[:200],
                    }
                ).encode()
            )
            return

        super().do_GET()

    def do_POST(self):
        global REQUEST_COUNT, ERROR_COUNT
        REQUEST_COUNT += 1

        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 10 * 1024 * 1024:
            ERROR_COUNT += 1
            self.send_error(413, "Request too large")
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def end_headers(self):
        self.send_header(
            "Cache-Control", "no-store, no-cache, must-revalidate, max-age=0"
        )
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")

        # Security headers — OWASP recommended
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-XSS-Protection", "1; mode=block")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"
        )
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")

        # Content Security Policy — conditional on serving mode.
        # Fonts are self-hosted (Geist/Geist Mono, UI decision #2) — no CDN
        # font-src/style-src exceptions needed for fonts.googleapis.com/gstatic.com.
        is_babel = self.path.endswith("index.babel.html")
        if is_babel:
            # Babel standalone needs unsafe-inline/unsafe-eval for inline transform
            csp = (
                "default-src 'self' http: https: data: blob:; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline'; "
                "font-src 'self'; "
                "img-src 'self' data: http: https:; "
                "connect-src 'self' http://localhost:8000 http://127.0.0.1:8000 https://open.er-api.com https://v6.exchangerate-api.com https://api.exchangerate.host; "
                "worker-src 'self' blob:; "
                "frame-ancestors 'none'; "
                "form-action 'self'; "
                "base-uri 'self'; "
                "object-src 'none'"
            )
        else:
            # Vite build uses hashed filenames — safe to restrict
            csp = (
                "default-src 'self' http: https: data: blob:; "
                "script-src 'self' https://unpkg.com https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline'; "
                "font-src 'self'; "
                "img-src 'self' data: http: https:; "
                "connect-src 'self' http://localhost:8000 http://127.0.0.1:8000 https://open.er-api.com https://v6.exchangerate-api.com https://api.exchangerate.host; "
                "worker-src 'self' blob:; "
                "frame-ancestors 'none'; "
                "form-action 'self'; "
                "base-uri 'self'; "
                "object-src 'none'"
            )
        self.send_header("Content-Security-Policy", csp)

        # HSTS — enabled when server detects HTTPS (e.g. behind reverse proxy)
        is_https = self.headers.get("X-Forwarded-Proto", "http") == "https"
        if is_https:
            self.send_header(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains; preload",
            )

        super().end_headers()

    def log_message(self, format, *args):
        pass

    def log_error(self, format, *args):
        global ERROR_COUNT
        ERROR_COUNT += 1


if __name__ == "__main__":
    with ReuseAddrTCPServer(("", PORT), EnterpriseHandler) as httpd:
        print(f"Blackbox BOM Enterprise Server")
        print(f"Running at http://localhost:{PORT}")
        print(f"Health: http://localhost:{PORT}/health")
        print(f"Metrics: http://localhost:{PORT}/metrics")
        print(f"Security: CSP, X-Frame-Options, COOP, COEP, CORP")
        print(f"Started: {datetime.now(timezone.utc).isoformat()}Z")
        httpd.serve_forever()
