from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import User, Organization, OrgMember


@dataclass
class AuthContext:
    user_id: str
    org_id: str
    role: str
    name: str
    email: str


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    role = request.headers.get("X-User-Role", "program_manager")
    valid_roles = ("program_manager", "afcen_admin", "developer", "government_officer", "bank")
    if role not in valid_roles:
        role = "program_manager"

    result = await db.execute(select(User).where(User.clerk_user_id == "dev_user"))
    user = result.scalar_one_or_none()
    if not user:
        user = User(clerk_user_id="dev_user", email="admin@afcen.org", name="Program Manager")
        db.add(user)

    result = await db.execute(select(Organization).where(Organization.clerk_org_id == "dev_org"))
    org = result.scalar_one_or_none()
    if not org:
        org = Organization(name="AfCEN Nigeria", clerk_org_id="dev_org")
        db.add(org)

    await db.flush()

    result = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org.id, OrgMember.user_id == user.id)
    )
    member = result.scalar_one_or_none()
    if not member:
        member = OrgMember(org_id=org.id, user_id=user.id, role=role)
        db.add(member)
        await db.flush()

    await db.commit()

    return AuthContext(
        user_id=user.id,
        org_id=org.id,
        role=role,
        name=user.name or "Program Manager",
        email=user.email or "admin@afcen.org",
    )


def require_role(*allowed_roles: str):
    async def checker(auth: AuthContext = Depends(get_current_user)):
        if auth.role not in allowed_roles:
            raise HTTPException(status_code=403, detail=f"Role '{auth.role}' not permitted")
        return auth
    return checker
