"""
Module 12 -- Performance Monitoring & M&E

Monthly performance KPIs, GESI metrics, carbon credit tracking,
and ESG reporting for the DARES IMG programme.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    PerformanceMonitoring,
    GESIMetric,
    CarbonCredit,
    ESGReport,
    AuditLog,
    utcnow,
)
from app.dependencies.auth import (
    AuthContext,
    get_current_user,
    require_module,
    require_module_write,
)

router = APIRouter()

# -- Pydantic schemas -------------------------------------------------------


class PerformanceCreate(BaseModel):
    site_id: str
    month: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    connections: int = 0
    new_connections: int = 0
    pue_connections: int = 0
    kwh_generated: float = 0.0
    kwh_sold: float = 0.0
    grid_import_kwh: float = 0.0
    der_kwh: float = 0.0
    revenue_usd: float = 0.0
    collection_rate_pct: float = 0.0
    availability_pct: float = 0.0
    supply_hours: float = 0.0
    saidi_minutes: float = 0.0
    saifi_events: float = 0.0
    capacity_utilisation_pct: float = 0.0
    renewable_fraction_pct: float = 100.0
    diesel_litres: float = 0.0
    battery_soh_pct: float = 100.0
    raw_data: dict = Field(default_factory=dict)


class GESICreate(BaseModel):
    site_id: str
    period: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    female_connections_pct: float = 0.0
    female_headed_hh_pct: float = 0.0
    women_employed_construction: int = 0
    women_employed_operations: int = 0
    youth_employed: int = 0
    disability_accessible_facilities: int = 0
    community_meetings_held: int = 0
    grievances_from_women: int = 0


class CarbonCreditCreate(BaseModel):
    site_id: str
    methodology: str = "gold_standard"
    annual_tco2e_avoided: float = 0.0
    credit_status: str = "not_applied"
    credits_issued_count: Optional[int] = None
    revenue_usd: Optional[float] = None


class ESGReportCreate(BaseModel):
    report_type: str
    title: str = ""
    scope_type: str = "all"
    scope_id: Optional[str] = None
    period_start: datetime
    period_end: datetime


class ESGReportLockBody(BaseModel):
    notes: str = ""


# -- Serialisers -------------------------------------------------------------


def _perf_to_dict(r: PerformanceMonitoring) -> dict:
    return {
        "id": r.id,
        "site_id": r.site_id,
        "month": r.month,
        "connections": r.connections,
        "new_connections": r.new_connections,
        "pue_connections": r.pue_connections,
        "kwh_generated": r.kwh_generated,
        "kwh_sold": r.kwh_sold,
        "grid_import_kwh": r.grid_import_kwh,
        "der_kwh": r.der_kwh,
        "revenue_usd": r.revenue_usd,
        "collection_rate_pct": r.collection_rate_pct,
        "availability_pct": r.availability_pct,
        "supply_hours": r.supply_hours,
        "saidi_minutes": r.saidi_minutes,
        "saifi_events": r.saifi_events,
        "capacity_utilisation_pct": r.capacity_utilisation_pct,
        "renewable_fraction_pct": r.renewable_fraction_pct,
        "diesel_litres": r.diesel_litres,
        "battery_soh_pct": r.battery_soh_pct,
        "raw_data": r.raw_data,
        "uploaded_at": str(r.uploaded_at),
    }


def _gesi_to_dict(r: GESIMetric) -> dict:
    return {
        "id": r.id,
        "site_id": r.site_id,
        "period": r.period,
        "female_connections_pct": r.female_connections_pct,
        "female_headed_hh_pct": r.female_headed_hh_pct,
        "women_employed_construction": r.women_employed_construction,
        "women_employed_operations": r.women_employed_operations,
        "youth_employed": r.youth_employed,
        "disability_accessible_facilities": r.disability_accessible_facilities,
        "community_meetings_held": r.community_meetings_held,
        "grievances_from_women": r.grievances_from_women,
        "created_at": str(r.created_at),
    }


def _carbon_to_dict(r: CarbonCredit) -> dict:
    return {
        "id": r.id,
        "site_id": r.site_id,
        "methodology": r.methodology,
        "annual_tco2e_avoided": r.annual_tco2e_avoided,
        "credit_status": r.credit_status,
        "credits_issued_count": r.credits_issued_count,
        "revenue_usd": r.revenue_usd,
        "updated_at": str(r.updated_at),
        "created_at": str(r.created_at),
    }


def _esg_to_dict(r: ESGReport) -> dict:
    return {
        "id": r.id,
        "report_type": r.report_type,
        "title": r.title,
        "scope_type": r.scope_type,
        "scope_id": r.scope_id,
        "period_start": str(r.period_start),
        "period_end": str(r.period_end),
        "generated_at": str(r.generated_at),
        "generated_by": r.generated_by,
        "data_snapshot": r.data_snapshot,
        "status": r.status,
        "created_at": str(r.created_at),
    }


# -- Audit helper ------------------------------------------------------------


async def _audit(
    db: AsyncSession,
    auth: AuthContext,
    action: str,
    entity_type: str,
    entity_id: str | None,
    after: dict | None = None,
) -> None:
    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        after_json=after,
    ))


# ============================================================================
# Performance Monitoring routes
# ============================================================================


@router.get("/performance")
async def list_performance(
    site_id: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("performance")),
):
    """List performance monitoring records with optional filters."""
    query = select(PerformanceMonitoring).order_by(
        PerformanceMonitoring.month.desc(),
        PerformanceMonitoring.uploaded_at.desc(),
    )
    count_query = select(func.count(PerformanceMonitoring.id))

    if site_id:
        query = query.where(PerformanceMonitoring.site_id == site_id)
        count_query = count_query.where(PerformanceMonitoring.site_id == site_id)
    if month:
        query = query.where(PerformanceMonitoring.month == month)
        count_query = count_query.where(PerformanceMonitoring.month == month)

    total = (await db.execute(count_query)).scalar() or 0
    rows = (await db.execute(query.offset(offset).limit(limit))).scalars().all()

    return {
        "items": [_perf_to_dict(r) for r in rows],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.post("/performance", status_code=201)
async def submit_performance(
    body: PerformanceCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("performance")),
):
    """Submit monthly performance data for a site."""
    record = PerformanceMonitoring(
        site_id=body.site_id,
        month=body.month,
        connections=body.connections,
        new_connections=body.new_connections,
        pue_connections=body.pue_connections,
        kwh_generated=body.kwh_generated,
        kwh_sold=body.kwh_sold,
        grid_import_kwh=body.grid_import_kwh,
        der_kwh=body.der_kwh,
        revenue_usd=body.revenue_usd,
        collection_rate_pct=body.collection_rate_pct,
        availability_pct=body.availability_pct,
        supply_hours=body.supply_hours,
        saidi_minutes=body.saidi_minutes,
        saifi_events=body.saifi_events,
        capacity_utilisation_pct=body.capacity_utilisation_pct,
        renewable_fraction_pct=body.renewable_fraction_pct,
        diesel_litres=body.diesel_litres,
        battery_soh_pct=body.battery_soh_pct,
        raw_data=body.raw_data,
    )
    db.add(record)
    await db.flush()

    await _audit(db, auth, "performance_submitted", "performance_monitoring", record.id, after=body.model_dump())
    await db.commit()
    await db.refresh(record)

    return _perf_to_dict(record)


@router.get("/performance/dashboard")
async def performance_dashboard(
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("performance")),
):
    """Aggregate national performance dashboard."""
    result = await db.execute(select(PerformanceMonitoring))
    all_records = result.scalars().all()

    if not all_records:
        return {
            "total_records": 0,
            "unique_sites": 0,
            "unique_months": 0,
            "totals": {},
            "averages": {},
        }

    # Latest record per site for current snapshot
    seen_sites: set[str] = set()
    latest_by_site: list[PerformanceMonitoring] = []
    sorted_records = sorted(all_records, key=lambda r: r.month, reverse=True)
    for r in sorted_records:
        if r.site_id not in seen_sites:
            seen_sites.add(r.site_id)
            latest_by_site.append(r)

    total_connections = sum(r.connections for r in latest_by_site)
    total_pue = sum(r.pue_connections for r in latest_by_site)

    total_kwh_generated = sum(r.kwh_generated for r in all_records)
    total_kwh_sold = sum(r.kwh_sold for r in all_records)
    total_revenue = sum(r.revenue_usd for r in all_records)
    total_diesel = sum(r.diesel_litres for r in all_records)

    avg_availability = sum(r.availability_pct for r in latest_by_site) / len(latest_by_site)
    avg_collection = sum(r.collection_rate_pct for r in latest_by_site) / len(latest_by_site)
    avg_renewable = sum(r.renewable_fraction_pct for r in latest_by_site) / len(latest_by_site)
    avg_supply_hours = sum(r.supply_hours for r in latest_by_site) / len(latest_by_site)
    avg_battery_soh = sum(r.battery_soh_pct for r in latest_by_site) / len(latest_by_site)

    unique_months = set(r.month for r in all_records)

    return {
        "total_records": len(all_records),
        "unique_sites": len(seen_sites),
        "unique_months": len(unique_months),
        "totals": {
            "connections": total_connections,
            "pue_connections": total_pue,
            "kwh_generated": round(total_kwh_generated, 2),
            "kwh_sold": round(total_kwh_sold, 2),
            "mwh_generated": round(total_kwh_generated / 1000, 2),
            "revenue_usd": round(total_revenue, 2),
            "diesel_litres": round(total_diesel, 1),
        },
        "averages": {
            "availability_pct": round(avg_availability, 1),
            "collection_rate_pct": round(avg_collection, 1),
            "renewable_fraction_pct": round(avg_renewable, 1),
            "supply_hours": round(avg_supply_hours, 1),
            "battery_soh_pct": round(avg_battery_soh, 1),
        },
    }


@router.get("/performance/site/{site_id}")
async def get_site_performance(
    site_id: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("performance")),
):
    """Get full performance history for a specific site."""
    result = await db.execute(
        select(PerformanceMonitoring)
        .where(PerformanceMonitoring.site_id == site_id)
        .order_by(PerformanceMonitoring.month.desc())
    )
    records = result.scalars().all()

    if not records:
        raise HTTPException(404, "No performance data found for this site")

    return {
        "site_id": site_id,
        "records": [_perf_to_dict(r) for r in records],
        "total": len(records),
    }


# ============================================================================
# GESI Metrics routes
# ============================================================================


@router.post("/gesi", status_code=201)
async def submit_gesi(
    body: GESICreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("performance")),
):
    """Submit GESI (Gender Equality & Social Inclusion) metrics for a site-period."""
    record = GESIMetric(
        site_id=body.site_id,
        period=body.period,
        female_connections_pct=body.female_connections_pct,
        female_headed_hh_pct=body.female_headed_hh_pct,
        women_employed_construction=body.women_employed_construction,
        women_employed_operations=body.women_employed_operations,
        youth_employed=body.youth_employed,
        disability_accessible_facilities=body.disability_accessible_facilities,
        community_meetings_held=body.community_meetings_held,
        grievances_from_women=body.grievances_from_women,
    )
    db.add(record)
    await db.flush()

    await _audit(db, auth, "gesi_submitted", "gesi_metrics", record.id, after=body.model_dump())
    await db.commit()
    await db.refresh(record)

    return _gesi_to_dict(record)


@router.get("/gesi/{site_id}")
async def get_gesi_metrics(
    site_id: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("performance")),
):
    """Get GESI metrics history for a site."""
    result = await db.execute(
        select(GESIMetric)
        .where(GESIMetric.site_id == site_id)
        .order_by(GESIMetric.period.desc())
    )
    records = result.scalars().all()

    if not records:
        raise HTTPException(404, "No GESI data found for this site")

    return {
        "site_id": site_id,
        "records": [_gesi_to_dict(r) for r in records],
        "total": len(records),
    }


# ============================================================================
# Carbon Credit routes
# ============================================================================


@router.post("/carbon", status_code=201)
async def submit_carbon_credit(
    body: CarbonCreditCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("performance")),
):
    """Submit carbon credit data for a site."""
    record = CarbonCredit(
        site_id=body.site_id,
        methodology=body.methodology,
        annual_tco2e_avoided=body.annual_tco2e_avoided,
        credit_status=body.credit_status,
        credits_issued_count=body.credits_issued_count,
        revenue_usd=body.revenue_usd,
    )
    db.add(record)
    await db.flush()

    await _audit(db, auth, "carbon_credit_submitted", "carbon_credits", record.id, after=body.model_dump())
    await db.commit()
    await db.refresh(record)

    return _carbon_to_dict(record)


@router.get("/carbon/{site_id}")
async def get_carbon_credits(
    site_id: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("performance")),
):
    """Get carbon credit records for a site."""
    result = await db.execute(
        select(CarbonCredit)
        .where(CarbonCredit.site_id == site_id)
        .order_by(CarbonCredit.created_at.desc())
    )
    records = result.scalars().all()

    if not records:
        raise HTTPException(404, "No carbon credit data found for this site")

    return {
        "site_id": site_id,
        "records": [_carbon_to_dict(r) for r in records],
        "total": len(records),
        "total_tco2e_avoided": round(sum(r.annual_tco2e_avoided for r in records), 2),
        "total_credits_issued": sum(r.credits_issued_count or 0 for r in records),
        "total_revenue_usd": round(sum(r.revenue_usd or 0.0 for r in records), 2),
    }


# ============================================================================
# ESG Report routes
# ============================================================================


@router.post("/esg-reports", status_code=201)
async def generate_esg_report(
    body: ESGReportCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("performance")),
):
    """Generate an ESG report. Snapshots current performance, GESI, and carbon data."""

    # Build data snapshot from related tables based on scope
    perf_query = select(PerformanceMonitoring)
    gesi_query = select(GESIMetric)
    carbon_query = select(CarbonCredit)

    if body.scope_type == "site" and body.scope_id:
        perf_query = perf_query.where(PerformanceMonitoring.site_id == body.scope_id)
        gesi_query = gesi_query.where(GESIMetric.site_id == body.scope_id)
        carbon_query = carbon_query.where(CarbonCredit.site_id == body.scope_id)

    perf_rows = (await db.execute(perf_query)).scalars().all()
    gesi_rows = (await db.execute(gesi_query)).scalars().all()
    carbon_rows = (await db.execute(carbon_query)).scalars().all()

    snapshot = {
        "performance_summary": {
            "records": len(perf_rows),
            "total_kwh_generated": round(sum(r.kwh_generated for r in perf_rows), 2),
            "total_kwh_sold": round(sum(r.kwh_sold for r in perf_rows), 2),
            "total_revenue_usd": round(sum(r.revenue_usd for r in perf_rows), 2),
            "avg_availability_pct": round(
                sum(r.availability_pct for r in perf_rows) / len(perf_rows), 1
            ) if perf_rows else 0.0,
            "avg_collection_rate_pct": round(
                sum(r.collection_rate_pct for r in perf_rows) / len(perf_rows), 1
            ) if perf_rows else 0.0,
            "avg_renewable_fraction_pct": round(
                sum(r.renewable_fraction_pct for r in perf_rows) / len(perf_rows), 1
            ) if perf_rows else 0.0,
        },
        "gesi_summary": {
            "records": len(gesi_rows),
            "avg_female_connections_pct": round(
                sum(r.female_connections_pct for r in gesi_rows) / len(gesi_rows), 1
            ) if gesi_rows else 0.0,
            "total_women_employed_construction": sum(r.women_employed_construction for r in gesi_rows),
            "total_women_employed_operations": sum(r.women_employed_operations for r in gesi_rows),
            "total_youth_employed": sum(r.youth_employed for r in gesi_rows),
            "total_community_meetings": sum(r.community_meetings_held for r in gesi_rows),
        },
        "carbon_summary": {
            "records": len(carbon_rows),
            "total_tco2e_avoided": round(sum(r.annual_tco2e_avoided for r in carbon_rows), 2),
            "total_credits_issued": sum(r.credits_issued_count or 0 for r in carbon_rows),
            "total_carbon_revenue_usd": round(sum(r.revenue_usd or 0.0 for r in carbon_rows), 2),
        },
    }

    report = ESGReport(
        report_type=body.report_type,
        title=body.title or f"ESG Report - {body.report_type}",
        scope_type=body.scope_type,
        scope_id=body.scope_id,
        period_start=body.period_start,
        period_end=body.period_end,
        generated_by=auth.name,
        data_snapshot=snapshot,
        status="draft",
    )
    db.add(report)
    await db.flush()

    await _audit(db, auth, "esg_report_generated", "esg_reports", report.id, after={
        "report_type": body.report_type,
        "scope_type": body.scope_type,
        "scope_id": body.scope_id,
    })
    await db.commit()
    await db.refresh(report)

    return _esg_to_dict(report)


@router.get("/esg-reports")
async def list_esg_reports(
    report_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("performance")),
):
    """List ESG reports with optional filters."""
    query = select(ESGReport).order_by(ESGReport.created_at.desc())
    count_query = select(func.count(ESGReport.id))

    if report_type:
        query = query.where(ESGReport.report_type == report_type)
        count_query = count_query.where(ESGReport.report_type == report_type)
    if status:
        query = query.where(ESGReport.status == status)
        count_query = count_query.where(ESGReport.status == status)

    total = (await db.execute(count_query)).scalar() or 0
    rows = (await db.execute(query.offset(offset).limit(limit))).scalars().all()

    return {
        "items": [_esg_to_dict(r) for r in rows],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.get("/esg-reports/{report_id}")
async def get_esg_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("performance")),
):
    """Retrieve a single ESG report with its data snapshot."""
    result = await db.execute(
        select(ESGReport).where(ESGReport.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "ESG report not found")

    return _esg_to_dict(report)


@router.put("/esg-reports/{report_id}/lock")
async def lock_esg_report(
    report_id: str,
    body: ESGReportLockBody,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("performance")),
):
    """Lock (finalise) an ESG report, preventing further edits."""
    result = await db.execute(
        select(ESGReport).where(ESGReport.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "ESG report not found")

    if report.status == "locked":
        raise HTTPException(400, "Report is already locked")

    report.status = "locked"

    await _audit(db, auth, "esg_report_locked", "esg_reports", report.id, after={
        "status": "locked",
        "notes": body.notes,
    })
    await db.commit()
    await db.refresh(report)

    return _esg_to_dict(report)
