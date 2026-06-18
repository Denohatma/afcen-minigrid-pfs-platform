from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    Milestone, MilestoneEvidence, Tender, BidEvaluation,
    TenderSubmission, PortfolioSite, Portfolio, AuditLog,
    utcnow, new_uuid,
)
from app.dependencies.auth import AuthContext, get_current_user, require_role

router = APIRouter()

# --- Schemas ---

MILESTONE_DEFINITIONS = [
    {
        "number": 1,
        "title": "Construction Completion & Commissioning",
        "description": "Minigrid constructed, commissioned, and providing electricity. "
                       "Evidence: commissioning certificate, photos, GPS verification.",
        "tranche_pct": 0.30,
    },
    {
        "number": 2,
        "title": "Connections Target & 6-Month Operations",
        "description": "Minimum connection target met and 6 months of continuous operation. "
                       "Evidence: metering data, connection records, customer registry.",
        "tranche_pct": 0.40,
    },
    {
        "number": 3,
        "title": "Performance Verification & PUE Achievement",
        "description": "12-month performance targets met including PUE connections. "
                       "Evidence: 12-month metering data, PUE verification, customer satisfaction survey.",
        "tranche_pct": 0.30,
    },
]


class EvidenceSubmit(BaseModel):
    files: list[dict] = []  # [{file_name, file_type, file_size, storage_key, description}]
    kpi_data: dict = {}


class ReviewBody(BaseModel):
    status: str  # "approved" or "revision_required"
    notes: str = ""


class ApproveBody(BaseModel):
    notes: str = ""


class DisburseBody(BaseModel):
    payment_reference: str
    notes: str = ""


# --- Routes ---


