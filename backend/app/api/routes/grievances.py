from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    Grievance, GrievanceComment, AuditLog,
    utcnow, new_uuid,
)
from app.dependencies.auth import AuthContext, get_current_user, require_role

router = APIRouter()

# --- Schemas ---


class GrievanceCreate(BaseModel):
    site_id: Optional[str] = None
    site_name_text: str = ""
    submitter_name: Optional[str] = None
    submitter_contact: Optional[str] = None
    submitter_type: str = "community_member"
    category: str = "other"
    description: str
    location_description: str = ""
    is_anonymous: bool = False


class AssignBody(BaseModel):
    developer_id: str


class RespondBody(BaseModel):
    developer_response: str


class ResolveBody(BaseModel):
    resolution_notes: str


class EscalateBody(BaseModel):
    notes: str = ""


class CommentCreate(BaseModel):
    author_role: str = ""
    comment_text: str


# --- Routes ---


@router.post("/grievances")
async def submit_grievance(
    body: GrievanceCreate,
    db: AsyncSession = Depends(get_db),
):
    """Submit a grievance. Public endpoint — no auth required. Supports anonymous submissions."""
    if not body.description.strip():
        raise HTTPException(400, "Description is required")

    valid_submitter_types = ("community_member", "worker", "local_government", "ngo", "other")
    if body.submitter_type not in valid_submitter_types:
        raise HTTPException(400, f"Invalid submitter_type. Must be one of: {', '.join(valid_submitter_types)}")

    valid_categories = ("land_resettlement", "environmental", "worker_safety", "service_quality", "other")
    if body.category not in valid_categories:
        raise HTTPException(400, f"Invalid category. Must be one of: {', '.join(valid_categories)}")

    grievance = Grievance(
        site_id=body.site_id,
        site_name_text=body.site_name_text,
        submitter_name=None if body.is_anonymous else body.submitter_name,
        submitter_contact=None if body.is_anonymous else body.submitter_contact,
        submitter_type=body.submitter_type,
        category=body.category,
        description=body.description,
        location_description=body.location_description,
        is_anonymous=body.is_anonymous,
        status="received",
    )
    db.add(grievance)
    await db.commit()
    await db.refresh(grievance)

    return {
        "id": grievance.id,
        "status": grievance.status,
        "category": grievance.category,
        "is_anonymous": grievance.is_anonymous,
        "created_at": str(grievance.created_at),
        "message": "Grievance submitted successfully. Reference ID: " + grievance.id,
    }


@router.get("/grievances")
async def list_grievances(
    site_id: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    auth: AuthContext = Depends(get_current_user),
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

    result = await db.execute(query)
    grievances = result.scalars().all()

    return {
        "grievances": [
            {
                "id": g.id,
                "site_id": g.site_id,
                "site_name_text": g.site_name_text,
                "submitter_type": g.submitter_type,
                "category": g.category,
                "description": g.description[:200] + "..." if len(g.description) > 200 else g.description,
                "is_anonymous": g.is_anonymous,
                "status": g.status,
                "assigned_developer_id": g.assigned_developer_id,
                "created_at": str(g.created_at),
                "updated_at": str(g.updated_at),
            }
            for g in grievances
        ],
        "total": len(grievances),
    }


@router.get("/grievances/report")
async def grievance_report(
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Quarterly summary stats: total by category, status, avg resolution time."""
    # Total by category
    cat_result = await db.execute(
        select(Grievance.category, func.count(Grievance.id))
        .group_by(Grievance.category)
    )
    by_category = {row[0]: row[1] for row in cat_result.all()}

    # Total by status
    status_result = await db.execute(
        select(Grievance.status, func.count(Grievance.id))
        .group_by(Grievance.status)
    )
    by_status = {row[0]: row[1] for row in status_result.all()}

    # Average resolution time (for resolved/closed grievances)
    resolved_result = await db.execute(
        select(Grievance).where(
            Grievance.resolved_at.isnot(None),
            Grievance.created_at.isnot(None),
        )
    )
    resolved = resolved_result.scalars().all()

    avg_resolution_days = 0.0
    if resolved:
        total_days = sum(
            (g.resolved_at - g.created_at).total_seconds() / 86400
            for g in resolved
        )
        avg_resolution_days = round(total_days / len(resolved), 1)

    # Total count
    total_result = await db.execute(select(func.count(Grievance.id)))
    total_count = total_result.scalar() or 0

    return {
        "total_grievances": total_count,
        "by_category": by_category,
        "by_status": by_status,
        "resolved_count": len(resolved),
        "avg_resolution_days": avg_resolution_days,
    }


@router.get("/grievances/{grievance_id}")
async def get_grievance(
    grievance_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get single grievance detail with comments."""
    result = await db.execute(
        select(Grievance).where(Grievance.id == grievance_id)
    )
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "Grievance not found")

    # Get comments
    comments_result = await db.execute(
        select(GrievanceComment)
        .where(GrievanceComment.grievance_id == grievance_id)
        .order_by(GrievanceComment.created_at)
    )
    comments = comments_result.scalars().all()

    return {
        "id": g.id,
        "site_id": g.site_id,
        "site_name_text": g.site_name_text,
        "submitter_name": g.submitter_name,
        "submitter_contact": g.submitter_contact,
        "submitter_type": g.submitter_type,
        "category": g.category,
        "description": g.description,
        "location_description": g.location_description,
        "is_anonymous": g.is_anonymous,
        "status": g.status,
        "assigned_developer_id": g.assigned_developer_id,
        "developer_response": g.developer_response,
        "resolution_notes": g.resolution_notes,
        "escalated_at": str(g.escalated_at) if g.escalated_at else None,
        "resolved_at": str(g.resolved_at) if g.resolved_at else None,
        "created_at": str(g.created_at),
        "updated_at": str(g.updated_at),
        "comments": [
            {
                "id": c.id,
                "author_role": c.author_role,
                "comment_text": c.comment_text,
                "created_at": str(c.created_at),
            }
            for c in comments
        ],
    }


@router.put("/grievances/{grievance_id}/acknowledge")
async def acknowledge_grievance(
    grievance_id: str,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """PM acknowledges receipt of a grievance."""
    result = await db.execute(
        select(Grievance).where(Grievance.id == grievance_id)
    )
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "Grievance not found")

    if g.status != "received":
        raise HTTPException(400, f"Cannot acknowledge grievance in status '{g.status}'")

    g.status = "acknowledged"

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="grievance_acknowledged",
        entity_type="grievance",
        entity_id=g.id,
    )
    db.add(audit)
    await db.commit()

    return {"id": g.id, "status": g.status}


