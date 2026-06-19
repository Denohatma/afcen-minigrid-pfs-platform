from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.db.models import (
    Grievance,
    GrievanceComment,
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

MODULE = "es_grm"

# ── Valid enumerations ──────────────────────────────────────────────────

VALID_COMPLAINANT_TYPES = (
    "community_member",
    "worker",
    "local_government",
    "ngo",
    "other",
)

VALID_CATEGORIES = (
    "land_resettlement",
    "environmental",
    "worker_safety",
    "service_quality",
    "sea_sh",
    "labour",
    "compensation",
    "noise_dust",
    "other",
)

VALID_SEVERITIES = ("low", "medium", "high", "critical")

VALID_STATUSES = (
    "received",
    "acknowledged",
    "under_investigation",
    "resolved",
    "escalated",
    "closed",
)


# ── Pydantic schemas ───────────────────────────────────────────────────


class GrievanceCreate(BaseModel):
    site_id: Optional[str] = None
    lot_id: Optional[str] = None
    complainant_type: str = "community_member"
    submitter_name: Optional[str] = None
    submitter_contact: Optional[str] = None
    category: str = "other"
    severity: str = "medium"
    description: str
    location_description: str = ""
    is_anonymous: bool = False
    is_sea_sh: bool = False


class GrievanceUpdate(BaseModel):
    category: Optional[str] = None
    severity: Optional[str] = None
    description: Optional[str] = None
    location_description: Optional[str] = None
    is_sea_sh: Optional[bool] = None


class AssignBody(BaseModel):
    assigned_to: str


class ResolveBody(BaseModel):
    corrective_action: str


class EscalateBody(BaseModel):
    notes: str = ""


class CommentCreate(BaseModel):
    author_role: str = ""
    comment_text: str


# ── Helpers ─────────────────────────────────────────────────────────────


def _audit(auth: AuthContext, action: str, entity_id: str, after: dict | None = None) -> AuditLog:
    return AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action=action,
        entity_type="grievance",
        entity_id=entity_id,
        after_json=after,
    )


def _serialize_grievance(g: Grievance, *, summary: bool = False) -> dict:
    base = {
        "id": g.id,
        "site_id": g.site_id,
        "lot_id": g.lot_id,
        "complainant_type": g.complainant_type,
        "category": g.category,
        "severity": g.severity,
        "is_anonymous": g.is_anonymous,
        "is_sea_sh": g.is_sea_sh,
        "status": g.status,
        "assigned_to": g.assigned_to,
        "created_at": str(g.created_at),
        "updated_at": str(g.updated_at),
    }
    if summary:
        desc = g.description or ""
        base["description"] = (desc[:200] + "...") if len(desc) > 200 else desc
    else:
        base.update(
            {
                "submitter_name": g.submitter_name,
                "submitter_contact": g.submitter_contact,
                "description": g.description,
                "location_description": g.location_description,
                "corrective_action": g.corrective_action,
                "resolution_date": str(g.resolution_date) if g.resolution_date else None,
                "escalated_at": str(g.escalated_at) if g.escalated_at else None,
            }
        )
    return base


async def _get_grievance(grievance_id: str, db: AsyncSession) -> Grievance:
    result = await db.execute(
        select(Grievance).where(Grievance.id == grievance_id)
    )
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "Grievance not found")
    return g


# ── Routes ──────────────────────────────────────────────────────────────


