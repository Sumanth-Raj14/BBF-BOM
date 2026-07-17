"""Teams + team membership API (WS2)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.team import Team, TeamMember
from app.models.user import User

router = APIRouter()


class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None


class MemberAdd(BaseModel):
    user_id: int
    role: str = "member"


def _team_dict(t: Team, member_count: int) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "created_by_id": t.createdById,
        "member_count": member_count,
    }


async def _member_counts(db: AsyncSession, tenant_id: int) -> dict[int, int]:
    result = await db.execute(
        select(TeamMember.teamId, func.count())
        .where(TeamMember.tenantId == tenant_id)
        .group_by(TeamMember.teamId)
    )
    return {tid: count for tid, count in result.all()}


@router.post("/")
async def create_team(
    body: TeamCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    team = Team(
        name=body.name,
        description=body.description,
        createdById=user.id,
        tenantId=user.tenantId,
    )
    db.add(team)
    await db.flush()
    # The creator is automatically a lead member.
    db.add(TeamMember(teamId=team.id, userId=user.id, role="lead", tenantId=user.tenantId))
    await db.commit()
    return _team_dict(team, member_count=1)


@router.get("/")
async def list_teams(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Team).where(Team.tenantId == user.tenantId).order_by(Team.name)
    )
    teams = result.scalars().all()
    counts = await _member_counts(db, user.tenantId)
    return [_team_dict(t, counts.get(t.id, 0)) for t in teams]


@router.get("/mine")
async def my_teams(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Team)
        .join(TeamMember, TeamMember.teamId == Team.id)
        .where(TeamMember.userId == user.id, Team.tenantId == user.tenantId)
        .order_by(Team.name)
    )
    teams = result.scalars().unique().all()
    counts = await _member_counts(db, user.tenantId)
    return [_team_dict(t, counts.get(t.id, 0)) for t in teams]


@router.get("/{team_id}/members")
async def list_members(
    team_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TeamMember, User)
        .join(User, User.id == TeamMember.userId)
        .where(TeamMember.teamId == team_id, TeamMember.tenantId == user.tenantId)
    )
    return [
        {
            "user_id": m.userId,
            "role": m.role,
            "email": u.email,
            "name": getattr(u, "fullName", None) or u.username,
        }
        for m, u in result.all()
    ]


@router.post("/{team_id}/members")
async def add_member(
    team_id: int,
    body: MemberAdd,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Team).where(Team.id == team_id, Team.tenantId == user.tenantId)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Team not found")

    existing = await db.execute(
        select(TeamMember).where(
            TeamMember.teamId == team_id, TeamMember.userId == body.user_id
        )
    )
    if existing.scalar_one_or_none() is not None:
        return {"status": "exists", "user_id": body.user_id}

    db.add(
        TeamMember(
            teamId=team_id, userId=body.user_id, role=body.role, tenantId=user.tenantId
        )
    )
    await db.commit()
    return {"status": "added", "user_id": body.user_id}


@router.delete("/{team_id}/members/{user_id}")
async def remove_member(
    team_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TeamMember).where(
            TeamMember.teamId == team_id,
            TeamMember.userId == user_id,
            TeamMember.tenantId == user.tenantId,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    await db.delete(member)
    await db.commit()
    return {"status": "removed", "user_id": user_id}
