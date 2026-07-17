"""Sentry integration for error tracking."""

import logging
import os

logger = logging.getLogger(__name__)


def init_sentry():
    """Initialize Sentry if DSN is configured."""
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        logger.info("Sentry DSN not configured, error tracking disabled")
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

        sentry_sdk.init(
            dsn=dsn,
            integrations=[
                FastApiIntegration(),
                SqlalchemyIntegration(),
            ],
            traces_sample_rate=0.1,
            environment=os.getenv("ENVIRONMENT", "development"),
            release=os.getenv("APP_VERSION", "0.20.0"),
        )
        logger.info("Sentry initialized successfully")
        return True
    except ImportError:
        logger.warning("sentry-sdk not installed, run: pip install sentry-sdk[fastapi]")
        return False
    except Exception as e:
        logger.error(f"Sentry init failed: {e}")
        return False
