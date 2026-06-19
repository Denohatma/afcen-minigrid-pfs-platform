"""
Module 9 — Eligible CAPEX, Milestones & Disbursement

Four-role segregated approval workflow:
  1. Developer submits evidence         (evidence_submitted_by)
  2. IVA verifies                       (iva_verified_by)
  3. REA PMU Officer approves           (rea_approved_by)
  4. REA Grant Admin gives final sign-off (grant_admin_approved_by)
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.db.models import (
    EligibleCapex,
    Milestone,
    Disbursement,
    GPSPhoto,
    IVAVisit,
    GrantAgreement,
    AuditLog,
    utcnow,
    new_uuid,
)
from app.dependencies.auth import (
    AuthContext,
    get_current_user,
    require_module,
    require_module_write,
)

router = APIRouter()

# ─── Pydantic Schemas ──────────────────────────────────────────────────

# --- Eligible CAPEX ---

class CapexCreate(BaseModel):
    category: str
    description: str = ""
    invoice_ref: str = ""
    claimed_amount: float = 0.0
    eligible_amount: float = 0.0
    evidence_files: list[dict[str, Any]] = Field(default_factory=list)


class CapexUpdate(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    invoice_ref: Optional[str] = None
    claimed_amount: Optional[float] = None
    eligible_amount: Optional[float] = None
    evidence_files: Optional[list[dict[str, Any]]] = None
    status: Optional[str] = None


class CapexVerify(BaseModel):
    iva_verified_amount: float
    disallowed_amount: float = 0.0
    disallow_reason: str = ""


# --- Milestones ---

class MilestoneCreate(BaseModel):
    grant_agreement_id: str
    site_id: Optional[str] = None
    milestone_type: str
    title: str
    description: str = ""
    tranche_pct: float = 0.0
    grant_amount_usd: float = 0.0
    target_date: Optional[datetime] = None


class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    milestone_type: Optional[str] = None
    tranche_pct: Optional[float] = None
    grant_amount_usd: Optional[float] = None
    target_date: Optional[datetime] = None


class EvidenceSubmit(BaseModel):
    evidence: dict[str, Any] = Field(default_factory=dict)
    notes: str = ""


class IVAVerifyMilestone(BaseModel):
    iva_status: str  # "verified", "failed", "partial"
    notes: str = ""


class REAApproveMilestone(BaseModel):
    rea_approval_status: str  # "approved", "rejected", "deferred"
    notes: str = ""


# --- Disbursements ---

class DisbursementCreate(BaseModel):
    amount_usd: float
    currency: str = "USD"
    beneficiary_account: str = ""
    notes: str = ""


class DisbursementIVAVerify(BaseModel):
    notes: str = ""


class DisbursementREAApprove(BaseModel):
    ringfence_checked: bool = False
    notes: str = ""


class DisbursementGrantAdminApprove(BaseModel):
    audit_ref: str = ""
    notes: str = ""


class PaymentConfirm(BaseModel):
    payment_reference: str
    notes: str = ""


# --- GPS Photos ---

class GPSPhotoCreate(BaseModel):
    milestone_id: str
    site_id: Optional[str] = None
    photo_filename: str = ""
    storage_key: str = ""
    latitude: float
    longitude: float
    accuracy_meters: float = 0.0
    device_id: str = ""
    captured_at: datetime


class GPSPhotoReview(BaseModel):
    coordinate_check: str = "pass"
    timestamp_check: str = "pass"
    duplicate_check: str = "pass"
    overall_status: str = "pass"
    reviewer_notes: str = ""


# --- IVA Visits ---

class IVAVisitCreate(BaseModel):
    site_id: str
    milestone_id: str
    trigger_reason: str = "auto_flag"
    iva_name: str = ""
    scheduled_date: Optional[datetime] = None


class IVAVisitUpdate(BaseModel):
    status: Optional[str] = None
    completed_date: Optional[datetime] = None
    field_report_key: Optional[str] = None
    verification_result: Optional[str] = None
    notes: Optional[str] = None


# ─── Helpers ───────────────────────────────────────────────────────────

def _serialize_capex(c: EligibleCapex) -> dict:
    return {
        "id": c.id,
        "grant_agreement_id": c.grant_agreement_id,
        "category": c.category,
        "description": c.description,
        "invoice_ref": c.invoice_ref,
        "claimed_amount": c.claimed_amount,
        "eligible_amount": c.eligible_amount,
        "iva_verified_amount": c.iva_verified_amount,
        "disallowed_amount": c.disallowed_amount,
        "disallow_reason": c.disallow_reason,
        "evidence_files": c.evidence_files,
        "status": c.status,
        "created_at": str(c.created_at) if c.created_at else None,
    }


def _serialize_milestone(m: Milestone) -> dict:
    return {
        "id": m.id,
        "grant_agreement_id": m.grant_agreement_id,
        "site_id": m.site_id,
        "milestone_type": m.milestone_type,
        "title": m.title,
        "description": m.description,
        "tranche_pct": m.tranche_pct,
        "grant_amount_usd": m.grant_amount_usd,
        "evidence": m.evidence,
        "iva_status": m.iva_status,
        "nemsa_status": m.nemsa_status,
        "rea_approval_status": m.rea_approval_status,
        "target_date": str(m.target_date) if m.target_date else None,
        "submitted_at": str(m.submitted_at) if m.submitted_at else None,
        "verified_at": str(m.verified_at) if m.verified_at else None,
        "approved_at": str(m.approved_at) if m.approved_at else None,
        "status": m.status,
        "created_at": str(m.created_at) if m.created_at else None,
    }


def _serialize_disbursement(d: Disbursement) -> dict:
    return {
        "id": d.id,
        "milestone_id": d.milestone_id,
        "amount_usd": d.amount_usd,
        "currency": d.currency,
        "beneficiary_account": d.beneficiary_account,
        "evidence_submitted_by": d.evidence_submitted_by,
        "evidence_submitted_at": str(d.evidence_submitted_at) if d.evidence_submitted_at else None,
        "iva_verified_by": d.iva_verified_by,
        "iva_verified_at": str(d.iva_verified_at) if d.iva_verified_at else None,
        "rea_approved_by": d.rea_approved_by,
        "rea_approved_at": str(d.rea_approved_at) if d.rea_approved_at else None,
        "grant_admin_approved_by": d.grant_admin_approved_by,
        "grant_admin_approved_at": str(d.grant_admin_approved_at) if d.grant_admin_approved_at else None,
        "payment_status": d.payment_status,
        "payment_reference": d.payment_reference,
        "audit_ref": d.audit_ref,
        "ringfence_checked": d.ringfence_checked,
        "created_at": str(d.created_at) if d.created_at else None,
    }


def _serialize_gps_photo(p: GPSPhoto) -> dict:
    return {
        "id": p.id,
        "milestone_id": p.milestone_id,
        "site_id": p.site_id,
        "photo_filename": p.photo_filename,
        "storage_key": p.storage_key,
        "latitude": p.latitude,
        "longitude": p.longitude,
        "accuracy_meters": p.accuracy_meters,
        "device_id": p.device_id,
        "captured_at": str(p.captured_at) if p.captured_at else None,
        "uploaded_at": str(p.uploaded_at) if p.uploaded_at else None,
        "distance_from_site_km": p.distance_from_site_km,
        "coordinate_check": p.coordinate_check,
        "timestamp_check": p.timestamp_check,
        "duplicate_check": p.duplicate_check,
        "overall_status": p.overall_status,
        "reviewer_notes": p.reviewer_notes,
    }


def _serialize_iva_visit(v: IVAVisit) -> dict:
    return {
        "id": v.id,
        "site_id": v.site_id,
        "milestone_id": v.milestone_id,
        "trigger_reason": v.trigger_reason,
        "iva_name": v.iva_name,
        "scheduled_date": str(v.scheduled_date) if v.scheduled_date else None,
        "completed_date": str(v.completed_date) if v.completed_date else None,
        "status": v.status,
        "field_report_key": v.field_report_key,
        "verification_result": v.verification_result,
        "notes": v.notes,
        "created_at": str(v.created_at) if v.created_at else None,
    }


def _audit(auth: AuthContext, action: str, entity_type: str, entity_id: str, details: dict) -> AuditLog:
    return AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
    )


# =====================================================================
# 1) ELIGIBLE CAPEX
# =====================================================================

@router.get("/agreements/{agreement_id}/capex", tags=["capex"])
async def list_capex(
    agreement_id: str,
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """List all CAPEX items for a grant agreement."""
    result = await db.execute(
        select(EligibleCapex)
        .where(EligibleCapex.grant_agreement_id == agreement_id)
        .order_by(EligibleCapex.created_at)
    )
    items = result.scalars().all()
    return {"items": [_serialize_capex(c) for c in items], "total": len(items)}


@router.post("/agreements/{agreement_id}/capex", tags=["capex"], status_code=201)
async def create_capex(
    agreement_id: str,
    body: CapexCreate,
    auth: AuthContext = Depends(require_module_write("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """Add a CAPEX line item under a grant agreement."""
    # Verify agreement exists
    ga = await db.execute(select(GrantAgreement).where(GrantAgreement.id == agreement_id))
    if not ga.scalar_one_or_none():
        raise HTTPException(404, "Grant agreement not found")

    capex = EligibleCapex(
        grant_agreement_id=agreement_id,
        category=body.category,
        description=body.description,
        invoice_ref=body.invoice_ref,
        claimed_amount=body.claimed_amount,
        eligible_amount=body.eligible_amount,
        evidence_files=body.evidence_files,
        status="claimed",
    )
    db.add(capex)
    db.add(_audit(auth, "capex_created", "eligible_capex", capex.id, {
        "agreement_id": agreement_id,
        "category": body.category,
        "claimed_amount": body.claimed_amount,
    }))
    await db.commit()
    await db.refresh(capex)
    return _serialize_capex(capex)


@router.put("/capex/{id}", tags=["capex"])
async def update_capex(
    id: str,
    body: CapexUpdate,
    auth: AuthContext = Depends(require_module_write("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """Update a CAPEX item (before IVA verification)."""
    result = await db.execute(select(EligibleCapex).where(EligibleCapex.id == id))
    capex = result.scalar_one_or_none()
    if not capex:
        raise HTTPException(404, "CAPEX item not found")
    if capex.status == "verified":
        raise HTTPException(400, "Cannot update a verified CAPEX item")

    changes = {}
    for field in ("category", "description", "invoice_ref", "claimed_amount",
                  "eligible_amount", "evidence_files", "status"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(capex, field, val)
            changes[field] = val

    db.add(_audit(auth, "capex_updated", "eligible_capex", id, changes))
    await db.commit()
    await db.refresh(capex)
    return _serialize_capex(capex)


@router.put("/capex/{id}/verify", tags=["capex"])
async def verify_capex(
    id: str,
    body: CapexVerify,
    auth: AuthContext = Depends(require_module_write("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """IVA verifies a CAPEX item, setting verified / disallowed amounts."""
    if auth.role not in ("iva", "rea_pmu_officer", "afcen_admin"):
        raise HTTPException(403, "Only IVA can verify CAPEX items")

    result = await db.execute(select(EligibleCapex).where(EligibleCapex.id == id))
    capex = result.scalar_one_or_none()
    if not capex:
        raise HTTPException(404, "CAPEX item not found")

    capex.iva_verified_amount = body.iva_verified_amount
    capex.disallowed_amount = body.disallowed_amount
    capex.disallow_reason = body.disallow_reason
    capex.status = "verified"

    db.add(_audit(auth, "capex_verified", "eligible_capex", id, {
        "iva_verified_amount": body.iva_verified_amount,
        "disallowed_amount": body.disallowed_amount,
    }))
    await db.commit()
    await db.refresh(capex)
    return _serialize_capex(capex)


# =====================================================================
# 2) MILESTONES
# =====================================================================

@router.get("/milestones/dashboard", tags=["milestones"])
async def milestone_dashboard(
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """Milestone progress dashboard with aggregate stats."""
    result = await db.execute(select(Milestone))
    milestones = result.scalars().all()

    if not milestones:
        return {
            "total_milestones": 0,
            "by_status": {},
            "by_iva_status": {},
            "by_rea_status": {},
            "total_grant_usd": 0.0,
            "approved_grant_usd": 0.0,
            "pending_grant_usd": 0.0,
        }

    total_grant = sum(m.grant_amount_usd for m in milestones)
    approved_grant = sum(m.grant_amount_usd for m in milestones if m.status == "approved")
    pending_grant = sum(m.grant_amount_usd for m in milestones if m.status in ("submitted", "iva_verified"))

    by_status: dict[str, dict] = {}
    by_iva: dict[str, int] = {}
    by_rea: dict[str, int] = {}

    for m in milestones:
        by_status.setdefault(m.status, {"count": 0, "amount_usd": 0.0})
        by_status[m.status]["count"] += 1
        by_status[m.status]["amount_usd"] += m.grant_amount_usd

        by_iva[m.iva_status] = by_iva.get(m.iva_status, 0) + 1
        by_rea[m.rea_approval_status] = by_rea.get(m.rea_approval_status, 0) + 1

    return {
        "total_milestones": len(milestones),
        "by_status": by_status,
        "by_iva_status": by_iva,
        "by_rea_status": by_rea,
        "total_grant_usd": round(total_grant, 2),
        "approved_grant_usd": round(approved_grant, 2),
        "pending_grant_usd": round(pending_grant, 2),
    }


@router.get("/milestones", tags=["milestones"])
async def list_milestones(
    agreement_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    site_id: Optional[str] = Query(None),
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """List milestones with optional filters."""
    query = select(Milestone).order_by(Milestone.created_at.desc())

    if agreement_id:
        query = query.where(Milestone.grant_agreement_id == agreement_id)
    if status:
        query = query.where(Milestone.status == status)
    if site_id:
        query = query.where(Milestone.site_id == site_id)

    result = await db.execute(query)
    milestones = result.scalars().all()
    return {"milestones": [_serialize_milestone(m) for m in milestones], "total": len(milestones)}


@router.get("/milestones/{id}", tags=["milestones"])
async def get_milestone(
    id: str,
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """Get milestone detail with GPS photos, IVA visits, and disbursement."""
    result = await db.execute(
        select(Milestone)
        .where(Milestone.id == id)
        .options(
            selectinload(Milestone.gps_photos),
            selectinload(Milestone.iva_visits),
            selectinload(Milestone.disbursement),
        )
    )
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(404, "Milestone not found")

    data = _serialize_milestone(milestone)
    data["gps_photos"] = [_serialize_gps_photo(p) for p in (milestone.gps_photos or [])]
    data["iva_visits"] = [_serialize_iva_visit(v) for v in (milestone.iva_visits or [])]
    data["disbursement"] = _serialize_disbursement(milestone.disbursement) if milestone.disbursement else None
    return data


@router.post("/milestones", tags=["milestones"], status_code=201)
async def create_milestone(
    body: MilestoneCreate,
    auth: AuthContext = Depends(require_module_write("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new milestone under a grant agreement."""
    # Verify agreement exists
    ga = await db.execute(select(GrantAgreement).where(GrantAgreement.id == body.grant_agreement_id))
    if not ga.scalar_one_or_none():
        raise HTTPException(404, "Grant agreement not found")

    milestone = Milestone(
        grant_agreement_id=body.grant_agreement_id,
        site_id=body.site_id,
        milestone_type=body.milestone_type,
        title=body.title,
        description=body.description,
        tranche_pct=body.tranche_pct,
        grant_amount_usd=body.grant_amount_usd,
        target_date=body.target_date,
        status="not_started",
    )
    db.add(milestone)
    db.add(_audit(auth, "milestone_created", "milestone", milestone.id, {
        "agreement_id": body.grant_agreement_id,
        "title": body.title,
        "milestone_type": body.milestone_type,
        "grant_amount_usd": body.grant_amount_usd,
    }))
    await db.commit()
    await db.refresh(milestone)
    return _serialize_milestone(milestone)


