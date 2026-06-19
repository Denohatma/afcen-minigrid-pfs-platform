"""
Module 6 — Evaluation & No-Objection routes.

Covers bid evaluation lifecycle (admin check, technical/financial scoring,
AI compliance flags, human review) and World Bank no-objection packs.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.db.models import (
    Evaluation, AIFlag, NoObjectionPack,
    Bid, Tender, AuditLog, utcnow, new_uuid,
)
from app.dependencies.auth import (
    AuthContext, get_current_user,
    require_module, require_module_write,
)

router = APIRouter()


# ── Pydantic Schemas ────────────────────────────────────────────────


class AdminCheckBody(BaseModel):
    admin_responsive: bool
    admin_notes: str = ""


class TechnicalScoreBody(BaseModel):
    technical_score: float = Field(..., ge=0, le=100)
    technical_threshold_met: bool
    criteria_scores: dict = Field(default_factory=dict)
    audit_notes: str = ""


class FinancialScoreBody(BaseModel):
    financial_score: float = Field(..., ge=0, le=100)
    experience_score: Optional[float] = Field(None, ge=0, le=100)
    es_score: Optional[float] = Field(None, ge=0, le=100)
    audit_notes: str = ""


class RecommendBody(BaseModel):
    recommended_for_award: bool = True
    audit_notes: str = ""


class AIFlagCreate(BaseModel):
    entity_id: Optional[str] = None
    flag_type: str
    severity: str = "medium"
    recommendation_text: str = ""


class AIFlagAction(BaseModel):
    human_action: str = Field(..., pattern="^(accept|override)$")
    override_reason: Optional[str] = None


class NoObjectionCreate(BaseModel):
    lot_id: str
    tender_id: str
    procurement_report: dict = Field(default_factory=dict)
    attachments: list = Field(default_factory=list)
    comments: str = ""


class WBApprovalBody(BaseModel):
    comments: str = ""


# ── Helper ──────────────────────────────────────────────────────────


def _evaluation_to_dict(ev: Evaluation, include_flags: bool = False) -> dict:
    """Serialise an Evaluation ORM instance to a plain dict."""
    d = {
        "id": ev.id,
        "bid_id": ev.bid_id,
        "tender_id": ev.tender_id,
        "evaluator_id": ev.evaluator_id,
        "coi_status": ev.coi_status,
        "coi_declaration": ev.coi_declaration,
        "admin_responsive": ev.admin_responsive,
        "admin_notes": ev.admin_notes,
        "technical_score": ev.technical_score,
        "technical_threshold_met": ev.technical_threshold_met,
        "financial_score": ev.financial_score,
        "experience_score": ev.experience_score,
        "es_score": ev.es_score,
        "total_score": ev.total_score,
        "criteria_scores": ev.criteria_scores,
        "clarifications": ev.clarifications,
        "ai_flags_reviewed": ev.ai_flags_reviewed,
        "audit_notes": ev.audit_notes,
        "status": ev.status,
        "recommended_for_award": ev.recommended_for_award,
        "created_at": str(ev.created_at) if ev.created_at else None,
        "updated_at": str(ev.updated_at) if ev.updated_at else None,
    }
    if include_flags and ev.ai_flags:
        d["ai_flags"] = [_flag_to_dict(f) for f in ev.ai_flags]
    return d


def _flag_to_dict(f: AIFlag) -> dict:
    return {
        "id": f.id,
        "evaluation_id": f.evaluation_id,
        "entity_id": f.entity_id,
        "flag_type": f.flag_type,
        "severity": f.severity,
        "recommendation_text": f.recommendation_text,
        "human_action": f.human_action,
        "override_reason": f.override_reason,
        "evaluator_id": f.evaluator_id,
        "timestamp": str(f.timestamp) if f.timestamp else None,
    }


def _recalculate_total(ev: Evaluation) -> None:
    """Recalculate total_score from component scores (QCBS-style weights)."""
    tech = ev.technical_score or 0.0
    fin = ev.financial_score or 0.0
    exp = ev.experience_score or 0.0
    es = ev.es_score or 0.0
    # Weighted: technical 40%, financial 30%, experience 20%, E&S 10%
    ev.total_score = round(tech * 0.40 + fin * 0.30 + exp * 0.20 + es * 0.10, 2)


def _pack_to_dict(p: NoObjectionPack) -> dict:
    return {
        "id": p.id,
        "lot_id": p.lot_id,
        "tender_id": p.tender_id,
        "procurement_report": p.procurement_report,
        "attachments": p.attachments,
        "submission_date": str(p.submission_date) if p.submission_date else None,
        "wb_status": p.wb_status,
        "comments": p.comments,
        "approval_date": str(p.approval_date) if p.approval_date else None,
        "created_at": str(p.created_at) if p.created_at else None,
    }


# ── 1. Create evaluations for all bids in a tender ─────────────────


@router.post("/evaluations/tender/{tender_id}/create")
async def create_evaluations_for_tender(
    tender_id: str,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Create evaluation records for every bid under a tender."""
    # Verify tender exists
    tender = (await db.execute(
        select(Tender).where(Tender.id == tender_id)
    )).scalar_one_or_none()
    if not tender:
        raise HTTPException(404, "Tender not found")

    # Fetch bids
    bids = (await db.execute(
        select(Bid).where(Bid.tender_id == tender_id)
    )).scalars().all()
    if not bids:
        raise HTTPException(400, "No bids found for this tender")

    created: list[dict] = []
    for bid in bids:
        # Skip if evaluation already exists for this bid
        existing = (await db.execute(
            select(Evaluation).where(Evaluation.bid_id == bid.id)
        )).scalar_one_or_none()
        if existing:
            continue

        evaluation = Evaluation(
            bid_id=bid.id,
            tender_id=tender_id,
            evaluator_id=auth.user_id,
            status="pending",
        )
        db.add(evaluation)
        await db.flush()

        created.append({
            "evaluation_id": evaluation.id,
            "bid_id": bid.id,
            "bidder_id": bid.bidder_id,
        })

    # Audit
    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="evaluations_created",
        entity_type="tender",
        entity_id=tender_id,
        after_json={"count": len(created)},
    ))

    await db.commit()

    return {
        "tender_id": tender_id,
        "evaluations_created": len(created),
        "results": created,
    }


