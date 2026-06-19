"""
Module 3 — DisCo Readiness & Interconnection Routes
Tracks distribution-company readiness checklists (feeder data, POI,
bulk meter, customer data, settlement terms, tripartite agreement)
and interconnection requirements (voltage, protection, NEMSA status).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    DiscoReadiness,
    InterconnectionRequirement,
    SiteRegistry,
    utcnow,
)
from app.dependencies.auth import (
    AuthContext,
    get_current_user,
    require_module,
    require_module_write,
)

router = APIRouter()

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

VALID_STATUSES = {"not_started", "in_progress", "submitted", "verified", "flagged"}


class DiscoReadinessCreate(BaseModel):
    site_id: str
    feeder_data_status: str = "not_started"
    poi_status: str = "not_started"
    bulk_meter_status: str = "not_started"
    customer_data_status: str = "not_started"
    settlement_terms_status: str = "not_started"
    tripartite_status: str = "not_started"
    feeder_data: dict[str, Any] = Field(default_factory=dict)
    poi_data: dict[str, Any] = Field(default_factory=dict)
    bulk_meter_data: dict[str, Any] = Field(default_factory=dict)
    customer_data: dict[str, Any] = Field(default_factory=dict)
    settlement_terms: dict[str, Any] = Field(default_factory=dict)
    overall_status: str = "not_started"
    notes: str = ""


class DiscoReadinessResponse(BaseModel):
    id: str
    site_id: str
    feeder_data_status: str
    poi_status: str
    bulk_meter_status: str
    customer_data_status: str
    settlement_terms_status: str
    tripartite_status: str
    feeder_data: dict[str, Any]
    poi_data: dict[str, Any]
    bulk_meter_data: dict[str, Any]
    customer_data: dict[str, Any]
    settlement_terms: dict[str, Any]
    validated_by: Optional[str] = None
    validated_at: Optional[str] = None
    overall_status: str
    notes: str
    updated_at: Optional[str] = None
    site_name: Optional[str] = None
    disco: Optional[str] = None


class ValidateBody(BaseModel):
    notes: str = ""


class InterconnectionCreate(BaseModel):
    site_id: str
    voltage_level: str = ""
    protection_scheme: str = ""
    islanding_mode: str = ""
    sync_requirements: str = ""
    nemsa_status: str = "not_started"
    responsibilities: dict[str, Any] = Field(default_factory=dict)


class InterconnectionUpdate(BaseModel):
    voltage_level: Optional[str] = None
    protection_scheme: Optional[str] = None
    islanding_mode: Optional[str] = None
    sync_requirements: Optional[str] = None
    nemsa_status: Optional[str] = None
    responsibilities: Optional[dict[str, Any]] = None


class InterconnectionResponse(BaseModel):
    id: str
    site_id: str
    voltage_level: str
    protection_scheme: str
    islanding_mode: str
    sync_requirements: str
    nemsa_status: str
    responsibilities: dict[str, Any]
    created_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _dr_to_response(
    dr: DiscoReadiness,
    site_name: str | None = None,
    disco: str | None = None,
) -> DiscoReadinessResponse:
    return DiscoReadinessResponse(
        id=dr.id,
        site_id=dr.site_id,
        feeder_data_status=dr.feeder_data_status or "not_started",
        poi_status=dr.poi_status or "not_started",
        bulk_meter_status=dr.bulk_meter_status or "not_started",
        customer_data_status=dr.customer_data_status or "not_started",
        settlement_terms_status=dr.settlement_terms_status or "not_started",
        tripartite_status=dr.tripartite_status or "not_started",
        feeder_data=dr.feeder_data or {},
        poi_data=dr.poi_data or {},
        bulk_meter_data=dr.bulk_meter_data or {},
        customer_data=dr.customer_data or {},
        settlement_terms=dr.settlement_terms or {},
        validated_by=dr.validated_by,
        validated_at=dr.validated_at.isoformat() if dr.validated_at else None,
        overall_status=dr.overall_status or "not_started",
        notes=dr.notes or "",
        updated_at=dr.updated_at.isoformat() if dr.updated_at else None,
        site_name=site_name,
        disco=disco,
    )


def _ic_to_response(ic: InterconnectionRequirement) -> InterconnectionResponse:
    return InterconnectionResponse(
        id=ic.id,
        site_id=ic.site_id,
        voltage_level=ic.voltage_level or "",
        protection_scheme=ic.protection_scheme or "",
        islanding_mode=ic.islanding_mode or "",
        sync_requirements=ic.sync_requirements or "",
        nemsa_status=ic.nemsa_status or "not_started",
        responsibilities=ic.responsibilities or {},
        created_at=ic.created_at.isoformat() if ic.created_at else None,
    )


def _compute_overall(dr: DiscoReadiness) -> str:
    """Derive overall_status from the six component statuses."""
    statuses = [
        dr.feeder_data_status,
        dr.poi_status,
        dr.bulk_meter_status,
        dr.customer_data_status,
        dr.settlement_terms_status,
        dr.tripartite_status,
    ]
    if all(s == "verified" for s in statuses):
        return "verified"
    if any(s == "flagged" for s in statuses):
        return "flagged"
    if all(s == "not_started" for s in statuses):
        return "not_started"
    return "in_progress"


# ---------------------------------------------------------------------------
# Route 8 (declared first so /dashboard doesn't clash with /{site_id})
# GET /disco-readiness/dashboard — summary stats
# ---------------------------------------------------------------------------


@router.get("/disco-readiness/dashboard")
async def disco_readiness_dashboard(
    auth: AuthContext = Depends(require_module("disco_readiness")),
    db: AsyncSession = Depends(get_db),
):
    """Return aggregated readiness statistics across all sites."""

    total_q = select(func.count()).select_from(DiscoReadiness)
    total = (await db.execute(total_q)).scalar() or 0

    # Count by overall_status
    status_q = (
        select(DiscoReadiness.overall_status, func.count())
        .group_by(DiscoReadiness.overall_status)
    )
    status_rows = (await db.execute(status_q)).all()
    by_status = {row[0] or "not_started": row[1] for row in status_rows}

    # Validated count
    validated_q = select(func.count()).select_from(DiscoReadiness).where(
        DiscoReadiness.validated_at.isnot(None)
    )
    validated = (await db.execute(validated_q)).scalar() or 0

    # Per-component verified counts
    components = {}
    for col_name in [
        "feeder_data_status",
        "poi_status",
        "bulk_meter_status",
        "customer_data_status",
        "settlement_terms_status",
        "tripartite_status",
    ]:
        col = getattr(DiscoReadiness, col_name)
        q = select(func.count()).select_from(DiscoReadiness).where(col == "verified")
        components[col_name] = (await db.execute(q)).scalar() or 0

    return {
        "total_sites": total,
        "by_status": by_status,
        "validated": validated,
        "component_verified": components,
        "completion_pct": round(
            (by_status.get("verified", 0) / total * 100) if total else 0, 1
        ),
    }


# ---------------------------------------------------------------------------
# Route 1: GET /disco-readiness — list all records
# ---------------------------------------------------------------------------


@router.get("/disco-readiness")
async def list_disco_readiness(
    site_id: Optional[str] = Query(None, description="Filter by site_id"),
    overall_status: Optional[str] = Query(None, description="Filter by overall status"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    auth: AuthContext = Depends(require_module("disco_readiness")),
    db: AsyncSession = Depends(get_db),
):
    """List all DisCo readiness records, optionally filtered by site_id."""

    query = (
        select(DiscoReadiness, SiteRegistry.community, SiteRegistry.disco)
        .outerjoin(SiteRegistry, DiscoReadiness.site_id == SiteRegistry.id)
    )
    count_query = select(func.count()).select_from(DiscoReadiness)

    if site_id:
        query = query.where(DiscoReadiness.site_id == site_id)
        count_query = count_query.where(DiscoReadiness.site_id == site_id)

    if overall_status:
        query = query.where(DiscoReadiness.overall_status == overall_status)
        count_query = count_query.where(DiscoReadiness.overall_status == overall_status)

    # Apply disco_scope restriction for disco_officer users
    if auth.disco_scope:
        query = query.where(SiteRegistry.disco == auth.disco_scope)
        count_query = count_query.join(
            SiteRegistry, DiscoReadiness.site_id == SiteRegistry.id
        ).where(SiteRegistry.disco == auth.disco_scope)

    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(DiscoReadiness.updated_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    rows = result.all()

    items = [
        _dr_to_response(row[0], site_name=row[1], disco=row[2])
        for row in rows
    ]

    return {
        "items": items,
        "total": total,
        "offset": offset,
        "limit": limit,
    }


# ---------------------------------------------------------------------------
# Route 2: GET /disco-readiness/{site_id} — get readiness for a site
# ---------------------------------------------------------------------------


@router.get("/disco-readiness/{site_id}")
async def get_disco_readiness(
    site_id: str,
    auth: AuthContext = Depends(require_module("disco_readiness")),
    db: AsyncSession = Depends(get_db),
):
    """Return DisCo readiness record for a specific site."""

    query = (
        select(DiscoReadiness, SiteRegistry.community, SiteRegistry.disco)
        .outerjoin(SiteRegistry, DiscoReadiness.site_id == SiteRegistry.id)
        .where(DiscoReadiness.site_id == site_id)
    )
    result = await db.execute(query)
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="DisCo readiness record not found for this site")

    dr, site_name, disco = row
    return _dr_to_response(dr, site_name=site_name, disco=disco)


# ---------------------------------------------------------------------------
# Route 3: POST /disco-readiness — create or update readiness
# ---------------------------------------------------------------------------


@router.post("/disco-readiness", status_code=201)
async def create_or_update_disco_readiness(
    body: DiscoReadinessCreate,
    auth: AuthContext = Depends(require_module_write("disco_readiness")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new DisCo readiness record, or update the existing one for the site."""

    # Verify site exists
    site_result = await db.execute(
        select(SiteRegistry).where(SiteRegistry.id == body.site_id)
    )
    site = site_result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    # Check for existing record
    existing_result = await db.execute(
        select(DiscoReadiness).where(DiscoReadiness.site_id == body.site_id)
    )
    dr = existing_result.scalar_one_or_none()

    if dr:
        # Update existing
        dr.feeder_data_status = body.feeder_data_status
        dr.poi_status = body.poi_status
        dr.bulk_meter_status = body.bulk_meter_status
        dr.customer_data_status = body.customer_data_status
        dr.settlement_terms_status = body.settlement_terms_status
        dr.tripartite_status = body.tripartite_status
        dr.feeder_data = body.feeder_data
        dr.poi_data = body.poi_data
        dr.bulk_meter_data = body.bulk_meter_data
        dr.customer_data = body.customer_data
        dr.settlement_terms = body.settlement_terms
        dr.notes = body.notes
        dr.overall_status = _compute_overall(dr)
        dr.updated_at = utcnow()
    else:
        # Create new
        dr = DiscoReadiness(
            site_id=body.site_id,
            feeder_data_status=body.feeder_data_status,
            poi_status=body.poi_status,
            bulk_meter_status=body.bulk_meter_status,
            customer_data_status=body.customer_data_status,
            settlement_terms_status=body.settlement_terms_status,
            tripartite_status=body.tripartite_status,
            feeder_data=body.feeder_data,
            poi_data=body.poi_data,
            bulk_meter_data=body.bulk_meter_data,
            customer_data=body.customer_data,
            settlement_terms=body.settlement_terms,
            notes=body.notes,
        )
        dr.overall_status = _compute_overall(dr)
        db.add(dr)

    await db.commit()
    await db.refresh(dr)
    return _dr_to_response(dr, site_name=site.community, disco=site.disco)


