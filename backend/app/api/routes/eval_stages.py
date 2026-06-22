"""
Module 6b -- Two-Envelope Bid Submission & Staged Evaluation.

Four-stage evaluation pipeline:
  1. Administrative Responsiveness (automated)
  2. Technical Evaluation (scored, threshold)
  3. Financial Evaluation (scored, threshold)
  4. Combined Score, Ranking & Award Recommendation
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    EvaluationStage, EvaluationCriterion, EvaluationScore,
    EvaluationBidResult, BidEnvelope, EnvelopeDocument,
    BidOpeningRecord, StandstillNotification,
    EvaluationClarification, Lot, Bid, Bidder,
    AuditLog, utcnow, new_uuid,
)
from app.dependencies.auth import (
    AuthContext, get_current_user,
    require_module, require_module_write,
)

router = APIRouter()


# ── Pydantic schemas ────────────────────────────────────────────────


class CriterionSetup(BaseModel):
    stage: int
    code: str
    name: str
    weight: float
    max_score: float = 10.0
    evaluator_role: str = ""
    is_pass_fail: bool = False


class StageSetupBody(BaseModel):
    stage2_threshold: float = 70.0
    stage3_threshold: float = 0.0
    stage4_technical_weight: float = 60.0
    stage4_financial_weight: float = 40.0
    criteria: List[CriterionSetup]


class ScoreBody(BaseModel):
    criterion_id: str
    bid_id: str
    score: float
    justification: str


class RecommendBody(BaseModel):
    bid_id: str
    note: str = ""


class BidOpeningBody(BaseModel):
    committee_members: List[str] = []


class EnvelopeCreateBody(BaseModel):
    envelope_type: str
    bid_id: Optional[str] = None
    form_data: dict = {}


class EnvelopeSaveBody(BaseModel):
    form_data: dict = {}


# ── Helpers ─────────────────────────────────────────────────────────


def _stage_dict(s: EvaluationStage) -> dict:
    return {
        "id": s.id,
        "lot_id": s.lot_id,
        "stage_number": s.stage_number,
        "stage_name": s.stage_name,
        "status": s.status,
        "opened_at": str(s.opened_at) if s.opened_at else None,
        "locked_at": str(s.locked_at) if s.locked_at else None,
        "locked_by": s.locked_by,
        "lock_note": s.lock_note,
        "min_threshold_pct": s.min_threshold_pct,
        "technical_weight_pct": s.technical_weight_pct,
        "financial_weight_pct": s.financial_weight_pct,
        "created_at": str(s.created_at) if s.created_at else None,
    }


def _criterion_dict(c: EvaluationCriterion) -> dict:
    return {
        "id": c.id,
        "lot_id": c.lot_id,
        "stage_number": c.stage_number,
        "criterion_code": c.criterion_code,
        "criterion_name": c.criterion_name,
        "description": c.description,
        "max_score": c.max_score,
        "weight_pct": c.weight_pct,
        "assigned_evaluator_id": c.assigned_evaluator_id,
        "assigned_evaluator_role": c.assigned_evaluator_role,
        "is_pass_fail": c.is_pass_fail,
        "pass_fail_requirement": c.pass_fail_requirement,
    }


def _result_dict(r: EvaluationBidResult) -> dict:
    return {
        "id": r.id,
        "lot_id": r.lot_id,
        "bid_id": r.bid_id,
        "developer_id": r.developer_id,
        "stage_number": r.stage_number,
        "stage1_admin_pass": r.stage1_admin_pass,
        "stage1_fail_reasons": r.stage1_fail_reasons,
        "stage2_technical_score": r.stage2_technical_score,
        "stage2_passed_threshold": r.stage2_passed_threshold,
        "stage2_threshold_applied": r.stage2_threshold_applied,
        "stage3_financial_score": r.stage3_financial_score,
        "stage3_passed_threshold": r.stage3_passed_threshold,
        "stage3_grant_ask_usd": r.stage3_grant_ask_usd,
        "stage3_grant_ask_pct": r.stage3_grant_ask_pct,
        "stage3_within_ceiling": r.stage3_within_ceiling,
        "stage3_dscr": r.stage3_dscr,
        "stage3_tariff_residential_usd": r.stage3_tariff_residential_usd,
        "stage4_combined_score": r.stage4_combined_score,
        "stage4_rank": r.stage4_rank,
        "stage4_recommended_for_award": r.stage4_recommended_for_award,
        "stage4_recommendation_note": r.stage4_recommendation_note,
        "created_at": str(r.created_at) if r.created_at else None,
        "updated_at": str(r.updated_at) if r.updated_at else None,
    }


def _envelope_dict(e: BidEnvelope) -> dict:
    return {
        "id": e.id,
        "lot_id": e.lot_id,
        "bid_id": e.bid_id,
        "developer_id": e.developer_id,
        "envelope_type": e.envelope_type,
        "status": e.status,
        "submitted_at": str(e.submitted_at) if e.submitted_at else None,
        "encrypted": e.encrypted,
        "data_completeness_pct": e.data_completeness_pct,
        "form_data": e.form_data,
        "created_at": str(e.created_at) if e.created_at else None,
        "updated_at": str(e.updated_at) if e.updated_at else None,
    }


async def _get_lot_or_404(lot_id: str, db: AsyncSession) -> Lot:
    result = await db.execute(select(Lot).where(Lot.id == lot_id))
    lot = result.scalar_one_or_none()
    if not lot:
        raise HTTPException(404, "Lot not found")
    return lot


# =====================================================================
# STAGE SETUP & LISTING
# =====================================================================


@router.post("/eval/lots/{lot_id}/stages/setup", status_code=201)
async def setup_evaluation_stages(
    lot_id: str,
    body: StageSetupBody,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Create the 4 evaluation stages and their criteria for a lot."""
    await _get_lot_or_404(lot_id, db)

    # Check no stages already exist
    existing = await db.execute(
        select(func.count()).select_from(EvaluationStage)
        .where(EvaluationStage.lot_id == lot_id)
    )
    if (existing.scalar() or 0) > 0:
        raise HTTPException(409, "Evaluation stages already set up for this lot")

    stage_defs = [
        (1, "Administrative Responsiveness", None, None, None),
        (2, "Technical Evaluation", body.stage2_threshold, None, None),
        (3, "Financial Evaluation", body.stage3_threshold if body.stage3_threshold else None, None, None),
        (4, "Combined Score & Award", None, body.stage4_technical_weight, body.stage4_financial_weight),
    ]

    stages_out = []
    for num, name, threshold, tw, fw in stage_defs:
        stage = EvaluationStage(
            lot_id=lot_id,
            stage_number=num,
            stage_name=name,
            status="pending",
            min_threshold_pct=threshold,
            technical_weight_pct=tw,
            financial_weight_pct=fw,
        )
        db.add(stage)
        stages_out.append(stage)

    # Create criteria
    criteria_out = []
    for c in body.criteria:
        criterion = EvaluationCriterion(
            lot_id=lot_id,
            stage_number=c.stage,
            criterion_code=c.code,
            criterion_name=c.name,
            weight_pct=c.weight,
            max_score=c.max_score,
            assigned_evaluator_role=c.evaluator_role or None,
            is_pass_fail=c.is_pass_fail,
        )
        db.add(criterion)
        criteria_out.append(criterion)

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="eval_stages_setup",
        entity_type="lot",
        entity_id=lot_id,
        after_json={"stages": 4, "criteria_count": len(body.criteria)},
    ))

    await db.flush()
    await db.commit()

    return {
        "lot_id": lot_id,
        "stages": [_stage_dict(s) for s in stages_out],
        "criteria": [_criterion_dict(c) for c in criteria_out],
    }