# ── 2. List evaluations for a tender ───────────────────────────────


@router.get("/evaluations/tender/{tender_id}")
async def list_tender_evaluations(
    tender_id: str,
    auth: AuthContext = Depends(require_module("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Return all evaluations for a tender, ordered by total_score desc."""
    evals = (await db.execute(
        select(Evaluation)
        .where(Evaluation.tender_id == tender_id)
        .order_by(Evaluation.total_score.desc().nullslast())
    )).scalars().all()

    return {
        "tender_id": tender_id,
        "total": len(evals),
        "evaluations": [_evaluation_to_dict(ev) for ev in evals],
    }


# ── 3. Get single evaluation with AI flags ─────────────────────────


@router.get("/evaluations/{evaluation_id}")
async def get_evaluation(
    evaluation_id: str,
    auth: AuthContext = Depends(require_module("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Get a single evaluation with its AI flags loaded."""
    result = await db.execute(
        select(Evaluation)
        .options(selectinload(Evaluation.ai_flags))
        .where(Evaluation.id == evaluation_id)
    )
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "Evaluation not found")

    return _evaluation_to_dict(ev, include_flags=True)


# ── 4. Admin responsiveness check ──────────────────────────────────


@router.put("/evaluations/{evaluation_id}/admin-check")
async def admin_responsiveness_check(
    evaluation_id: str,
    body: AdminCheckBody,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Record whether a bid passes administrative responsiveness."""
    ev = (await db.execute(
        select(Evaluation).where(Evaluation.id == evaluation_id)
    )).scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "Evaluation not found")

    ev.admin_responsive = body.admin_responsive
    ev.admin_notes = body.admin_notes
    ev.status = "admin_checked" if body.admin_responsive else "admin_rejected"
    ev.updated_at = utcnow()

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="admin_check",
        entity_type="evaluation",
        entity_id=evaluation_id,
        after_json={"admin_responsive": body.admin_responsive},
    ))

    await db.commit()

    return _evaluation_to_dict(ev)


# ── 5. Set technical scores ────────────────────────────────────────


@router.put("/evaluations/{evaluation_id}/technical-score")
async def set_technical_score(
    evaluation_id: str,
    body: TechnicalScoreBody,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Set the technical score and sub-criteria for an evaluation."""
    ev = (await db.execute(
        select(Evaluation).where(Evaluation.id == evaluation_id)
    )).scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "Evaluation not found")

    if ev.admin_responsive is None:
        raise HTTPException(400, "Admin responsiveness check must be completed first")
    if ev.admin_responsive is False:
        raise HTTPException(400, "Bid was marked as not administratively responsive")

    ev.technical_score = body.technical_score
    ev.technical_threshold_met = body.technical_threshold_met
    ev.criteria_scores = {**(ev.criteria_scores or {}), **body.criteria_scores}
    if body.audit_notes:
        ev.audit_notes = (ev.audit_notes or "") + f"\n[tech] {body.audit_notes}"
    ev.status = "technical_scored"
    ev.updated_at = utcnow()
    _recalculate_total(ev)

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="technical_score_set",
        entity_type="evaluation",
        entity_id=evaluation_id,
        after_json={
            "technical_score": body.technical_score,
            "threshold_met": body.technical_threshold_met,
        },
    ))

    await db.commit()

    return _evaluation_to_dict(ev)


# ── 6. Set financial scores ────────────────────────────────────────


@router.put("/evaluations/{evaluation_id}/financial-score")
async def set_financial_score(
    evaluation_id: str,
    body: FinancialScoreBody,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Set the financial (and optional experience/E&S) scores."""
    ev = (await db.execute(
        select(Evaluation).where(Evaluation.id == evaluation_id)
    )).scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "Evaluation not found")

    if ev.technical_score is None:
        raise HTTPException(400, "Technical scoring must be completed first")
    if ev.technical_threshold_met is False:
        raise HTTPException(400, "Bid did not meet the technical threshold")

    ev.financial_score = body.financial_score
    if body.experience_score is not None:
        ev.experience_score = body.experience_score
    if body.es_score is not None:
        ev.es_score = body.es_score
    if body.audit_notes:
        ev.audit_notes = (ev.audit_notes or "") + f"\n[fin] {body.audit_notes}"
    ev.status = "financial_scored"
    ev.updated_at = utcnow()
    _recalculate_total(ev)

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="financial_score_set",
        entity_type="evaluation",
        entity_id=evaluation_id,
        after_json={
            "financial_score": body.financial_score,
            "total_score": ev.total_score,
        },
    ))

    await db.commit()

    return _evaluation_to_dict(ev)


# ── 7. Recommend for award ─────────────────────────────────────────


@router.put("/evaluations/{evaluation_id}/recommend")
async def recommend_for_award(
    evaluation_id: str,
    body: RecommendBody,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Mark an evaluation as recommended (or not) for award."""
    ev = (await db.execute(
        select(Evaluation).where(Evaluation.id == evaluation_id)
    )).scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "Evaluation not found")

    if ev.total_score is None:
        raise HTTPException(400, "Scoring must be completed before recommendation")

    ev.recommended_for_award = body.recommended_for_award
    ev.status = "recommended" if body.recommended_for_award else "not_recommended"
    if body.audit_notes:
        ev.audit_notes = (ev.audit_notes or "") + f"\n[recommend] {body.audit_notes}"
    ev.updated_at = utcnow()

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="bid_recommended" if body.recommended_for_award else "bid_not_recommended",
        entity_type="evaluation",
        entity_id=evaluation_id,
        after_json={"recommended_for_award": body.recommended_for_award},
    ))

    await db.commit()

    return _evaluation_to_dict(ev)


# ── 8. Create AI flag ──────────────────────────────────────────────


@router.post("/evaluations/{evaluation_id}/ai-flags")
async def create_ai_flag(
    evaluation_id: str,
    body: AIFlagCreate,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Create an AI compliance flag against an evaluation."""
    ev = (await db.execute(
        select(Evaluation).where(Evaluation.id == evaluation_id)
    )).scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "Evaluation not found")

    flag = AIFlag(
        evaluation_id=evaluation_id,
        entity_id=body.entity_id,
        flag_type=body.flag_type,
        severity=body.severity,
        recommendation_text=body.recommendation_text,
    )
    db.add(flag)

    # Mark evaluation as needing AI-flag review
    ev.ai_flags_reviewed = False
    ev.updated_at = utcnow()

    await db.flush()
    await db.commit()

    return _flag_to_dict(flag)


# ── 9. Human action on AI flag ─────────────────────────────────────


@router.put("/ai-flags/{flag_id}/action")
async def action_on_ai_flag(
    flag_id: str,
    body: AIFlagAction,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Accept or override an AI flag with human justification."""
    flag = (await db.execute(
        select(AIFlag).where(AIFlag.id == flag_id)
    )).scalar_one_or_none()
    if not flag:
        raise HTTPException(404, "AI flag not found")

    if flag.human_action is not None:
        raise HTTPException(400, "This flag has already been actioned")

    if body.human_action == "override" and not body.override_reason:
        raise HTTPException(400, "override_reason is required when overriding a flag")

    flag.human_action = body.human_action
    flag.override_reason = body.override_reason
    flag.evaluator_id = auth.user_id
    flag.timestamp = utcnow()

    # Check whether all flags on this evaluation have been actioned
    all_flags = (await db.execute(
        select(AIFlag).where(AIFlag.evaluation_id == flag.evaluation_id)
    )).scalars().all()
    all_reviewed = all(f.human_action is not None for f in all_flags)

    if all_reviewed:
        ev = (await db.execute(
            select(Evaluation).where(Evaluation.id == flag.evaluation_id)
        )).scalar_one_or_none()
        if ev:
            ev.ai_flags_reviewed = True
            ev.updated_at = utcnow()

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action=f"ai_flag_{body.human_action}",
        entity_type="ai_flag",
        entity_id=flag_id,
        after_json={
            "evaluation_id": flag.evaluation_id,
            "flag_type": flag.flag_type,
            "human_action": body.human_action,
            "override_reason": body.override_reason,
        },
    ))

    await db.commit()

    return _flag_to_dict(flag)


