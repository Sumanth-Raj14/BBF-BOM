"""Auth service layer — business logic for authentication, MFA, password management."""

import hashlib
import os
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Optional

import pyotp
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import blacklist_token
from app.core.client_ip import get_client_ip
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_tokens_for_user,
    get_password_hash,
    verify_password,
    verify_token,
    verify_token_with_blacklist,
)
from app.models.audit_log import AuditLog
from app.models.user import User

LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION_MINUTES = 15
_FAILED_LOGIN_IPS: dict[str, list[float]] = {}
_FAILED_LOGIN_IP_MAX = 10000
_FAILED_LOGIN_IP_WINDOW = 300.0
_FAILED_LOGIN_IP_LIMIT = 20


def _check_ip_rate_limit(ip: str) -> bool:
    import time

    now = time.time()
    window_start = now - _FAILED_LOGIN_IP_WINDOW
    if ip not in _FAILED_LOGIN_IPS:
        if len(_FAILED_LOGIN_IPS) >= _FAILED_LOGIN_IP_MAX:
            _FAILED_LOGIN_IPS.pop(next(iter(_FAILED_LOGIN_IPS)), None)
        _FAILED_LOGIN_IPS[ip] = []
    timestamps = _FAILED_LOGIN_IPS[ip]
    _FAILED_LOGIN_IPS[ip] = [t for t in timestamps if t > window_start]
    if len(_FAILED_LOGIN_IPS[ip]) >= _FAILED_LOGIN_IP_LIMIT:
        return False
    _FAILED_LOGIN_IPS[ip].append(now)
    return True


