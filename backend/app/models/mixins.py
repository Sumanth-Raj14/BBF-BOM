from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy.orm import declared_attr, relationship


class TenantAwareMixin:
    @declared_attr
    def tenantId(self):
        return Column(
            Integer, ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
        )

    @declared_attr
    def tenant(self):
        return relationship("Tenant", foreign_keys=[self.tenantId])


class OptimisticLockMixin:
    """Lost-update protection for concurrently edited rows.

    Without this, every write path here was a read-modify-write with no guard:
    two people editing the same BOM line both loaded qty=10, one saved 12, the
    other saved 15, and the 12 vanished with neither user told anything. That is
    the single most damaging class of silent data loss in a multi-user PLM tool,
    because the victim has no way to notice.

    SQLAlchemy does the work: with `version_id_col` set, the ORM appends
    `AND lock_version = <the value it loaded>` to every UPDATE/DELETE for the
    mapper and bumps the column itself. If another transaction got there first
    the row count is 0 and SQLAlchemy raises StaleDataError, which
    app.main maps to 409 CONFLICT.

    Named `lock_version`, deliberately NOT `version`: `boms.version` and
    `bom_snapshots.version` already exist and mean a business revision number
    that users choose. Reusing that name would conflate an engineering revision
    with a concurrency token — two things that must never share a column.

    Caveat worth knowing: raw `text()` UPDATEs and bulk Core update()/delete()
    do not participate (they neither check nor bump the column), exactly as they
    bypass the tenant auto-filter. They cannot cause a spurious conflict, but a
    concurrent ORM write will not detect them either.
    """

    lock_version = Column(Integer, nullable=False, default=1, server_default="1")

    @declared_attr
    def __mapper_args__(cls):  # noqa: N805
        return {"version_id_col": cls.lock_version}
