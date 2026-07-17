import os
import secrets
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_IN_CONTAINER = (
    os.path.exists("/.dockerenv") or os.environ.get("KUBERNETES_SERVICE_HOST") is not None
)

# Minimum entropy required for secrets (in bits, Shannon formula)
# A 32-char urlsafe token yields ~210 bits; set threshold to require strong secrets
MIN_SECRET_ENTROPY_THRESHOLD: float = 80.0


def _load_vault_secret(path: str, key: str) -> Optional[str]:
    """Load a secret from HashiCorp Vault if VAULT_ADDR is set."""
    vault_addr = os.environ.get("VAULT_ADDR")
    vault_token = os.environ.get("VAULT_TOKEN")
    if not vault_addr or not vault_token:
        return None
    try:
        import httpx

        resp = httpx.get(
            f"{vault_addr}/v1/{path}",
            headers={"X-Vault-Token": vault_token},
            timeout=5,
        )
        if resp.status_code == 200:
            return resp.json().get("data", {}).get("data", {}).get(key)
    except Exception as exc:
        import logging

        logging.warning("Vault secret load failed for %s/%s: %s", path, key, exc)
    return None


# Module-level helpers to avoid Pydantic v2 ModelPrivateAttr issues
import math as _math
from collections import Counter as _Counter


def _estimate_entropy(value: str) -> float:
    """Estimate Shannon entropy of a string to detect weak secrets (in bits)."""
    if not value:
        return 0.0
    freq = _Counter(value)
    length = len(value)
    h_per_char = -sum((count / length) * _math.log2(count / length) for count in freq.values())
    return h_per_char * length  # Total entropy in bits


_WEAK_SECRET_VALUES = frozenset(
    {
        "test",
        "changeme",
        "password",
        "secret",
        "admin",
        "123456",
        "qwerty",
        "test-secret-key",
        "test-encryption-key-32chars!",
        "test-secret-key-for-testing-only",
    }
)


def _is_weak_secret(value: str) -> bool:
    if not value:
        return True
    lower = value.lower().replace("-", "").replace("_", "").replace("!", "")
    for weak in _WEAK_SECRET_VALUES:
        w = weak.lower().replace("-", "").replace("_", "").replace("!", "")
        if w in lower:
            return True
    return False