def _hash_reset_token(token: str) -> str:
    """Deterministic SHA-256 hash of a password-reset token for indexed lookup.

    The token itself is 256 bits of entropy (secrets.token_urlsafe(32)), so a
    plain hash is not brute-forceable and needs no per-user salt."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def log_auth_event(
    db: AsyncSession,
    user_id: int,
    user_email: str,
    action: str,
    request=None,
    details: dict = None,
    tenant_id: int = None,
):
    if os.environ.get("DISABLE_AUDIT_LOG", "").lower() in ("1", "true", "yes"):
        return
    from app.core.tenant_context import TenantContext

    effective_tenant_id = tenant_id or TenantContext.get()
    log = AuditLog(
        action=action,
        entityType="auth",
        entityId=user_id,
        entityName=user_email,
        userId=user_id,
        userEmail=user_email,
        userIp=get_client_ip(request) if request else None,
        userAgent=request.headers.get("user-agent") if request else None,
        changes=details or {},
        tenantId=effective_tenant_id,
    )
    db.add(log)


def validate_password_complexity(password: str) -> Optional[str]:
    if len(password) < 8:
        return "Password must be at least 8 characters long"
    if not re.search(r"[A-Z]", password):
        return "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return "Password must contain at least one lowercase letter"
    if not re.search(r"\d", password):
        return "Password must contain at least one digit"
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\;'/`~]", password):
        return "Password must contain at least one special character"
    return None


def make_tokens(user: User) -> dict:
    access_token, refresh_token = create_tokens_for_user(user)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


async def authenticate_user(
    db: AsyncSession,
    username: str,
    password: str,
    request=None,
) -> User:
    result = await db.execute(
        select(User).where((User.email == username) | (User.username == username))
    )
    user = result.scalar_one_or_none()

    if user and user.lockedUntil and user.lockedUntil > datetime.now(UTC):
        remaining = int((user.lockedUntil - datetime.now(UTC)).total_seconds() // 60)
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account locked. Try again in {remaining} minute(s).",
        )

    client_ip = get_client_ip(request) if request else "unknown"
    if not _check_ip_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts from this IP. Try again later.",
            headers={"Retry-After": "300"},
        )

    if not user or not verify_password(password, user.hashedPassword):
        if user:
            user.failedLoginAttempts = (user.failedLoginAttempts or 0) + 1
            if user.failedLoginAttempts >= LOCKOUT_THRESHOLD:
                user.lockedUntil = datetime.now(UTC) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
            await db.commit()
            await log_auth_event(
                db,
                user.id,
                user.email,
                "LOGIN_FAILED",
                request,
                {"attempt": user.failedLoginAttempts, "threshold": LOCKOUT_THRESHOLD},
            )
            await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email/username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.isActive:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")

    user.failedLoginAttempts = 0
    user.lockedUntil = None
    user.lastLoginAt = datetime.now(UTC)
    await db.commit()

    await log_auth_event(db, user.id, user.email, "LOGIN_SUCCESS", request)
    await db.commit()

    return user


async def check_mfa_required(db: AsyncSession, user: User) -> Optional[str]:
    from app.models.digital_signature import UserMfa

    mfa_result = await db.execute(
        select(UserMfa).where(UserMfa.user_id == user.id, UserMfa.is_enabled)
    )
    mfa_record = mfa_result.scalar_one_or_none()
    if mfa_record:
        temp_token = create_access_token(
            data={"sub": str(user.id), "type": "mfa_challenge"},
            expires_delta=timedelta(minutes=5),
        )
        return temp_token
    return None


async def refresh_user_token(db: AsyncSession, refresh_token_str: str) -> dict:
    payload = await verify_token_with_blacklist(refresh_token_str, expected_type="refresh")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    old_jti = payload.get("jti")
    if old_jti:
        await blacklist_token(old_jti, settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.isActive:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return make_tokens(user)


async def _get_or_create_admin_role(db: AsyncSession, tenant_id: int):
    """Find-or-create the "admin" Role for opt-in tenant self-signup.

    `Role.name` is GLOBALLY unique (a known deferred quirk -- roles aren't
    yet fully tenant-scoped), so an "admin" role created for any tenant is
    found and reused by name rather than duplicated.

    Registration is unauthenticated, so there is normally no tenant context
    and this SELECT runs unfiltered. But it can still run inside a tenant
    context (e.g. tests that set one globally), in which case the tenant
    ORM event filter (app.core.tenant_events) may append a `tenantId`
    predicate and hide an existing global "admin" row, racing us into
    trying to create a second one. Guard that with a SAVEPOINT: create the
    role in a nested transaction so that a unique-constraint violation only
    rolls back the savepoint (not the caller's pending tenant/user rows),
    then re-query for the row the concurrent registration created.
    """
    from app.models.role import Role

    result = await db.execute(select(Role).where(Role.name == "admin"))
    admin_role = result.scalar_one_or_none()
    if admin_role:
        return admin_role

    try:
        async with db.begin_nested():
            admin_role = Role(
                name="admin",
                description="Tenant administrator",
                tenantId=tenant_id,
            )
            db.add(admin_role)
            await db.flush()
    except IntegrityError:
        result = await db.execute(select(Role).where(Role.name == "admin"))
        admin_role = result.scalar_one_or_none()
        if admin_role is None:
            raise

    return admin_role


async def register_new_user(
    db: AsyncSession,
    email: str,
    username: str,
    password: str,
    full_name: Optional[str] = None,
    request=None,
) -> User:
    pwd_err = validate_password_complexity(password)
    if pwd_err:
        raise HTTPException(status_code=422, detail=pwd_err)

    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    result = await db.execute(select(User).where(User.username == username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")

    from app.models.role import Role, user_roles
    from app.models.tenant import Tenant

    # Secure local-first default: self-registration must never let an anonymous
    # signer-upper join an EXISTING tenant (that would be a cross-tenant breach —
    # the old `select(Tenant).limit(1)` behavior). If no tenant exists yet, the
    # first registration bootstraps a brand-new tenant and becomes its admin.
    # If a tenant already exists, open self-registration is rejected; new members
    # must be invited by an admin instead (unless explicitly opted in via
    # ALLOW_TENANT_SELF_SIGNUP, which always creates a fresh tenant per signup).
    result = await db.execute(select(func.count()).select_from(Tenant))
    tenant_count = result.scalar_one()

    is_bootstrap = tenant_count == 0
    if not is_bootstrap and not settings.ALLOW_TENANT_SELF_SIGNUP:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Self-registration is disabled. Ask your organization admin "
                "to invite you."
            ),
        )

    new_tenant = Tenant(
        tenant_name=f"{username}'s Organization",
        tenant_code=f"org_{username}_{secrets.token_hex(4)}",
    )
    db.add(new_tenant)
    await db.flush()
    await db.refresh(new_tenant)

    db_user = User(
        email=email,
        username=username,
        hashedPassword=get_password_hash(password),
        fullName=full_name,
        tenantId=new_tenant.id,
        # SECURITY: isSuperuser is a GLOBAL tenant-bypass (see
        # models/user.py::effective_tenant_id, which returns None -- i.e. no
        # tenant filtering at all -- for superusers; core/rbac.py also lets
        # superusers bypass every role/tenant check). Only the very first-ever
        # registration (tenant_count == 0, the single-tenant on-prem bootstrap)
        # may become a global superuser -- that's acceptable for the sole
        # admin of a fresh install. Every subsequent self-signup (opt-in via
        # ALLOW_TENANT_SELF_SIGNUP) must NOT get global superuser, or every
        # anonymous signup would become a cross-tenant superuser, reopening
        # the breach this workstream closes -- it gets a tenant-scoped
        # "admin" role instead (below).
        isSuperuser=is_bootstrap,
    )
    db.add(db_user)
    await db.flush()  # assigns db_user.id, needed for the role association insert

    if not is_bootstrap:
        admin_role = await _get_or_create_admin_role(db, new_tenant.id)
        await db.execute(
            user_roles.insert().values(user_id=db_user.id, role_id=admin_role.id)
        )

    await db.commit()
    await db.refresh(db_user)

    await log_auth_event(
        db, db_user.id, db_user.email, "REGISTER", request, tenant_id=db_user.tenantId
    )
    await db.commit()

    return db_user


async def get_user_with_mfa_status(db: AsyncSession, user: User) -> dict:
    from app.models.digital_signature import UserMfa

    mfa_result = await db.execute(select(UserMfa).where(UserMfa.user_id == user.id))
    mfa_record = mfa_result.scalar_one_or_none()
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "fullName": user.fullName,
        "department": user.department,
        "jobTitle": user.jobTitle,
        "avatarUrl": user.avatarUrl,
        "isActive": user.isActive,
        "isSuperuser": user.isSuperuser,
        "mfaEnabled": mfa_record.is_enabled if mfa_record else False,
    }


async def setup_mfa(db: AsyncSession, user: User, request=None):
    from app.models.digital_signature import UserMfa

    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=user.email, issuer_name="Blackbox BOM")
    backup_codes = [secrets.token_hex(4) for _ in range(8)]
    hashed_backup_codes = [get_password_hash(code) for code in backup_codes]

    result = await db.execute(select(UserMfa).where(UserMfa.user_id == user.id))
    existing = result.scalar_one_or_none()
    if existing:
        existing.secret_key = secret
        existing.backup_codes = hashed_backup_codes
        existing.is_enabled = False
    else:
        db.add(
            UserMfa(
                user_id=user.id,
                secret_key=secret,
                backup_codes=hashed_backup_codes,
                mfa_type="totp",
                tenantId=user.tenantId,
            )
        )
    await log_auth_event(db, user.id, user.email, "MFA_SETUP", request)
    await db.commit()
    return {"secret": secret, "qr_uri": uri, "backup_codes": backup_codes}


async def verify_mfa_enable(
    db: AsyncSession,
    user: User,
    code: str,
    secret: Optional[str] = None,
    request=None,
):
    from app.models.digital_signature import UserMfa

    result = await db.execute(select(UserMfa).where(UserMfa.user_id == user.id))
    mfa_record = result.scalar_one_or_none()

    if secret:
        totp = pyotp.TOTP(secret)
        if totp.verify(code):
            if not mfa_record:
                mfa_record = UserMfa(
                    user_id=user.id,
                    secret_key=secret,
                    backup_codes=[],
                    mfa_type="totp",
                    is_enabled=True,
                    tenantId=user.tenantId,
                )
                db.add(mfa_record)
            else:
                mfa_record.secret_key = secret
                mfa_record.is_enabled = True
            await log_auth_event(db, user.id, user.email, "MFA_ENABLE", request)
            await db.commit()
            return {"message": "MFA enabled successfully", "enabled": True}
        raise HTTPException(status_code=400, detail="Invalid MFA code")

    if not mfa_record or not mfa_record.is_enabled:
        raise HTTPException(status_code=400, detail="MFA not configured")

    totp = pyotp.TOTP(mfa_record.get_decrypted_secret())
    if totp.verify(code):
        mfa_record.last_used_at = func.now()
        await log_auth_event(db, user.id, user.email, "MFA_VERIFY", request)
        await db.commit()
        return {"message": "MFA verification successful", "verified": True}

    if mfa_record.backup_codes:
        for i, hashed_code in enumerate(mfa_record.backup_codes):
            if verify_password(code, hashed_code):
                mfa_record.last_used_at = func.now()
                remaining_codes = list(mfa_record.backup_codes)
                remaining_codes.pop(i)
                mfa_record.backup_codes = remaining_codes
                await db.commit()
                return {
                    "message": "MFA verification successful (backup code used)",
                    "verified": True,
                }

    raise HTTPException(status_code=400, detail="Invalid MFA code")


async def disable_mfa(
    db: AsyncSession,
    user: User,
    password: str,
    totp_code: str,
    request=None,
):
    from app.models.digital_signature import UserMfa

    if settings.IS_PRODUCTION:
        if not password or not totp_code:
            raise HTTPException(
                status_code=400, detail="Password and TOTP code required to disable MFA"
            )
        if not verify_password(password, user.hashedPassword):
            raise HTTPException(status_code=403, detail="Invalid password")

    result = await db.execute(select(UserMfa).where(UserMfa.user_id == user.id))
    mfa_record = result.scalar_one_or_none()
    if not mfa_record:
        raise HTTPException(status_code=404, detail="MFA not configured")

    if settings.IS_PRODUCTION:
        totp = pyotp.TOTP(mfa_record.get_decrypted_secret())
        if not totp.verify(totp_code, valid_window=1):
            raise HTTPException(status_code=400, detail="Invalid TOTP code")

    mfa_record.is_enabled = False
    await log_auth_event(db, user.id, user.email, "MFA_DISABLE", request)
    await db.commit()
    return {"message": "MFA disabled successfully", "enabled": False}


async def challenge_mfa(db: AsyncSession, temp_token: str, code: str) -> dict:
    from app.models.digital_signature import UserMfa

    payload = verify_token(temp_token, expected_type="mfa_challenge")
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired temp token")

    user_id = int(payload.get("sub", 0))
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.isActive:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    mfa_result = await db.execute(
        select(UserMfa).where(UserMfa.user_id == user_id, UserMfa.is_enabled)
    )
    mfa_record = mfa_result.scalar_one_or_none()
    if not mfa_record:
        raise HTTPException(status_code=400, detail="MFA not configured for this user")

    totp = pyotp.TOTP(mfa_record.get_decrypted_secret())
    valid = totp.verify(code)

    if not valid and mfa_record.backup_codes:
        for i, hashed_code in enumerate(mfa_record.backup_codes):
            if verify_password(code, hashed_code):
                valid = True
                remaining_codes = list(mfa_record.backup_codes)
                remaining_codes.pop(i)
                mfa_record.backup_codes = remaining_codes
                break

    if not valid:
        raise HTTPException(status_code=400, detail="Invalid MFA code")

    mfa_record.last_used_at = func.now()
    await db.commit()

    return make_tokens(user)


async def logout_user(db: AsyncSession, user: User, token: str, request=None):
    if token:
        payload = verify_token(token)
        jti = payload.get("jti") if payload else None
        if jti:
            await blacklist_token(jti, settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    await log_auth_event(db, user.id, user.email, "LOGOUT", request)
    await db.commit()


async def revoke_all_sessions(db: AsyncSession, user: User, request=None):
    from app.core.cache import set_user_revoked_before

    # Invalidate every outstanding access/refresh token for this user by recording
    # a revoked-before timestamp. Token verification rejects any token whose iat
    # predates this value. TTL covers the longest (refresh) token lifetime.
    now_ts = datetime.now(UTC).timestamp()
    ttl = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400
    await set_user_revoked_before(str(user.id), now_ts, ttl)

    await log_auth_event(db, user.id, user.email, "REVOKE_ALL", request)
    await db.commit()


async def send_forgot_password(db: AsyncSession, email: str, request=None):
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        return {"message": "If that email exists, a reset link has been sent."}

    reset_token = secrets.token_urlsafe(32)
    # Store a fast, indexed hash of the high-entropy token so completion can do a
    # direct lookup (no scan-and-bcrypt-every-candidate loop / timing oracle).
    user.resetToken = _hash_reset_token(reset_token)
    user.resetTokenExpires = datetime.now(UTC) + timedelta(hours=1)
    await db.commit()

    from app.services.email_service import send_email

    reset_link = f"{settings.SSO_REDIRECT_URI.rsplit('/', 1)[0]}/reset-password?token={reset_token}"
    html = f"""
    <h2>Password Reset</h2>
    <p>Click the link below to reset your password. This link expires in 1 hour.</p>
    <p><a href="{reset_link}">Reset Password</a></p>
    <p>If you did not request this, please ignore this email.</p>
    """
    await send_email(
        to=user.email,
        subject="Password Reset Request - Blackbox BOM",
        body=f"Reset your password here: {reset_link}",
        html=html,
    )

    await log_auth_event(db, user.id, user.email, "PASSWORD_RESET_REQUESTED", request)
    await db.commit()

    return {"message": "If that email exists, a reset link has been sent."}


async def complete_reset_password(db: AsyncSession, token: str, new_password: str, request=None):
    pwd_err = validate_password_complexity(new_password)
    if pwd_err:
        raise HTTPException(status_code=422, detail=pwd_err)

    token_hash = _hash_reset_token(token)
    result = await db.execute(
        select(User).where(
            User.resetToken == token_hash,
            User.resetTokenExpires.isnot(None),
            User.resetTokenExpires > datetime.now(UTC),
        )
    )
    target = result.scalar_one_or_none()

    if not target:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    current_tenant = getattr(target, "tenantId", None)
    if current_tenant is not None:
        from app.models.tenant import Tenant

        tenant_check = await db.execute(select(Tenant).where(Tenant.id == current_tenant))
        if not tenant_check.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    target.hashedPassword = get_password_hash(new_password)
    target.resetToken = None
    target.resetTokenExpires = None
    target.failedLoginAttempts = 0
    target.lockedUntil = None
    await db.commit()

    await log_auth_event(db, target.id, target.email, "PASSWORD_RESET_COMPLETED", request)
    await db.commit()

    return {"message": "Password reset successfully"}


async def change_user_password(
    db: AsyncSession,
    user: User,
    current_password: str,
    new_password: str,
    request=None,
):
    if not verify_password(current_password, user.hashedPassword):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect"
        )

    pwd_err = validate_password_complexity(new_password)
    if pwd_err:
        raise HTTPException(status_code=422, detail=pwd_err)

    user.hashedPassword = get_password_hash(new_password)
    await db.commit()

    await log_auth_event(db, user.id, user.email, "PASSWORD_CHANGE", request)
    await db.commit()

    return {"message": "Password changed successfully"}
