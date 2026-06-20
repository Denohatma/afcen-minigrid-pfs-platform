"""
MEL (Monitoring, Evaluation & Learning) Module

Collects, validates, aggregates impact data across commissioned sites.
Aligned to DARES PDO indicator matrix (PIM Table 4.5).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    MELSubmission,
    MELLearningLog,
    MELTarget,
    AuditLog,
    utcnow,
    new_uuid,
)
from app.dependencies.auth import (
    AuthContext,
    require_module,
    require_module_write,
)

router = APIRouter()

VALID_SUBMISSION_TYPES = (
    "meter_api", "meter_csv", "developer_declaration",
    "analyst_entry", "iva_verified",
)
VALID_STATUSES = ("submitted", "under_review", "verified", "rejected", "superseded")
VALID_LEARNING_TAGS = (
    "productive_use", "reliability", "gesi", "generator_displacement",
    "tariff", "community", "technical", "commercial", "financing",
    "esia_es", "interconnection", "replication",
)

REQUIRED_FIELDS = [
    "hh_connected", "msme_connected", "supply_hours_per_day",
    "kwh_generated", "kwh_sold", "collection_rate_pct",
    "direct_jobs_created", "co2_avoided_tco2e",
]


# ── Schemas ───────────────────────────────────────────────────────

class MELSubmissionCreate(BaseModel):
    site_id: Optional[str] = None
    site_name: str = ""
    award_id: Optional[str] = None
    reporting_period: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    period_label: str = ""
    submission_type: str = "developer_declaration"

    hh_connected: Optional[int] = None
    hh_connected_cumulative: Optional[int] = None
    msme_connected: Optional[int] = None
    msme_connected_cumulative: Optional[int] = None
    anchor_connected: Optional[int] = None
    new_connections_this_period: Optional[int] = None

    female_hh_connected: Optional[int] = None
    women_led_msme: Optional[int] = None
    youth_led_msme: Optional[int] = None
    vulnerable_hh: Optional[int] = None

    supply_hours_per_day: Optional[float] = None
    system_availability_pct: Optional[float] = None
    saidi_minutes: Optional[float] = None
    saifi_events: Optional[int] = None
    longest_outage_hours: Optional[float] = None
    grid_supply_hours_per_day: Optional[float] = None

    kwh_generated: Optional[float] = None
    kwh_from_grid: Optional[float] = None
    kwh_sold: Optional[float] = None
    kwh_exported_to_grid: Optional[float] = None
    diesel_generators_decommissioned: Optional[int] = None
    generator_kva_displaced: Optional[float] = None
    co2_avoided_tco2e: Optional[float] = None
    co2_avoided_cumulative: Optional[float] = None
    fuel_litres_saved: Optional[float] = None

    arpu_usd: Optional[float] = None
    arpu_ngn: Optional[float] = None
    total_revenue_usd: Optional[float] = None
    collection_rate_pct: Optional[float] = None
    direct_jobs_created: Optional[int] = None
    indirect_jobs_created: Optional[int] = None
    women_employed_direct: Optional[int] = None
    msme_revenue_uplift_usd: Optional[float] = None

    pue_anchors_operational: Optional[int] = None
    pue_categories: Optional[list[str]] = None
    productive_use_kwh: Optional[float] = None

    key_observation: Optional[str] = None
    learning_tag: Optional[str] = None
    community_feedback: Optional[str] = None
    challenges_faced: Optional[str] = None
    corrective_actions: Optional[str] = None
    notes: Optional[str] = None


class LearningLogCreate(BaseModel):
    site_id: Optional[str] = None
    site_name: str = ""
    award_id: Optional[str] = None
    reporting_period: Optional[str] = None
    tag: str
    title: str
    body: str
    is_portfolio_wide: bool = False


class TargetCreate(BaseModel):
    indicator_key: str
    target_value: float
    target_year: int
    site_id: Optional[str] = None
    award_id: Optional[str] = None
    source: str = "programme"
    notes: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────

def _serialize_submission(s: MELSubmission) -> dict:
    return {
        "id": s.id,
        "site_id": s.site_id,
        "site_name": s.site_name,
        "award_id": s.award_id,
        "reporting_period": s.reporting_period,
        "period_label": s.period_label,
        "submission_type": s.submission_type,
        "status": s.status,
        "verified_at": str(s.verified_at) if s.verified_at else None,
        "rejection_reason": s.rejection_reason,
        "hh_connected": s.hh_connected,
        "hh_connected_cumulative": s.hh_connected_cumulative,
        "msme_connected": s.msme_connected,
        "msme_connected_cumulative": s.msme_connected_cumulative,
        "anchor_connected": s.anchor_connected,
        "new_connections_this_period": s.new_connections_this_period,
        "female_hh_connected": s.female_hh_connected,
        "female_hh_pct": s.female_hh_pct,
        "women_led_msme": s.women_led_msme,
        "youth_led_msme": s.youth_led_msme,
        "vulnerable_hh": s.vulnerable_hh,
        "supply_hours_per_day": s.supply_hours_per_day,
        "system_availability_pct": s.system_availability_pct,
        "saidi_minutes": s.saidi_minutes,
        "saifi_events": s.saifi_events,
        "longest_outage_hours": s.longest_outage_hours,
        "grid_supply_hours_per_day": s.grid_supply_hours_per_day,
        "kwh_generated": s.kwh_generated,
        "kwh_from_grid": s.kwh_from_grid,
        "kwh_sold": s.kwh_sold,
        "kwh_exported_to_grid": s.kwh_exported_to_grid,
        "renewable_energy_fraction": s.renewable_energy_fraction,
        "capacity_utilisation_factor": s.capacity_utilisation_factor,
        "diesel_generators_decommissioned": s.diesel_generators_decommissioned,
        "generator_kva_displaced": s.generator_kva_displaced,
        "co2_avoided_tco2e": s.co2_avoided_tco2e,
        "co2_avoided_cumulative": s.co2_avoided_cumulative,
        "fuel_litres_saved": s.fuel_litres_saved,
        "arpu_usd": s.arpu_usd,
        "arpu_ngn": s.arpu_ngn,
        "total_revenue_usd": s.total_revenue_usd,
        "collection_rate_pct": s.collection_rate_pct,
        "direct_jobs_created": s.direct_jobs_created,
        "indirect_jobs_created": s.indirect_jobs_created,
        "women_employed_direct": s.women_employed_direct,
        "msme_revenue_uplift_usd": s.msme_revenue_uplift_usd,
        "pue_anchors_operational": s.pue_anchors_operational,
        "pue_categories": s.pue_categories,
        "productive_use_kwh": s.productive_use_kwh,
        "key_observation": s.key_observation,
        "learning_tag": s.learning_tag,
        "community_feedback": s.community_feedback,
        "challenges_faced": s.challenges_faced,
        "corrective_actions": s.corrective_actions,
        "data_completeness_pct": s.data_completeness_pct,
        "notes": s.notes,
        "created_at": str(s.created_at) if s.created_at else None,
        "updated_at": str(s.updated_at) if s.updated_at else None,
    }


def _compute_completeness(s: MELSubmission) -> float:
    filled = sum(1 for f in REQUIRED_FIELDS if getattr(s, f, None) is not None)
    return round(filled / len(REQUIRED_FIELDS) * 100, 1)


# ── Dashboard ─────────────────────────────────────────────────────

@router.get("/mel/dashboard")
async def mel_dashboard(
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("performance")),
):
    result = await db.execute(
        select(MELSubmission).where(MELSubmission.status == "verified")
    )
    verified = result.scalars().all()

    all_result = await db.execute(select(MELSubmission))
    all_subs = all_result.scalars().all()

    target_result = await db.execute(select(MELTarget))
    targets = target_result.scalars().all()
    target_map = {t.indicator_key: t.target_value for t in targets}

    total_hh = sum(s.hh_connected or 0 for s in verified)
    total_msme = sum(s.msme_connected or 0 for s in verified)
    total_female_hh = sum(s.female_hh_connected or 0 for s in verified)
    total_co2 = sum(s.co2_avoided_tco2e or 0 for s in verified)
    total_co2_cum = sum(s.co2_avoided_cumulative or 0 for s in verified)
    total_jobs_direct = sum(s.direct_jobs_created or 0 for s in verified)
    total_jobs_indirect = sum(s.indirect_jobs_created or 0 for s in verified)
    total_generators = sum(s.diesel_generators_decommissioned or 0 for s in verified)
    total_kwh_sold = sum(s.kwh_sold or 0 for s in verified)
    total_revenue = sum(s.total_revenue_usd or 0 for s in verified)

    avail_vals = [s.system_availability_pct for s in verified if s.system_availability_pct]
    avg_availability = round(sum(avail_vals) / len(avail_vals), 1) if avail_vals else 0
    supply_vals = [s.supply_hours_per_day for s in verified if s.supply_hours_per_day]
    avg_supply = round(sum(supply_vals) / len(supply_vals), 1) if supply_vals else 0
    coll_vals = [s.collection_rate_pct for s in verified if s.collection_rate_pct]
    avg_collection = round(sum(coll_vals) / len(coll_vals), 1) if coll_vals else 0
    arpu_vals = [s.arpu_usd for s in verified if s.arpu_usd]
    avg_arpu = round(sum(arpu_vals) / len(arpu_vals), 2) if arpu_vals else 0

    unique_sites = len(set(s.site_id for s in verified if s.site_id))
    unique_periods = sorted(set(s.period_label for s in verified if s.period_label))

    indicators = {
        "hh_connected": {"actual": total_hh, "target": target_map.get("hh_connected_cumulative", 0)},
        "msme_connected": {"actual": total_msme, "target": target_map.get("msme_connected_cumulative", 0)},
        "female_hh_pct": {"actual": round(total_female_hh / total_hh * 100, 1) if total_hh else 0, "target": target_map.get("female_hh_pct", 30)},
        "co2_avoided": {"actual": total_co2_cum, "target": target_map.get("co2_avoided_cumulative", 0)},
        "generators_displaced": {"actual": total_generators, "target": target_map.get("diesel_generators_decommissioned", 0)},
        "direct_jobs": {"actual": total_jobs_direct, "target": target_map.get("direct_jobs_created", 0)},
        "avg_availability": {"actual": avg_availability, "target": target_map.get("avg_availability_pct", 95)},
    }

    return {
        "total_submissions": len(all_subs),
        "verified_submissions": len(verified),
        "pending_review": sum(1 for s in all_subs if s.status in ("submitted", "under_review")),
        "unique_sites": unique_sites,
        "periods_covered": unique_periods,
        "total_hh_connected": total_hh,
        "total_msme_connected": total_msme,
        "total_female_hh": total_female_hh,
        "avg_supply_hours": avg_supply,
        "avg_availability_pct": avg_availability,
        "total_kwh_sold": round(total_kwh_sold, 2),
        "total_co2_avoided": round(total_co2, 2),
        "total_generators_displaced": total_generators,
        "total_direct_jobs": total_jobs_direct,
        "total_indirect_jobs": total_jobs_indirect,
        "avg_collection_rate": avg_collection,
        "avg_arpu_usd": avg_arpu,
        "total_revenue_usd": round(total_revenue, 2),
        "indicators": indicators,
    }


# ── Submissions CRUD ──────────────────────────────────────────────

@router.get("/mel/submissions")
async def list_submissions(
    site_id: Optional[str] = Query(None),
    period: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    submission_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("performance")),
):
    query = select(MELSubmission).order_by(
        MELSubmission.reporting_period.desc(), MELSubmission.created_at.desc()
    )
    count_query = select(func.count(MELSubmission.id))

    if site_id:
        query = query.where(MELSubmission.site_id == site_id)
        count_query = count_query.where(MELSubmission.site_id == site_id)
    if period:
        query = query.where(MELSubmission.reporting_period == period)
        count_query = count_query.where(MELSubmission.reporting_period == period)
    if status:
        query = query.where(MELSubmission.status == status)
        count_query = count_query.where(MELSubmission.status == status)
    if submission_type:
        query = query.where(MELSubmission.submission_type == submission_type)
        count_query = count_query.where(MELSubmission.submission_type == submission_type)

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(query.offset(offset).limit(limit))
    submissions = result.scalars().all()

    return {
        "submissions": [_serialize_submission(s) for s in submissions],
        "total": total,
    }


@router.get("/mel/submissions/{sub_id}")
async def get_submission(
    sub_id: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("performance")),
):
    result = await db.execute(
        select(MELSubmission).where(MELSubmission.id == sub_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(404, "Submission not found")
    return _serialize_submission(sub)


@router.post("/mel/submissions", status_code=201)
async def create_submission(
    body: MELSubmissionCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("performance")),
):
    if body.submission_type not in VALID_SUBMISSION_TYPES:
        raise HTTPException(400, f"Invalid submission_type: {body.submission_type}")

    female_hh_pct = None
    if body.female_hh_connected and body.hh_connected and body.hh_connected > 0:
        female_hh_pct = round(body.female_hh_connected / body.hh_connected * 100, 2)

    re_fraction = None
    if body.kwh_generated and body.kwh_from_grid is not None:
        total_gen = (body.kwh_generated or 0) + (body.kwh_from_grid or 0)
        if total_gen > 0:
            re_fraction = round(body.kwh_generated / total_gen * 100, 2)

    sub = MELSubmission(
        site_id=body.site_id,
        site_name=body.site_name,
        award_id=body.award_id,
        reporting_period=body.reporting_period,
        period_label=body.period_label or body.reporting_period,
        submitted_by=auth.user_id,
        submission_type=body.submission_type,
        status="submitted",
        hh_connected=body.hh_connected,
        hh_connected_cumulative=body.hh_connected_cumulative,
        msme_connected=body.msme_connected,
        msme_connected_cumulative=body.msme_connected_cumulative,
        anchor_connected=body.anchor_connected,
        new_connections_this_period=body.new_connections_this_period,
        female_hh_connected=body.female_hh_connected,
        female_hh_pct=female_hh_pct,
        women_led_msme=body.women_led_msme,
        youth_led_msme=body.youth_led_msme,
        vulnerable_hh=body.vulnerable_hh,
        supply_hours_per_day=body.supply_hours_per_day,
        system_availability_pct=body.system_availability_pct,
        saidi_minutes=body.saidi_minutes,
        saifi_events=body.saifi_events,
        longest_outage_hours=body.longest_outage_hours,
        grid_supply_hours_per_day=body.grid_supply_hours_per_day,
        kwh_generated=body.kwh_generated,
        kwh_from_grid=body.kwh_from_grid,
        kwh_sold=body.kwh_sold,
        kwh_exported_to_grid=body.kwh_exported_to_grid,
        renewable_energy_fraction=re_fraction,
        diesel_generators_decommissioned=body.diesel_generators_decommissioned,
        generator_kva_displaced=body.generator_kva_displaced,
        co2_avoided_tco2e=body.co2_avoided_tco2e,
        co2_avoided_cumulative=body.co2_avoided_cumulative,
        fuel_litres_saved=body.fuel_litres_saved,
        arpu_usd=body.arpu_usd,
        arpu_ngn=body.arpu_ngn,
        total_revenue_usd=body.total_revenue_usd,
        collection_rate_pct=body.collection_rate_pct,
        direct_jobs_created=body.direct_jobs_created,
        indirect_jobs_created=body.indirect_jobs_created,
        women_employed_direct=body.women_employed_direct,
        msme_revenue_uplift_usd=body.msme_revenue_uplift_usd,
        pue_anchors_operational=body.pue_anchors_operational,
        pue_categories=body.pue_categories,
        productive_use_kwh=body.productive_use_kwh,
        key_observation=body.key_observation,
        learning_tag=body.learning_tag,
        community_feedback=body.community_feedback,
        challenges_faced=body.challenges_faced,
        corrective_actions=body.corrective_actions,
        notes=body.notes,
    )
    sub.data_completeness_pct = _compute_completeness(sub)

    db.add(sub)
    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="MEL_SUBMISSION_CREATED",
        entity_type="mel_submission",
        entity_id=sub.id,
        after_json={"site_name": body.site_name, "period": body.reporting_period},
    ))
    await db.commit()
    await db.refresh(sub)
    return _serialize_submission(sub)


@router.put("/mel/submissions/{sub_id}/verify")
async def verify_submission(
    sub_id: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("performance")),
):
    result = await db.execute(
        select(MELSubmission).where(MELSubmission.id == sub_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(404, "Submission not found")
    if sub.status == "verified":
        raise HTTPException(400, "Already verified")

    sub.status = "verified"
    sub.verified_by = auth.user_id
    sub.verified_at = utcnow()
    sub.updated_at = utcnow()

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="MEL_SUBMISSION_VERIFIED",
        entity_type="mel_submission",
        entity_id=sub.id,
    ))
    await db.commit()
    await db.refresh(sub)
    return _serialize_submission(sub)


@router.put("/mel/submissions/{sub_id}/reject")
async def reject_submission(
    sub_id: str,
    reason: str = Query(...),
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("performance")),
):
    result = await db.execute(
        select(MELSubmission).where(MELSubmission.id == sub_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(404, "Submission not found")

    sub.status = "rejected"
    sub.rejection_reason = reason
    sub.updated_at = utcnow()
    await db.commit()
    await db.refresh(sub)
    return _serialize_submission(sub)


# ── Learning Log ──────────────────────────────────────────────────

@router.get("/mel/learning-log")
async def list_learning_entries(
    tag: Optional[str] = Query(None),
    site_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("performance")),
):
    query = select(MELLearningLog).order_by(MELLearningLog.created_at.desc())
    if tag:
        query = query.where(MELLearningLog.tag == tag)
    if site_id:
        query = query.where(MELLearningLog.site_id == site_id)

    result = await db.execute(query.limit(limit))
    entries = result.scalars().all()
    return {
        "entries": [
            {
                "id": e.id,
                "site_id": e.site_id,
                "site_name": e.site_name,
                "tag": e.tag,
                "title": e.title,
                "body": e.body,
                "author_name": e.author_name,
                "is_portfolio_wide": e.is_portfolio_wide,
                "is_published": e.is_published,
                "upvotes": e.upvotes,
                "reporting_period": e.reporting_period,
                "created_at": str(e.created_at) if e.created_at else None,
            }
            for e in entries
        ]
    }


@router.post("/mel/learning-log", status_code=201)
async def create_learning_entry(
    body: LearningLogCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("performance")),
):
    if body.tag not in VALID_LEARNING_TAGS:
        raise HTTPException(400, f"Invalid tag: {body.tag}")

    entry = MELLearningLog(
        site_id=body.site_id,
        site_name=body.site_name,
        award_id=body.award_id,
        reporting_period=body.reporting_period,
        author_id=auth.user_id,
        author_name=auth.name,
        tag=body.tag,
        title=body.title,
        body=body.body,
        is_portfolio_wide=body.is_portfolio_wide,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return {"id": entry.id, "title": entry.title, "tag": entry.tag}


# ── Targets ───────────────────────────────────────────────────────

@router.get("/mel/targets")
async def list_targets(
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("performance")),
):
    result = await db.execute(
        select(MELTarget).order_by(MELTarget.indicator_key)
    )
    targets = result.scalars().all()
    return {
        "targets": [
            {
                "id": t.id,
                "indicator_key": t.indicator_key,
                "target_value": t.target_value,
                "target_year": t.target_year,
                "site_id": t.site_id,
                "source": t.source,
                "notes": t.notes,
            }
            for t in targets
        ]
    }


@router.post("/mel/targets", status_code=201)
async def create_target(
    body: TargetCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("performance")),
):
    target = MELTarget(
        indicator_key=body.indicator_key,
        target_value=body.target_value,
        target_year=body.target_year,
        site_id=body.site_id,
        award_id=body.award_id,
        source=body.source,
        notes=body.notes,
    )
    db.add(target)
    await db.commit()
    await db.refresh(target)
    return {"id": target.id, "indicator_key": target.indicator_key}
