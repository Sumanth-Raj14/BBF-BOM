"""Create calendar_events — a live API whose table no migration ever built.

`app/models/calendar_event.py` backs a fully registered CRUD router
(`app/api/endpoints/calendar_events.py`, mounted in `app/api/api_v1.py`), but
no migration in 001-057 creates the table. It only ever existed because
`Base.metadata.create_all()` made it.

Why that went unnoticed: every green CI path bootstraps a fresh database with
create_all (SQLite tests directly, Postgres jobs via `scripts.init_db`'s
greenfield branch — a CI container is always alembic-unmanaged). The
staging/production deploy step is different: `.github/workflows/ci.yml` runs
bare `docker compose exec backend alembic upgrade head` with no create_all
fallback, so an already-managed database takes the incremental-only path and
never gets this table. Result: /api/v1/calendar/calendar-events* 500s in
production while CI stays green.

The original DDL was archived to `backend/docs/sql_archive/012_calendar_events.sql`
instead of being ported into the alembic chain during the pre-022 SQL-to-Alembic
effort described in `scripts/init_db.py`'s docstring. This ports it, matching
the CURRENT model rather than the archived SQL where they differ.

Idempotent: skips if the table already exists, so databases bootstrapped via
create_all (every existing dev/CI database) upgrade cleanly instead of failing
on "table already exists".

Revision ID: 058_calendar_events
Revises: 057_mbom_hierarchy
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "058_calendar_events"
down_revision: str | None = "057_mbom_hierarchy"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if "calendar_events" in inspect(bind).get_table_names():
        # Already present from a create_all bootstrap — nothing to do.
        return

    op.create_table(
        "calendar_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("event_type", sa.String(length=50), server_default="general"),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True)),
        sa.Column("all_day", sa.Boolean(), server_default=sa.false()),
        sa.Column("color", sa.String(length=20)),
        sa.Column("related_resource_type", sa.String(length=50)),
        sa.Column("related_resource_id", sa.Integer()),
        sa.Column("is_completed", sa.Boolean(), server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        # TenantAwareMixin declares this as ondelete="CASCADE", index=True,
        # nullable=False (app/models/mixins.py) — match it exactly or the
        # migrated schema drifts from the model.
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    # index=True on the model columns produces these automatically under
    # create_all; a migration has to state them.
    op.create_index("ix_calendar_events_user_id", "calendar_events", ["user_id"])
    op.create_index(
        "ix_calendar_events_user_time", "calendar_events", ["user_id", "start_time"]
    )
    op.create_index("ix_calendar_events_tenantId", "calendar_events", ["tenantId"])


def downgrade() -> None:
    bind = op.get_bind()
    if "calendar_events" not in inspect(bind).get_table_names():
        return
    op.drop_index("ix_calendar_events_tenantId", table_name="calendar_events")
    op.drop_index("ix_calendar_events_user_time", table_name="calendar_events")
    op.drop_index("ix_calendar_events_user_id", table_name="calendar_events")
    op.drop_table("calendar_events")
