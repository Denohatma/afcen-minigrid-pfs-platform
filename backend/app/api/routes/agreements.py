"""
Module 7 — Grant Agreement Management
Module 8 — Conditions Precedent (CP) Tracker

Routes for creating/managing grant agreements and tracking
conditions precedent through submission, verification, and waiver workflows.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.db.models import (
    GrantAgreement, ConditionPrecedent, AuditLog, utcnow, new_uuid,
)
from app.dependencies.auth import (
    AuthContext, get_current_user, require_module, require_module_write,
)

router = APIRouter()


# ── Pydantic Schemas ────────────────────────────────────────────────


class AgreementCreate(BaseModel):
    lot_id: str
    bidder_id: str
    grant_amount_usd: float = 0.0
    eligible_capex_ceiling_usd: float = 0.0
    grant_pct: float = 0.0
    tranche_rules: dict = {}
    currency: str = "USD"
    ringfenced_amount: float = 0.0
    pbg_assignment_status: str = "not_assigned"
    pbg_lender: str = ""
    agreement_date: Optional[str] = None
    agreement_data: dict = {}


class AgreementUpdate(BaseModel):
    grant_amount_usd: Optional[float] = None
    eligible_capex_ceiling_usd: Optional[float] = None
    grant_pct: Optional[float] = None
    tranche_rules: Optional[dict] = None
    currency: Optional[str] = None
    ringfenced_amount: Optional[float] = None
    pbg_assignment_status: Optional[str] = None
    pbg_lender: Optional[str] = None
    agreement_date: Optional[str] = None
    agreement_data: Optional[dict] = None
    status: Optional[str] = None


class CPCreate(BaseModel):
    cp_category: str
    title: str
    description: str = ""
    evidence_type: str = ""
    owner_role: str = ""
    verifier_role: str = ""
    due_date: Optional[str] = None


class CPUpdate(BaseModel):
    cp_category: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    evidence_type: Optional[str] = None
    owner_role: Optional[str] = None
    verifier_role: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None


class CPSubmitEvidence(BaseModel):
    evidence_files: list[dict] = Field(
        default=[],
        description="List of evidence file objects: [{file_name, file_type, storage_key, description}]",
    )


class CPVerify(BaseModel):
    notes: str = ""


class CPReturn(BaseModel):
    return_reason: str


class CPWaive(BaseModel):
    waiver_authority: str
    waiver_justification: str
    waiver_expiry: Optional[str] = None


# ── Helpers ─────────────────────────────────────────────────────────


def _serialize_agreement(ag: GrantAgreement, include_cps: bool = False) -> dict:
    data = {
        "id": ag.id,
        "lot_id": ag.lot_id,
        "bidder_id": ag.bidder_id,
        "grant_amount_usd": ag.grant_amount_usd,
        "eligible_capex_ceiling_usd": ag.eligible_capex_ceiling_usd,
        "grant_pct": ag.grant_pct,
        "tranche_rules": ag.tranche_rules or {},
        "currency": ag.currency,
        "ringfenced_amount": ag.ringfenced_amount,
        "pbg_assignment_status": ag.pbg_assignment_status,
        "pbg_lender": ag.pbg_lender,
        "agreement_date": ag.agreement_date.isoformat() if ag.agreement_date else None,
        "effective_date": ag.effective_date.isoformat() if ag.effective_date else None,
        "status": ag.status,
        "agreement_data": ag.agreement_data or {},
        "created_at": ag.created_at.isoformat() if ag.created_at else None,
    }
    if include_cps:
        data["cps"] = [_serialize_cp(cp) for cp in (ag.cps or [])]
    return data


def _serialize_cp(cp: ConditionPrecedent) -> dict:
    return {
        "id": cp.id,
        "grant_agreement_id": cp.grant_agreement_id,
        "cp_category": cp.cp_category,
        "title": cp.title,
        "description": cp.description,
        "evidence_type": cp.evidence_type,
        "owner_role": cp.owner_role,
        "verifier_role": cp.verifier_role,
        "due_date": cp.due_date.isoformat() if cp.due_date else None,
        "status": cp.status,
        "evidence_files": cp.evidence_files or [],
        "submitted_at": cp.submitted_at.isoformat() if cp.submitted_at else None,
        "verified_at": cp.verified_at.isoformat() if cp.verified_at else None,
        "verified_by": cp.verified_by,
        "waiver_status": cp.waiver_status,
        "waiver_authority": cp.waiver_authority,
        "waiver_justification": cp.waiver_justification,
        "waiver_expiry": cp.waiver_expiry.isoformat() if cp.waiver_expiry else None,
        "retry_count": cp.retry_count,
        "return_reason": cp.return_reason,
        "created_at": cp.created_at.isoformat() if cp.created_at else None,
        "updated_at": cp.updated_at.isoformat() if cp.updated_at else None,
    }


def _audit(auth: AuthContext, action: str, entity_type: str, entity_id: str, before=None, after=None) -> AuditLog:
    return AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before_json=before,
        after_json=after,
    )


def _parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    return datetime.fromisoformat(value)


# ── Agreement Routes ────────────────────────────────────────────────


@router.get("/agreements/dashboard")
async def agreement_dashboard(
    auth: AuthContext = Depends(require_module("agreements")),
    db: AsyncSession = Depends(get_db),
):
    """Summary statistics for all grant agreements."""
    result = await db.execute(
        select(
            func.count(GrantAgreement.id).label("total"),
            func.sum(GrantAgreement.grant_amount_usd).label("total_grant_usd"),
            func.sum(GrantAgreement.ringfenced_amount).label("total_ringfenced_usd"),
            func.count(case((GrantAgreement.status == "draft", 1))).label("draft"),
            func.count(case((GrantAgreement.status == "pending", 1))).label("pending"),
            func.count(case((GrantAgreement.status == "active", 1))).label("active"),
            func.count(case((GrantAgreement.status == "completed", 1))).label("completed"),
            func.count(case((GrantAgreement.status == "terminated", 1))).label("terminated"),
        )
    )
    row = result.one()

    return {
        "total_agreements": row.total or 0,
        "total_grant_usd": round(row.total_grant_usd or 0, 2),
        "total_ringfenced_usd": round(row.total_ringfenced_usd or 0, 2),
        "by_status": {
            "draft": row.draft or 0,
            "pending": row.pending or 0,
            "active": row.active or 0,
            "completed": row.completed or 0,
            "terminated": row.terminated or 0,
        },
    }


@router.get("/agreements")
async def list_agreements(
    status: Optional[str] = None,
    lot_id: Optional[str] = None,
    auth: AuthContext = Depends(require_module("agreements")),
    db: AsyncSession = Depends(get_db),
):
    """List grant agreements with optional filters."""
    query = select(GrantAgreement).order_by(GrantAgreement.created_at.desc())

    if status:
        query = query.where(GrantAgreement.status == status)
    if lot_id:
        query = query.where(GrantAgreement.lot_id == lot_id)

    result = await db.execute(query)
    agreements = result.scalars().all()
    return [_serialize_agreement(ag) for ag in agreements]


@router.get("/agreements/{agreement_id}")
async def get_agreement(
    agreement_id: str,
    auth: AuthContext = Depends(require_module("agreements")),
    db: AsyncSession = Depends(get_db),
):
    """Get a single agreement with its conditions precedent."""
    result = await db.execute(
        select(GrantAgreement)
        .options(selectinload(GrantAgreement.cps))
        .where(GrantAgreement.id == agreement_id)
    )
    ag = result.scalar_one_or_none()
    if not ag:
        raise HTTPException(404, "Agreement not found")
    return _serialize_agreement(ag, include_cps=True)


@router.post("/agreements")
async def create_agreement(
    body: AgreementCreate,
    auth: AuthContext = Depends(require_module_write("agreements")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new grant agreement."""
    ag = GrantAgreement(
        lot_id=body.lot_id,
        bidder_id=body.bidder_id,
        grant_amount_usd=body.grant_amount_usd,
        eligible_capex_ceiling_usd=body.eligible_capex_ceiling_usd,
        grant_pct=body.grant_pct,
        tranche_rules=body.tranche_rules,
        currency=body.currency,
        ringfenced_amount=body.ringfenced_amount,
        pbg_assignment_status=body.pbg_assignment_status,
        pbg_lender=body.pbg_lender,
        agreement_date=_parse_date(body.agreement_date),
        status="draft",
        agreement_data=body.agreement_data,
    )
    db.add(ag)
    db.add(_audit(auth, "agreement_created", "grant_agreement", ag.id, after=body.model_dump()))
    await db.commit()
    await db.refresh(ag)
    return _serialize_agreement(ag)


