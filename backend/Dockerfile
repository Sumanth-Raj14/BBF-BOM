# TODO: pin by digest in CI
FROM python:3.12-slim

WORKDIR /app

RUN groupadd -r bom && useradd -r -g bom -d /app -s /sbin/nologin bom && \
    mkdir -p /backups /rsa_keys /wal_archive /app/logs && \
    chown -R bom:bom /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    tini \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

USER bom

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