@router.put("/grievances/{grievance_id}/assign")
async def assign_grievance(
    grievance_id: str,
    body: AssignBody,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """PM assigns a grievance to a developer for investigation."""
    result = await db.execute(
        select(Grievance).where(Grievance.id == grievance_id)
    )
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "Grievance not found")

    g.assigned_developer_id = body.developer_id
    g.status = "under_investigation"

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="grievance_assigned",
        entity_type="grievance",
        entity_id=g.id,
        details={"developer_id": body.developer_id},
    )
    db.add(audit)
    await db.commit()

    return {
        "id": g.id,
        "status": g.status,
        "assigned_developer_id": g.assigned_developer_id,
    }


@router.put("/grievances/{grievance_id}/respond")
async def respond_to_grievance(
    grievance_id: str,
    body: RespondBody,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Developer submits a response to a grievance."""
    result = await db.execute(
        select(Grievance).where(Grievance.id == grievance_id)
    )
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "Grievance not found")

    g.developer_response = body.developer_response

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="grievance_response_submitted",
        entity_type="grievance",
        entity_id=g.id,
    )
    db.add(audit)
    await db.commit()

    return {
        "id": g.id,
        "status": g.status,
        "developer_response": g.developer_response,
    }


@router.put("/grievances/{grievance_id}/resolve")
async def resolve_grievance(
    grievance_id: str,
    body: ResolveBody,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """PM resolves a grievance."""
    result = await db.execute(
        select(Grievance).where(Grievance.id == grievance_id)
    )
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "Grievance not found")

    g.status = "resolved"
    g.resolution_notes = body.resolution_notes
    g.resolved_at = utcnow()

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="grievance_resolved",
        entity_type="grievance",
        entity_id=g.id,
    )
    db.add(audit)
    await db.commit()

    return {
        "id": g.id,
        "status": g.status,
        "resolution_notes": g.resolution_notes,
        "resolved_at": str(g.resolved_at),
    }


@router.put("/grievances/{grievance_id}/escalate")
async def escalate_grievance(
    grievance_id: str,
    body: EscalateBody,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """PM escalates a grievance."""
    result = await db.execute(
        select(Grievance).where(Grievance.id == grievance_id)
    )
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "Grievance not found")

    g.status = "escalated"
    g.escalated_at = utcnow()

    # Add escalation note as a comment if provided
    if body.notes:
        comment = GrievanceComment(
            grievance_id=g.id,
            author_role=auth.role,
            comment_text=f"Escalated: {body.notes}",
        )
        db.add(comment)

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="grievance_escalated",
        entity_type="grievance",
        entity_id=g.id,
        details={"notes": body.notes},
    )
    db.add(audit)
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
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to a grievance."""
    result = await db.execute(
        select(Grievance).where(Grievance.id == grievance_id)
    )
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "Grievance not found")

    comment = GrievanceComment(
        grievance_id=grievance_id,
        author_role=body.author_role or auth.role,
        comment_text=body.comment_text,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    return {
        "id": comment.id,
        "grievance_id": grievance_id,
        "author_role": comment.author_role,
        "comment_text": comment.comment_text,
        "created_at": str(comment.created_at),
    }
