"""
Module 1 — Portfolio / Site Registry
Module 2 — Site Readiness / PFS

FastAPI routes for site and programme management within the
AfCEN DARES IMG platform.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import SiteRegistry, Program, AuditLog, utcnow, new_uuid
from app.dependencies.auth import (
    AuthContext,
    get_current_user,
    require_module,
    require_module_write,
)

router = APIRouter(prefix="/site-registry", tags=["site-registry"])

# ── Pydantic Schemas ────────────────────────────────────────────────


class SiteBase(BaseModel):
    program_id: Optional[str] = None
    disco: str
    feeder_name: str = ""
    band: str = ""
    community: str
    state: str = ""
    lga: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    population: int = 0
    customers: int = 0
    supply_hours: float = 0.0
    demand_kwh: float = 0.0
    genset_proxy: bool = False
    grid_dist_km: float = 0.0
    security_risk: str = "low"
    data_quality_score: float = 0.0
    status: str = "candidate"
    source_data: dict[str, Any] = Field(default_factory=dict)
    settlement_rank: Optional[int] = None


class SiteCreate(SiteBase):
    pass


class SiteUpdate(BaseModel):
    program_id: Optional[str] = None
    disco: Optional[str] = None
    feeder_name: Optional[str] = None
    band: Optional[str] = None
    community: Optional[str] = None
    state: Optional[str] = None
    lga: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    population: Optional[int] = None
    customers: Optional[int] = None
    supply_hours: Optional[float] = None
    demand_kwh: Optional[float] = None
    genset_proxy: Optional[bool] = None
    grid_dist_km: Optional[float] = None
    security_risk: Optional[str] = None
    data_quality_score: Optional[float] = None
    status: Optional[str] = None
    source_data: Optional[dict[str, Any]] = None
    settlement_rank: Optional[int] = None


class SiteOut(SiteBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SiteListResponse(BaseModel):
    items: list[SiteOut]
    total: int
    page: int
    limit: int


class DiscoStat(BaseModel):
    disco: str
    site_count: int
    total_customers: int
    total_demand_kwh: float
    avg_data_quality: float


class StatsResponse(BaseModel):
    total_sites: int
    discos: list[DiscoStat]


class ProgramBase(BaseModel):
    name: str
    scheme_type: str = "img_capex_grant"
    funding_source: str = "DARES/IDA"
    grant_envelope_usd: float = 0.0
    implementing_agency: str = "REA"
    status: str = "active"
    config: dict[str, Any] = Field(default_factory=dict)


class ProgramCreate(ProgramBase):
    pass


class ProgramOut(ProgramBase):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Helper ──────────────────────────────────────────────────────────


VALID_SITE_STATUSES = {
    "candidate", "shortlisted", "pfs_ready", "pfs_complete",
    "approved", "deferred", "rejected",
}

VALID_SECURITY_RISKS = {"low", "medium", "high"}


def _row_to_site_out(row: SiteRegistry) -> SiteOut:
    return SiteOut.model_validate(row)


async def _get_site_or_404(
    site_id: str,
    db: AsyncSession,
    auth: AuthContext,
) -> SiteRegistry:
    result = await db.execute(
        select(SiteRegistry).where(SiteRegistry.id == site_id)
    )
    site = result.scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=404, detail="Site not found")
    # Enforce disco scope
    if auth.disco_scope and site.disco != auth.disco_scope:
        raise HTTPException(status_code=403, detail="Site outside your DisCo scope")
    return site


async def _audit(
    db: AsyncSession,
    auth: AuthContext,
    action: str,
    entity_type: str,
    entity_id: str | None,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before_json=before,
        after_json=after,
    ))


# ── Site Routes ─────────────────────────────────────────────────────


@router.get("/sites/stats", response_model=StatsResponse)
async def site_stats(
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("site_registry")),
):
    """Aggregate statistics grouped by DisCo."""
    base = select(SiteRegistry)
    if auth.disco_scope:
        base = base.where(SiteRegistry.disco == auth.disco_scope)

    # Total count
    total_q = select(func.count(SiteRegistry.id))
    if auth.disco_scope:
        total_q = total_q.where(SiteRegistry.disco == auth.disco_scope)
    total = (await db.execute(total_q)).scalar() or 0

    # Per-disco aggregates
    disco_q = (
        select(
            SiteRegistry.disco,
            func.count(SiteRegistry.id).label("site_count"),
            func.coalesce(func.sum(SiteRegistry.customers), 0).label("total_customers"),
            func.coalesce(func.sum(SiteRegistry.demand_kwh), 0).label("total_demand_kwh"),
            func.coalesce(func.avg(SiteRegistry.data_quality_score), 0).label("avg_dq"),
        )
        .group_by(SiteRegistry.disco)
        .order_by(SiteRegistry.disco)
    )
    if auth.disco_scope:
        disco_q = disco_q.where(SiteRegistry.disco == auth.disco_scope)

    rows = (await db.execute(disco_q)).all()
    discos = [
        DiscoStat(
            disco=r.disco,
            site_count=r.site_count,
            total_customers=int(r.total_customers),
            total_demand_kwh=float(r.total_demand_kwh),
            avg_data_quality=round(float(r.avg_dq), 2),
        )
        for r in rows
    ]

    return StatsResponse(total_sites=total, discos=discos)


@router.get("/sites", response_model=SiteListResponse)
async def list_sites(
    disco: Optional[str] = Query(None, description="Filter by DisCo code"),
    status: Optional[str] = Query(None, description="Filter by site status"),
    search: Optional[str] = Query(None, description="Search community / feeder name"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=500, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("site_registry")),
):
    """List sites with filtering, search, and pagination.

    Users with a `disco_scope` are automatically restricted to their DisCo.
    """
    query = select(SiteRegistry)
    count_query = select(func.count(SiteRegistry.id))

    # Disco-scope enforcement
    if auth.disco_scope:
        query = query.where(SiteRegistry.disco == auth.disco_scope)
        count_query = count_query.where(SiteRegistry.disco == auth.disco_scope)
    elif disco:
        query = query.where(SiteRegistry.disco == disco)
        count_query = count_query.where(SiteRegistry.disco == disco)

    if status:
        query = query.where(SiteRegistry.status == status)
        count_query = count_query.where(SiteRegistry.status == status)

    if search:
        pattern = f"%{search}%"
        search_filter = or_(
            SiteRegistry.community.ilike(pattern),
            SiteRegistry.feeder_name.ilike(pattern),
            SiteRegistry.state.ilike(pattern),
            SiteRegistry.lga.ilike(pattern),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total = (await db.execute(count_query)).scalar() or 0

    offset = (page - 1) * limit
    query = query.order_by(SiteRegistry.created_at.desc()).offset(offset).limit(limit)
    rows = (await db.execute(query)).scalars().all()

    return SiteListResponse(
        items=[_row_to_site_out(r) for r in rows],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/sites/{site_id}", response_model=SiteOut)
async def get_site(
    site_id: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("site_registry")),
):
    """Retrieve a single site by ID."""
    site = await _get_site_or_404(site_id, db, auth)
    return _row_to_site_out(site)


@router.post("/sites", response_model=SiteOut, status_code=201)
async def create_site(
    body: SiteCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("site_registry")),
):
    """Create a new site in the registry."""
    if body.security_risk not in VALID_SECURITY_RISKS:
        raise HTTPException(
            400,
            f"security_risk must be one of: {', '.join(sorted(VALID_SECURITY_RISKS))}",
        )
    if body.status not in VALID_SITE_STATUSES:
        raise HTTPException(
            400,
            f"status must be one of: {', '.join(sorted(VALID_SITE_STATUSES))}",
        )

    # If the user has disco_scope, force disco to match
    if auth.disco_scope and body.disco != auth.disco_scope:
        raise HTTPException(
            403, "Cannot create a site outside your DisCo scope",
        )

    # Validate program_id if provided
    if body.program_id:
        prog = await db.execute(
            select(Program).where(Program.id == body.program_id)
        )
        if prog.scalar_one_or_none() is None:
            raise HTTPException(400, "Referenced program_id does not exist")

    site = SiteRegistry(**body.model_dump())
    db.add(site)
    await db.flush()

    await _audit(
        db, auth, "create", "site_registry", site.id,
        after=body.model_dump(),
    )

    await db.commit()
    await db.refresh(site)
    return _row_to_site_out(site)


@router.put("/sites/{site_id}", response_model=SiteOut)
async def update_site(
    site_id: str,
    body: SiteUpdate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("site_registry")),
):
    """Update an existing site. Only provided fields are changed."""
    site = await _get_site_or_404(site_id, db, auth)

    before = {
        c.name: getattr(site, c.name)
        for c in SiteRegistry.__table__.columns
    }

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields provided for update")

    # Validate enums if present
    if "security_risk" in updates and updates["security_risk"] not in VALID_SECURITY_RISKS:
        raise HTTPException(
            400,
            f"security_risk must be one of: {', '.join(sorted(VALID_SECURITY_RISKS))}",
        )
    if "status" in updates and updates["status"] not in VALID_SITE_STATUSES:
        raise HTTPException(
            400,
            f"status must be one of: {', '.join(sorted(VALID_SITE_STATUSES))}",
        )

    # Prevent changing disco when scoped
    if auth.disco_scope and "disco" in updates and updates["disco"] != auth.disco_scope:
        raise HTTPException(403, "Cannot move site outside your DisCo scope")

    # Validate program_id if changing
    if "program_id" in updates and updates["program_id"]:
        prog = await db.execute(
            select(Program).where(Program.id == updates["program_id"])
        )
        if prog.scalar_one_or_none() is None:
            raise HTTPException(400, "Referenced program_id does not exist")

    for field, value in updates.items():
        setattr(site, field, value)
    site.updated_at = utcnow()

    await _audit(
        db, auth, "update", "site_registry", site.id,
        before=before, after=updates,
    )

    await db.commit()
    await db.refresh(site)
    return _row_to_site_out(site)


# ── Program Routes ──────────────────────────────────────────────────


@router.get("/programs", response_model=list[ProgramOut])
async def list_programs(
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("site_registry")),
):
    """List all programmes."""
    result = await db.execute(
        select(Program).order_by(Program.created_at.desc())
    )
    rows = result.scalars().all()
    return [ProgramOut.model_validate(r) for r in rows]


@router.post("/programs", response_model=ProgramOut, status_code=201)
async def create_program(
    body: ProgramCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("site_registry")),
):
    """Create a new programme."""
    if not body.name.strip():
        raise HTTPException(400, "Programme name is required")

    program = Program(**body.model_dump())
    db.add(program)
    await db.flush()

    await _audit(
        db, auth, "create", "program", program.id,
        after=body.model_dump(),
    )

    await db.commit()
    await db.refresh(program)
    return ProgramOut.model_validate(program)
