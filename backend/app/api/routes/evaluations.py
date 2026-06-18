from __future__ import annotations

import hashlib
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    BidEvaluation, EvaluationScore, ClarificationRound,
    TenderSubmission, Tender, AuditLog, utcnow, new_uuid,
)
from app.dependencies.auth import AuthContext, get_current_user, require_role

router = APIRouter()

# --- Schemas ---


class ScoreOverride(BaseModel):
    human_score: float
    justification: str


class RecommendBody(BaseModel):
    notes: str = ""


class ClarificationRequest(BaseModel):
    request_text: str
    response_deadline: Optional[str] = None


class ClarificationResponse(BaseModel):
    response_text: str


# --- AI Scoring (mock / deterministic) ---

EVALUATION_CRITERIA = [
    {"criterion": "technical_approach", "weight": 0.25, "max_score": 100},
    {"criterion": "financial_competitiveness", "weight": 0.25, "max_score": 100},
    {"criterion": "team_experience", "weight": 0.15, "max_score": 100},
    {"criterion": "local_content", "weight": 0.10, "max_score": 100},
    {"criterion": "esg_compliance", "weight": 0.10, "max_score": 100},
    {"criterion": "implementation_timeline", "weight": 0.10, "max_score": 100},
    {"criterion": "safety_plan", "weight": 0.05, "max_score": 100},
]

REASONING_TEMPLATES = {
    "technical_approach": "Technical proposal demonstrates {level} understanding of minigrid design. {detail}",
    "financial_competitiveness": "Financial offer is {level} competitive relative to benchmark LCOE. {detail}",
    "team_experience": "Team has {level} track record in Sub-Saharan Africa minigrid deployment. {detail}",
    "local_content": "Local content plan shows {level} commitment to Nigerian workforce. {detail}",
    "esg_compliance": "ESG framework is {level} aligned with DARES sustainability requirements. {detail}",
    "implementation_timeline": "Proposed timeline is {level} realistic given site conditions. {detail}",
    "safety_plan": "Safety and O&M plan is {level} comprehensive. {detail}",
}


def _deterministic_score(submission_id: str, criterion: str) -> float:
    """Generate a deterministic score 55-95 based on submission ID and criterion."""
    seed = hashlib.md5(f"{submission_id}:{criterion}".encode()).hexdigest()
    value = int(seed[:8], 16)
    return 55.0 + (value % 4100) / 100.0  # range 55.00 to 95.99


def _score_level(score: float) -> tuple[str, str]:
    """Return qualitative level and detail based on score."""
    if score >= 85:
        return "strong", "Exceeds minimum requirements with notable strengths."
    elif score >= 75:
        return "good", "Meets requirements with some areas of distinction."
    elif score >= 65:
        return "adequate", "Meets minimum requirements but could be strengthened."
    else:
        return "limited", "Marginal compliance; several areas need improvement."


def _generate_red_flags(scores: list[dict]) -> list[str]:
    """Generate red flags for low-scoring criteria."""
    flags = []
    for s in scores:
        if s["score"] < 60:
            flags.append(f"Low score on {s['criterion'].replace('_', ' ')}: {s['score']:.1f}/100")
    return flags


def _mock_ai_scoring(submission: TenderSubmission) -> dict:
    """Generate deterministic AI scoring for a bid submission."""
    scores = []
    weighted_total = 0.0

    for crit in EVALUATION_CRITERIA:
        raw_score = _deterministic_score(submission.id, crit["criterion"])
        level, detail = _score_level(raw_score)
        reasoning = REASONING_TEMPLATES[crit["criterion"]].format(level=level, detail=detail)

        weighted_score = raw_score * crit["weight"]
        weighted_total += weighted_score

        scores.append({
            "criterion": crit["criterion"],
            "weight": crit["weight"],
            "ai_score": round(raw_score, 2),
            "ai_reasoning": reasoning,
        })

    red_flags = _generate_red_flags([{"criterion": s["criterion"], "score": s["ai_score"]} for s in scores])

    # Determine confidence level
    score_range = max(s["ai_score"] for s in scores) - min(s["ai_score"] for s in scores)
    confidence = "high" if score_range < 20 else "medium" if score_range < 30 else "low"

    # Check DARES eligibility (minimum 60 on each criterion)
    dares_eligible = all(s["ai_score"] >= 60 for s in scores)

    summary = (
        f"Bid from {submission.company_name} scored {weighted_total:.1f}/100 overall. "
        f"{'DARES-eligible.' if dares_eligible else 'Does NOT meet DARES minimum thresholds.'} "
        f"Confidence: {confidence}."
    )

    return {
        "scores": scores,
        "total_score": round(weighted_total, 2),
        "summary": summary,
        "red_flags": red_flags,
        "confidence": confidence,
        "dares_eligible": dares_eligible,
    }


