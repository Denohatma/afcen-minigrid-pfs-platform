from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    ESGReport, GESIMetric, CarbonCreditTracking,
    MeteringData, Milestone, Grievance, PerformanceAlert,
    AuditLog, utcnow, new_uuid,
)
from app.dependencies.auth import AuthContext, get_current_user, require_role

router = APIRouter()

# --- Schemas ---


class ReportGenerate(BaseModel):
    report_type: str  # dares_quarterly, investor_esg, carbon_data
    scope_type: str = "all"  # all, disco, developer, lot, site
    scope_id: Optional[str] = None
    period_start: str  # ISO date string
    period_end: str  # ISO date string
    title: str = ""


class GESISubmit(BaseModel):
    site_id: str
    period: str  # ISO date string
    female_connections_pct: float = 0.0
    female_headed_hh_pct: float = 0.0
    women_employed_construction: int = 0
    women_employed_operations: int = 0
    youth_employed: int = 0
    disability_accessible_facilities: int = 0
    community_meetings_held: int = 0
    grievances_from_women: int = 0


class CarbonSubmit(BaseModel):
    site_id: str
    methodology: str = "gold_standard"  # gold_standard, verra, other
    annual_tco2e_avoided: float = 0.0
    credit_status: str = "not_applied"  # not_applied, application_submitted, validation_complete, credits_issued, credits_sold
    credits_issued_count: Optional[int] = None
    revenue_usd: Optional[float] = None


# --- Helper: aggregate data for report snapshot ---


