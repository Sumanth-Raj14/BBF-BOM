"""SSO Integration - OAuth2 endpoints for Google, GitHub, Microsoft."""

import base64
import hashlib
import hmac
import logging
import secrets
from datetime import timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.config import settings
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.core.security import create_access_token, get_password_hash
from app.models.tenant import Tenant
from app.models.user import User

router = APIRouter()


def _sign_sso_state(state: str) -> str:
    mac = hmac.new(settings.SECRET_KEY.encode(), state.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode()


def _verify_sso_state(state: str, signature: str) -> bool:
    expected = _sign_sso_state(state)
    return hmac.compare_digest(expected, signature)


class SSOCallbackRequest(BaseModel):
    code: str
    state: Optional[str] = None
    provider: str


class SSOLoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict
    is_new_user: bool


SSO_PROVIDERS = {
    "google": {
        "name": "Google",
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://www.googleapis.com/oauth2/v3/userinfo",
        "scopes": ["openid", "email", "profile"],
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "email_key": "email",
        "name_key": "name",
        "avatar_key": "picture",
        "id_key": "sub",
    },
    "github": {
        "name": "GitHub",
        "authorize_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "userinfo_url": "https://api.github.com/user",
        "email_url": "https://api.github.com/user/emails",
        "scopes": ["user:email"],
        "client_id": settings.GITHUB_CLIENT_ID,
        "client_secret": settings.GITHUB_CLIENT_SECRET,
        "email_key": "email",
        "name_key": "name",
        "avatar_key": "avatar_url",
        "id_key": "id",
    },
    "microsoft": {
        "name": "Microsoft",
        "authorize_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "userinfo_url": "https://graph.microsoft.com/v1.0/me",
        "scopes": ["openid", "email", "profile", "User.Read"],
        "client_id": settings.MICROSOFT_CLIENT_ID,
        "client_secret": settings.MICROSOFT_CLIENT_SECRET,
        "email_key": "mail",
        "name_key": "displayName",
        "avatar_key": None,
        "id_key": "id",
    },
}


@router.get("/providers")
async def list_sso_providers():
    return {
        "providers": [
            {
                "id": pid,
                "name": p["name"],
                "enabled": bool(p.get("client_id")),
            }
            for pid, p in SSO_PROVIDERS.items()
        ]
    }


@router.get("/authorize/{provider}")
async def sso_authorize(provider: str):
    if provider not in SSO_PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")

    config = SSO_PROVIDERS[provider]
    if not config.get("client_id"):
        raise HTTPException(status_code=400, detail=f"Provider '{provider}' not configured")

    state = secrets.token_urlsafe(32)
    signature = _sign_sso_state(state)
    signed_state = f"{state}.{signature}"
    params = {
        "client_id": config["client_id"],
        "redirect_uri": settings.SSO_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(config["scopes"]),
        "state": state,
    }

    query_string = "&".join(f"{k}={v}" for k, v in params.items())
    auth_url = f"{config['authorize_url']}?{query_string}"

    return {"authorization_url": auth_url, "state": signed_state, "provider": provider}


@router.post("/callback/{provider}", response_model=SSOLoginResponse)
@limiter.limit("10/minute")
async def sso_callback(
    provider: str,
    req: SSOCallbackRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if provider not in SSO_PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")

    config = SSO_PROVIDERS[provider]
    if not config.get("client_id"):
        raise HTTPException(status_code=400, detail=f"Provider '{provider}' not configured")

    # Verify CSRF state parameter
    if req.state:
        parts = req.state.rsplit(".", 1)
        if len(parts) != 2 or not _verify_sso_state(parts[0], parts[1]):
            raise HTTPException(
                status_code=401, detail="Invalid state parameter - possible CSRF attack"
            )
    else:
        raise HTTPException(status_code=401, detail="Missing state parameter")

    # Exchange authorization code for access token
    token_data = {
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "code": req.code,
        "grant_type": "authorization_code",
        "redirect_uri": settings.SSO_REDIRECT_URI,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token_resp = await client.post(
                config["token_url"],
                data=token_data,
                headers={"Accept": "application/json"},
            )
            token_resp.raise_for_status()
            token_info = token_resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502, detail=f"Token exchange failed: {e.response.status_code}"
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {str(e)}")

    access_token = token_info.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="No access_token in provider response")

    # Fetch user info
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            userinfo_resp = await client.get(config["userinfo_url"], headers=headers)
            userinfo_resp.raise_for_status()
            user_info = userinfo_resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch user info: {str(e)}")

    email = user_info.get(config["email_key"])
    if not email and provider == "github":
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                emails_resp = await client.get(config["email_url"], headers=headers)
                emails = emails_resp.json()
                for em in emails:
                    if em.get("primary"):
                        email = em["email"]
                        break
                if not email and emails:
                    email = emails[0]["email"]
        except Exception:
            logger.warning("Failed to parse SSO user info for email")

    if not email:
        raise HTTPException(status_code=400, detail="Could not retrieve email from SSO provider")

    full_name = user_info.get(config["name_key"], email.split("@")[0])
    avatar_url = user_info.get(config.get("avatar_key", "")) if config.get("avatar_key") else None
    str(user_info.get(config["id_key"], ""))

    # Find or create user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    is_new_user = False

    if not user:
        is_new_user = True
        username = email.split("@")[0]
        # Auto-assign tenant by email domain
        email_domain = email.split("@")[1] if "@" in email else None
        tenant_id = None
        if email_domain:
            tenant_result = await db.execute(select(Tenant).where(Tenant.domain == email_domain))
            tenant = tenant_result.scalar_one_or_none()
            if tenant:
                tenant_id = tenant.id
        user = User(
            email=email,
            username=username,
            fullName=full_name,
            avatarUrl=avatar_url,
            hashedPassword=get_password_hash(secrets.token_urlsafe(32)),
            isActive=True,
            ssoProviders=[provider],
            tenantId=tenant_id,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        providers = set(user.ssoProviders or [])
        if provider not in providers:
            providers.add(provider)
            user.ssoProviders = list(providers)
            await db.commit()

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    jwt_token = create_access_token(data={"sub": str(user.id)}, expires_delta=access_token_expires)

    return SSOLoginResponse(
        access_token=jwt_token,
        token_type="bearer",
        user={
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "fullName": user.fullName,
            "avatarUrl": user.avatarUrl,
        },
        is_new_user=is_new_user,
    )


@router.post("/unlink/{provider}")
async def sso_unlink(
    provider: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if provider not in SSO_PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")

    providers = list(current_user.ssoProviders or [])
    if provider not in providers:
        raise HTTPException(
            status_code=400, detail=f"SSO provider '{provider}' is not linked to your account"
        )

    providers.remove(provider)
    current_user.ssoProviders = providers
    await db.commit()
    return {
        "message": f"SSO provider '{provider}' unlinked successfully",
        "provider": provider,
    }