# --- Routes ---


@router.post("/evaluations/tender/{tender_id}/score")
async def trigger_ai_scoring(
    tender_id: str,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Trigger AI scoring for all submissions on a tender."""
    # Verify tender exists
    tender_result = await db.execute(select(Tender).where(Tender.id == tender_id))
    tender = tender_result.scalar_one_or_none()
    if not tender:
        raise HTTPException(404, "Tender not found")

    # Get all submissions
    subs_result = await db.execute(
        select(TenderSubmission).where(TenderSubmission.tender_id == tender_id)
    )
    submissions = subs_result.scalars().all()
    if not submissions:
        raise HTTPException(400, "No submissions found for this tender")

    evaluations_created = []

    for sub in submissions:
        # Check if evaluation already exists
        existing = await db.execute(
            select(BidEvaluation).where(BidEvaluation.submission_id == sub.id)
        )
        if existing.scalar_one_or_none():
            continue

        # Run mock AI scoring
        ai_result = _mock_ai_scoring(sub)

        evaluation = BidEvaluation(
            submission_id=sub.id,
            tender_id=tender_id,
            ai_total_score=ai_result["total_score"],
            final_score=ai_result["total_score"],
            ai_summary=ai_result["summary"],
            ai_red_flags=ai_result["red_flags"],
            confidence_level=ai_result["confidence"],
            dares_eligible=ai_result["dares_eligible"],
            status="scored",
        )
        db.add(evaluation)
        await db.flush()

        # Create individual score records
        for sc in ai_result["scores"]:
            score = EvaluationScore(
                evaluation_id=evaluation.id,
                criterion=sc["criterion"],
                weight=sc["weight"],
                ai_score=sc["ai_score"],
                ai_reasoning=sc["ai_reasoning"],
                final_score=sc["ai_score"],
            )
            db.add(score)

        evaluations_created.append({
            "evaluation_id": evaluation.id,
            "submission_id": sub.id,
            "company_name": sub.company_name,
            "ai_total_score": ai_result["total_score"],
            "dares_eligible": ai_result["dares_eligible"],
        })

    # Log the action
    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="ai_scoring_triggered",
        entity_type="tender",
        entity_id=tender_id,
        details={"evaluations_created": len(evaluations_created)},
    )
    db.add(audit)

    await db.commit()

    return {
        "tender_id": tender_id,
        "evaluations_created": len(evaluations_created),
        "results": evaluations_created,
    }


@router.get("/evaluations/tender/{tender_id}")
async def get_tender_evaluations(
    tender_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all evaluation results for a tender, ranked by final score."""
    evals_result = await db.execute(
        select(BidEvaluation)
        .where(BidEvaluation.tender_id == tender_id)
        .order_by(BidEvaluation.final_score.desc())
    )
    evaluations = evals_result.scalars().all()

    results = []
    for ev in evaluations:
        # Get the submission details
        sub_result = await db.execute(
            select(TenderSubmission).where(TenderSubmission.id == ev.submission_id)
        )
        sub = sub_result.scalar_one_or_none()

        # Get scores
        scores_result = await db.execute(
            select(EvaluationScore).where(EvaluationScore.evaluation_id == ev.id)
        )
        scores = scores_result.scalars().all()

        # Get clarifications
        clar_result = await db.execute(
            select(ClarificationRound).where(ClarificationRound.evaluation_id == ev.id)
        )
        clarifications = clar_result.scalars().all()

        results.append({
            "evaluation_id": ev.id,
            "submission_id": ev.submission_id,
            "company_name": sub.company_name if sub else "Unknown",
            "ai_total_score": ev.ai_total_score,
            "human_total_score": ev.human_total_score,
            "final_score": ev.final_score,
            "ai_summary": ev.ai_summary,
            "ai_red_flags": ev.ai_red_flags,
            "dares_eligible": ev.dares_eligible,
            "confidence_level": ev.confidence_level,
            "status": ev.status,
            "recommended_for_award": ev.recommended_for_award,
            "award_approved": ev.award_approved,
            "scores": [
                {
                    "id": s.id,
                    "criterion": s.criterion,
                    "weight": s.weight,
                    "ai_score": s.ai_score,
                    "ai_reasoning": s.ai_reasoning,
                    "human_score": s.human_score,
                    "human_justification": s.human_justification,
                    "final_score": s.final_score,
                    "overridden_by": s.overridden_by,
                }
                for s in scores
            ],
            "clarifications": [
                {
                    "id": c.id,
                    "round_number": c.round_number,
                    "request_text": c.request_text,
                    "response_text": c.response_text,
                    "status": c.status,
                    "requested_at": str(c.requested_at),
                    "responded_at": str(c.responded_at) if c.responded_at else None,
                }
                for c in clarifications
            ],
        })

    return {"tender_id": tender_id, "evaluations": results, "total": len(results)}


@router.put("/evaluations/{eval_id}/scores/{score_id}/override")
async def override_score(
    eval_id: str,
    score_id: str,
    body: ScoreOverride,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Human override of an AI-generated score on a specific criterion."""
    result = await db.execute(
        select(EvaluationScore).where(
            EvaluationScore.id == score_id,
            EvaluationScore.evaluation_id == eval_id,
        )
    )
    score = result.scalar_one_or_none()
    if not score:
        raise HTTPException(404, "Score not found")

    if body.human_score < 0 or body.human_score > 100:
        raise HTTPException(400, "Score must be between 0 and 100")

    score.human_score = body.human_score
    score.human_justification = body.justification
    score.overridden_by = auth.user_id
    score.overridden_at = utcnow()
    score.final_score = body.human_score  # Human override takes precedence

    # Recalculate evaluation totals
    eval_result = await db.execute(
        select(BidEvaluation).where(BidEvaluation.id == eval_id)
    )
    evaluation = eval_result.scalar_one_or_none()
    if evaluation:
        scores_result = await db.execute(
            select(EvaluationScore).where(EvaluationScore.evaluation_id == eval_id)
        )
        all_scores = scores_result.scalars().all()

        weighted_total = sum(s.final_score * s.weight for s in all_scores)
        human_total = sum(
            (s.human_score if s.human_score is not None else s.ai_score) * s.weight
            for s in all_scores
        )
        evaluation.human_total_score = round(human_total, 2)
        evaluation.final_score = round(weighted_total, 2)

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="score_overridden",
        entity_type="evaluation_score",
        entity_id=score_id,
        details={
            "evaluation_id": eval_id,
            "criterion": score.criterion,
            "ai_score": score.ai_score,
            "human_score": body.human_score,
        },
    )
    db.add(audit)

    await db.commit()

    return {
        "score_id": score_id,
        "criterion": score.criterion,
        "ai_score": score.ai_score,
        "human_score": score.human_score,
        "final_score": score.final_score,
        "evaluation_final_score": evaluation.final_score if evaluation else None,
    }


@router.post("/evaluations/{eval_id}/recommend")
async def recommend_for_award(
    eval_id: str,
    body: RecommendBody,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Mark a bid evaluation as recommended for award."""
    result = await db.execute(
        select(BidEvaluation).where(BidEvaluation.id == eval_id)
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(404, "Evaluation not found")

    if evaluation.status != "scored":
        raise HTTPException(400, f"Evaluation must be in 'scored' status, currently '{evaluation.status}'")

    evaluation.recommended_for_award = True
    evaluation.status = "recommended"
    if body.notes:
        evaluation.ai_comparative_notes = body.notes

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="bid_recommended",
        entity_type="bid_evaluation",
        entity_id=eval_id,
        details={"notes": body.notes},
    )
    db.add(audit)

    await db.commit()
    return {
        "evaluation_id": eval_id,
        "recommended_for_award": True,
        "status": evaluation.status,
    }


@router.post("/evaluations/{eval_id}/clarification")
async def send_clarification(
    eval_id: str,
    body: ClarificationRequest,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Send a clarification request to a developer for their bid."""
    eval_result = await db.execute(
        select(BidEvaluation).where(BidEvaluation.id == eval_id)
    )
    evaluation = eval_result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(404, "Evaluation not found")

    # Determine round number
    existing = await db.execute(
        select(ClarificationRound)
        .where(ClarificationRound.evaluation_id == eval_id)
        .order_by(ClarificationRound.round_number.desc())
    )
    last = existing.scalars().first()
    round_number = (last.round_number + 1) if last else 1

    from datetime import datetime
    deadline = None
    if body.response_deadline:
        try:
            deadline = datetime.fromisoformat(body.response_deadline)
        except ValueError:
            raise HTTPException(400, "Invalid deadline format. Use ISO 8601.")

    clarification = ClarificationRound(
        evaluation_id=eval_id,
        round_number=round_number,
        request_text=body.request_text,
        requested_by=auth.name,
        response_deadline=deadline,
        status="pending",
    )
    db.add(clarification)
    await db.commit()
    await db.refresh(clarification)

    return {
        "id": clarification.id,
        "evaluation_id": eval_id,
        "round_number": round_number,
        "request_text": body.request_text,
        "status": "pending",
        "requested_at": str(clarification.requested_at),
    }


@router.put("/evaluations/{eval_id}/clarification/{clarification_id}/respond")
async def respond_to_clarification(
    eval_id: str,
    clarification_id: str,
    body: ClarificationResponse,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Developer responds to a clarification request."""
    result = await db.execute(
        select(ClarificationRound).where(
            ClarificationRound.id == clarification_id,
            ClarificationRound.evaluation_id == eval_id,
        )
    )
    clarification = result.scalar_one_or_none()
    if not clarification:
        raise HTTPException(404, "Clarification request not found")

    if clarification.status != "pending":
        raise HTTPException(400, "Clarification has already been responded to")

    clarification.response_text = body.response_text
    clarification.responded_at = utcnow()
    clarification.status = "responded"

    await db.commit()
    return {
        "id": clarification.id,
        "status": "responded",
        "responded_at": str(clarification.responded_at),
    }


@router.post("/evaluations/tender/{tender_id}/award/{eval_id}")
async def award_tender(
    tender_id: str,
    eval_id: str,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Award a tender to the selected bidder."""
    # Verify tender
    tender_result = await db.execute(select(Tender).where(Tender.id == tender_id))
    tender = tender_result.scalar_one_or_none()
    if not tender:
        raise HTTPException(404, "Tender not found")

    # Verify evaluation
    eval_result = await db.execute(
        select(BidEvaluation).where(
            BidEvaluation.id == eval_id,
            BidEvaluation.tender_id == tender_id,
        )
    )
    evaluation = eval_result.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(404, "Evaluation not found for this tender")

    if not evaluation.recommended_for_award:
        raise HTTPException(400, "Evaluation must be recommended for award first")

    # Award
    evaluation.award_approved = True
    evaluation.status = "awarded"
    tender.status = "awarded"
    tender.awarded_at = utcnow()

    # Mark other evaluations as not awarded
    others_result = await db.execute(
        select(BidEvaluation).where(
            BidEvaluation.tender_id == tender_id,
            BidEvaluation.id != eval_id,
        )
    )
    for other in others_result.scalars().all():
        other.status = "not_awarded"

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="tender_awarded",
        entity_type="tender",
        entity_id=tender_id,
        details={"evaluation_id": eval_id, "submission_id": evaluation.submission_id},
    )
    db.add(audit)

    await db.commit()

    # Get winner details
    sub_result = await db.execute(
        select(TenderSubmission).where(TenderSubmission.id == evaluation.submission_id)
    )
    winner = sub_result.scalar_one_or_none()

    return {
        "tender_id": tender_id,
        "status": "awarded",
        "awarded_evaluation_id": eval_id,
        "winner": {
            "company_name": winner.company_name if winner else "Unknown",
            "final_score": evaluation.final_score,
        },
        "awarded_at": str(tender.awarded_at),
    }