async def _build_report_snapshot(
    db: AsyncSession,
    report_type: str,
    scope_type: str,
    scope_id: Optional[str],
    period_start: datetime,
    period_end: datetime,
) -> dict:
    """Aggregate data from monitoring, disbursements, grievances for the report snapshot."""
    snapshot = {}

    # --- Monitoring / metering data ---
    meter_query = select(MeteringData).where(
        MeteringData.period_start >= period_start,
        MeteringData.period_end <= period_end,
    )
    if scope_type == "site" and scope_id:
        meter_query = meter_query.where(MeteringData.site_id == scope_id)
    elif scope_type == "developer" and scope_id:
        meter_query = meter_query.where(MeteringData.developer_id == scope_id)

    meter_result = await db.execute(meter_query)
    metering = meter_result.scalars().all()

    if metering:
        snapshot["energy"] = {
            "total_generation_kwh": round(sum(m.total_generation_kwh for m in metering), 2),
            "total_consumption_kwh": round(sum(m.total_consumption_kwh for m in metering), 2),
            "total_pue_consumption_kwh": round(sum(m.pue_consumption_kwh for m in metering), 2),
            "total_revenue_usd": round(sum(m.total_revenue_usd for m in metering), 2),
            "avg_system_availability_pct": round(
                sum(m.system_availability_pct for m in metering) / len(metering), 1
            ),
            "avg_collection_rate_pct": round(
                sum(m.collection_rate_pct for m in metering) / len(metering), 1
            ),
            "avg_renewable_fraction_pct": round(
                sum(m.renewable_fraction_pct for m in metering) / len(metering), 1
            ),
            "total_connections": max((m.active_connections for m in metering), default=0),
            "total_pue_connections": max((m.pue_connections for m in metering), default=0),
            "total_diesel_litres": round(sum(m.diesel_litres for m in metering), 1),
            "records_count": len(metering),
        }
    else:
        snapshot["energy"] = {}

    # --- Disbursement / milestone data ---
    ms_query = select(Milestone)
    ms_result = await db.execute(ms_query)
    milestones = ms_result.scalars().all()

    total_grant = sum(m.grant_amount_usd for m in milestones)
    disbursed = sum(m.grant_amount_usd for m in milestones if m.status == "disbursed")
    snapshot["disbursements"] = {
        "total_milestones": len(milestones),
        "completed": sum(1 for m in milestones if m.status in ("approved", "disbursed")),
        "total_grant_usd": round(total_grant, 2),
        "total_disbursed_usd": round(disbursed, 2),
        "remaining_usd": round(total_grant - disbursed, 2),
    }

    # --- Grievance data ---
    griev_query = select(Grievance).where(
        Grievance.created_at >= period_start,
        Grievance.created_at <= period_end,
    )
    if scope_type == "site" and scope_id:
        griev_query = griev_query.where(Grievance.site_id == scope_id)

    griev_result = await db.execute(griev_query)
    grievances = griev_result.scalars().all()

    griev_by_category = {}
    griev_by_status = {}
    for g in grievances:
        griev_by_category[g.category] = griev_by_category.get(g.category, 0) + 1
        griev_by_status[g.status] = griev_by_status.get(g.status, 0) + 1

    resolved = [g for g in grievances if g.resolved_at]
    avg_resolution_days = 0.0
    if resolved:
        total_days = sum(
            (g.resolved_at - g.created_at).total_seconds() / 86400
            for g in resolved
        )
        avg_resolution_days = round(total_days / len(resolved), 1)

    snapshot["grievances"] = {
        "total": len(grievances),
        "by_category": griev_by_category,
        "by_status": griev_by_status,
        "resolved": len(resolved),
        "avg_resolution_days": avg_resolution_days,
    }

    # --- Performance alerts ---
    alert_query = select(PerformanceAlert).where(
        PerformanceAlert.created_at >= period_start,
        PerformanceAlert.created_at <= period_end,
    )
    if scope_type == "site" and scope_id:
        alert_query = alert_query.where(PerformanceAlert.site_id == scope_id)

    alert_result = await db.execute(alert_query)
    alerts = alert_result.scalars().all()

    snapshot["alerts"] = {
        "total": len(alerts),
        "critical": sum(1 for a in alerts if a.severity == "critical"),
        "warning": sum(1 for a in alerts if a.severity == "warning"),
        "acknowledged": sum(1 for a in alerts if a.acknowledged),
    }

    # --- GESI metrics (if available for the period) ---
    gesi_query = select(GESIMetric).where(
        GESIMetric.period >= period_start,
        GESIMetric.period <= period_end,
    )
    if scope_type == "site" and scope_id:
        gesi_query = gesi_query.where(GESIMetric.site_id == scope_id)

    gesi_result = await db.execute(gesi_query)
    gesi_records = gesi_result.scalars().all()

    if gesi_records:
        snapshot["gesi"] = {
            "records_count": len(gesi_records),
            "avg_female_connections_pct": round(
                sum(g.female_connections_pct for g in gesi_records) / len(gesi_records), 1
            ),
            "avg_female_headed_hh_pct": round(
                sum(g.female_headed_hh_pct for g in gesi_records) / len(gesi_records), 1
            ),
            "total_women_employed_construction": sum(g.women_employed_construction for g in gesi_records),
            "total_women_employed_operations": sum(g.women_employed_operations for g in gesi_records),
            "total_youth_employed": sum(g.youth_employed for g in gesi_records),
            "total_community_meetings": sum(g.community_meetings_held for g in gesi_records),
        }
    else:
        snapshot["gesi"] = {}

    # --- Carbon data ---
    carbon_query = select(CarbonCreditTracking)
    if scope_type == "site" and scope_id:
        carbon_query = carbon_query.where(CarbonCreditTracking.site_id == scope_id)

    carbon_result = await db.execute(carbon_query)
    carbon_records = carbon_result.scalars().all()

    if carbon_records:
        snapshot["carbon"] = {
            "total_sites_tracked": len(carbon_records),
            "total_annual_tco2e_avoided": round(
                sum(c.annual_tco2e_avoided for c in carbon_records), 2
            ),
            "credits_issued": sum(1 for c in carbon_records if c.credit_status == "credits_issued"),
            "credits_sold": sum(1 for c in carbon_records if c.credit_status == "credits_sold"),
            "total_credits_issued": sum(c.credits_issued_count or 0 for c in carbon_records),
            "total_revenue_usd": round(sum(c.revenue_usd or 0 for c in carbon_records), 2),
        }
    else:
        snapshot["carbon"] = {}

    return snapshot


# --- Routes ---