# ---------------------------------------------------------------------------
# Route 4: PUT /disco-readiness/{id}/validate — mark as validated
# ---------------------------------------------------------------------------


@router.put("/disco-readiness/{record_id}/validate")
async def validate_disco_readiness(
    record_id: str,
    body: ValidateBody,
    auth: AuthContext = Depends(require_module_write("disco_readiness")),
    db: AsyncSession = Depends(get_db),
):
    """Mark a DisCo readiness record as validated by the current user."""

    result = await db.execute(
        select(DiscoReadiness).where(DiscoReadiness.id == record_id)
    )
    dr = result.scalar_one_or_none()
    if not dr:
        raise HTTPException(status_code=404, detail="DisCo readiness record not found")

    dr.validated_by = auth.user_id
    dr.validated_at = utcnow()
    dr.overall_status = "verified"
    if body.notes:
        dr.notes = (dr.notes or "") + f"\n[Validated by {auth.name}] {body.notes}"
    dr.updated_at = utcnow()

    await db.commit()
    await db.refresh(dr)

    # Fetch site info for response
    site_result = await db.execute(
        select(SiteRegistry.community, SiteRegistry.disco).where(
            SiteRegistry.id == dr.site_id
        )
    )
    site_row = site_result.one_or_none()
    site_name = site_row[0] if site_row else None
    disco = site_row[1] if site_row else None

    return _dr_to_response(dr, site_name=site_name, disco=disco)