@router.get("/grievances/report")
async def grievance_report(
    auth: AuthContext = Depends(require_module(MODULE)),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated grievance report: by category, by status, average resolution days, SEA/SH flag count."""

    # By category
    cat_result = await db.execute(
        select(Grievance.category, func.count(Grievance.id)).group_by(Grievance.category)
    )
    by_category = {row[0]: row[1] for row in cat_result.all()}

    # By status
    status_result = await db.execute(
        select(Grievance.status, func.count(Grievance.id)).group_by(Grievance.status)
    )
    by_status = {row[0]: row[1] for row in status_result.all()}

    # By severity
    sev_result = await db.execute(
        select(Grievance.severity, func.count(Grievance.id)).group_by(Grievance.severity)
    )
    by_severity = {row[0]: row[1] for row in sev_result.all()}

    # Average resolution time (resolved / closed grievances with a resolution_date)
    resolved_result = await db.execute(
        select(Grievance).where(
            Grievance.resolution_date.isnot(None),
            Grievance.created_at.isnot(None),
        )
    )
    resolved = resolved_result.scalars().all()

    avg_resolution_days = 0.0
    if resolved:
        total_days = sum(
            (g.resolution_date - g.created_at).total_seconds() / 86400
            for g in resolved
        )
        avg_resolution_days = round(total_days / len(resolved), 1)

    # Total
    total_result = await db.execute(select(func.count(Grievance.id)))
    total_count = total_result.scalar() or 0

    # SEA/SH count
    sea_sh_result = await db.execute(
        select(func.count(Grievance.id)).where(Grievance.is_sea_sh.is_(True))
    )
    sea_sh_count = sea_sh_result.scalar() or 0

    return {
        "total_grievances": total_count,
        "by_category": by_category,
        "by_status": by_status,
        "by_severity": by_severity,
        "resolved_count": len(resolved),
        "avg_resolution_days": avg_resolution_days,
        "sea_sh_count": sea_sh_count,
    }


@router.get("/grievances/dashboard")
async def grievance_dashboard(
    auth: AuthContext = Depends(require_module(MODULE)),
    db: AsyncSession = Depends(get_db),
):
    """Dashboard quick stats: totals, open / resolved / escalated counts, SEA/SH, avg resolution."""

    total_q = await db.execute(select(func.count(Grievance.id)))
    total = total_q.scalar() or 0

    open_q = await db.execute(
        select(func.count(Grievance.id)).where(
            Grievance.status.in_(["received", "acknowledged", "under_investigation"])
        )
    )
    open_count = open_q.scalar() or 0

    resolved_q = await db.execute(
        select(func.count(Grievance.id)).where(Grievance.status == "resolved")
    )
    resolved_count = resolved_q.scalar() or 0

    closed_q = await db.execute(
        select(func.count(Grievance.id)).where(Grievance.status == "closed")
    )
    closed_count = closed_q.scalar() or 0

    escalated_q = await db.execute(
        select(func.count(Grievance.id)).where(Grievance.status == "escalated")
    )
    escalated_count = escalated_q.scalar() or 0

    sea_sh_q = await db.execute(
        select(func.count(Grievance.id)).where(Grievance.is_sea_sh.is_(True))
    )
    sea_sh_count = sea_sh_q.scalar() or 0

    # avg resolution days
    resolved_rows = await db.execute(
        select(Grievance).where(
            Grievance.resolution_date.isnot(None),
            Grievance.created_at.isnot(None),
        )
    )
    resolved_list = resolved_rows.scalars().all()
    avg_resolution_days = 0.0
    if resolved_list:
        total_days = sum(
            (g.resolution_date - g.created_at).total_seconds() / 86400
            for g in resolved_list
        )
        avg_resolution_days = round(total_days / len(resolved_list), 1)

    # Severity breakdown
    sev_q = await db.execute(
        select(Grievance.severity, func.count(Grievance.id)).group_by(Grievance.severity)
    )
    by_severity = {row[0]: row[1] for row in sev_q.all()}

    return {
        "total": total,
        "open": open_count,
        "resolved": resolved_count,
        "closed": closed_count,
        "escalated": escalated_count,
        "sea_sh_flagged": sea_sh_count,
        "avg_resolution_days": avg_resolution_days,
        "by_severity": by_severity,
    }


@router.get("/grievances")
async def list_grievances(
    status: Optional[str] = Query(None, description="Filter by status"),
    category: Optional[str] = Query(None, description="Filter by category"),
    site_id: Optional[str] = Query(None, description="Filter by site_id"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    auth: AuthContext = Depends(require_module(MODULE)),
    db: AsyncSession = Depends(get_db),
):
    """List all grievances with optional filters."""
    query = select(Grievance).order_by(Grievance.created_at.desc())

    if site_id:
        query = query.where(Grievance.site_id == site_id)
    if status:
        query = query.where(Grievance.status == status)
    if category:
        query = query.where(Grievance.category == category)
    if severity:
        query = query.where(Grievance.severity == severity)

    result = await db.execute(query)
    grievances = result.scalars().all()

    return {
        "grievances": [_serialize_grievance(g, summary=True) for g in grievances],
        "total": len(grievances),
    }


@router.get("/grievances/{grievance_id}")
async def get_grievance(
    grievance_id: str,
    auth: AuthContext = Depends(require_module(MODULE)),
    db: AsyncSession = Depends(get_db),
):
    """Get single grievance detail with comments."""
    g = await _get_grievance(grievance_id, db)

    # Load comments
    comments_result = await db.execute(
        select(GrievanceComment)
        .where(GrievanceComment.grievance_id == grievance_id)
        .order_by(GrievanceComment.created_at)
    )
    comments = comments_result.scalars().all()

    data = _serialize_grievance(g)
    data["comments"] = [
        {
            "id": c.id,
            "author_id": c.author_id,
            "author_role": c.author_role,
            "comment_text": c.comment_text,
            "created_at": str(c.created_at),
        }
        for c in comments
    ]
    return data


@router.post("/grievances")
async def submit_grievance(
    body: GrievanceCreate,
    db: AsyncSession = Depends(get_db),
):
    """Submit a grievance. Open to community_rep role and public (anonymous). No auth required."""
    if not body.description.strip():
        raise HTTPException(400, "Description is required")

    if body.complainant_type not in VALID_COMPLAINANT_TYPES:
        raise HTTPException(
            400,
            f"Invalid complainant_type. Must be one of: {', '.join(VALID_COMPLAINANT_TYPES)}",
        )

    if body.category not in VALID_CATEGORIES:
        raise HTTPException(
            400,
            f"Invalid category. Must be one of: {', '.join(VALID_CATEGORIES)}",
        )

    if body.severity not in VALID_SEVERITIES:
        raise HTTPException(
            400,
            f"Invalid severity. Must be one of: {', '.join(VALID_SEVERITIES)}",
        )

    # Auto-flag SEA/SH
    is_sea_sh = body.is_sea_sh or body.category == "sea_sh"

    grievance = Grievance(
        site_id=body.site_id,
        lot_id=body.lot_id,
        complainant_type=body.complainant_type,
        submitter_name=None if body.is_anonymous else body.submitter_name,
        submitter_contact=None if body.is_anonymous else body.submitter_contact,
        category=body.category,
        severity=body.severity,
        description=body.description,
        location_description=body.location_description,
        is_anonymous=body.is_anonymous,
        is_sea_sh=is_sea_sh,
        status="received",
    )
    db.add(grievance)
    await db.commit()
    await db.refresh(grievance)

    return {
        "id": grievance.id,
        "status": grievance.status,
        "category": grievance.category,
        "severity": grievance.severity,
        "is_anonymous": grievance.is_anonymous,
        "is_sea_sh": grievance.is_sea_sh,
        "created_at": str(grievance.created_at),
        "message": f"Grievance submitted successfully. Reference ID: {grievance.id}",
    }


@router.put("/grievances/{grievance_id}")
async def update_grievance(
    grievance_id: str,
    body: GrievanceUpdate,
    auth: AuthContext = Depends(require_module_write(MODULE)),
    db: AsyncSession = Depends(get_db),
):
    """Update editable fields on a grievance (category, severity, description, is_sea_sh)."""
    g = await _get_grievance(grievance_id, db)

    if body.category is not None:
        if body.category not in VALID_CATEGORIES:
            raise HTTPException(400, f"Invalid category. Must be one of: {', '.join(VALID_CATEGORIES)}")
        g.category = body.category

    if body.severity is not None:
        if body.severity not in VALID_SEVERITIES:
            raise HTTPException(400, f"Invalid severity. Must be one of: {', '.join(VALID_SEVERITIES)}")
        g.severity = body.severity

    if body.description is not None:
        if not body.description.strip():
            raise HTTPException(400, "Description cannot be empty")
        g.description = body.description

    if body.location_description is not None:
        g.location_description = body.location_description

    if body.is_sea_sh is not None:
        g.is_sea_sh = body.is_sea_sh

    db.add(_audit(auth, "grievance_updated", g.id))
    await db.commit()
    await db.refresh(g)

    return _serialize_grievance(g)


@router.put("/grievances/{grievance_id}/acknowledge")
async def acknowledge_grievance(
    grievance_id: str,
    auth: AuthContext = Depends(require_module_write(MODULE)),
    db: AsyncSession = Depends(get_db),
):
    """Acknowledge receipt of a grievance (moves status received -> acknowledged)."""
    g = await _get_grievance(grievance_id, db)

    if g.status != "received":
        raise HTTPException(400, f"Cannot acknowledge grievance in status '{g.status}'")

    g.status = "acknowledged"

    db.add(_audit(auth, "grievance_acknowledged", g.id))
    await db.commit()

    return {"id": g.id, "status": g.status}


@router.put("/grievances/{grievance_id}/assign")
async def assign_grievance(
    grievance_id: str,
    body: AssignBody,
    auth: AuthContext = Depends(require_module_write(MODULE)),
    db: AsyncSession = Depends(get_db),
):
    """Assign a grievance to a handler for investigation."""
    g = await _get_grievance(grievance_id, db)

    g.assigned_to = body.assigned_to
    g.status = "under_investigation"

    db.add(_audit(auth, "grievance_assigned", g.id, after={"assigned_to": body.assigned_to}))
    await db.commit()

    return {
        "id": g.id,
        "status": g.status,
        "assigned_to": g.assigned_to,
    }


@router.put("/grievances/{grievance_id}/resolve")
async def resolve_grievance(
    grievance_id: str,
    body: ResolveBody,
    auth: AuthContext = Depends(require_module_write(MODULE)),
    db: AsyncSession = Depends(get_db),
):
    """Resolve a grievance with a corrective action."""
    g = await _get_grievance(grievance_id, db)

    g.status = "resolved"
    g.corrective_action = body.corrective_action
    g.resolution_date = utcnow()

    db.add(_audit(auth, "grievance_resolved", g.id))
    await db.commit()

    return {
        "id": g.id,
        "status": g.status,
        "corrective_action": g.corrective_action,
        "resolution_date": str(g.resolution_date),
    }


@router.put("/grievances/{grievance_id}/escalate")
async def escalate_grievance(
    grievance_id: str,
    body: EscalateBody,
    auth: AuthContext = Depends(require_module_write(MODULE)),
    db: AsyncSession = Depends(get_db),
):
    """Escalate a grievance (e.g. SEA/SH or unresolved beyond SLA)."""
    g = await _get_grievance(grievance_id, db)

    g.status = "escalated"
    g.escalated_at = utcnow()

    # Record escalation note as a comment
    if body.notes:
        comment = GrievanceComment(
            grievance_id=g.id,
            author_id=auth.user_id,
            author_role=auth.role,
            comment_text=f"Escalated: {body.notes}",
        )
        db.add(comment)

    db.add(_audit(auth, "grievance_escalated", g.id, after={"notes": body.notes}))
    await db.commit()

    return {
        "id": g.id,
        "status": g.status,
        "escalated_at": str(g.escalated_at),
    }


@router.post("/grievances/{grievance_id}/comments")
async def add_comment(
    grievance_id: str,
    body: CommentCreate,
    auth: AuthContext = Depends(require_module(MODULE)),
    db: AsyncSession = Depends(get_db),
):
    """Add a follow-up comment to a grievance."""
    g = await _get_grievance(grievance_id, db)

    comment = GrievanceComment(
        grievance_id=grievance_id,
        author_id=auth.user_id,
        author_role=body.author_role or auth.role,
        comment_text=body.comment_text,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    return {
        "id": comment.id,
        "grievance_id": grievance_id,
        "author_id": comment.author_id,
        "author_role": comment.author_role,
        "comment_text": comment.comment_text,
        "created_at": str(comment.created_at),
    }