class Settings(BaseSettings):
    PROJECT_NAME: str = "Blackbox BOM API"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ALGORITHM: str = "RS256"

    # PostgreSQL
    POSTGRES_SERVER: str = "127.0.0.1"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "bom_user"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "bom_db"
    DATABASE_URI: Optional[str] = None

    # Database connection pool (consumed by app.db.session.init_engine)
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    @field_validator("DATABASE_URI", mode="before")
    @classmethod
    def assemble_db_connection(cls, v: Optional[str], info):
        if isinstance(v, str):
            return v
        data = info.data
        user = data.get("POSTGRES_USER", "bom_user")
        password = data.get("POSTGRES_PASSWORD", "")
        host = data.get("POSTGRES_SERVER", "127.0.0.1")
        port = data.get("POSTGRES_PORT", 5432)
        db = data.get("POSTGRES_DB", "bom_db")
        return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{db}"

    # CORS - override via env var BACKEND_CORS_ORIGINS as JSON array
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3003",
    ]

    ALLOWED_HOSTS: list[str] = [
        "localhost",
        "127.0.0.1",
        "*.blackbox-bom.com",
    ]

    @field_validator("ALLOWED_HOSTS", mode="before")
    @classmethod
    def parse_allowed_hosts(cls, v):
        if isinstance(v, str):
            import json

            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [host.strip() for host in v.split(",") if host.strip()]
        return v

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            import json

            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # Email (SMTP)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@blackbox-bom.com"
    SMTP_USE_TLS: bool = True
    ADMIN_EMAIL: str = ""

    # SSO Providers
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    MICROSOFT_CLIENT_ID: str = ""
    MICROSOFT_CLIENT_SECRET: str = ""
    SSO_REDIRECT_URI: str = "http://localhost:3000/auth/callback"

    # SAML 2.0 SSO (Enterprise)
    SAML_IDP_ENTITY_ID: str = ""
    SAML_IDP_SSO_URL: str = ""
    SAML_IDP_SLO_URL: str = ""
    SAML_IDP_CERT: str = ""

    # S3/MinIO Storage
    S3_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_BUCKET: str = "bom-documents"
    S3_REGION: str = "us-east-1"

    # File Upload
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: str = "pdf,docx,xlsx,csv,txt,png,jpg,jpeg,step,stp,igs,sldprt,sldasm"

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_AUTH_PER_MINUTE: int = 5

    # Backup
    BACKUP_DIR: str = "./backups"
    BACKUP_SCHEDULE_HOURS: int = 6
    BACKUP_MIN_DISK_GB: int = 5

    # Encryption
    ENCRYPTION_KEY: str = ""

    # JWT
    RSA_KEY_DIR: str = "./rsa_keys"
    RSA_PRIVATE_KEY_PATH: str = ""
    RSA_PUBLIC_KEY_PATH: str = ""

    # Redis
    REDIS_URL: str = "redis://127.0.0.1:6379/0"

    # Reverse proxy — only trust X-Forwarded-For / X-Real-IP when the app is
    # deployed behind a trusted proxy (e.g. nginx). Off by default so that
    # client-spoofable headers cannot defeat IP lockout / rate limiting.
    BEHIND_PROXY: bool = False

    # Environment
    ENVIRONMENT: str = "development"
    IS_PRODUCTION: bool = False

    @field_validator("IS_PRODUCTION", mode="before")
    @classmethod
    def derive_is_production(cls, v, info):
        if isinstance(v, bool):
            return v
        env = info.data.get("ENVIRONMENT", "development")
        return env in ("production", "prod", "staging")

    @field_validator("ENVIRONMENT", mode="before")
    @classmethod
    def normalize_environment(cls, v):
        if isinstance(v, str) and v.lower() in ("production", "prod"):
            return "production"
        if isinstance(v, str) and v.lower() == "staging":
            return "staging"
        return "development"

    # Vault (optional - loads secrets from Vault if VAULT_ADDR is set)
    VAULT_ADDR: Optional[str] = None
    VAULT_TOKEN: Optional[str] = None
    VAULT_SECRET_PATH: str = "secret/data/bom-tool"
    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env")

    @field_validator("SECRET_KEY", mode="after")
    @classmethod
    def ensure_persistent_secret(cls, v):
        import json
        import os

        _secret_file = os.environ.get("SECRET_KEY_FILE", ".secret_key")

        if v:
            entropy = _estimate_entropy(v)
            if _is_weak_secret(v) or entropy < MIN_SECRET_ENTROPY_THRESHOLD:
                raise ValueError(
                    f"SECRET_KEY is too weak (entropy: {entropy:.1f}, need >= {MIN_SECRET_ENTROPY_THRESHOLD}). "
                    'Generate a strong key with: python -c "import secrets; print(secrets.token_urlsafe(32))"'
                )
            return v

        env_key = os.environ.get("SECRET_KEY")
        if env_key:
            return env_key

        # In production (any deployment: container, bare-metal, VM, Windows),
        # never auto-generate or read a persisted key — require it from the
        # environment so JWTs survive restarts and cannot be silently weakened.
        _env = os.environ.get("ENVIRONMENT", "development").lower()
        _is_production = _env in ("production", "prod", "staging") or os.environ.get(
            "IS_PRODUCTION", ""
        ).lower() in ("1", "true", "yes")
        if _is_production:
            raise RuntimeError(
                "SECRET_KEY must be set via environment variable in production. "
                "Auto-generation is disabled outside development."
            )

        if os.path.exists(_secret_file):
            with open(_secret_file) as f:
                stored = json.load(f)
                if isinstance(stored, dict) and stored.get("key"):
                    return stored["key"]

        if _IN_CONTAINER:
            raise RuntimeError(
                "SECRET_KEY must be set via environment variable when running in a container. "
                "Set SECRET_KEY in .env or pass it as an environment variable."
            )

        import logging as _lg

        _lg.getLogger(__name__).warning(
            "WARNING: SECRET_KEY was auto-generated and persisted to %s. "
            "This key changes every container restart, invalidating all JWTs. "
            "Set SECRET_KEY in .env or as an environment variable for persistence.",
            _secret_file,
        )
        generated = secrets.token_urlsafe(32)
        try:
            with open(_secret_file, "w") as f:
                json.dump({"key": generated}, f)
        except OSError as e:
            raise RuntimeError(
                f"Cannot persist SECRET_KEY to {_secret_file}: {e}. "
                "Set SECRET_KEY env var or ensure the .secret_key file is writable."
            ) from e
        return generated

    def model_post_init(self, __context):
        if self.VAULT_ADDR and self.VAULT_TOKEN:
            vault_secrets = {
                "POSTGRES_PASSWORD": ("database", "password"),
                "SECRET_KEY": ("auth", "secret_key"),
                "ENCRYPTION_KEY": ("encryption", "key"),
                "S3_ACCESS_KEY": ("s3", "access_key"),
                "S3_SECRET_KEY": ("s3", "secret_key"),
                "GOOGLE_CLIENT_SECRET": ("sso", "google_secret"),
                "GITHUB_CLIENT_SECRET": ("sso", "github_secret"),
                "MICROSOFT_CLIENT_SECRET": ("sso", "microsoft_secret"),
            }
            for attr, (path, key) in vault_secrets.items():
                current = getattr(self, attr, None)
                if not current or current == getattr(Settings, attr, None):
                    vault_val = _load_vault_secret(f"{self.VAULT_SECRET_PATH}/{path}", key)
                    if vault_val:
                        object.__setattr__(self, attr, vault_val)

        # Validate required secrets are set
        required = {
            "POSTGRES_PASSWORD": "Set POSTGRES_PASSWORD in .env or via VAULT",
            "S3_SECRET_KEY": "Set S3_SECRET_KEY in .env or via VAULT",
            "ENCRYPTION_KEY": "Set ENCRYPTION_KEY in .env or via VAULT",
        }
        missing = [f"{k} — {v}" for k, v in required.items() if not getattr(self, k, None)]
        if missing:
            raise ValueError("Required secrets not configured:\n  " + "\n  ".join(missing))

        # Check for weak secrets in all environments, reject in production
        secret_fields = {
            "POSTGRES_PASSWORD": "PostgreSQL password",
            "S3_SECRET_KEY": "S3 secret key",
            "ENCRYPTION_KEY": "Encryption key",
            "SECRET_KEY": "JWT secret key",
        }
        for field, label in secret_fields.items():
            val = getattr(self, field, None)
            if val:
                entropy = _estimate_entropy(val)
                if _is_weak_secret(val):
                    msg = f"{label} is a known weak/test value. Generate a strong secret."
                    if self.IS_PRODUCTION:
                        raise ValueError(f"CRITICAL: {msg}")
                    import logging as _lg

                    _lg.getLogger(__name__).warning(f"WARNING: {msg}")
                elif entropy < MIN_SECRET_ENTROPY_THRESHOLD:
                    msg = f"{label} has low entropy ({entropy:.1f}). Consider a stronger value."
                    if self.IS_PRODUCTION:
                        raise ValueError(f"CRITICAL: {msg}")
                    import logging as _lg

                    _lg.getLogger(__name__).warning(f"WARNING: {msg}")


settings = Settings()
