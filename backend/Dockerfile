# TODO: pin by digest in CI
FROM python:3.12-slim

WORKDIR /app

RUN groupadd -r bom && useradd -r -g bom -d /app -s /sbin/nologin bom && \
    mkdir -p /backups /rsa_keys /wal_archive /app/logs /app/uploads && \
    chown -R bom:bom /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    libmagic1 \
    tini \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x /app/scripts/docker-entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
    CMD python -c "import http.client; c=http.client.HTTPConnection('localhost:8000'); c.request('GET','/health'); r=c.getresponse(); exit(0) if r.status==200 else exit(1)"

USER bom

ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
