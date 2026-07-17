"""Teams + team membership (WS2).

Enables assigning work (work orders, CAPA actions, …) to a team as well as an
individual, and powers the unified "My Work / Team Work" board.
"""

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.mixins import TenantAwareMixin


class Team(Base, TenantAwareMixin):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text)
    createdById = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    createdAt = Column(DateTime(timezone=True), server_default=func.now())
    updatedAt = Column(DateTime(timezone=True), onupdate=func.now())

    members = relationship(
        "TeamMember", back_populates="team", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (Index("idx_teams_tenant_name", "tenantId", "name"),)

    def __repr__(self):
        return f"<Team {self.id}:{self.name}>"


class TeamMember(Base, TenantAwareMixin):
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True)
    teamId = Column(
        Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    userId = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role = Column(String(50), default="member")  # member | lead
    createdAt = Column(DateTime(timezone=True), server_default=func.now())

    team = relationship("Team", back_populates="members")
    user = relationship("User", foreign_keys=[userId])

    __table_args__ = (UniqueConstraint("teamId", "userId", name="uq_team_member"),)

    def __repr__(self):
        return f"<TeamMember team:{self.teamId} user:{self.userId}>"
