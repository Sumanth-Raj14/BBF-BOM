"""Auth cookie helpers for httpOnly cookie-based JWT token transport."""

from fastapi import Response

from app.core.config import settings


def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=settings.IS_PRODUCTION,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=settings.IS_PRODUCTION,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth/refresh",
    )


def clear_auth_cookies(response: Response):
    response.set_cookie(
        key="access_token",
        value="",
        httponly=True,
        samesite="lax",
        secure=settings.IS_PRODUCTION,
        max_age=0,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value="",
        httponly=True,
        samesite="lax",
        secure=settings.IS_PRODUCTION,
        max_age=0,
        path="/api/v1/auth/refresh",
    )