@router.put("/milestones/{id}", tags=["milestones"])
async def update_milestone(
    id: str,
    body: MilestoneUpdate,
    auth: AuthContext = Depends(require_module_write("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """Update milestone metadata (before submission)."""
    result = await db.execute(select(Milestone).where(Milestone.id == id))
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(404, "Milestone not found")
    if milestone.status not in ("not_started", "revision_required"):
        raise HTTPException(400, f"Cannot update milestone in '{milestone.status}' status")

    changes = {}
    for field in ("title", "description", "milestone_type", "tranche_pct",
                  "grant_amount_usd", "target_date"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(milestone, field, val)
            changes[field] = str(val)

    db.add(_audit(auth, "milestone_updated", "milestone", id, changes))
    await db.commit()
    await db.refresh(milestone)
    return _serialize_milestone(milestone)


@router.put("/milestones/{id}/submit", tags=["milestones"])
async def submit_milestone_evidence(
    id: str,
    body: EvidenceSubmit,
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """Developer submits milestone completion evidence."""
    if auth.role not in ("developer", "rea_pmu_officer", "afcen_admin"):
        raise HTTPException(403, "Only the developer can submit milestone evidence")

    result = await db.execute(select(Milestone).where(Milestone.id == id))
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(404, "Milestone not found")
    if milestone.status not in ("not_started", "revision_required"):
        raise HTTPException(400, f"Cannot submit evidence in '{milestone.status}' status")

    milestone.evidence = body.evidence
    milestone.status = "submitted"
    milestone.submitted_at = utcnow()

    db.add(_audit(auth, "milestone_evidence_submitted", "milestone", id, {
        "notes": body.notes,
        "evidence_keys": list(body.evidence.keys()) if body.evidence else [],
    }))
    await db.commit()
    await db.refresh(milestone)
    return _serialize_milestone(milestone)


@router.put("/milestones/{id}/iva-verify", tags=["milestones"])
async def iva_verify_milestone(
    id: str,
    body: IVAVerifyMilestone,
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """IVA verifies a submitted milestone."""
    if auth.role not in ("iva", "rea_pmu_officer", "afcen_admin"):
        raise HTTPException(403, "Only IVA can verify milestones")

    result = await db.execute(select(Milestone).where(Milestone.id == id))
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(404, "Milestone not found")
    if milestone.status != "submitted":
        raise HTTPException(400, f"Milestone must be 'submitted' for IVA verification, currently '{milestone.status}'")

    if body.iva_status not in ("verified", "failed", "partial"):
        raise HTTPException(400, "iva_status must be 'verified', 'failed', or 'partial'")

    milestone.iva_status = body.iva_status
    milestone.verified_at = utcnow()

    if body.iva_status == "verified":
        milestone.status = "iva_verified"
    elif body.iva_status == "failed":
        milestone.status = "revision_required"

    db.add(_audit(auth, "milestone_iva_verified", "milestone", id, {
        "iva_status": body.iva_status,
        "notes": body.notes,
    }))
    await db.commit()
    await db.refresh(milestone)
    return _serialize_milestone(milestone)


@router.put("/milestones/{id}/rea-approve", tags=["milestones"])
async def rea_approve_milestone(
    id: str,
    body: REAApproveMilestone,
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """REA PMU Officer approves or rejects a milestone."""
    if auth.role not in ("rea_pmu_officer", "afcen_admin"):
        raise HTTPException(403, "Only REA PMU Officer can approve milestones")

    result = await db.execute(select(Milestone).where(Milestone.id == id))
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(404, "Milestone not found")
    if milestone.status != "iva_verified":
        raise HTTPException(400, f"Milestone must be IVA-verified before REA approval, currently '{milestone.status}'")

    if body.rea_approval_status not in ("approved", "rejected", "deferred"):
        raise HTTPException(400, "rea_approval_status must be 'approved', 'rejected', or 'deferred'")

    milestone.rea_approval_status = body.rea_approval_status
    milestone.approved_at = utcnow() if body.rea_approval_status == "approved" else None

    if body.rea_approval_status == "approved":
        milestone.status = "approved"
    elif body.rea_approval_status == "rejected":
        milestone.status = "revision_required"

    db.add(_audit(auth, "milestone_rea_approved", "milestone", id, {
        "rea_approval_status": body.rea_approval_status,
        "notes": body.notes,
    }))
    await db.commit()
    await db.refresh(milestone)
    return _serialize_milestone(milestone)


# =====================================================================
# 3) DISBURSEMENTS
# =====================================================================

@router.get("/disbursements/dashboard", tags=["disbursements"])
async def disbursement_dashboard(
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """Disbursement overview dashboard with aggregate stats."""
    result = await db.execute(select(Disbursement))
    disbursements = result.scalars().all()

    total_requested = sum(d.amount_usd for d in disbursements)
    total_paid = sum(d.amount_usd for d in disbursements if d.payment_status == "paid")
    total_pending = sum(d.amount_usd for d in disbursements if d.payment_status == "pending")
    total_approved = sum(d.amount_usd for d in disbursements if d.payment_status == "grant_admin_approved")

    by_status: dict[str, dict] = {}
    for d in disbursements:
        by_status.setdefault(d.payment_status, {"count": 0, "amount_usd": 0.0})
        by_status[d.payment_status]["count"] += 1
        by_status[d.payment_status]["amount_usd"] += d.amount_usd

    return {
        "total_disbursements": len(disbursements),
        "total_requested_usd": round(total_requested, 2),
        "total_paid_usd": round(total_paid, 2),
        "total_approved_usd": round(total_approved, 2),
        "total_pending_usd": round(total_pending, 2),
        "disbursement_rate_pct": round(total_paid / total_requested * 100, 1) if total_requested > 0 else 0.0,
        "by_status": by_status,
    }


@router.get("/disbursements", tags=["disbursements"])
async def list_disbursements(
    payment_status: Optional[str] = Query(None),
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """List all disbursements with optional status filter."""
    query = select(Disbursement).order_by(Disbursement.created_at.desc())

    if payment_status:
        query = query.where(Disbursement.payment_status == payment_status)

    result = await db.execute(query)
    disbursements = result.scalars().all()
    return {"disbursements": [_serialize_disbursement(d) for d in disbursements], "total": len(disbursements)}


@router.get("/disbursements/{id}", tags=["disbursements"])
async def get_disbursement(
    id: str,
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """Get single disbursement detail."""
    result = await db.execute(
        select(Disbursement)
        .where(Disbursement.id == id)
        .options(selectinload(Disbursement.milestone))
    )
    disbursement = result.scalar_one_or_none()
    if not disbursement:
        raise HTTPException(404, "Disbursement not found")

    data = _serialize_disbursement(disbursement)
    if disbursement.milestone:
        data["milestone"] = _serialize_milestone(disbursement.milestone)
    return data


@router.post("/milestones/{milestone_id}/disburse", tags=["disbursements"], status_code=201)
async def create_disbursement(
    milestone_id: str,
    body: DisbursementCreate,
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """Developer creates a disbursement request for an approved milestone."""
    if auth.role not in ("developer", "rea_pmu_officer", "afcen_admin"):
        raise HTTPException(403, "Only the developer can create a disbursement request")

    # Verify milestone exists and is approved
    result = await db.execute(select(Milestone).where(Milestone.id == milestone_id))
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(404, "Milestone not found")
    if milestone.status != "approved":
        raise HTTPException(400, f"Milestone must be approved before disbursement, currently '{milestone.status}'")

    # Check no existing disbursement (unique constraint)
    existing = await db.execute(
        select(Disbursement).where(Disbursement.milestone_id == milestone_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Disbursement already exists for this milestone")

    disbursement = Disbursement(
        milestone_id=milestone_id,
        amount_usd=body.amount_usd,
        currency=body.currency,
        beneficiary_account=body.beneficiary_account,
        evidence_submitted_by=auth.user_id,
        evidence_submitted_at=utcnow(),
        payment_status="pending",
    )
    db.add(disbursement)

    milestone.status = "disbursement_requested"

    db.add(_audit(auth, "disbursement_created", "disbursement", disbursement.id, {
        "milestone_id": milestone_id,
        "amount_usd": body.amount_usd,
        "currency": body.currency,
        "submitted_by_role": auth.role,
    }))
    await db.commit()
    await db.refresh(disbursement)
    return _serialize_disbursement(disbursement)


@router.put("/disbursements/{id}/iva-verify", tags=["disbursements"])
async def iva_verify_disbursement(
    id: str,
    body: DisbursementIVAVerify,
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """IVA verifies a disbursement request."""
    if auth.role not in ("iva", "rea_pmu_officer", "afcen_admin"):
        raise HTTPException(403, "Only IVA can verify disbursements")

    result = await db.execute(select(Disbursement).where(Disbursement.id == id))
    disbursement = result.scalar_one_or_none()
    if not disbursement:
        raise HTTPException(404, "Disbursement not found")
    if disbursement.payment_status != "pending":
        raise HTTPException(400, f"Disbursement must be 'pending' for IVA verification, currently '{disbursement.payment_status}'")
    if not disbursement.evidence_submitted_by:
        raise HTTPException(400, "Developer must submit evidence before IVA verification")

    disbursement.iva_verified_by = auth.user_id
    disbursement.iva_verified_at = utcnow()
    disbursement.payment_status = "iva_verified"

    db.add(_audit(auth, "disbursement_iva_verified", "disbursement", id, {
        "notes": body.notes,
        "verified_by": auth.name,
    }))
    await db.commit()
    await db.refresh(disbursement)
    return _serialize_disbursement(disbursement)


@router.put("/disbursements/{id}/rea-approve", tags=["disbursements"])
async def rea_approve_disbursement(
    id: str,
    body: DisbursementREAApprove,
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """REA PMU Officer approves the disbursement."""
    if auth.role not in ("rea_pmu_officer", "afcen_admin"):
        raise HTTPException(403, "Only REA PMU Officer can approve disbursements")

    result = await db.execute(select(Disbursement).where(Disbursement.id == id))
    disbursement = result.scalar_one_or_none()
    if not disbursement:
        raise HTTPException(404, "Disbursement not found")
    if disbursement.payment_status != "iva_verified":
        raise HTTPException(400, f"Disbursement must be IVA-verified before REA approval, currently '{disbursement.payment_status}'")

    disbursement.rea_approved_by = auth.user_id
    disbursement.rea_approved_at = utcnow()
    disbursement.ringfence_checked = body.ringfence_checked
    disbursement.payment_status = "rea_approved"

    db.add(_audit(auth, "disbursement_rea_approved", "disbursement", id, {
        "ringfence_checked": body.ringfence_checked,
        "notes": body.notes,
        "approved_by": auth.name,
    }))
    await db.commit()
    await db.refresh(disbursement)
    return _serialize_disbursement(disbursement)


@router.put("/disbursements/{id}/grant-admin-approve", tags=["disbursements"])
async def grant_admin_approve_disbursement(
    id: str,
    body: DisbursementGrantAdminApprove,
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """REA Grant Admin gives final approval before payment."""
    if auth.role not in ("rea_grant_admin", "rea_pmu_officer", "afcen_admin"):
        raise HTTPException(403, "Only REA Grant Admin can give final disbursement approval")

    result = await db.execute(select(Disbursement).where(Disbursement.id == id))
    disbursement = result.scalar_one_or_none()
    if not disbursement:
        raise HTTPException(404, "Disbursement not found")
    if disbursement.payment_status != "rea_approved":
        raise HTTPException(400, f"Disbursement must be REA-approved before grant admin sign-off, currently '{disbursement.payment_status}'")

    disbursement.grant_admin_approved_by = auth.user_id
    disbursement.grant_admin_approved_at = utcnow()
    disbursement.audit_ref = body.audit_ref
    disbursement.payment_status = "grant_admin_approved"

    db.add(_audit(auth, "disbursement_grant_admin_approved", "disbursement", id, {
        "audit_ref": body.audit_ref,
        "notes": body.notes,
        "approved_by": auth.name,
    }))
    await db.commit()
    await db.refresh(disbursement)
    return _serialize_disbursement(disbursement)


@router.put("/disbursements/{id}/confirm-payment", tags=["disbursements"])
async def confirm_payment(
    id: str,
    body: PaymentConfirm,
    auth: AuthContext = Depends(require_module_write("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """Confirm payment has been executed and record payment reference."""
    result = await db.execute(
        select(Disbursement)
        .where(Disbursement.id == id)
        .options(selectinload(Disbursement.milestone))
    )
    disbursement = result.scalar_one_or_none()
    if not disbursement:
        raise HTTPException(404, "Disbursement not found")
    if disbursement.payment_status != "grant_admin_approved":
        raise HTTPException(400, f"Disbursement must be grant-admin-approved before payment, currently '{disbursement.payment_status}'")
    if not body.payment_reference:
        raise HTTPException(400, "Payment reference is required")

    disbursement.payment_status = "paid"
    disbursement.payment_reference = body.payment_reference

    # Update milestone status to disbursed
    if disbursement.milestone:
        disbursement.milestone.status = "disbursed"

    db.add(_audit(auth, "disbursement_paid", "disbursement", id, {
        "payment_reference": body.payment_reference,
        "amount_usd": disbursement.amount_usd,
        "notes": body.notes,
    }))
    await db.commit()
    await db.refresh(disbursement)
    return _serialize_disbursement(disbursement)


# =====================================================================
# 4) GPS PHOTOS
# =====================================================================

@router.post("/gps-photos", tags=["gps-photos"], status_code=201)
async def upload_gps_photo(
    body: GPSPhotoCreate,
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """Upload a GPS photo record linked to a milestone."""
    # Verify milestone exists
    ms = await db.execute(select(Milestone).where(Milestone.id == body.milestone_id))
    if not ms.scalar_one_or_none():
        raise HTTPException(404, "Milestone not found")

    photo = GPSPhoto(
        milestone_id=body.milestone_id,
        site_id=body.site_id,
        photo_filename=body.photo_filename,
        storage_key=body.storage_key,
        latitude=body.latitude,
        longitude=body.longitude,
        accuracy_meters=body.accuracy_meters,
        device_id=body.device_id,
        captured_at=body.captured_at,
    )
    db.add(photo)
    db.add(_audit(auth, "gps_photo_uploaded", "gps_photo", photo.id, {
        "milestone_id": body.milestone_id,
        "latitude": body.latitude,
        "longitude": body.longitude,
    }))
    await db.commit()
    await db.refresh(photo)
    return _serialize_gps_photo(photo)


@router.get("/milestones/{milestone_id}/gps-photos", tags=["gps-photos"])
async def list_gps_photos(
    milestone_id: str,
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """List GPS photos for a specific milestone."""
    result = await db.execute(
        select(GPSPhoto)
        .where(GPSPhoto.milestone_id == milestone_id)
        .order_by(GPSPhoto.captured_at.desc())
    )
    photos = result.scalars().all()
    return {"photos": [_serialize_gps_photo(p) for p in photos], "total": len(photos)}


@router.put("/gps-photos/{id}/review", tags=["gps-photos"])
async def review_gps_photo(
    id: str,
    body: GPSPhotoReview,
    auth: AuthContext = Depends(require_module_write("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """Review a GPS photo (coordinate, timestamp, duplicate checks)."""
    result = await db.execute(select(GPSPhoto).where(GPSPhoto.id == id))
    photo = result.scalar_one_or_none()
    if not photo:
        raise HTTPException(404, "GPS photo not found")

    photo.coordinate_check = body.coordinate_check
    photo.timestamp_check = body.timestamp_check
    photo.duplicate_check = body.duplicate_check
    photo.overall_status = body.overall_status
    photo.reviewer_notes = body.reviewer_notes

    db.add(_audit(auth, "gps_photo_reviewed", "gps_photo", id, {
        "overall_status": body.overall_status,
        "coordinate_check": body.coordinate_check,
        "timestamp_check": body.timestamp_check,
        "duplicate_check": body.duplicate_check,
    }))
    await db.commit()
    await db.refresh(photo)
    return _serialize_gps_photo(photo)


# =====================================================================
# 5) IVA VISITS
# =====================================================================

@router.post("/iva-visits", tags=["iva-visits"], status_code=201)
async def schedule_iva_visit(
    body: IVAVisitCreate,
    auth: AuthContext = Depends(require_module_write("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """Schedule a new IVA site visit."""
    # Verify milestone exists
    ms = await db.execute(select(Milestone).where(Milestone.id == body.milestone_id))
    if not ms.scalar_one_or_none():
        raise HTTPException(404, "Milestone not found")

    visit = IVAVisit(
        site_id=body.site_id,
        milestone_id=body.milestone_id,
        trigger_reason=body.trigger_reason,
        iva_name=body.iva_name,
        scheduled_date=body.scheduled_date,
        status="pending",
    )
    db.add(visit)
    db.add(_audit(auth, "iva_visit_scheduled", "iva_visit", visit.id, {
        "site_id": body.site_id,
        "milestone_id": body.milestone_id,
        "trigger_reason": body.trigger_reason,
    }))
    await db.commit()
    await db.refresh(visit)
    return _serialize_iva_visit(visit)


@router.get("/iva-visits", tags=["iva-visits"])
async def list_iva_visits(
    milestone_id: Optional[str] = Query(None),
    site_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    auth: AuthContext = Depends(require_module("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """List IVA visits with optional filters."""
    query = select(IVAVisit).order_by(IVAVisit.created_at.desc())

    if milestone_id:
        query = query.where(IVAVisit.milestone_id == milestone_id)
    if site_id:
        query = query.where(IVAVisit.site_id == site_id)
    if status:
        query = query.where(IVAVisit.status == status)

    result = await db.execute(query)
    visits = result.scalars().all()
    return {"visits": [_serialize_iva_visit(v) for v in visits], "total": len(visits)}


@router.put("/iva-visits/{id}", tags=["iva-visits"])
async def update_iva_visit(
    id: str,
    body: IVAVisitUpdate,
    auth: AuthContext = Depends(require_module_write("disbursement")),
    db: AsyncSession = Depends(get_db),
):
    """Update IVA visit status, results, and notes."""
    result = await db.execute(select(IVAVisit).where(IVAVisit.id == id))
    visit = result.scalar_one_or_none()
    if not visit:
        raise HTTPException(404, "IVA visit not found")

    changes = {}
    for field in ("status", "completed_date", "field_report_key",
                  "verification_result", "notes"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(visit, field, val)
            changes[field] = str(val)

    db.add(_audit(auth, "iva_visit_updated", "iva_visit", id, changes))
    await db.commit()
    await db.refresh(visit)
    return _serialize_iva_visit(visit)
