"""
Ticket & Grievance Management Module

Six categories: Grievance, Technical, Commercial, E&S, Milestone, Regulatory.
SLA-tracked, fully audited, World Bank-defensible.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.db.models import (
    Ticket,
    TicketComment,
    TicketHistory,
    TicketAttachment,
    TicketSLARule,
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

VALID_CATEGORIES = (
    "Grievance", "Technical", "Commercial", "E&S", "Milestone", "Regulatory",
)
VALID_PRIORITIES = ("Critical", "High", "Medium", "Low")
VALID_STATUSES = (
    "open", "in_progress", "in_review", "escalated", "resolved", "closed",
)

DEFAULT_SLA = {
    "Critical": 24,
    "High": 72,
    "Medium": 168,
    "Low": 336,
}


# ── Pydantic Schemas ──────────────────────────────────────────────────

class TicketCreate(BaseModel):
    title: str
    description: str = ""
    category: str
    priority: str = "Medium"
    reporter_name: str = ""
    reporter_org: str = ""
    anonymous: bool = False
    site_id: Optional[str] = None
    site_name: str = ""
    award_id: Optional[str] = None
    milestone_id: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    parent_ticket_id: Optional[str] = None


class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    assignee_id: Optional[str] = None
    tags: Optional[list[str]] = None
    resolution_summary: Optional[str] = None
    escalation_reason: Optional[str] = None
    escalated_to: Optional[str] = None
    due_date: Optional[datetime] = None


class CommentCreate(BaseModel):
    body: str
    is_internal: bool = False
    author_name: str = ""


class TicketAssign(BaseModel):
    assignee_id: str
    note: str = ""


class TicketEscalate(BaseModel):
    escalation_reason: str
    escalated_to: Optional[str] = None


class TicketResolve(BaseModel):
    resolution_summary: str


class TicketClose(BaseModel):
    resolution_summary: str = ""


# ── Helpers ────────────────────────────────────────────────────────────

def _serialize_ticket(t: Ticket) -> dict:
    return {
        "id": t.id,
        "ticket_ref": t.ticket_ref,
        "title": t.title,
        "description": t.description,
        "category": t.category,
        "priority": t.priority,
        "status": t.status,
        "sla_hours": t.sla_hours,
        "sla_breached": t.sla_breached,
        "reporter_id": t.reporter_id,
        "reporter_name": t.reporter_name,
        "reporter_org": t.reporter_org,
        "anonymous": t.anonymous,
        "assignee_id": t.assignee_id,
        "site_id": t.site_id,
        "site_name": t.site_name,
        "award_id": t.award_id,
        "milestone_id": t.milestone_id,
        "due_date": str(t.due_date) if t.due_date else None,
        "resolved_at": str(t.resolved_at) if t.resolved_at else None,
        "closed_at": str(t.closed_at) if t.closed_at else None,
        "resolution_summary": t.resolution_summary,
        "escalation_reason": t.escalation_reason,
        "escalated_to": t.escalated_to,
        "parent_ticket_id": t.parent_ticket_id,
        "tags": t.tags or [],
        "created_at": str(t.created_at) if t.created_at else None,
        "updated_at": str(t.updated_at) if t.updated_at else None,
    }


def _serialize_comment(c: TicketComment) -> dict:
    return {
        "id": c.id,
        "ticket_id": c.ticket_id,
        "author_id": c.author_id,
        "author_name": c.author_name,
        "body": c.body,
        "is_internal": c.is_internal,
        "attachments": c.attachments_json or [],
        "created_at": str(c.created_at) if c.created_at else None,
    }


def _serialize_history(h: TicketHistory) -> dict:
    return {
        "id": h.id,
        "ticket_id": h.ticket_id,
        "actor_id": h.actor_id,
        "actor_name": h.actor_name,
        "action": h.action,
        "field_changed": h.field_changed,
        "old_value": h.old_value,
        "new_value": h.new_value,
        "note": h.note,
        "created_at": str(h.created_at) if h.created_at else None,
    }


def _add_history(
    ticket_id: str,
    auth: AuthContext,
    action: str,
    field_changed: str | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
    note: str | None = None,
) -> TicketHistory:
    return TicketHistory(
        ticket_id=ticket_id,
        actor_id=auth.user_id,
        actor_name=auth.name,
        action=action,
        field_changed=field_changed,
        old_value=old_value,
        new_value=new_value,
        note=note,
    )


def _audit(auth: AuthContext, action: str, entity_type: str, entity_id: str, details: dict) -> AuditLog:
    return AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        after_json=details,
    )


async def _generate_ticket_ref(db: AsyncSession) -> str:
    year = datetime.utcnow().year
    result = await db.execute(
        select(func.count(Ticket.id)).where(
            Ticket.ticket_ref.like(f"TKT-{year}-%")
        )
    )
    count = result.scalar() or 0
    return f"TKT-{year}-{count + 1:04d}"


# ── Dashboard ─────────────────────────────────────────────────────────

@router.get("/tickets/dashboard", tags=["tickets"])
async def ticket_dashboard(
    auth: AuthContext = Depends(require_module("es_grm")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Ticket))
    tickets = result.scalars().all()

    total = len(tickets)
    open_count = sum(1 for t in tickets if t.status == "open")
    in_progress = sum(1 for t in tickets if t.status == "in_progress")
    in_review = sum(1 for t in tickets if t.status == "in_review")
    escalated = sum(1 for t in tickets if t.status == "escalated")
    resolved = sum(1 for t in tickets if t.status == "resolved")
    closed = sum(1 for t in tickets if t.status == "closed")
    sla_breached = sum(1 for t in tickets if t.sla_breached)

    by_category: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    for t in tickets:
        by_category[t.category] = by_category.get(t.category, 0) + 1
        by_priority[t.priority] = by_priority.get(t.priority, 0) + 1

    return {
        "total": total,
        "open": open_count,
        "in_progress": in_progress,
        "in_review": in_review,
        "escalated": escalated,
        "resolved": resolved,
        "closed": closed,
        "sla_breached": sla_breached,
        "by_category": by_category,
        "by_priority": by_priority,
    }


# ── CRUD ───────────────────────────────────────────────────────────────

@router.get("/tickets", tags=["tickets"])
async def list_tickets(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    assignee_id: Optional[str] = Query(None),
    auth: AuthContext = Depends(require_module("es_grm")),
    db: AsyncSession = Depends(get_db),
):
    query = select(Ticket).order_by(Ticket.created_at.desc())
    if status:
        query = query.where(Ticket.status == status)
    if category:
        query = query.where(Ticket.category == category)
    if priority:
        query = query.where(Ticket.priority == priority)
    if assignee_id:
        query = query.where(Ticket.assignee_id == assignee_id)

    result = await db.execute(query)
    tickets = result.scalars().all()

    now = utcnow()
    for t in tickets:
        if t.status not in ("resolved", "closed") and t.due_date and t.due_date < now and not t.sla_breached:
            t.sla_breached = True

    await db.commit()

    return {"tickets": [_serialize_ticket(t) for t in tickets], "total": len(tickets)}


@router.get("/tickets/{id}", tags=["tickets"])
async def get_ticket(
    id: str,
    auth: AuthContext = Depends(require_module("es_grm")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Ticket)
        .where(Ticket.id == id)
        .options(
            selectinload(Ticket.comments),
            selectinload(Ticket.history),
            selectinload(Ticket.attachments),
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    data = _serialize_ticket(ticket)
    data["comments"] = [_serialize_comment(c) for c in (ticket.comments or [])]
    data["history"] = [_serialize_history(h) for h in (ticket.history or [])]
    data["attachments"] = [
        {
            "id": a.id,
            "filename": a.filename,
            "file_url": a.file_url,
            "file_size_bytes": a.file_size_bytes,
            "mime_type": a.mime_type,
            "uploaded_at": str(a.uploaded_at) if a.uploaded_at else None,
        }
        for a in (ticket.attachments or [])
    ]
    return data


@router.post("/tickets", tags=["tickets"], status_code=201)
async def create_ticket(
    body: TicketCreate,
    auth: AuthContext = Depends(require_module("es_grm")),
    db: AsyncSession = Depends(get_db),
):
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(400, f"Invalid category. Must be one of: {', '.join(VALID_CATEGORIES)}")
    if body.priority not in VALID_PRIORITIES:
        raise HTTPException(400, f"Invalid priority. Must be one of: {', '.join(VALID_PRIORITIES)}")

    ticket_ref = await _generate_ticket_ref(db)
    sla_hours = DEFAULT_SLA.get(body.priority, 168)

    now = utcnow()
    due_date = now + timedelta(hours=sla_hours)

    ticket = Ticket(
        ticket_ref=ticket_ref,
        title=body.title,
        description=body.description,
        category=body.category,
        priority=body.priority,
        status="open",
        sla_hours=sla_hours,
        reporter_id=auth.user_id if not body.anonymous else None,
        reporter_name=body.reporter_name or auth.name,
        reporter_org=body.reporter_org,
        anonymous=body.anonymous,
        site_id=body.site_id,
        site_name=body.site_name,
        award_id=body.award_id,
        milestone_id=body.milestone_id,
        due_date=due_date,
        parent_ticket_id=body.parent_ticket_id,
        tags=body.tags,
    )
    db.add(ticket)

    db.add(_add_history(ticket.id, auth, "created", note=f"Ticket {ticket_ref} created"))
    db.add(_audit(auth, "ticket_created", "ticket", ticket.id, {
        "ticket_ref": ticket_ref,
        "category": body.category,
        "priority": body.priority,
        "title": body.title,
    }))

    await db.commit()
    await db.refresh(ticket)
    return _serialize_ticket(ticket)


@router.put("/tickets/{id}", tags=["tickets"])
async def update_ticket(
    id: str,
    body: TicketUpdate,
    auth: AuthContext = Depends(require_module_write("es_grm")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Ticket).where(Ticket.id == id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    changes = {}
    for field in ("title", "description", "category", "priority", "status",
                  "assignee_id", "tags", "resolution_summary", "escalation_reason",
                  "escalated_to", "due_date"):
        val = getattr(body, field, None)
        if val is not None:
            old_val = str(getattr(ticket, field, None))
            setattr(ticket, field, val)
            changes[field] = str(val)

            if field in ("status", "priority", "assignee_id"):
                db.add(_add_history(
                    ticket.id, auth,
                    f"{field}_changed",
                    field_changed=field,
                    old_value=old_val,
                    new_value=str(val),
                ))

    if body.status == "resolved" and body.resolution_summary:
        ticket.resolved_at = utcnow()
    if body.status == "closed":
        ticket.closed_at = utcnow()

    db.add(_audit(auth, "ticket_updated", "ticket", id, changes))
    await db.commit()
    await db.refresh(ticket)
    return _serialize_ticket(ticket)


# ── Assign ─────────────────────────────────────────────────────────────

@router.put("/tickets/{id}/assign", tags=["tickets"])
async def assign_ticket(
    id: str,
    body: TicketAssign,
    auth: AuthContext = Depends(require_module_write("es_grm")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Ticket).where(Ticket.id == id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    old_assignee = ticket.assignee_id
    ticket.assignee_id = body.assignee_id
    if ticket.status == "open":
        ticket.status = "in_progress"

    db.add(_add_history(
        ticket.id, auth,
        "reassigned" if old_assignee else "assigned",
        field_changed="assignee_id",
        old_value=old_assignee,
        new_value=body.assignee_id,
        note=body.note,
    ))
    db.add(_audit(auth, "ticket_assigned", "ticket", id, {
        "assignee_id": body.assignee_id,
        "note": body.note,
    }))
    await db.commit()
    await db.refresh(ticket)
    return _serialize_ticket(ticket)


# ── Escalate ───────────────────────────────────────────────────────────

@router.put("/tickets/{id}/escalate", tags=["tickets"])
async def escalate_ticket(
    id: str,
    body: TicketEscalate,
    auth: AuthContext = Depends(require_module("es_grm")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Ticket).where(Ticket.id == id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.status in ("resolved", "closed"):
        raise HTTPException(400, "Cannot escalate a resolved or closed ticket")

    ticket.status = "escalated"
    ticket.escalation_reason = body.escalation_reason
    ticket.escalated_to = body.escalated_to

    db.add(_add_history(
        ticket.id, auth, "escalated",
        note=body.escalation_reason,
    ))
    db.add(_audit(auth, "ticket_escalated", "ticket", id, {
        "escalation_reason": body.escalation_reason,
        "escalated_to": body.escalated_to,
    }))
    await db.commit()
    await db.refresh(ticket)
    return _serialize_ticket(ticket)


# ── Resolve ────────────────────────────────────────────────────────────

@router.put("/tickets/{id}/resolve", tags=["tickets"])
async def resolve_ticket(
    id: str,
    body: TicketResolve,
    auth: AuthContext = Depends(require_module("es_grm")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Ticket).where(Ticket.id == id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.status == "closed":
        raise HTTPException(400, "Cannot resolve a closed ticket")

    ticket.status = "resolved"
    ticket.resolved_at = utcnow()
    ticket.resolution_summary = body.resolution_summary

    db.add(_add_history(
        ticket.id, auth, "resolved",
        field_changed="status",
        old_value=ticket.status,
        new_value="resolved",
        note=body.resolution_summary,
    ))
    db.add(_audit(auth, "ticket_resolved", "ticket", id, {
        "resolution_summary": body.resolution_summary,
    }))
    await db.commit()
    await db.refresh(ticket)
    return _serialize_ticket(ticket)


# ── Close ──────────────────────────────────────────────────────────────

@router.put("/tickets/{id}/close", tags=["tickets"])
async def close_ticket(
    id: str,
    body: TicketClose,
    auth: AuthContext = Depends(require_module("es_grm")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Ticket).where(Ticket.id == id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    ticket.status = "closed"
    ticket.closed_at = utcnow()
    if body.resolution_summary:
        ticket.resolution_summary = body.resolution_summary

    db.add(_add_history(
        ticket.id, auth, "closed",
        field_changed="status",
        old_value=ticket.status,
        new_value="closed",
    ))
    db.add(_audit(auth, "ticket_closed", "ticket", id, {
        "resolution_summary": ticket.resolution_summary,
    }))
    await db.commit()
    await db.refresh(ticket)
    return _serialize_ticket(ticket)


# ── Comments ───────────────────────────────────────────────────────────

@router.get("/tickets/{id}/comments", tags=["tickets"])
async def list_comments(
    id: str,
    auth: AuthContext = Depends(require_module("es_grm")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TicketComment)
        .where(TicketComment.ticket_id == id)
        .order_by(TicketComment.created_at.asc())
    )
    comments = result.scalars().all()
    return {"comments": [_serialize_comment(c) for c in comments]}


@router.post("/tickets/{id}/comments", tags=["tickets"], status_code=201)
async def add_comment(
    id: str,
    body: CommentCreate,
    auth: AuthContext = Depends(require_module("es_grm")),
    db: AsyncSession = Depends(get_db),
):
    ticket = await db.execute(select(Ticket).where(Ticket.id == id))
    if not ticket.scalar_one_or_none():
        raise HTTPException(404, "Ticket not found")

    comment = TicketComment(
        ticket_id=id,
        author_id=auth.user_id,
        author_name=body.author_name or auth.name,
        body=body.body,
        is_internal=body.is_internal,
    )
    db.add(comment)

    db.add(_add_history(id, auth, "commented", note=body.body[:200]))
    db.add(_audit(auth, "ticket_comment_added", "ticket", id, {
        "comment_id": comment.id,
        "is_internal": body.is_internal,
    }))
    await db.commit()
    await db.refresh(comment)
    return _serialize_comment(comment)


# ── History / Audit Trail ──────────────────────────────────────────────

@router.get("/tickets/{id}/history", tags=["tickets"])
async def ticket_history(
    id: str,
    auth: AuthContext = Depends(require_module("es_grm")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TicketHistory)
        .where(TicketHistory.ticket_id == id)
        .order_by(TicketHistory.created_at.asc())
    )
    history = result.scalars().all()
    return {"history": [_serialize_history(h) for h in history]}


# ── SLA Rules ──────────────────────────────────────────────────────────

@router.get("/tickets/sla-rules", tags=["tickets"])
async def list_sla_rules(
    auth: AuthContext = Depends(require_module("es_grm")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TicketSLARule))
    rules = result.scalars().all()
    return {
        "rules": [
            {
                "id": r.id,
                "category": r.category,
                "priority": r.priority,
                "sla_hours": r.sla_hours,
                "response_hours": r.response_hours,
                "auto_escalate_at_pct": r.auto_escalate_at_pct,
                "escalate_to_role": r.escalate_to_role,
            }
            for r in rules
        ]
    }