@router.post("/reports/generate")
async def generate_report(
    body: ReportGenerate,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Generate a report by aggregating data from monitoring, disbursements, grievances."""
    valid_types = ("dares_quarterly", "investor_esg", "carbon_data")
    if body.report_type not in valid_types:
        raise HTTPException(400, f"report_type must be one of: {', '.join(valid_types)}")

    valid_scopes = ("all", "disco", "developer", "lot", "site")
    if body.scope_type not in valid_scopes:
        raise HTTPException(400, f"scope_type must be one of: {', '.join(valid_scopes)}")

    try:
        period_start = datetime.fromisoformat(body.period_start)
        period_end = datetime.fromisoformat(body.period_end)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use ISO format (YYYY-MM-DD).")

    if period_end <= period_start:
        raise HTTPException(400, "period_end must be after period_start")

    # Build data snapshot
    data_snapshot = await _build_report_snapshot(
        db, body.report_type, body.scope_type, body.scope_id, period_start, period_end
    )

    title = body.title or f"{body.report_type.replace('_', ' ').title()} Report"

    report = ESGReport(
        report_type=body.report_type,
        title=title,
        scope_type=body.scope_type,
        scope_id=body.scope_id,
        period_start=period_start,
        period_end=period_end,
        generated_by=auth.name,
        data_snapshot=data_snapshot,
        status="draft",
    )
    db.add(report)

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="report_generated",
        entity_type="esg_report",
        entity_id=report.id,
        details={"report_type": body.report_type, "scope_type": body.scope_type},
    )
    db.add(audit)

    await db.commit()
    await db.refresh(report)

    return {
        "id": report.id,
        "report_type": report.report_type,
        "title": report.title,
        "scope_type": report.scope_type,
        "scope_id": report.scope_id,
        "period_start": str(report.period_start),
        "period_end": str(report.period_end),
        "status": report.status,
        "generated_at": str(report.generated_at),
        "generated_by": report.generated_by,
        "data_snapshot": report.data_snapshot,
    }


@router.get("/reports")
async def list_reports(
    report_type: Optional[str] = None,
    status: Optional[str] = None,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List generated reports."""
    query = select(ESGReport).order_by(ESGReport.created_at.desc())

    if report_type:
        query = query.where(ESGReport.report_type == report_type)
    if status:
        query = query.where(ESGReport.status == status)

    result = await db.execute(query)
    reports = result.scalars().all()

    return {
        "reports": [
            {
                "id": r.id,
                "report_type": r.report_type,
                "title": r.title,
                "scope_type": r.scope_type,
                "scope_id": r.scope_id,
                "period_start": str(r.period_start),
                "period_end": str(r.period_end),
                "status": r.status,
                "generated_at": str(r.generated_at),
                "generated_by": r.generated_by,
                "created_at": str(r.created_at),
            }
            for r in reports
        ],
        "total": len(reports),
    }


@router.get("/reports/benchmarks")
async def portfolio_benchmarks(
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Portfolio-wide benchmark stats: avg availability, avg LCOE, avg connections, etc."""
    # Get latest metering record per site
    all_result = await db.execute(
        select(MeteringData).order_by(MeteringData.period_end.desc())
    )
    all_records = all_result.scalars().all()

    seen_sites = set()
    latest_by_site = []
    for r in all_records:
        if r.site_id not in seen_sites:
            seen_sites.add(r.site_id)
            latest_by_site.append(r)

    total_sites = len(latest_by_site)

    if total_sites == 0:
        return {
            "total_sites": 0,
            "avg_system_availability_pct": 0,
            "avg_collection_rate_pct": 0,
            "avg_renewable_fraction_pct": 0,
            "avg_connections_per_site": 0,
            "total_connections": 0,
            "total_pue_connections": 0,
            "total_generation_kwh": 0,
            "avg_supply_hours": 0,
        }

    total_connections = sum(r.active_connections for r in latest_by_site)
    total_pue = sum(r.pue_connections for r in latest_by_site)
    total_gen = sum(r.total_generation_kwh for r in all_records)
    avg_avail = sum(r.system_availability_pct for r in latest_by_site) / total_sites
    avg_collect = sum(r.collection_rate_pct for r in latest_by_site) / total_sites
    avg_renew = sum(r.renewable_fraction_pct for r in latest_by_site) / total_sites
    avg_supply = sum(r.avg_hours_supply for r in latest_by_site) / total_sites
    avg_connections = total_connections / total_sites

    # GESI benchmarks
    gesi_result = await db.execute(select(GESIMetric))
    gesi_records = gesi_result.scalars().all()
    avg_female_pct = 0.0
    if gesi_records:
        avg_female_pct = sum(g.female_connections_pct for g in gesi_records) / len(gesi_records)

    # Carbon benchmarks
    carbon_result = await db.execute(select(CarbonCreditTracking))
    carbon_records = carbon_result.scalars().all()
    total_tco2e = sum(c.annual_tco2e_avoided for c in carbon_records)

    return {
        "total_sites": total_sites,
        "avg_system_availability_pct": round(avg_avail, 1),
        "avg_collection_rate_pct": round(avg_collect, 1),
        "avg_renewable_fraction_pct": round(avg_renew, 1),
        "avg_connections_per_site": round(avg_connections, 0),
        "total_connections": total_connections,
        "total_pue_connections": total_pue,
        "total_generation_kwh": round(total_gen, 2),
        "avg_supply_hours": round(avg_supply, 1),
        "avg_female_connections_pct": round(avg_female_pct, 1),
        "total_annual_tco2e_avoided": round(total_tco2e, 2),
    }


@router.get("/reports/{report_id}")
async def get_report(
    report_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get report detail with full data snapshot."""
    result = await db.execute(
        select(ESGReport).where(ESGReport.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Report not found")

    return {
        "id": report.id,
        "report_type": report.report_type,
        "title": report.title,
        "scope_type": report.scope_type,
        "scope_id": report.scope_id,
        "period_start": str(report.period_start),
        "period_end": str(report.period_end),
        "status": report.status,
        "generated_at": str(report.generated_at),
        "generated_by": report.generated_by,
        "data_snapshot": report.data_snapshot,
        "created_at": str(report.created_at),
    }


@router.put("/reports/{report_id}/lock")
async def lock_report(
    report_id: str,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Lock a report so no further changes can be made."""
    result = await db.execute(
        select(ESGReport).where(ESGReport.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Report not found")

    if report.status == "locked":
        raise HTTPException(400, "Report is already locked")

    report.status = "locked"

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="report_locked",
        entity_type="esg_report",
        entity_id=report.id,
    )
    db.add(audit)

    await db.commit()

    return {"id": report.id, "status": report.status}


@router.delete("/reports/{report_id}")
async def delete_report(
    report_id: str,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Delete a draft report. Locked reports cannot be deleted."""
    result = await db.execute(
        select(ESGReport).where(ESGReport.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Report not found")

    if report.status == "locked":
        raise HTTPException(400, "Cannot delete a locked report")

    await db.delete(report)

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="report_deleted",
        entity_type="esg_report",
        entity_id=report_id,
    )
    db.add(audit)

    await db.commit()

    return {"deleted": True, "id": report_id}


@router.post("/reports/gesi")
async def submit_gesi_metrics(
    body: GESISubmit,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit GESI metrics for a site/period."""
    try:
        period = datetime.fromisoformat(body.period)
    except ValueError:
        raise HTTPException(400, "Invalid period format. Use ISO format (YYYY-MM-DD).")

    metric = GESIMetric(
        site_id=body.site_id,
        period=period,
        female_connections_pct=body.female_connections_pct,
        female_headed_hh_pct=body.female_headed_hh_pct,
        women_employed_construction=body.women_employed_construction,
        women_employed_operations=body.women_employed_operations,
        youth_employed=body.youth_employed,
        disability_accessible_facilities=body.disability_accessible_facilities,
        community_meetings_held=body.community_meetings_held,
        grievances_from_women=body.grievances_from_women,
    )
    db.add(metric)

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="gesi_metrics_submitted",
        entity_type="gesi_metric",
        entity_id=metric.id,
        details={"site_id": body.site_id},
    )
    db.add(audit)

    await db.commit()
    await db.refresh(metric)

    return {
        "id": metric.id,
        "site_id": metric.site_id,
        "period": str(metric.period),
        "female_connections_pct": metric.female_connections_pct,
        "female_headed_hh_pct": metric.female_headed_hh_pct,
        "women_employed_construction": metric.women_employed_construction,
        "women_employed_operations": metric.women_employed_operations,
        "youth_employed": metric.youth_employed,
        "disability_accessible_facilities": metric.disability_accessible_facilities,
        "community_meetings_held": metric.community_meetings_held,
        "grievances_from_women": metric.grievances_from_women,
        "created_at": str(metric.created_at),
    }


@router.get("/reports/gesi/{site_id}")
async def get_gesi_metrics(
    site_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get GESI metrics history for a site."""
    result = await db.execute(
        select(GESIMetric)
        .where(GESIMetric.site_id == site_id)
        .order_by(GESIMetric.period.desc())
    )
    metrics = result.scalars().all()

    return {
        "site_id": site_id,
        "metrics": [
            {
                "id": m.id,
                "period": str(m.period),
                "female_connections_pct": m.female_connections_pct,
                "female_headed_hh_pct": m.female_headed_hh_pct,
                "women_employed_construction": m.women_employed_construction,
                "women_employed_operations": m.women_employed_operations,
                "youth_employed": m.youth_employed,
                "disability_accessible_facilities": m.disability_accessible_facilities,
                "community_meetings_held": m.community_meetings_held,
                "grievances_from_women": m.grievances_from_women,
                "created_at": str(m.created_at),
            }
            for m in metrics
        ],
        "total": len(metrics),
    }


@router.post("/reports/carbon")
async def update_carbon_tracking(
    body: CarbonSubmit,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update carbon credit tracking for a site. Creates or updates the record."""
    valid_methods = ("gold_standard", "verra", "other")
    if body.methodology not in valid_methods:
        raise HTTPException(400, f"methodology must be one of: {', '.join(valid_methods)}")

    valid_statuses = ("not_applied", "application_submitted", "validation_complete", "credits_issued", "credits_sold")
    if body.credit_status not in valid_statuses:
        raise HTTPException(400, f"credit_status must be one of: {', '.join(valid_statuses)}")

    # Check for existing record for this site
    result = await db.execute(
        select(CarbonCreditTracking).where(CarbonCreditTracking.site_id == body.site_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.methodology = body.methodology
        existing.annual_tco2e_avoided = body.annual_tco2e_avoided
        existing.credit_status = body.credit_status
        existing.credits_issued_count = body.credits_issued_count
        existing.revenue_usd = body.revenue_usd
        record = existing
        action = "carbon_tracking_updated"
    else:
        record = CarbonCreditTracking(
            site_id=body.site_id,
            methodology=body.methodology,
            annual_tco2e_avoided=body.annual_tco2e_avoided,
            credit_status=body.credit_status,
            credits_issued_count=body.credits_issued_count,
            revenue_usd=body.revenue_usd,
        )
        db.add(record)
        action = "carbon_tracking_created"

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action=action,
        entity_type="carbon_credit_tracking",
        entity_id=record.id,
        details={"site_id": body.site_id},
    )
    db.add(audit)

    await db.commit()
    await db.refresh(record)

    return {
        "id": record.id,
        "site_id": record.site_id,
        "methodology": record.methodology,
        "annual_tco2e_avoided": record.annual_tco2e_avoided,
        "credit_status": record.credit_status,
        "credits_issued_count": record.credits_issued_count,
        "revenue_usd": record.revenue_usd,
        "updated_at": str(record.updated_at),
    }


@router.get("/reports/carbon/{site_id}")
async def get_carbon_tracking(
    site_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get carbon credit tracking for a site."""
    result = await db.execute(
        select(CarbonCreditTracking).where(CarbonCreditTracking.site_id == site_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(404, "No carbon tracking found for this site")

    return {
        "id": record.id,
        "site_id": record.site_id,
        "methodology": record.methodology,
        "annual_tco2e_avoided": record.annual_tco2e_avoided,
        "credit_status": record.credit_status,
        "credits_issued_count": record.credits_issued_count,
        "revenue_usd": record.revenue_usd,
        "updated_at": str(record.updated_at),
        "created_at": str(record.created_at),
    }
