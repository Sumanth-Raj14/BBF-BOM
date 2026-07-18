"""21 CFR Part 11 — electronic signatures + audit trail.

`sign_action` is the single entry point for recording a Part-11-compliant
electronic signature on a critical, state-changing action. It:

  1. Requires password re-authentication of the acting user (NOT just an
     already-valid session/JWT) — the caller's current password must be
     supplied and verified against the stored hash via
     `app.core.security.verify_password`. Missing or wrong password ->
     HTTPException(401), and the caller MUST NOT have mutated any state
     yet when this raises (callers invoke this before applying the state
     transition).
  2. Computes a SHA-256 content hash over a canonical (sorted-keys) JSON
     serialization of the record/action being attested to, for tamper-
     evident integrity.
  3. Adds (but does not commit) one `ESignature` row and one `AuditLog`
     row to the session, tenant-scoped to the acting user's tenant. The
     caller commits as part of its own transaction so the signature/audit
     rows are persisted atomically together with the state change they
     gate.

Both `ESignature` and `AuditLog` are append-only: neither model has an
update/delete endpoint anywhere in the API.
"""

import hashlib
import json
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password
from app.core.tenant_context import get_tenant_id
from app.models.audit_log import AuditLog
from app.models.esignature import ESignature
from app.models.user import User


def _content_hash(content: dict) -> str:
    canonical = json.dumps(content, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def sign_action(
    db: AsyncSession,
    current_user: User,
    password: Optional[str],
    action: str,
    entity_type: str,
    entity_id: int,
    meaning: str,
    content: Optional[dict] = None,
) -> ESignature:
    """Re-authenticate `current_user` by password and record an electronic
    signature + audit log entry for `action` on `entity_type`:`entity_id`.

    Raises HTTPException(401) if no password was supplied or it does not
    match the user's current stored password. Does not commit — caller
    controls the transaction.
    """
    if not password or not verify_password(password, current_user.hashedPassword):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password re-authentication required for electronic signature",
        )

    tid = get_tenant_id()
    if tid is None:
        tid = current_user.tenantId

    payload = dict(content or {})
    payload.update({"action": action, "entity_type": entity_type, "entity_id": entity_id})
    digest = _content_hash(payload)

    signature = ESignature(
        tenantId=tid,
        user_id=current_user.id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        meaning=meaning,
        content_hash=digest,
    )
    db.add(signature)

    audit = AuditLog(
        tenantId=tid,
        action=action,
        entityType=entity_type,
        entityId=entity_id,
        userId=current_user.id,
        userEmail=current_user.email,
        changes={"meaning": meaning, "content_hash": digest},
    )
    db.add(audit)

    return signature
