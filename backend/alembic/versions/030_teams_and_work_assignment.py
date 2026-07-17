"""WS2: teams, team_members, and team assignment on work items

Adds the Team + TeamMember tables and an ``assigned_team_id`` column on
``work_orders`` and ``capa_actions`` so work can be assigned to a team as well as
an individual (powers the unified My Work / Team Work board).

Revision ID: 030_teams_and_work_assignment
Revises: 029_fix_column_mismatches
Create Date: 2026-07-11
"""

import sqlalchemy as sa
from alembic import op

revision = "030_teams_and_work_assignment"
down_revision = "029_fix_column_mismatches"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "teams",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "createdById",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_teams_tenant_name", "teams", ["tenantId", "name"])
    op.create_index("ix_teams_name", "teams", ["name"])
    op.create_index("ix_teams_createdById", "teams", ["createdById"])
    op.create_index("ix_teams_tenantId", "teams", ["tenantId"])

    op.create_table(
        "team_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "teamId",
            sa.Integer(),
            sa.ForeignKey("teams.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "userId",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=50), server_default="member"),
        sa.Column(
            "tenantId",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("teamId", "userId", name="uq_team_member"),
    )
    op.create_index("ix_team_members_teamId", "team_members", ["teamId"])
    op.create_index("ix_team_members_userId", "team_members", ["userId"])
    op.create_index("ix_team_members_tenantId", "team_members", ["tenantId"])

    op.add_column(
        "work_orders",
        sa.Column(
            "assigned_team_id",
            sa.Integer(),
            sa.ForeignKey("teams.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_work_orders_assigned_team_id", "work_orders", ["assigned_team_id"]
    )

    op.add_column(
        "capa_actions",
        sa.Column(
            "assigned_team_id",
            sa.Integer(),
            sa.ForeignKey("teams.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_capa_actions_assigned_team_id", "capa_actions", ["assigned_team_id"]
    )


def downgrade():
    op.drop_index("ix_capa_actions_assigned_team_id", table_name="capa_actions")
    op.drop_column("capa_actions", "assigned_team_id")
    op.drop_index("ix_work_orders_assigned_team_id", table_name="work_orders")
    op.drop_column("work_orders", "assigned_team_id")

    op.drop_index("ix_team_members_tenantId", table_name="team_members")
    op.drop_index("ix_team_members_userId", table_name="team_members")
    op.drop_index("ix_team_members_teamId", table_name="team_members")
    op.drop_table("team_members")

    op.drop_index("ix_teams_tenantId", table_name="teams")
    op.drop_index("ix_teams_createdById", table_name="teams")
    op.drop_index("ix_teams_name", table_name="teams")
    op.drop_index("idx_teams_tenant_name", table_name="teams")
    op.drop_table("teams")
