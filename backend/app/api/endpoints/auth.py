from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth_cookie import clear_auth_cookies, set_auth_cookies
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.core.security import verify_password
from app.db.session import get_db
from app.models.api_key import ApiKey
from app.models.user import User
from app.services import auth_service

router = APIRouter()


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str


class TokenRefresh(BaseModel):
    refresh_token: str


class MFASetupResponse(BaseModel):
    secret: str
    qr_uri: str
    backup_codes: list[str]


class MFAVerify(BaseModel):
    code: str
    secret: Optional[str] = None


class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str
    fullName: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


def _set_auth(response: Response, tokens: dict):
    set_auth_cookies(response, tokens["access_token"], tokens["refresh_token"])


@router.post("/login")
@limiter.limit(f"{auth_service.settings.RATE_LIMIT_AUTH_PER_MINUTE}/minute")
async def login(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    content_type = request.headers.get("content-type", "")
    if "json" in content_type:
        body = await request.json()
        username = body.get("email") or body.get("username", "")
        password = body.get("password", "")
    else:
        form = await request.form()
        username = form.get("username", "")
        password = form.get("password", "")

    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="email/username and password are required",
        )

    user = await auth_service.authenticate_user(db, username, password, request)
    temp_token = await auth_service.check_mfa_required(db, user)
    if temp_token:
        return {"mfa_required": True, "temp_token": temp_token, "token_type": "bearer"}

    tokens = auth_service.make_tokens(user)
    _set_auth(response, tokens)
    return tokens


class PluginLoginRequest(BaseModel):
    api_key: str
    client_type: Optional[str] = None
    client_version: Optional[str] = None


@router.post("/plugin-login")
@limiter.limit(f"{auth_service.settings.RATE_LIMIT_AUTH_PER_MINUTE}/minute")
async def plugin_login(
    request: Request,
    body: PluginLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate a desktop plugin (e.g. the SolidWorks add-in) via an API key.

    Returns an access token as ``session_id`` for use as a Bearer token. The plugin
    posts {api_key, client_type, client_version}; the key is matched against active,
    non-expired API keys and the associated user is issued a normal access token.
    """
    presented = (body.api_key or "").strip()
    if not presented:
        raise HTTPException(status_code=422, detail="api_key is required")

    now = datetime.now(UTC)
    result = await db.execute(select(ApiKey).where(ApiKey.is_active.is_(True)))
    matched = None
    for key in result.scalars().all():
        exp = key.expires_at
        if exp is not None:
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=UTC)
            if exp < now:
                continue
        if verify_password(presented, key.key_hash):
            matched = key
            break

    if matched is None:
        raise HTTPException(status_code=401, detail="Invalid or expired API key")

    user = await db.get(User, matched.user_id)
    if user is None or not getattr(user, "isActive", True):
        raise HTTPException(status_code=401, detail="API key user is inactive")

    matched.last_used_at = now
    await db.commit()

    tokens = auth_service.make_tokens(user)
    return {
        "session_id": tokens["access_token"],
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token"),
        "token_type": "bearer",
        "client_type": body.client_type,
        "user": {"id": user.id, "email": user.email, "username": user.username},
    }


@router.post("/refresh", response_model=Token)
@limiter.limit(f"{auth_service.settings.RATE_LIMIT_AUTH_PER_MINUTE}/minute")
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    refresh_token_str = request.cookies.get("refresh_token")
    if not refresh_token_str:
        try:
            body = await request.json()
            refresh_token_str = body.get("refresh_token")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token required",
            )
    if not refresh_token_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token required",
        )

    tokens = await auth_service.refresh_user_token(db, refresh_token_str)
    _set_auth(response, tokens)
    return tokens


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/hour")
async def register(
    request: Request,
    response: Response,
    user_data: UserRegister,
    db: AsyncSession = Depends(get_db),
):
    user = await auth_service.register_new_user(
        db,
        email=user_data.email,
        username=user_data.username,
        password=user_data.password,
        full_name=user_data.fullName,
        request=request,
    )
    tokens = auth_service.make_tokens(user)
    _set_auth(response, tokens)
    return tokens


@router.get("/me")
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await auth_service.get_user_with_mfa_status(db, current_user)


@router.post("/mfa/setup", response_model=MFASetupResponse)
@limiter.limit(f"{auth_service.settings.RATE_LIMIT_AUTH_PER_MINUTE}/minute")
async def mfa_setup(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await auth_service.setup_mfa(db, current_user, request)
    return MFASetupResponse(**result)


@router.post("/mfa/verify")
@limiter.limit(f"{auth_service.settings.RATE_LIMIT_AUTH_PER_MINUTE}/minute")
async def mfa_verify(
    request: Request,
    body: MFAVerify,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await auth_service.verify_mfa_enable(db, current_user, body.code, body.secret, request)


@router.post("/mfa/disable")
@limiter.limit(f"{auth_service.settings.RATE_LIMIT_AUTH_PER_MINUTE}/minute")
async def mfa_disable(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        body = await request.json()
    except Exception:
        body = {}
    return await auth_service.disable_mfa(
        db, current_user, body.get("password", ""), body.get("totp_code", ""), request
    )


@router.post("/mfa/challenge")
@limiter.limit(f"{auth_service.settings.RATE_LIMIT_AUTH_PER_MINUTE}/minute")
async def mfa_challenge(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    temp_token = body.get("temp_token", "")
    code = body.get("code", "")

    if not temp_token or not code:
        raise HTTPException(status_code=422, detail="temp_token and code are required")

    tokens = await auth_service.challenge_mfa(db, temp_token, code)
    _set_auth(response, tokens)
    return tokens


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = request.cookies.get("access_token") or ""
    await auth_service.logout_user(db, current_user, token, request)
    clear_auth_cookies(response)
    return {"message": "Logged out successfully"}


@router.post("/revoke-all")
@limiter.limit("2/minute")
async def revoke_all_tokens(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await auth_service.revoke_all_sessions(db, current_user, request)
    clear_auth_cookies(response)
    return {"message": "All sessions revoked. Please log in again."}


@router.post("/forgot-password")
@limiter.limit("3/hour")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    return await auth_service.send_forgot_password(db, body.email, request)


@router.post("/reset-password")
@limiter.limit("3/hour")
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    return await auth_service.complete_reset_password(db, body.token, body.password, request)


@router.post("/change-password")
@limiter.limit(f"{auth_service.settings.RATE_LIMIT_AUTH_PER_MINUTE}/minute")
async def change_password(
    request: Request,
    body: PasswordChange,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await auth_service.change_user_password(
        db, current_user, body.current_password, body.new_password, request
    )
