"""Currency conversion for cost roll-ups.

Deliberately mirrors uom_service: a rate that cannot be resolved is REPORTED,
never silently applied as 1:1. Treating a missing EUR->USD rate as 1.0 does
not produce an approximate number, it invents money.

Reads the existing `exchange_rates` table (app/models/enterprise_extensions.py,
also exposed by app/api/endpoints/enterprise_ext_api.py) — no new storage.
"""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enterprise_extensions import ExchangeRate

DEFAULT_CURRENCY = "USD"


def norm(code: Optional[str]) -> str:
    """Normalise a currency code. NULL means the pre-multi-currency default
    (USD) — the same value migration 061 backfills onto existing rows."""
    return (code or DEFAULT_CURRENCY).strip().upper()


async def get_rate(
    db: AsyncSession,
    from_currency: Optional[str],
    to_currency: Optional[str],
    tenant_id: Optional[int] = None,
) -> Optional[Decimal]:
    """Newest active rate from -> to, or the inverse of the stored to -> from
    rate, or None when neither exists. None means "unknown", not 1.

    ponytail: direct + inverse only, no triangulation through a base currency
    (EUR->USD->JPY). Add the two-hop walk when a tenant actually keeps a
    star-shaped rate table; guessing a cross rate is exactly the kind of
    invented number this module exists to refuse.
    """
    src, dst = norm(from_currency), norm(to_currency)
    if src == dst:
        return Decimal(1)

    stmt = (
        select(ExchangeRate)
        .where(
            ExchangeRate.is_active.is_(True),
            # A forward-dated rate is not in force yet; "newest" must mean
            # newest *effective*, or tomorrow's rate prices today's BOM.
            ExchangeRate.effective_date <= datetime.now(UTC),
            ExchangeRate.from_currency.in_([src, dst]),
            ExchangeRate.to_currency.in_([src, dst]),
        )
        .order_by(ExchangeRate.effective_date.desc())
    )
    # tenant_events auto-scopes ORM select(), but the roll-up passes its tenant
    # explicitly like every other query in bom_service rather than trusting the
    # ambient context alone.
    if tenant_id is not None:
        stmt = stmt.where(ExchangeRate.tenantId == tenant_id)
    rows = (await db.execute(stmt)).scalars().all()

    for row in rows:
        if norm(row.from_currency) == src and norm(row.to_currency) == dst and row.rate:
            return Decimal(str(row.rate))
    for row in rows:
        if norm(row.from_currency) == dst and norm(row.to_currency) == src and row.rate:
            return Decimal(1) / Decimal(str(row.rate))
    return None
