"""Create initial admin user for Blackbox BOM.

Usage:
    python -m app.scripts.create_admin

Reads credentials from environment variables:
    ADMIN_EMAIL (default: admin@blackbox-bom.com)
    ADMIN_USERNAME (default: admin)
    ADMIN_PASSWORD (default: prompts if not set)
"""

import asyncio
import getpass
import os
import re
import sys

from sqlalchemy import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from app.core.security import get_password_hash
from app.db.session import AsyncSessionLocal
from app.models.user import User


def _validate_password(password: str) -> str | None:
    if len(password) < 12:
        return "Password must be at least 12 characters long"
    if not re.search(r"[A-Z]", password):
        return "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return "Password must contain at least one lowercase letter"
    if not re.search(r"\d", password):
        return "Password must contain at least one digit"
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\;'/`~]", password):
        return "Password must contain at least one special character"
    return None


async def main():
    email = os.environ.get("ADMIN_EMAIL", "admin@blackbox-bom.com")
    username = os.environ.get("ADMIN_USERNAME", "admin")
    password = os.environ.get("ADMIN_PASSWORD", "")

    if not password:
        password = getpass.getpass("Enter admin password: ")

    err = _validate_password(password)
    if err:
        print(f"ERROR: {err}", file=sys.stderr)
        sys.exit(1)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where((User.email == email) | (User.username == username))
        )
        existing = result.scalar_one_or_none()
        if existing:
            print(f"Admin user already exists: {existing.email}")
            sys.exit(0)

        user = User(
            email=email,
            username=username,
            hashedPassword=get_password_hash(password),
            fullName="Administrator",
            isActive=True,
            isSuperuser=True,
        )
        db.add(user)
        await db.commit()
        print(f"Admin user created: {email} (superuser=True)")


if __name__ == "__main__":
    asyncio.run(main())