@router.get("/eval/lots/{lot_id}/stages")
async def list_evaluation_stages(
    lot_id: str,
    auth: AuthContext = Depends(require_module("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Return all stages with their criteria for a lot."""
    await _get_lot_or_404(lot_id, db)

    stages_result = await db.execute(
        select(EvaluationStage)
        .where(EvaluationStage.lot_id == lot_id)
        .order_by(EvaluationStage.stage_number)
    )
    stages = stages_result.scalars().all()

    criteria_result = await db.execute(
        select(EvaluationCriterion)
        .where(EvaluationCriterion.lot_id == lot_id)
        .order_by(EvaluationCriterion.stage_number, EvaluationCriterion.criterion_code)
    )
    criteria = criteria_result.scalars().all()

    # Group criteria by stage
    criteria_by_stage: dict[int, list] = {}
    for c in criteria:
        criteria_by_stage.setdefault(c.stage_number, []).append(_criterion_dict(c))

    stages_out = []
    for s in stages:
        sd = _stage_dict(s)
        sd["criteria"] = criteria_by_stage.get(s.stage_number, [])
        stages_out.append(sd)

    return {"lot_id": lot_id, "stages": stages_out, "total": len(stages_out)}


# =====================================================================
# STAGE 1: ADMINISTRATIVE RESPONSIVENESS (AUTOMATED)
# =====================================================================


@router.post("/eval/lots/{lot_id}/stages/1/run")
async def run_stage1_admin_check(
    lot_id: str,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Automated Stage 1 admin responsiveness checks against envelopes."""
    await _get_lot_or_404(lot_id, db)

    # Verify stage 1 exists and is pending
    stage_result = await db.execute(
        select(EvaluationStage).where(
            EvaluationStage.lot_id == lot_id,
            EvaluationStage.stage_number == 1,
        )
    )
    stage = stage_result.scalar_one_or_none()
    if not stage:
        raise HTTPException(404, "Stage 1 not found. Run setup first.")
    if stage.status == "locked":
        raise HTTPException(400, "Stage 1 is already locked")

    # Get all bids for this lot
    bids_result = await db.execute(
        select(Bid).where(Bid.lot_id == lot_id)
    )
    bids = bids_result.scalars().all()
    if not bids:
        raise HTTPException(400, "No bids found for this lot")

    results = []
    for bid in bids:
        fail_reasons = []

        # Check technical envelope
        tech_env = await db.execute(
            select(BidEnvelope).where(
                BidEnvelope.lot_id == lot_id,
                BidEnvelope.bid_id == bid.id,
                BidEnvelope.envelope_type == "technical",
            )
        )
        tech = tech_env.scalar_one_or_none()
        if not tech or tech.status != "submitted":
            fail_reasons.append("Technical envelope not submitted")

        # Check financial envelope
        fin_env = await db.execute(
            select(BidEnvelope).where(
                BidEnvelope.lot_id == lot_id,
                BidEnvelope.bid_id == bid.id,
                BidEnvelope.envelope_type == "financial",
            )
        )
        fin = fin_env.scalar_one_or_none()
        if not fin or fin.status not in ("submitted", "sealed"):
            fail_reasons.append("Financial envelope not submitted or sealed")

        admin_pass = len(fail_reasons) == 0

        # Create or update bid result for stage 1
        existing_result = await db.execute(
            select(EvaluationBidResult).where(
                EvaluationBidResult.lot_id == lot_id,
                EvaluationBidResult.bid_id == bid.id,
                EvaluationBidResult.stage_number == 1,
            )
        )
        bid_result = existing_result.scalar_one_or_none()
        if bid_result:
            bid_result.stage1_admin_pass = admin_pass
            bid_result.stage1_fail_reasons = fail_reasons if fail_reasons else None
            bid_result.updated_at = utcnow()
        else:
            bid_result = EvaluationBidResult(
                lot_id=lot_id,
                bid_id=bid.id,
                developer_id=bid.bidder_id,
                stage_number=1,
                stage1_admin_pass=admin_pass,
                stage1_fail_reasons=fail_reasons if fail_reasons else None,
            )
            db.add(bid_result)

        results.append(bid_result)

    # Lock stage 1
    stage.status = "locked"
    stage.locked_at = utcnow()
    stage.locked_by = auth.user_id

    # Activate stage 2
    stage2_result = await db.execute(
        select(EvaluationStage).where(
            EvaluationStage.lot_id == lot_id,
            EvaluationStage.stage_number == 2,
        )
    )
    stage2 = stage2_result.scalar_one_or_none()
    if stage2:
        stage2.status = "active"
        stage2.opened_at = utcnow()

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="stage1_completed",
        entity_type="lot",
        entity_id=lot_id,
        after_json={
            "bids_checked": len(bids),
            "passed": sum(1 for r in results if r.stage1_admin_pass),
            "failed": sum(1 for r in results if not r.stage1_admin_pass),
        },
    ))

    await db.flush()
    await db.commit()

    return {
        "lot_id": lot_id,
        "stage": 1,
        "status": "locked",
        "results": [_result_dict(r) for r in results],
    }


# =====================================================================
# SCORING (STAGES 2 & 3)
# =====================================================================


@router.post("/eval/lots/{lot_id}/stages/{stage_num}/score")
async def submit_score(
    lot_id: str,
    stage_num: int,
    body: ScoreBody,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Submit an individual score for a criterion on a bid."""
    await _get_lot_or_404(lot_id, db)

    # Validate stage is active
    stage_result = await db.execute(
        select(EvaluationStage).where(
            EvaluationStage.lot_id == lot_id,
            EvaluationStage.stage_number == stage_num,
        )
    )
    stage = stage_result.scalar_one_or_none()
    if not stage:
        raise HTTPException(404, f"Stage {stage_num} not found")
    if stage.status != "active":
        raise HTTPException(400, f"Stage {stage_num} is not active (status: {stage.status})")

    # Validate justification length
    if len(body.justification) < 80:
        raise HTTPException(
            400,
            f"Justification must be at least 80 characters (got {len(body.justification)})"
        )

    # Validate criterion exists
    crit_result = await db.execute(
        select(EvaluationCriterion).where(EvaluationCriterion.id == body.criterion_id)
    )
    criterion = crit_result.scalar_one_or_none()
    if not criterion:
        raise HTTPException(404, "Criterion not found")
    if criterion.lot_id != lot_id or criterion.stage_number != stage_num:
        raise HTTPException(400, "Criterion does not belong to this stage/lot")

    # Validate score range
    if body.score < 0 or body.score > criterion.max_score:
        raise HTTPException(400, f"Score must be between 0 and {criterion.max_score}")

    # Validate bid exists
    bid_result = await db.execute(
        select(Bid).where(Bid.id == body.bid_id, Bid.lot_id == lot_id)
    )
    if not bid_result.scalar_one_or_none():
        raise HTTPException(404, "Bid not found for this lot")

    # Create or update score
    existing = await db.execute(
        select(EvaluationScore).where(
            EvaluationScore.lot_id == lot_id,
            EvaluationScore.stage_number == stage_num,
            EvaluationScore.criterion_id == body.criterion_id,
            EvaluationScore.bid_id == body.bid_id,
            EvaluationScore.evaluator_id == auth.user_id,
        )
    )
    score_row = existing.scalar_one_or_none()

    if score_row:
        score_row.individual_score = body.score
        score_row.individual_justification = body.justification
        score_row.individual_submitted_at = utcnow()
        score_row.updated_at = utcnow()
    else:
        score_row = EvaluationScore(
            lot_id=lot_id,
            stage_number=stage_num,
            criterion_id=body.criterion_id,
            bid_id=body.bid_id,
            evaluator_id=auth.user_id,
            individual_score=body.score,
            individual_justification=body.justification,
            individual_submitted_at=utcnow(),
        )
        db.add(score_row)

    await db.flush()
    await db.commit()

    return {
        "id": score_row.id,
        "lot_id": lot_id,
        "stage_number": stage_num,
        "criterion_id": body.criterion_id,
        "bid_id": body.bid_id,
        "evaluator_id": auth.user_id,
        "individual_score": score_row.individual_score,
        "individual_justification": score_row.individual_justification,
        "individual_submitted_at": str(score_row.individual_submitted_at) if score_row.individual_submitted_at else None,
    }


@router.get("/eval/lots/{lot_id}/stages/{stage_num}/progress")
async def get_scoring_progress(
    lot_id: str,
    stage_num: int,
    auth: AuthContext = Depends(require_module("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Return per-criterion progress: how many bids scored, by which evaluators."""
    await _get_lot_or_404(lot_id, db)

    # Get criteria for this stage
    criteria_result = await db.execute(
        select(EvaluationCriterion).where(
            EvaluationCriterion.lot_id == lot_id,
            EvaluationCriterion.stage_number == stage_num,
        ).order_by(EvaluationCriterion.criterion_code)
    )
    criteria = criteria_result.scalars().all()

    # Count bids for this lot
    bid_count_result = await db.execute(
        select(func.count()).select_from(Bid).where(Bid.lot_id == lot_id)
    )
    total_bids = bid_count_result.scalar() or 0

    # Get all scores for this stage
    scores_result = await db.execute(
        select(EvaluationScore).where(
            EvaluationScore.lot_id == lot_id,
            EvaluationScore.stage_number == stage_num,
        )
    )
    scores = scores_result.scalars().all()

    # Build progress per criterion
    progress = []
    for c in criteria:
        crit_scores = [s for s in scores if s.criterion_id == c.id]
        bids_scored = len(set(s.bid_id for s in crit_scores))
        evaluators = list(set(s.evaluator_id for s in crit_scores))
        progress.append({
            "criterion_id": c.id,
            "criterion_code": c.criterion_code,
            "criterion_name": c.criterion_name,
            "total_bids": total_bids,
            "bids_scored": bids_scored,
            "evaluators": evaluators,
            "complete": bids_scored >= total_bids,
        })

    return {
        "lot_id": lot_id,
        "stage_number": stage_num,
        "total_bids": total_bids,
        "criteria_progress": progress,
    }


# =====================================================================
# STAGE 2 LOCK: TECHNICAL EVALUATION
# =====================================================================


@router.post("/eval/lots/{lot_id}/stages/2/lock")
async def lock_stage2_technical(
    lot_id: str,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Calculate weighted technical scores, apply threshold, lock stage 2."""
    await _get_lot_or_404(lot_id, db)

    stage_result = await db.execute(
        select(EvaluationStage).where(
            EvaluationStage.lot_id == lot_id,
            EvaluationStage.stage_number == 2,
        )
    )
    stage = stage_result.scalar_one_or_none()
    if not stage:
        raise HTTPException(404, "Stage 2 not found")
    if stage.status == "locked":
        raise HTTPException(400, "Stage 2 is already locked")

    threshold = stage.min_threshold_pct or 70.0

    # Get criteria for stage 2
    criteria_result = await db.execute(
        select(EvaluationCriterion).where(
            EvaluationCriterion.lot_id == lot_id,
            EvaluationCriterion.stage_number == 2,
        )
    )
    criteria = criteria_result.scalars().all()
    if not criteria:
        raise HTTPException(400, "No criteria defined for stage 2")

    # Get all bids
    bids_result = await db.execute(
        select(Bid).where(Bid.lot_id == lot_id)
    )
    bids = bids_result.scalars().all()

    results = []
    for bid in bids:
        # Check stage 1 pass
        s1_result = await db.execute(
            select(EvaluationBidResult).where(
                EvaluationBidResult.lot_id == lot_id,
                EvaluationBidResult.bid_id == bid.id,
                EvaluationBidResult.stage_number == 1,
            )
        )
        s1 = s1_result.scalar_one_or_none()
        if s1 and not s1.stage1_admin_pass:
            # Skip bids that failed admin check
            continue

        # Calculate weighted average technical score
        total_weighted_score = 0.0
        total_weight = 0.0

        for c in criteria:
            score_result = await db.execute(
                select(EvaluationScore).where(
                    EvaluationScore.lot_id == lot_id,
                    EvaluationScore.stage_number == 2,
                    EvaluationScore.criterion_id == c.id,
                    EvaluationScore.bid_id == bid.id,
                )
            )
            score_rows = score_result.scalars().all()
            if score_rows:
                # Average across evaluators, then normalise to percentage
                avg_score = sum(s.individual_score or 0 for s in score_rows) / len(score_rows)
                normalised = (avg_score / c.max_score) * 100.0 if c.max_score > 0 else 0.0
                total_weighted_score += normalised * (c.weight_pct / 100.0)
                total_weight += c.weight_pct

        # Normalise if weights do not sum to 100
        if total_weight > 0 and total_weight != 100.0:
            tech_score = round(total_weighted_score * (100.0 / total_weight), 2)
        else:
            tech_score = round(total_weighted_score, 2)

        passed = tech_score >= threshold

        # Create or update result for stage 2
        existing = await db.execute(
            select(EvaluationBidResult).where(
                EvaluationBidResult.lot_id == lot_id,
                EvaluationBidResult.bid_id == bid.id,
                EvaluationBidResult.stage_number == 2,
            )
        )
        bid_result = existing.scalar_one_or_none()
        if bid_result:
            bid_result.stage2_technical_score = tech_score
            bid_result.stage2_passed_threshold = passed
            bid_result.stage2_threshold_applied = threshold
            bid_result.updated_at = utcnow()
        else:
            bid_result = EvaluationBidResult(
                lot_id=lot_id,
                bid_id=bid.id,
                developer_id=bid.bidder_id,
                stage_number=2,
                stage2_technical_score=tech_score,
                stage2_passed_threshold=passed,
                stage2_threshold_applied=threshold,
            )
            db.add(bid_result)

        results.append(bid_result)

    # Lock stage 2
    stage.status = "locked"
    stage.locked_at = utcnow()
    stage.locked_by = auth.user_id

    # Activate stage 3
    stage3_result = await db.execute(
        select(EvaluationStage).where(
            EvaluationStage.lot_id == lot_id,
            EvaluationStage.stage_number == 3,
        )
    )
    stage3 = stage3_result.scalar_one_or_none()
    if stage3:
        stage3.status = "active"
        stage3.opened_at = utcnow()

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="stage2_locked",
        entity_type="lot",
        entity_id=lot_id,
        after_json={
            "threshold": threshold,
            "passed": sum(1 for r in results if r.stage2_passed_threshold),
            "failed": sum(1 for r in results if not r.stage2_passed_threshold),
        },
    ))

    await db.flush()
    await db.commit()

    return {
        "lot_id": lot_id,
        "stage": 2,
        "status": "locked",
        "threshold": threshold,
        "results": [_result_dict(r) for r in results],
    }


# =====================================================================
# STAGE 3 LOCK: FINANCIAL EVALUATION
# =====================================================================


@router.post("/eval/lots/{lot_id}/stages/3/lock")
async def lock_stage3_financial(
    lot_id: str,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Calculate weighted financial scores, apply threshold, lock stage 3."""
    await _get_lot_or_404(lot_id, db)

    stage_result = await db.execute(
        select(EvaluationStage).where(
            EvaluationStage.lot_id == lot_id,
            EvaluationStage.stage_number == 3,
        )
    )
    stage = stage_result.scalar_one_or_none()
    if not stage:
        raise HTTPException(404, "Stage 3 not found")
    if stage.status == "locked":
        raise HTTPException(400, "Stage 3 is already locked")

    threshold = stage.min_threshold_pct or 0.0

    # Get criteria for stage 3
    criteria_result = await db.execute(
        select(EvaluationCriterion).where(
            EvaluationCriterion.lot_id == lot_id,
            EvaluationCriterion.stage_number == 3,
        )
    )
    criteria = criteria_result.scalars().all()
    if not criteria:
        raise HTTPException(400, "No criteria defined for stage 3")

    # Get bids that passed stage 2
    passed_s2 = await db.execute(
        select(EvaluationBidResult.bid_id).where(
            EvaluationBidResult.lot_id == lot_id,
            EvaluationBidResult.stage_number == 2,
            EvaluationBidResult.stage2_passed_threshold == True,
        )
    )
    passed_bid_ids = {r[0] for r in passed_s2.all()}

    bids_result = await db.execute(
        select(Bid).where(Bid.lot_id == lot_id, Bid.id.in_(passed_bid_ids))
    )
    bids = bids_result.scalars().all()

    results = []
    for bid in bids:
        total_weighted_score = 0.0
        total_weight = 0.0

        for c in criteria:
            score_result = await db.execute(
                select(EvaluationScore).where(
                    EvaluationScore.lot_id == lot_id,
                    EvaluationScore.stage_number == 3,
                    EvaluationScore.criterion_id == c.id,
                    EvaluationScore.bid_id == bid.id,
                )
            )
            score_rows = score_result.scalars().all()
            if score_rows:
                avg_score = sum(s.individual_score or 0 for s in score_rows) / len(score_rows)
                normalised = (avg_score / c.max_score) * 100.0 if c.max_score > 0 else 0.0
                total_weighted_score += normalised * (c.weight_pct / 100.0)
                total_weight += c.weight_pct

        if total_weight > 0 and total_weight != 100.0:
            fin_score = round(total_weighted_score * (100.0 / total_weight), 2)
        else:
            fin_score = round(total_weighted_score, 2)

        passed = fin_score >= threshold if threshold > 0 else True

        # Create or update result for stage 3
        existing = await db.execute(
            select(EvaluationBidResult).where(
                EvaluationBidResult.lot_id == lot_id,
                EvaluationBidResult.bid_id == bid.id,
                EvaluationBidResult.stage_number == 3,
            )
        )
        bid_result = existing.scalar_one_or_none()
        if bid_result:
            bid_result.stage3_financial_score = fin_score
            bid_result.stage3_passed_threshold = passed
            bid_result.stage3_grant_ask_usd = bid.grant_amount_usd
            bid_result.stage3_grant_ask_pct = bid.grant_ask_pct
            bid_result.stage3_tariff_residential_usd = bid.tariff_residential
            bid_result.updated_at = utcnow()
        else:
            bid_result = EvaluationBidResult(
                lot_id=lot_id,
                bid_id=bid.id,
                developer_id=bid.bidder_id,
                stage_number=3,
                stage3_financial_score=fin_score,
                stage3_passed_threshold=passed,
                stage3_grant_ask_usd=bid.grant_amount_usd,
                stage3_grant_ask_pct=bid.grant_ask_pct,
                stage3_tariff_residential_usd=bid.tariff_residential,
            )
            db.add(bid_result)

        results.append(bid_result)

    # Lock stage 3
    stage.status = "locked"
    stage.locked_at = utcnow()
    stage.locked_by = auth.user_id

    # Activate stage 4
    stage4_result = await db.execute(
        select(EvaluationStage).where(
            EvaluationStage.lot_id == lot_id,
            EvaluationStage.stage_number == 4,
        )
    )
    stage4 = stage4_result.scalar_one_or_none()
    if stage4:
        stage4.status = "active"
        stage4.opened_at = utcnow()

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="stage3_locked",
        entity_type="lot",
        entity_id=lot_id,
        after_json={
            "threshold": threshold,
            "bids_scored": len(results),
        },
    ))

    await db.flush()
    await db.commit()

    return {
        "lot_id": lot_id,
        "stage": 3,
        "status": "locked",
        "threshold": threshold,
        "results": [_result_dict(r) for r in results],
    }


# =====================================================================
# STAGE 4: COMBINED SCORE, RANKING & RECOMMENDATION
# =====================================================================


@router.post("/eval/lots/{lot_id}/stages/4/calculate")
async def calculate_combined_scores(
    lot_id: str,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Calculate combined score = tech * weight + fin * weight. Rank bids."""
    await _get_lot_or_404(lot_id, db)

    # Get stage 4 weights
    stage4_result = await db.execute(
        select(EvaluationStage).where(
            EvaluationStage.lot_id == lot_id,
            EvaluationStage.stage_number == 4,
        )
    )
    stage4 = stage4_result.scalar_one_or_none()
    if not stage4:
        raise HTTPException(404, "Stage 4 not found")

    tech_weight = (stage4.technical_weight_pct or 60.0) / 100.0
    fin_weight = (stage4.financial_weight_pct or 40.0) / 100.0

    # Get bids that passed stage 3 (or have stage 3 results)
    s3_results = await db.execute(
        select(EvaluationBidResult).where(
            EvaluationBidResult.lot_id == lot_id,
            EvaluationBidResult.stage_number == 3,
            EvaluationBidResult.stage3_passed_threshold == True,
        )
    )
    s3_passed = {r.bid_id: r for r in s3_results.scalars().all()}

    # Also need stage 2 technical scores
    s2_results = await db.execute(
        select(EvaluationBidResult).where(
            EvaluationBidResult.lot_id == lot_id,
            EvaluationBidResult.stage_number == 2,
            EvaluationBidResult.stage2_passed_threshold == True,
        )
    )
    s2_passed = {r.bid_id: r for r in s2_results.scalars().all()}

    combined = []
    for bid_id in s3_passed:
        tech_score = s2_passed[bid_id].stage2_technical_score if bid_id in s2_passed else 0.0
        fin_score = s3_passed[bid_id].stage3_financial_score or 0.0
        combined_score = round((tech_score * tech_weight) + (fin_score * fin_weight), 2)
        combined.append({
            "bid_id": bid_id,
            "developer_id": s3_passed[bid_id].developer_id,
            "tech_score": tech_score,
            "fin_score": fin_score,
            "combined_score": combined_score,
        })

    # Sort by combined score descending
    combined.sort(key=lambda x: x["combined_score"], reverse=True)

    # Create/update stage 4 results with ranks
    result_rows = []
    for rank, entry in enumerate(combined, start=1):
        existing = await db.execute(
            select(EvaluationBidResult).where(
                EvaluationBidResult.lot_id == lot_id,
                EvaluationBidResult.bid_id == entry["bid_id"],
                EvaluationBidResult.stage_number == 4,
            )
        )
        bid_result = existing.scalar_one_or_none()
        if bid_result:
            bid_result.stage4_combined_score = entry["combined_score"]
            bid_result.stage4_rank = rank
            bid_result.updated_at = utcnow()
        else:
            bid_result = EvaluationBidResult(
                lot_id=lot_id,
                bid_id=entry["bid_id"],
                developer_id=entry["developer_id"],
                stage_number=4,
                stage4_combined_score=entry["combined_score"],
                stage4_rank=rank,
            )
            db.add(bid_result)
        result_rows.append(bid_result)

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="stage4_calculated",
        entity_type="lot",
        entity_id=lot_id,
        after_json={
            "tech_weight": tech_weight,
            "fin_weight": fin_weight,
            "bids_ranked": len(combined),
        },
    ))

    await db.flush()
    await db.commit()

    return {
        "lot_id": lot_id,
        "stage": 4,
        "technical_weight_pct": stage4.technical_weight_pct,
        "financial_weight_pct": stage4.financial_weight_pct,
        "ranking": [
            {
                "rank": i + 1,
                "bid_id": c["bid_id"],
                "developer_id": c["developer_id"],
                "technical_score": c["tech_score"],
                "financial_score": c["fin_score"],
                "combined_score": c["combined_score"],
            }
            for i, c in enumerate(combined)
        ],
    }


@router.post("/eval/lots/{lot_id}/stages/4/recommend")
async def recommend_for_award(
    lot_id: str,
    body: RecommendBody,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Set recommended_for_award on a bid result."""
    await _get_lot_or_404(lot_id, db)

    result = await db.execute(
        select(EvaluationBidResult).where(
            EvaluationBidResult.lot_id == lot_id,
            EvaluationBidResult.bid_id == body.bid_id,
            EvaluationBidResult.stage_number == 4,
        )
    )
    bid_result = result.scalar_one_or_none()
    if not bid_result:
        raise HTTPException(404, "Stage 4 result not found for this bid. Run calculate first.")

    bid_result.stage4_recommended_for_award = True
    bid_result.stage4_recommendation_note = body.note
    bid_result.updated_at = utcnow()

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="bid_recommended_for_award",
        entity_type="bid",
        entity_id=body.bid_id,
        after_json={"lot_id": lot_id, "note": body.note},
    ))

    await db.commit()

    return _result_dict(bid_result)


# =====================================================================
# ALL RESULTS (PMU VIEW)
# =====================================================================


@router.get("/eval/lots/{lot_id}/results")
async def get_all_bid_results(
    lot_id: str,
    auth: AuthContext = Depends(require_module("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Return all bid results across all stages for PMU view."""
    await _get_lot_or_404(lot_id, db)

    results_query = await db.execute(
        select(EvaluationBidResult)
        .where(EvaluationBidResult.lot_id == lot_id)
        .order_by(EvaluationBidResult.stage_number, EvaluationBidResult.bid_id)
    )
    results = results_query.scalars().all()

    # Group by bid_id
    by_bid: dict[str, dict] = {}
    for r in results:
        if r.bid_id not in by_bid:
            by_bid[r.bid_id] = {
                "bid_id": r.bid_id,
                "developer_id": r.developer_id,
                "stages": {},
            }
        by_bid[r.bid_id]["stages"][f"stage{r.stage_number}"] = _result_dict(r)

    return {
        "lot_id": lot_id,
        "total_bids": len(by_bid),
        "results": list(by_bid.values()),
    }


# =====================================================================
# BID OPENING
# =====================================================================


@router.post("/eval/lots/{lot_id}/bid-opening", status_code=201)
async def create_bid_opening(
    lot_id: str,
    body: BidOpeningBody,
    auth: AuthContext = Depends(require_module_write("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """Create a bid opening record for the lot."""
    await _get_lot_or_404(lot_id, db)

    # Check no existing record
    existing = await db.execute(
        select(BidOpeningRecord).where(BidOpeningRecord.lot_id == lot_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Bid opening record already exists for this lot")

    # Count bids
    bid_count = await db.execute(
        select(func.count()).select_from(Bid).where(Bid.lot_id == lot_id)
    )
    total_bids = bid_count.scalar() or 0

    # Build bid summary
    bids_result = await db.execute(
        select(Bid).where(Bid.lot_id == lot_id).order_by(Bid.submitted_at)
    )
    bids = bids_result.scalars().all()
    bid_summary = []
    for b in bids:
        bid_summary.append({
            "bid_id": b.id,
            "bidder_id": b.bidder_id,
            "status": b.status,
            "submitted_at": str(b.submitted_at) if b.submitted_at else None,
        })

    record = BidOpeningRecord(
        lot_id=lot_id,
        opened_by=auth.user_id,
        committee_members=body.committee_members,
        bids_received_count=total_bids,
        bid_summary=bid_summary,
    )
    db.add(record)

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="bid_opening_recorded",
        entity_type="lot",
        entity_id=lot_id,
        after_json={"bids_received": total_bids, "committee_size": len(body.committee_members)},
    ))

    await db.flush()
    await db.commit()

    return {
        "id": record.id,
        "lot_id": record.lot_id,
        "opened_at": str(record.opened_at) if record.opened_at else None,
        "opened_by": record.opened_by,
        "committee_members": record.committee_members,
        "bids_received_count": record.bids_received_count,
        "late_bids_count": record.late_bids_count,
        "bid_summary": record.bid_summary,
        "created_at": str(record.created_at) if record.created_at else None,
    }


# =====================================================================
# ENVELOPES
# =====================================================================


@router.get("/eval/lots/{lot_id}/envelopes")
async def list_envelopes(
    lot_id: str,
    auth: AuthContext = Depends(require_module("evaluation")),
    db: AsyncSession = Depends(get_db),
):
    """List envelopes for a lot. Developers see only their own."""
    await _get_lot_or_404(lot_id, db)

    q = select(BidEnvelope).where(BidEnvelope.lot_id == lot_id)

    # Developers only see their own envelopes
    if auth.role == "developer":
        q = q.where(BidEnvelope.developer_id == auth.user_id)

    q = q.order_by(BidEnvelope.created_at)
    result = await db.execute(q)
    envelopes = result.scalars().all()

    return {
        "lot_id": lot_id,
        "envelopes": [_envelope_dict(e) for e in envelopes],
        "total": len(envelopes),
    }


@router.post("/eval/lots/{lot_id}/envelopes", status_code=201)
async def create_envelope(
    lot_id: str,
    body: EnvelopeCreateBody,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new BidEnvelope in draft status."""
    await _get_lot_or_404(lot_id, db)

    if body.envelope_type not in ("technical", "financial"):
        raise HTTPException(400, "envelope_type must be 'technical' or 'financial'")

    # Check for duplicate envelope of same type by same developer
    existing = await db.execute(
        select(BidEnvelope).where(
            BidEnvelope.lot_id == lot_id,
            BidEnvelope.developer_id == auth.user_id,
            BidEnvelope.envelope_type == body.envelope_type,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"A {body.envelope_type} envelope already exists for this lot")

    envelope = BidEnvelope(
        lot_id=lot_id,
        bid_id=body.bid_id,
        developer_id=auth.user_id,
        envelope_type=body.envelope_type,
        status="draft",
        form_data=body.form_data,
    )
    db.add(envelope)
    await db.flush()
    await db.commit()

    return _envelope_dict(envelope)


@router.put("/eval/lots/{lot_id}/envelopes/{envelope_id}/submit")
async def submit_envelope(
    lot_id: str,
    envelope_id: str,
    request: Request,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit an envelope. Technical -> 'submitted', Financial -> 'sealed'."""
    result = await db.execute(
        select(BidEnvelope).where(
            BidEnvelope.id == envelope_id,
            BidEnvelope.lot_id == lot_id,
        )
    )
    envelope = result.scalar_one_or_none()
    if not envelope:
        raise HTTPException(404, "Envelope not found")

    if envelope.status not in ("draft",):
        raise HTTPException(400, f"Cannot submit envelope with status '{envelope.status}'")

    if envelope.envelope_type == "technical":
        envelope.status = "submitted"
    elif envelope.envelope_type == "financial":
        envelope.status = "sealed"

    envelope.submitted_at = utcnow()
    envelope.submission_ip = request.client.host if request.client else ""
    envelope.updated_at = utcnow()

    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="envelope_submitted",
        entity_type="bid_envelope",
        entity_id=envelope_id,
        after_json={"type": envelope.envelope_type, "status": envelope.status},
    ))

    await db.commit()

    return _envelope_dict(envelope)


@router.put("/eval/lots/{lot_id}/envelopes/{envelope_id}/save")
async def save_envelope_draft(
    lot_id: str,
    envelope_id: str,
    body: EnvelopeSaveBody,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save form_data draft. Updates data_completeness_pct."""
    result = await db.execute(
        select(BidEnvelope).where(
            BidEnvelope.id == envelope_id,
            BidEnvelope.lot_id == lot_id,
        )
    )
    envelope = result.scalar_one_or_none()
    if not envelope:
        raise HTTPException(404, "Envelope not found")

    if envelope.status not in ("draft",):
        raise HTTPException(400, f"Cannot save envelope with status '{envelope.status}'")

    envelope.form_data = body.form_data
    envelope.updated_at = utcnow()

    # Calculate data completeness based on non-empty fields
    if body.form_data:
        total_fields = len(body.form_data)
        filled_fields = sum(
            1 for v in body.form_data.values()
            if v is not None and v != "" and v != [] and v != {}
        )
        envelope.data_completeness_pct = round(
            (filled_fields / total_fields) * 100.0, 1
        ) if total_fields > 0 else 0.0
    else:
        envelope.data_completeness_pct = 0.0

    await db.commit()

    return _envelope_dict(envelope)