# ---------------------------------------------------------------------------
# Route 5: GET /interconnection/{site_id} — get interconnection requirements
# ---------------------------------------------------------------------------


@router.get("/interconnection/{site_id}")
async def get_interconnection(
    site_id: str,
    auth: AuthContext = Depends(require_module("disco_readiness")),
    db: AsyncSession = Depends(get_db),
):
    """Return interconnection requirements for a specific site."""

    result = await db.execute(
        select(InterconnectionRequirement).where(
            InterconnectionRequirement.site_id == site_id
        )
    )
    ic = result.scalar_one_or_none()
    if not ic:
        raise HTTPException(
            status_code=404,
            detail="Interconnection requirement not found for this site",
        )

    return _ic_to_response(ic)


# ---------------------------------------------------------------------------
# Route 6: POST /interconnection — create interconnection requirement
# ---------------------------------------------------------------------------


@router.post("/interconnection", status_code=201)
async def create_interconnection(
    body: InterconnectionCreate,
    auth: AuthContext = Depends(require_module_write("disco_readiness")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new interconnection requirement record for a site."""

    # Verify site exists
    site_result = await db.execute(
        select(SiteRegistry).where(SiteRegistry.id == body.site_id)
    )
    if not site_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Site not found")

    # Check for existing record
    existing = await db.execute(
        select(InterconnectionRequirement).where(
            InterconnectionRequirement.site_id == body.site_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Interconnection requirement already exists for this site. Use PUT to update.",
        )

    ic = InterconnectionRequirement(
        site_id=body.site_id,
        voltage_level=body.voltage_level,
        protection_scheme=body.protection_scheme,
        islanding_mode=body.islanding_mode,
        sync_requirements=body.sync_requirements,
        nemsa_status=body.nemsa_status,
        responsibilities=body.responsibilities,
    )
    db.add(ic)
    await db.commit()
    await db.refresh(ic)
    return _ic_to_response(ic)


# ---------------------------------------------------------------------------
# Route 7: PUT /interconnection/{id} — update interconnection requirement
# ---------------------------------------------------------------------------


@router.put("/interconnection/{record_id}")
async def update_interconnection(
    record_id: str,
    body: InterconnectionUpdate,
    auth: AuthContext = Depends(require_module_write("disco_readiness")),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing interconnection requirement record."""

    result = await db.execute(
        select(InterconnectionRequirement).where(
            InterconnectionRequirement.id == record_id
        )
    )
    ic = result.scalar_one_or_none()
    if not ic:
        raise HTTPException(
            status_code=404, detail="Interconnection requirement not found"
        )

    # Apply only provided fields
    if body.voltage_level is not None:
        ic.voltage_level = body.voltage_level
    if body.protection_scheme is not None:
        ic.protection_scheme = body.protection_scheme
    if body.islanding_mode is not None:
        ic.islanding_mode = body.islanding_mode
    if body.sync_requirements is not None:
        ic.sync_requirements = body.sync_requirements
    if body.nemsa_status is not None:
        ic.nemsa_status = body.nemsa_status
    if body.responsibilities is not None:
        ic.responsibilities = body.responsibilities

    await db.commit()
    await db.refresh(ic)
    return _ic_to_response(ic)