# ── 10. List AI flags for an evaluation ────────────────────────────


@router.get("/evaluations/{evaluation_id}/ai-flags")
async def list_ai_flags(
    evaluation_id: str,
    auth: AuthContext = Depends(require_module("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """List all AI flags for a given evaluation."""
    # Verify evaluation exists
    ev = (await db.execute(
        select(Evaluation).where(Evaluation.id == evaluation_id)
    )).scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "Evaluation not found")

    flags = (await db.execute(
        select(AIFlag)
        .where(AIFlag.evaluation_id == evaluation_id)
        .order_by(AIFlag.timestamp.desc())
    )).scalars().all()

    return {
        "evaluation_id": evaluation_id,
        "total": len(flags),
        "all_reviewed": ev.ai_flags_reviewed,
        "flags": [_flag_to_dict(f) for f in flags],
    }


# ── 11. Create no-objection pack ───────────────────────────────────


@router.post("/no-objection")
async def create_no_objection_pack(
    body: NoObjectionCreate,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Create a World Bank no-objection pack for a lot."""
    # Verify tender exists
    tender = (await db.execute(
        select(Tender).where(Tender.id == body.tender_id)
    )).scalar_one_or_none()
    if not tender:
        raise HTTPException(404, "Tender not found")

    # Check for duplicate
    existing = (await db.execute(
        select(NoObjectionPack).where(NoObjectionPack.lot_id == body.lot_id)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "No-objection pack already exists for this lot")

    pack = NoObjectionPack(
        lot_id=body.lot_id,
        tender_id=body.tender_id,
        procurement_report=body.procurement_report,
        attachments=body.attachments,
        comments=body.comments,
        wb_status="not_submitted",
    )
    db.add(pack)

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="no_objection_created",
        entity_type="no_objection_pack",
        entity_id=pack.id,
        after_json={"lot_id": body.lot_id, "tender_id": body.tender_id},
    ))

    await db.flush()
    await db.commit()

    return _pack_to_dict(pack)


# ── 12. Get no-objection pack by lot ───────────────────────────────


@router.get("/no-objection/lot/{lot_id}")
async def get_no_objection_pack(
    lot_id: str,
    auth: AuthContext = Depends(require_module("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve the no-objection pack for a lot."""
    pack = (await db.execute(
        select(NoObjectionPack).where(NoObjectionPack.lot_id == lot_id)
    )).scalar_one_or_none()
    if not pack:
        raise HTTPException(404, "No-objection pack not found for this lot")

    return _pack_to_dict(pack)


# ── 13. Submit no-objection pack to WB ─────────────────────────────


@router.put("/no-objection/{pack_id}/submit")
async def submit_no_objection(
    pack_id: str,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Submit a no-objection pack to the World Bank for review."""
    pack = (await db.execute(
        select(NoObjectionPack).where(NoObjectionPack.id == pack_id)
    )).scalar_one_or_none()
    if not pack:
        raise HTTPException(404, "No-objection pack not found")

    if pack.wb_status not in ("not_submitted", "returned"):
        raise HTTPException(
            400,
            f"Pack cannot be submitted from status '{pack.wb_status}'"
        )

    pack.wb_status = "submitted"
    pack.submission_date = utcnow()

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="no_objection_submitted",
        entity_type="no_objection_pack",
        entity_id=pack_id,
        after_json={"wb_status": "submitted"},
    ))

    await db.commit()

    return _pack_to_dict(pack)


# ── 14. WB approval of no-objection pack ──────────────────────────


@router.put("/no-objection/{pack_id}/approve")
async def approve_no_objection(
    pack_id: str,
    body: WBApprovalBody,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Record World Bank approval (or return) of a no-objection pack."""
    pack = (await db.execute(
        select(NoObjectionPack).where(NoObjectionPack.id == pack_id)
    )).scalar_one_or_none()
    if not pack:
        raise HTTPException(404, "No-objection pack not found")

    if pack.wb_status != "submitted":
        raise HTTPException(400, "Pack must be in 'submitted' status to approve")

    pack.wb_status = "approved"
    pack.approval_date = utcnow()
    if body.comments:
        pack.comments = (pack.comments or "") + f"\n[WB] {body.comments}"

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="no_objection_approved",
        entity_type="no_objection_pack",
        entity_id=pack_id,
        after_json={"wb_status": "approved"},
    ))

    await db.commit()

    return _pack_to_dict(pack)
