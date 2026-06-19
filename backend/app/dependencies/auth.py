from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import User


VALID_ROLES = (
    "rea_pmu_officer",
    "rea_grant_admin",
    "afcen_admin",
    "afcen_analyst",
    "disco_officer",
    "developer",
    "nerc_officer",
    "nemsa_inspector",
    "iva",
    "wb_observer",
    "lender",
    "community_rep",
)

SUPERUSER_ROLES = {"rea_pmu_officer", "afcen_admin"}

MODULE_ACCESS = {
    "site_registry":     {"full": {"rea_pmu_officer", "afcen_admin", "afcen_analyst"}, "read": {"disco_officer", "developer", "wb_observer", "nerc_officer"}},
    "site_readiness":    {"full": {"rea_pmu_officer", "afcen_admin", "afcen_analyst"}, "read": {"disco_officer", "developer", "wb_observer"}},
    "disco_readiness":   {"full": {"disco_officer", "afcen_admin"}, "read": {"rea_pmu_officer", "afcen_analyst", "developer", "nerc_officer"}},
    "financial_model":   {"full": {"afcen_admin", "afcen_analyst"}, "read": {"rea_pmu_officer", "developer", "wb_observer"}},
    "tender":            {"full": {"rea_pmu_officer", "afcen_admin"}, "read": {"afcen_analyst", "developer", "wb_observer", "nerc_officer"}},
    "evaluation":        {"full": {"afcen_admin", "afcen_analyst"}, "read": {"rea_pmu_officer", "wb_observer"}},
    "agreements":        {"full": {"rea_pmu_officer", "rea_grant_admin", "afcen_admin"}, "read": {"developer", "wb_observer", "lender"}},
    "cp_tracker":        {"full": {"rea_pmu_officer", "afcen_admin"}, "read": {"developer", "wb_observer", "lender"}},
    "disbursement":      {"full": {"rea_grant_admin", "rea_pmu_officer"}, "read": {"afcen_admin", "developer", "iva", "wb_observer", "lender"}},
    "es_grm":            {"full": {"rea_pmu_officer", "afcen_admin", "community_rep"}, "read": {"developer", "wb_observer"}},
    "settlement":        {"full": {"disco_officer", "afcen_admin"}, "read": {"rea_pmu_officer", "developer", "nerc_officer"}},
    "performance":       {"full": {"rea_pmu_officer", "afcen_admin", "afcen_analyst"}, "read": {"developer", "disco_officer", "wb_observer", "nerc_officer"}},
}


@dataclass
class AuthContext:
    user_id: str
    role: str
    name: str
    email: str
    disco_scope: str | None


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    role = request.headers.get("X-User-Role", "rea_pmu_officer")
    if role not in VALID_ROLES:
        role = "rea_pmu_officer"

    result = await db.execute(select(User).where(User.email == "admin@afcen.org"))
    user = result.scalar_one_or_none()
    if not user:
        user = User(email="admin@afcen.org", name="Program Manager", role=role, organisation="AfCEN Nigeria")
        db.add(user)
        await db.flush()
        await db.commit()

    return AuthContext(
        user_id=user.id,
        role=role,
        name=user.name or "Program Manager",
        email=user.email,
        disco_scope=user.disco_scope,
    )


def require_role(*allowed_roles: str):
    async def checker(auth: AuthContext = Depends(get_current_user)):
        if auth.role in SUPERUSER_ROLES:
            return auth
        if auth.role not in set(allowed_roles):
            raise HTTPException(status_code=403, detail=f"Role '{auth.role}' not permitted")
        return auth
    return checker


def require_module(module: str):
    async def checker(auth: AuthContext = Depends(get_current_user)):
        if auth.role in SUPERUSER_ROLES:
            return auth
        access = MODULE_ACCESS.get(module, {})
        all_allowed = access.get("full", set()) | access.get("read", set())
        if auth.role not in all_allowed:
            raise HTTPException(status_code=403, detail=f"No access to module '{module}'")
        return auth
    return checker


def require_module_write(module: str):
    async def checker(auth: AuthContext = Depends(get_current_user)):
        if auth.role in SUPERUSER_ROLES:
            return auth
        access = MODULE_ACCESS.get(module, {})
        if auth.role not in access.get("full", set()):
            raise HTTPException(status_code=403, detail=f"No write access to module '{module}'")
        return auth
    return checker