@router.put("/agreements/{agreement_id}")
async def update_agreement(
    agreement_id: str,
    body: AgreementUpdate,
    auth: AuthContext = Depends(require_module_write("agreements")),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing grant agreement."""
    result = await db.execute(
        select(GrantAgreement).where(GrantAgreement.id == agreement_id)
    )
    ag = result.scalar_one_or_none()
    if not ag:
        raise HTTPException(404, "Agreement not found")

    before = _serialize_agreement(ag)
    updates = body.model_dump(exclude_unset=True)

    if "agreement_date" in updates:
        updates["agreement_date"] = _parse_date(updates["agreement_date"])

    for field, value in updates.items():
        setattr(ag, field, value)

    db.add(_audit(auth, "agreement_updated", "grant_agreement", ag.id, before=before, after=updates))
    await db.commit()
    await db.refresh(ag)
    return _serialize_agreement(ag)


@router.put("/agreements/{agreement_id}/activate")
async def activate_agreement(
    agreement_id: str,
    auth: AuthContext = Depends(require_module_write("agreements")),
    db: AsyncSession = Depends(get_db),
):
    """Activate an agreement — sets status to 'active' and records effective_date."""
    result = await db.execute(
        select(GrantAgreement)
        .options(selectinload(GrantAgreement.cps))
        .where(GrantAgreement.id == agreement_id)
    )
    ag = result.scalar_one_or_none()
    if not ag:
        raise HTTPException(404, "Agreement not found")

    if ag.status == "active":
        raise HTTPException(400, "Agreement is already active")

    # Check that all non-waived CPs are verified
    outstanding = [
        cp for cp in (ag.cps or [])
        if cp.status not in ("verified", "waived") and cp.waiver_status != "waived"
    ]
    if outstanding:
        titles = [cp.title for cp in outstanding[:5]]
        raise HTTPException(
            400,
            f"{len(outstanding)} condition(s) precedent outstanding: {', '.join(titles)}",
        )

    before_status = ag.status
    ag.status = "active"
    ag.effective_date = utcnow()

    db.add(_audit(
        auth, "agreement_activated", "grant_agreement", ag.id,
        before={"status": before_status},
        after={"status": "active", "effective_date": ag.effective_date.isoformat()},
    ))
    await db.commit()
    await db.refresh(ag)
    return _serialize_agreement(ag)


# ── Conditions Precedent Routes ─────────────────────────────────────


@router.get("/cps/dashboard")
async def cp_dashboard(
    auth: AuthContext = Depends(require_module("cp_tracker")),
    db: AsyncSession = Depends(get_db),
):
    """CP completion dashboard across all agreements."""
    result = await db.execute(
        select(
            func.count(ConditionPrecedent.id).label("total"),
            func.count(case((ConditionPrecedent.status == "not_started", 1))).label("not_started"),
            func.count(case((ConditionPrecedent.status == "in_progress", 1))).label("in_progress"),
            func.count(case((ConditionPrecedent.status == "submitted", 1))).label("submitted"),
            func.count(case((ConditionPrecedent.status == "verified", 1))).label("verified"),
            func.count(case((ConditionPrecedent.status == "returned", 1))).label("returned"),
            func.count(case((ConditionPrecedent.status == "waived", 1))).label("waived"),
        )
    )
    row = result.one()
    total = row.total or 0
    verified = (row.verified or 0) + (row.waived or 0)
    completion_pct = round(verified / total * 100, 1) if total else 0.0

    # Overdue count
    overdue_result = await db.execute(
        select(func.count(ConditionPrecedent.id)).where(
            ConditionPrecedent.due_date < utcnow(),
            ConditionPrecedent.status.notin_(["verified", "waived"]),
        )
    )
    overdue = overdue_result.scalar() or 0

    # Breakdown by category
    cat_result = await db.execute(
        select(
            ConditionPrecedent.cp_category,
            func.count(ConditionPrecedent.id),
            func.count(case((ConditionPrecedent.status.in_(["verified", "waived"]), 1))),
        ).group_by(ConditionPrecedent.cp_category)
    )
    by_category = {
        cat: {"total": cnt, "completed": comp}
        for cat, cnt, comp in cat_result.all()
    }

    return {
        "total_cps": total,
        "completion_pct": completion_pct,
        "overdue": overdue,
        "by_status": {
            "not_started": row.not_started or 0,
            "in_progress": row.in_progress or 0,
            "submitted": row.submitted or 0,
            "verified": row.verified or 0,
            "returned": row.returned or 0,
            "waived": row.waived or 0,
        },
        "by_category": by_category,
    }


@router.get("/agreements/{agreement_id}/cps")
async def list_cps(
    agreement_id: str,
    auth: AuthContext = Depends(require_module("cp_tracker")),
    db: AsyncSession = Depends(get_db),
):
    """List all conditions precedent for a given agreement."""
    # Verify agreement exists
    ag_result = await db.execute(
        select(GrantAgreement.id).where(GrantAgreement.id == agreement_id)
    )
    if not ag_result.scalar_one_or_none():
        raise HTTPException(404, "Agreement not found")

    result = await db.execute(
        select(ConditionPrecedent)
        .where(ConditionPrecedent.grant_agreement_id == agreement_id)
        .order_by(ConditionPrecedent.cp_category, ConditionPrecedent.created_at)
    )
    cps = result.scalars().all()
    return [_serialize_cp(cp) for cp in cps]


@router.post("/agreements/{agreement_id}/cps")
async def create_cp(
    agreement_id: str,
    body: CPCreate,
    auth: AuthContext = Depends(require_module_write("cp_tracker")),
    db: AsyncSession = Depends(get_db),
):
    """Create a condition precedent for an agreement."""
    ag_result = await db.execute(
        select(GrantAgreement).where(GrantAgreement.id == agreement_id)
    )
    ag = ag_result.scalar_one_or_none()
    if not ag:
        raise HTTPException(404, "Agreement not found")
    if ag.status not in ("draft", "pending"):
        raise HTTPException(400, f"Cannot add CPs to agreement in '{ag.status}' status")

    cp = ConditionPrecedent(
        grant_agreement_id=agreement_id,
        cp_category=body.cp_category,
        title=body.title,
        description=body.description,
        evidence_type=body.evidence_type,
        owner_role=body.owner_role,
        verifier_role=body.verifier_role,
        due_date=_parse_date(body.due_date),
        status="not_started",
    )
    db.add(cp)
    db.add(_audit(auth, "cp_created", "condition_precedent", cp.id, after=body.model_dump()))
    await db.commit()
    await db.refresh(cp)
    return _serialize_cp(cp)


@router.get("/cps/{cp_id}")
async def get_cp(
    cp_id: str,
    auth: AuthContext = Depends(require_module("cp_tracker")),
    db: AsyncSession = Depends(get_db),
):
    """Get a single condition precedent by ID."""
    result = await db.execute(
        select(ConditionPrecedent).where(ConditionPrecedent.id == cp_id)
    )
    cp = result.scalar_one_or_none()
    if not cp:
        raise HTTPException(404, "Condition precedent not found")
    return _serialize_cp(cp)


@router.put("/cps/{cp_id}")
async def update_cp(
    cp_id: str,
    body: CPUpdate,
    auth: AuthContext = Depends(require_module_write("cp_tracker")),
    db: AsyncSession = Depends(get_db),
):
    """Update a condition precedent."""
    result = await db.execute(
        select(ConditionPrecedent).where(ConditionPrecedent.id == cp_id)
    )
    cp = result.scalar_one_or_none()
    if not cp:
        raise HTTPException(404, "Condition precedent not found")

    before = _serialize_cp(cp)
    updates = body.model_dump(exclude_unset=True)

    if "due_date" in updates:
        updates["due_date"] = _parse_date(updates["due_date"])

    for field, value in updates.items():
        setattr(cp, field, value)

    cp.updated_at = utcnow()
    db.add(_audit(auth, "cp_updated", "condition_precedent", cp.id, before=before, after=updates))
    await db.commit()
    await db.refresh(cp)
    return _serialize_cp(cp)


@router.put("/cps/{cp_id}/submit")
async def submit_cp_evidence(
    cp_id: str,
    body: CPSubmitEvidence,
    auth: AuthContext = Depends(require_module("cp_tracker")),
    db: AsyncSession = Depends(get_db),
):
    """Submit evidence for a condition precedent."""
    result = await db.execute(
        select(ConditionPrecedent).where(ConditionPrecedent.id == cp_id)
    )
    cp = result.scalar_one_or_none()
    if not cp:
        raise HTTPException(404, "Condition precedent not found")

    if cp.status in ("verified", "waived"):
        raise HTTPException(400, f"CP is already '{cp.status}' and cannot accept new evidence")

    if not body.evidence_files:
        raise HTTPException(400, "At least one evidence file is required")

    before_status = cp.status
    cp.evidence_files = body.evidence_files
    cp.status = "submitted"
    cp.submitted_at = utcnow()
    cp.updated_at = utcnow()

    db.add(_audit(
        auth, "cp_evidence_submitted", "condition_precedent", cp.id,
        before={"status": before_status},
        after={"status": "submitted", "evidence_file_count": len(body.evidence_files)},
    ))
    await db.commit()
    await db.refresh(cp)
    return _serialize_cp(cp)


@router.put("/cps/{cp_id}/verify")
async def verify_cp(
    cp_id: str,
    body: CPVerify,
    auth: AuthContext = Depends(require_module_write("cp_tracker")),
    db: AsyncSession = Depends(get_db),
):
    """Verify a submitted condition precedent (verifier role)."""
    result = await db.execute(
        select(ConditionPrecedent).where(ConditionPrecedent.id == cp_id)
    )
    cp = result.scalar_one_or_none()
    if not cp:
        raise HTTPException(404, "Condition precedent not found")

    if cp.status != "submitted":
        raise HTTPException(400, f"CP must be in 'submitted' status to verify, currently '{cp.status}'")

    cp.status = "verified"
    cp.verified_at = utcnow()
    cp.verified_by = auth.user_id
    cp.updated_at = utcnow()

    db.add(_audit(
        auth, "cp_verified", "condition_precedent", cp.id,
        after={"status": "verified", "notes": body.notes},
    ))
    await db.commit()
    await db.refresh(cp)
    return _serialize_cp(cp)


@router.put("/cps/{cp_id}/return")
async def return_cp(
    cp_id: str,
    body: CPReturn,
    auth: AuthContext = Depends(require_module_write("cp_tracker")),
    db: AsyncSession = Depends(get_db),
):
    """Return a submitted CP with a reason for re-submission."""
    result = await db.execute(
        select(ConditionPrecedent).where(ConditionPrecedent.id == cp_id)
    )
    cp = result.scalar_one_or_none()
    if not cp:
        raise HTTPException(404, "Condition precedent not found")

    if cp.status != "submitted":
        raise HTTPException(400, f"CP must be in 'submitted' status to return, currently '{cp.status}'")

    cp.status = "returned"
    cp.return_reason = body.return_reason
    cp.retry_count = (cp.retry_count or 0) + 1
    cp.updated_at = utcnow()

    db.add(_audit(
        auth, "cp_returned", "condition_precedent", cp.id,
        after={"status": "returned", "return_reason": body.return_reason, "retry_count": cp.retry_count},
    ))
    await db.commit()
    await db.refresh(cp)
    return _serialize_cp(cp)


@router.put("/cps/{cp_id}/waive")
async def waive_cp(
    cp_id: str,
    body: CPWaive,
    auth: AuthContext = Depends(require_module_write("cp_tracker")),
    db: AsyncSession = Depends(get_db),
):
    """Waive a condition precedent with authority and justification."""
    result = await db.execute(
        select(ConditionPrecedent).where(ConditionPrecedent.id == cp_id)
    )
    cp = result.scalar_one_or_none()
    if not cp:
        raise HTTPException(404, "Condition precedent not found")

    if cp.status == "verified":
        raise HTTPException(400, "Cannot waive an already verified CP")

    cp.status = "waived"
    cp.waiver_status = "waived"
    cp.waiver_authority = body.waiver_authority
    cp.waiver_justification = body.waiver_justification
    cp.waiver_expiry = _parse_date(body.waiver_expiry)
    cp.updated_at = utcnow()

    db.add(_audit(
        auth, "cp_waived", "condition_precedent", cp.id,
        after={
            "status": "waived",
            "waiver_authority": body.waiver_authority,
            "waiver_justification": body.waiver_justification,
        },
    ))
    await db.commit()
    await db.refresh(cp)
    return _serialize_cp(cp)