@router.post("/disbursements/setup/{tender_id}")
async def setup_milestones(
    tender_id: str,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Create milestones (3 per site) for all awarded sites in a tender."""
    # Verify tender is awarded
    tender_result = await db.execute(select(Tender).where(Tender.id == tender_id))
    tender = tender_result.scalar_one_or_none()
    if not tender:
        raise HTTPException(404, "Tender not found")
    if tender.status != "awarded":
        raise HTTPException(400, f"Tender must be awarded first, currently '{tender.status}'")

    # Get awarded evaluation to find developer
    eval_result = await db.execute(
        select(BidEvaluation).where(
            BidEvaluation.tender_id == tender_id,
            BidEvaluation.award_approved == True,
        )
    )
    awarded_eval = eval_result.scalar_one_or_none()
    if not awarded_eval:
        raise HTTPException(400, "No awarded evaluation found for this tender")

    # Get developer ID from the submission
    sub_result = await db.execute(
        select(TenderSubmission).where(TenderSubmission.id == awarded_eval.submission_id)
    )
    submission = sub_result.scalar_one_or_none()
    developer_id = submission.developer_id if submission else None

    # Get portfolio sites
    sites_result = await db.execute(
        select(PortfolioSite).where(PortfolioSite.portfolio_id == tender.portfolio_id)
    )
    portfolio_sites = sites_result.scalars().all()

    if not portfolio_sites:
        raise HTTPException(400, "No sites found in the tender portfolio")

    # Get portfolio for grant amount
    portfolio_result = await db.execute(
        select(Portfolio).where(Portfolio.id == tender.portfolio_id)
    )
    portfolio = portfolio_result.scalar_one_or_none()

    milestones_created = 0

    for ps in portfolio_sites:
        # Calculate site-level grant from results if available
        results = ps.results or {}
        pbg = results.get("pbg_calculator", {})
        site_grant = pbg.get("grant_total_usd", 0)

        # If no PFS results, estimate based on portfolio total
        if site_grant == 0 and portfolio and portfolio.total_grant_usd > 0:
            site_grant = portfolio.total_grant_usd / len(portfolio_sites)

        site_name = ""
        sd = ps.settlement_data or {}
        site_name = sd.get("village", sd.get("site_name", f"Site-{ps.settlement_rank}"))

        # Check if milestones already exist for this site
        existing = await db.execute(
            select(Milestone).where(
                Milestone.portfolio_site_id == ps.id,
                Milestone.tender_id == tender_id,
            )
        )
        if existing.scalars().first():
            continue

        for mdef in MILESTONE_DEFINITIONS:
            milestone = Milestone(
                portfolio_site_id=ps.id,
                site_name=site_name,
                tender_id=tender_id,
                developer_id=developer_id,
                milestone_number=mdef["number"],
                title=mdef["title"],
                description=mdef["description"],
                tranche_pct=mdef["tranche_pct"],
                grant_amount_usd=round(site_grant * mdef["tranche_pct"], 2),
                status="not_started",
            )
            db.add(milestone)
            milestones_created += 1

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="milestones_created",
        entity_type="tender",
        entity_id=tender_id,
        details={
            "milestones_created": milestones_created,
            "sites": len(portfolio_sites),
        },
    )
    db.add(audit)

    await db.commit()

    return {
        "tender_id": tender_id,
        "milestones_created": milestones_created,
        "sites_covered": len(portfolio_sites),
        "milestones_per_site": len(MILESTONE_DEFINITIONS),
    }


@router.get("/disbursements")
async def list_milestones(
    status: Optional[str] = None,
    developer_id: Optional[str] = None,
    site_name: Optional[str] = None,
    tender_id: Optional[str] = None,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all milestones with optional filters."""
    query = select(Milestone).order_by(Milestone.site_name, Milestone.milestone_number)

    if status:
        query = query.where(Milestone.status == status)
    if developer_id:
        query = query.where(Milestone.developer_id == developer_id)
    if site_name:
        query = query.where(Milestone.site_name.ilike(f"%{site_name}%"))
    if tender_id:
        query = query.where(Milestone.tender_id == tender_id)

    result = await db.execute(query)
    milestones = result.scalars().all()

    return {
        "milestones": [
            {
                "id": m.id,
                "portfolio_site_id": m.portfolio_site_id,
                "site_name": m.site_name,
                "tender_id": m.tender_id,
                "developer_id": m.developer_id,
                "milestone_number": m.milestone_number,
                "title": m.title,
                "tranche_pct": m.tranche_pct,
                "grant_amount_usd": m.grant_amount_usd,
                "status": m.status,
                "target_date": str(m.target_date) if m.target_date else None,
                "submitted_at": str(m.submitted_at) if m.submitted_at else None,
                "approved_at": str(m.approved_at) if m.approved_at else None,
                "disbursed_at": str(m.disbursed_at) if m.disbursed_at else None,
            }
            for m in milestones
        ],
        "total": len(milestones),
    }


@router.get("/disbursements/dashboard")
async def disbursement_dashboard(
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate dashboard stats for RBF grant disbursements."""
    all_result = await db.execute(select(Milestone))
    all_milestones = all_result.scalars().all()

    total_committed = sum(m.grant_amount_usd for m in all_milestones)
    total_disbursed = sum(m.grant_amount_usd for m in all_milestones if m.status == "disbursed")
    total_approved = sum(m.grant_amount_usd for m in all_milestones if m.status == "approved")
    total_submitted = sum(m.grant_amount_usd for m in all_milestones if m.status == "submitted")
    total_remaining = total_committed - total_disbursed

    by_status = {}
    for m in all_milestones:
        if m.status not in by_status:
            by_status[m.status] = {"count": 0, "amount_usd": 0.0}
        by_status[m.status]["count"] += 1
        by_status[m.status]["amount_usd"] += m.grant_amount_usd

    # Unique sites and developers
    site_ids = set(m.portfolio_site_id for m in all_milestones if m.portfolio_site_id)
    developer_ids = set(m.developer_id for m in all_milestones if m.developer_id)

    return {
        "total_committed_usd": round(total_committed, 2),
        "total_disbursed_usd": round(total_disbursed, 2),
        "total_approved_pending_disbursement_usd": round(total_approved, 2),
        "total_submitted_under_review_usd": round(total_submitted, 2),
        "total_remaining_usd": round(total_remaining, 2),
        "disbursement_rate_pct": round(total_disbursed / total_committed * 100, 1) if total_committed > 0 else 0.0,
        "total_milestones": len(all_milestones),
        "total_sites": len(site_ids),
        "total_developers": len(developer_ids),
        "by_status": by_status,
    }


@router.get("/disbursements/{milestone_id}")
async def get_milestone(
    milestone_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get milestone details with evidence."""
    result = await db.execute(
        select(Milestone).where(Milestone.id == milestone_id)
    )
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(404, "Milestone not found")

    evidence_result = await db.execute(
        select(MilestoneEvidence).where(MilestoneEvidence.milestone_id == milestone_id)
    )
    evidence = evidence_result.scalars().all()

    return {
        "id": milestone.id,
        "portfolio_site_id": milestone.portfolio_site_id,
        "site_name": milestone.site_name,
        "tender_id": milestone.tender_id,
        "developer_id": milestone.developer_id,
        "milestone_number": milestone.milestone_number,
        "title": milestone.title,
        "description": milestone.description,
        "tranche_pct": milestone.tranche_pct,
        "grant_amount_usd": milestone.grant_amount_usd,
        "status": milestone.status,
        "target_date": str(milestone.target_date) if milestone.target_date else None,
        "submitted_at": str(milestone.submitted_at) if milestone.submitted_at else None,
        "reviewed_at": str(milestone.reviewed_at) if milestone.reviewed_at else None,
        "approved_at": str(milestone.approved_at) if milestone.approved_at else None,
        "disbursed_at": str(milestone.disbursed_at) if milestone.disbursed_at else None,
        "payment_reference": milestone.payment_reference,
        "reviewer_notes": milestone.reviewer_notes,
        "kpi_data": milestone.kpi_data,
        "evidence": [
            {
                "id": e.id,
                "file_name": e.file_name,
                "file_type": e.file_type,
                "file_size": e.file_size,
                "storage_key": e.storage_key,
                "description": e.description,
                "verified": e.verified,
                "verified_by": e.verified_by,
                "verification_notes": e.verification_notes,
                "uploaded_at": str(e.uploaded_at),
            }
            for e in evidence
        ],
    }


@router.post("/disbursements/{milestone_id}/submit")
async def submit_milestone_evidence(
    milestone_id: str,
    body: EvidenceSubmit,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Developer submits milestone completion evidence."""
    result = await db.execute(
        select(Milestone).where(Milestone.id == milestone_id)
    )
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(404, "Milestone not found")

    if milestone.status not in ("not_started", "revision_required"):
        raise HTTPException(
            400,
            f"Milestone cannot be submitted in '{milestone.status}' status"
        )

    # Create evidence records
    for f in body.files:
        evidence = MilestoneEvidence(
            milestone_id=milestone_id,
            file_name=f.get("file_name", "unknown"),
            file_type=f.get("file_type", ""),
            file_size=f.get("file_size", 0),
            storage_key=f.get("storage_key", ""),
            description=f.get("description", ""),
        )
        db.add(evidence)

    milestone.status = "submitted"
    milestone.submitted_at = utcnow()
    if body.kpi_data:
        milestone.kpi_data = body.kpi_data

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="milestone_submitted",
        entity_type="milestone",
        entity_id=milestone_id,
        details={
            "site_name": milestone.site_name,
            "milestone_number": milestone.milestone_number,
            "files_count": len(body.files),
        },
    )
    db.add(audit)

    await db.commit()
    return {
        "id": milestone_id,
        "status": "submitted",
        "submitted_at": str(milestone.submitted_at),
        "files_uploaded": len(body.files),
    }


@router.put("/disbursements/{milestone_id}/review")
async def review_milestone(
    milestone_id: str,
    body: ReviewBody,
    auth: AuthContext = Depends(require_role("government_officer", "afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Government officer reviews milestone evidence."""
    result = await db.execute(
        select(Milestone).where(Milestone.id == milestone_id)
    )
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(404, "Milestone not found")

    if milestone.status != "submitted":
        raise HTTPException(400, f"Milestone must be in 'submitted' status, currently '{milestone.status}'")

    if body.status not in ("approved", "revision_required"):
        raise HTTPException(400, "Review status must be 'approved' or 'revision_required'")

    milestone.status = body.status
    milestone.reviewed_at = utcnow()
    milestone.reviewer_notes = body.notes

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="milestone_reviewed",
        entity_type="milestone",
        entity_id=milestone_id,
        details={
            "site_name": milestone.site_name,
            "milestone_number": milestone.milestone_number,
            "review_status": body.status,
        },
    )
    db.add(audit)

    await db.commit()
    return {
        "id": milestone_id,
        "status": milestone.status,
        "reviewed_at": str(milestone.reviewed_at),
        "reviewer_notes": milestone.reviewer_notes,
    }


@router.put("/disbursements/{milestone_id}/approve")
async def approve_milestone(
    milestone_id: str,
    body: ApproveBody,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Program Manager approves milestone for disbursement."""
    result = await db.execute(
        select(Milestone).where(Milestone.id == milestone_id)
    )
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(404, "Milestone not found")

    if milestone.status != "approved":
        raise HTTPException(400, f"Milestone must be reviewed and approved first, currently '{milestone.status}'")

    milestone.approved_at = utcnow()
    if body.notes:
        milestone.reviewer_notes = (milestone.reviewer_notes or "") + f"\nPM: {body.notes}"

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="milestone_pm_approved",
        entity_type="milestone",
        entity_id=milestone_id,
        details={
            "site_name": milestone.site_name,
            "milestone_number": milestone.milestone_number,
            "grant_amount_usd": milestone.grant_amount_usd,
        },
    )
    db.add(audit)

    await db.commit()
    return {
        "id": milestone_id,
        "status": milestone.status,
        "approved_at": str(milestone.approved_at),
        "grant_amount_usd": milestone.grant_amount_usd,
    }


@router.put("/disbursements/{milestone_id}/disburse")
async def disburse_milestone(
    milestone_id: str,
    body: DisburseBody,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Mark milestone as disbursed with payment reference."""
    result = await db.execute(
        select(Milestone).where(Milestone.id == milestone_id)
    )
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(404, "Milestone not found")

    if milestone.status != "approved":
        raise HTTPException(400, f"Milestone must be approved before disbursement, currently '{milestone.status}'")

    if not body.payment_reference:
        raise HTTPException(400, "Payment reference is required")

    milestone.status = "disbursed"
    milestone.disbursed_at = utcnow()
    milestone.payment_reference = body.payment_reference
    if body.notes:
        milestone.reviewer_notes = (milestone.reviewer_notes or "") + f"\nDisbursement: {body.notes}"

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="milestone_disbursed",
        entity_type="milestone",
        entity_id=milestone_id,
        details={
            "site_name": milestone.site_name,
            "milestone_number": milestone.milestone_number,
            "grant_amount_usd": milestone.grant_amount_usd,
            "payment_reference": body.payment_reference,
        },
    )
    db.add(audit)

    await db.commit()
    return {
        "id": milestone_id,
        "status": "disbursed",
        "disbursed_at": str(milestone.disbursed_at),
        "payment_reference": milestone.payment_reference,
        "grant_amount_usd": milestone.grant_amount_usd,
    }
