"""Units of Measure + conversion factors.

Multi-UOM support for BOM quantity/cost roll-up across lines that mix units
within the same physical dimension (e.g. wire counted in metres inside an
assembly counted in each). Modeled the same way
app/models/enterprise_extensions.py models currency conversion: a reference
table (UomUnit, like Currency) plus a factor table (UomConversion, like
ExchangeRate) — both tenant-scoped, same as that pair.

UomConversion stores one row per non-base unit, from that unit straight to
its dimension's base unit (qty_in_base = qty_in_unit * factor). Any other
pair in the same dimension (e.g. CM -> IN) is derived at query time by
chaining through the base unit (see app/services/uom_service.convert) —
so seeding N units needs only N-1 rows, not a full pairwise matrix.
"""

from sqlalchemy import Boolean, Column, DateTime, Index, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class UomUnit(Base, TenantAwareMixin):
    """A unit of measure, e.g. M (metre). `dimension` groups units that can
    be converted into one another (length/mass/count/volume); exactly one
    unit per dimension per tenant should be `is_base` — the anchor every
    UomConversion factor for that dimension is relative to.
    """

    __tablename__ = "uom_units"

    id = Column(Integer, primary_key=True)
    code = Column(String(10), nullable=False)  # EA, M, CM, KG, ... unique per tenant
    name = Column(String(50), nullable=False)
    dimension = Column(String(20), nullable=False)  # length | mass | count | volume
    is_base = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("tenantId", "code", name="uq_uom_units_tenant_code"),
        Index("idx_uom_units_tenant_dimension", "tenantId", "dimension"),
    )

    def __repr__(self):
        return f"<UomUnit {self.code}>"


class UomConversion(Base, TenantAwareMixin):
    """Direct conversion factor: 1 `from_uom` == `factor` `to_uom`.

    Seed convention (see app/services/uom_service.STANDARD_CONVERSIONS):
    `to_uom` is always the base unit of the dimension `from_uom` belongs to.
    """

    __tablename__ = "uom_conversions"

    id = Column(Integer, primary_key=True)
    from_uom = Column(String(10), nullable=False)
    to_uom = Column(String(10), nullable=False)
    factor = Column(Numeric(24, 12), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("tenantId", "from_uom", "to_uom", name="uq_uom_conversions_tenant_pair"),
        Index("idx_uom_conversions_tenant_from", "tenantId", "from_uom"),
    )

    def __repr__(self):
        return f"<UomConversion {self.from_uom}->{self.to_uom} x{self.factor}>"
