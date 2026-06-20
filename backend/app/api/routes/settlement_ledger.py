"""
DisCo Settlement Ledger — Invoice-based settlement tracking

Four invoice types: grid_import, power_export, grid_lease, duos.
Tracks payments, disputes, escalations, and net positions.
Links to milestone disbursement module for M3 risk flagging.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.db.models import (
    SettlementInvoice,
    SettlementInvoiceHistory,
    SettlementInvoiceAttachment,
    SettlementNetPosition,
    Ticket,
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

TYPE_CODES = {
    "grid_import": "IMP",
    "power_export": "EXP",
    "grid_lease": "LEASE",
    "duos": "DUOS",
}

DISCO_CODES = {
    "KEDCO": "KEDCO",
    "AEDC": "AEDC",
    "Ikeja Electric": "IE",
    "BEDC": "BEDC",
    "EEDC": "EEDC",
    "PHED": "PHED",
    "JED": "JED",
    "KAEDCO": "KAEDCO",
    "IBEDC": "IBEDC",
    "YEDC": "YEDC",
    "BPC": "BPC",
}

DIRECTION_MAP = {
    "grid_import": "dev_to_disco",
    "grid_lease": "dev_to_disco",
    "duos": "dev_to_disco",
    "power_export": "disco_to_dev",
}


# ── Pydantic Schemas ──────────────────────────────────────────────

class InvoiceCreate(BaseModel):
    site_id: Optional[str] = None
    site_name: str = ""
    disco_name: str
    developer_name: str = ""
    invoice_type: str
    billing_period: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    amount_usd: float
    amount_ngn: Optional[float] = None
    exchange_rate: Optional[float] = None
    kwh_quantity: Optional[float] = None
    rate_per_kwh: Optional[float] = None
    bulk_meter_reading_start: Optional[float] = None
    bulk_meter_reading_end: Optional[float] = None
    bulk_meter_id: Optional[str] = None
    issued_date: Optional[datetime] = None
    due_date: datetime
    issuer_role: Optional[str] = None
    notes: Optional[str] = None
    milestone_id: Optional[str] = None
    award_id: Optional[str] = None


class InvoiceUpdate(BaseModel):
    amount_usd: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    payment_reference: Optional[str] = None
    due_date: Optional[datetime] = None


class PaymentBody(BaseModel):
    amount_paid_usd: float
    payment_reference: str = ""
    paid_date: Optional[datetime] = None
    notes: str = ""


class DisputeBody(BaseModel):
    dispute_reason: str
    evidence_notes: str = ""


class ResolveDisputeBody(BaseModel):
    resolution_note: str
    agreed_amount_usd: Optional[float] = None
    new_status: str = "pending"


class EscalateBody(BaseModel):
    escalation_note: str
    escalated_to: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────

def _serialize_invoice(inv: SettlementInvoice) -> dict:
    now = datetime.utcnow()
    amount_outstanding = (inv.amount_usd or 0) - (inv.amount_paid_usd or 0)
    days_overdue = 0
    if inv.due_date and inv.due_date < now and inv.status not in ("paid", "cancelled"):
        days_overdue = (now - inv.due_date).days

    return {
        "id": inv.id,
        "invoice_ref": inv.invoice_ref,
        "site_id": inv.site_id,
        "site_name": inv.site_name,
        "award_id": inv.award_id,
        "disco_name": inv.disco_name,
        "developer_id": inv.developer_id,
        "developer_name": inv.developer_name,
        "invoice_type": inv.invoice_type,
        "direction": inv.direction,
        "billing_period": inv.billing_period,
        "amount_usd": inv.amount_usd,
        "amount_ngn": inv.amount_ngn,
        "exchange_rate": inv.exchange_rate,
        "kwh_quantity": inv.kwh_quantity,
        "rate_per_kwh": inv.rate_per_kwh,
        "bulk_meter_reading_start": inv.bulk_meter_reading_start,
        "bulk_meter_reading_end": inv.bulk_meter_reading_end,
        "bulk_meter_id": inv.bulk_meter_id,
        "status": inv.status,
        "amount_paid_usd": inv.amount_paid_usd,
        "amount_outstanding_usd": round(amount_outstanding, 2),
        "issued_date": str(inv.issued_date) if inv.issued_date else None,
        "due_date": str(inv.due_date) if inv.due_date else None,
        "paid_date": str(inv.paid_date) if inv.paid_date else None,
        "payment_reference": inv.payment_reference,
        "issuer_role": inv.issuer_role,
        "notes": inv.notes,
        "dispute_reason": inv.dispute_reason,
        "dispute_raised_at": str(inv.dispute_raised_at) if inv.dispute_raised_at else None,
        "dispute_resolved_at": str(inv.dispute_resolved_at) if inv.dispute_resolved_at else None,
        "dispute_resolution_note": inv.dispute_resolution_note,
        "escalated_at": str(inv.escalated_at) if inv.escalated_at else None,
        "escalation_note": inv.escalation_note,
        "linked_ticket_id": inv.linked_ticket_id,
        "milestone_id": inv.milestone_id,
        "days_overdue": days_overdue,
        "created_at": str(inv.created_at) if inv.created_at else None,
        "updated_at": str(inv.updated_at) if inv.updated_at else None,
    }


def _serialize_history(h: SettlementInvoiceHistory) -> dict:
    return {
        "id": h.id,
        "invoice_id": h.invoice_id,
        "actor_id": h.actor_id,
        "actor_name": h.actor_name,
        "action": h.action,
        "old_status": h.old_status,
        "new_status": h.new_status,
        "old_amount_paid": h.old_amount_paid,
        "new_amount_paid": h.new_amount_paid,
        "note": h.note,
        "created_at": str(h.created_at) if h.created_at else None,
    }


async def _generate_invoice_ref(
    db: AsyncSession, disco_name: str, invoice_type: str
) -> str:
    year = datetime.utcnow().year
    disco_code = DISCO_CODES.get(disco_name, disco_name[:4].upper())
    type_code = TYPE_CODES.get(invoice_type, invoice_type[:3].upper())
    prefix = f"{disco_code}-{type_code}-{year}-"

    result = await db.execute(
        select(func.count(SettlementInvoice.id)).where(
            SettlementInvoice.invoice_ref.like(f"{prefix}%")
        )
    )
    count = result.scalar() or 0
    return f"{prefix}{count + 1:03d}"


async def _compute_net_position(db: AsyncSession, site_name: str, billing_period: str):
    result = await db.execute(
        select(SettlementInvoice).where(
            and_(
                SettlementInvoice.site_name == site_name,
                SettlementInvoice.billing_period == billing_period,
            )
        )
    )
    invoices = result.scalars().all()
    if not invoices:
        return None

    now = datetime.utcnow()
    total_dev_owes = sum(
        i.amount_usd for i in invoices if i.direction == "dev_to_disco"
    )
    total_disco_owes = sum(
        i.amount_usd for i in invoices if i.direction == "disco_to_dev"
    )
    net_position = total_disco_owes - total_dev_owes
    paid_count = sum(1 for i in invoices if i.status == "paid")
    overdue_count = sum(
        1 for i in invoices
        if i.status == "overdue" or (i.status == "pending" and i.due_date and i.due_date < now)
    )
    disputed_count = sum(1 for i in invoices if i.status == "disputed")
    has_arrears = overdue_count > 0

    existing = await db.execute(
        select(SettlementNetPosition).where(
            and_(
                SettlementNetPosition.site_name == site_name,
                SettlementNetPosition.billing_period == billing_period,
            )
        )
    )
    pos = existing.scalar_one_or_none()
    if pos:
        pos.total_dev_owes_usd = round(total_dev_owes, 2)
        pos.total_disco_owes_usd = round(total_disco_owes, 2)
        pos.net_position_usd = round(net_position, 2)
        pos.invoices_count = len(invoices)
        pos.paid_count = paid_count
        pos.overdue_count = overdue_count
        pos.disputed_count = disputed_count
        pos.has_arrears = has_arrears
        pos.computed_at = utcnow()
    else:
        site_id = invoices[0].site_id if invoices else None
        award_id = invoices[0].award_id if invoices else None
        pos = SettlementNetPosition(
            site_id=site_id,
            site_name=site_name,
            award_id=award_id,
            billing_period=billing_period,
            total_dev_owes_usd=round(total_dev_owes, 2),
            total_disco_owes_usd=round(total_disco_owes, 2),
            net_position_usd=round(net_position, 2),
            invoices_count=len(invoices),
            paid_count=paid_count,
            overdue_count=overdue_count,
            disputed_count=disputed_count,
            has_arrears=has_arrears,
        )
        db.add(pos)

    return pos


def _add_audit(auth: AuthContext, action: str, entity_id: str, details: dict) -> AuditLog:
    return AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action=action,
        entity_type="settlement_invoice",
        entity_id=entity_id,
        after_json=details,
    )


# ── Dashboard ─────────────────────────────────────────────────────

@router.get("/settlement/dashboard")
async def settlement_dashboard(
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("settlement")),
):
    result = await db.execute(select(SettlementInvoice))
    invoices = result.scalars().all()

    now = datetime.utcnow()
    total_invoiced = sum(i.amount_usd for i in invoices)
    total_paid = sum(i.amount_usd for i in invoices if i.status == "paid")
    total_pending = sum(
        i.amount_usd for i in invoices if i.status in ("pending", "partial")
    )
    total_overdue = sum(i.amount_usd for i in invoices if i.status == "overdue")
    disputed_invoices = [i for i in invoices if i.status == "disputed"]
    total_disputed = sum(i.amount_usd for i in disputed_invoices)

    by_type = {
        "grid_import_usd": sum(i.amount_usd for i in invoices if i.invoice_type == "grid_import"),
        "power_export_usd": sum(i.amount_usd for i in invoices if i.invoice_type == "power_export"),
        "grid_lease_usd": sum(i.amount_usd for i in invoices if i.invoice_type == "grid_lease"),
        "duos_usd": sum(i.amount_usd for i in invoices if i.invoice_type == "duos"),
    }

    disco_map: dict[str, dict] = {}
    for i in invoices:
        if i.disco_name not in disco_map:
            disco_map[i.disco_name] = {"disco_name": i.disco_name, "total_usd": 0, "overdue_usd": 0, "disputed_count": 0}
        disco_map[i.disco_name]["total_usd"] += i.amount_usd
        if i.status == "overdue":
            disco_map[i.disco_name]["overdue_usd"] += i.amount_usd
        if i.status == "disputed":
            disco_map[i.disco_name]["disputed_count"] += 1

    overdue_list = sorted(
        [i for i in invoices if i.status == "overdue" or (i.status == "pending" and i.due_date and i.due_date < now)],
        key=lambda x: (now - x.due_date).days if x.due_date else 0,
        reverse=True,
    )[:10]

    net_result = await db.execute(select(SettlementNetPosition))
    positions = net_result.scalars().all()
    sites_with_arrears = sum(1 for p in positions if p.has_arrears)
    sites_with_m3_risk = sum(1 for p in positions if p.milestone_3_risk)
    aggregate_net = sum(p.net_position_usd for p in positions)

    history_result = await db.execute(
        select(SettlementInvoiceHistory)
        .order_by(SettlementInvoiceHistory.created_at.desc())
        .limit(10)
    )
    recent_activity = [_serialize_history(h) for h in history_result.scalars().all()]

    return {
        "total_invoiced_usd": round(total_invoiced, 2),
        "total_paid_usd": round(total_paid, 2),
        "total_pending_usd": round(total_pending, 2),
        "total_overdue_usd": round(total_overdue, 2),
        "total_disputed_count": len(disputed_invoices),
        "total_disputed_usd": round(total_disputed, 2),
        "sites_with_arrears": sites_with_arrears,
        "sites_with_m3_risk": sites_with_m3_risk,
        "net_position_usd": round(aggregate_net, 2),
        "by_type": by_type,
        "by_disco": list(disco_map.values()),
        "overdue_invoices": [_serialize_invoice(i) for i in overdue_list],
        "recent_activity": recent_activity,
    }


# ── CRUD ──────────────────────────────────────────────────────────

@router.get("/settlement/invoices")
async def list_invoices(
    site_id: Optional[str] = Query(None),
    site_name: Optional[str] = Query(None),
    invoice_type: Optional[str] = Query(None),
    direction: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    disco_name: Optional[str] = Query(None),
    period: Optional[str] = Query(None),
    sort: str = Query("due_date"),
    order: str = Query("desc"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("settlement")),
):
    query = select(SettlementInvoice)
    count_query = select(func.count(SettlementInvoice.id))

    filters = []
    if site_id:
        filters.append(SettlementInvoice.site_id == site_id)
    if site_name:
        filters.append(SettlementInvoice.site_name == site_name)
    if invoice_type:
        filters.append(SettlementInvoice.invoice_type == invoice_type)
    if direction:
        filters.append(SettlementInvoice.direction == direction)
    if status:
        filters.append(SettlementInvoice.status == status)
    if disco_name:
        filters.append(SettlementInvoice.disco_name == disco_name)
    if period:
        filters.append(SettlementInvoice.billing_period == period)

    for f in filters:
        query = query.where(f)
        count_query = count_query.where(f)

    sort_col = getattr(SettlementInvoice, sort, SettlementInvoice.due_date)
    query = query.order_by(sort_col.desc() if order == "desc" else sort_col.asc())

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(query.offset(offset).limit(limit))
    invoices = result.scalars().all()

    return {
        "invoices": [_serialize_invoice(i) for i in invoices],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.get("/settlement/invoices/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("settlement")),
):
    result = await db.execute(
        select(SettlementInvoice)
        .where(SettlementInvoice.id == invoice_id)
        .options(
            selectinload(SettlementInvoice.history),
            selectinload(SettlementInvoice.attachments),
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Invoice not found")

    data = _serialize_invoice(inv)
    data["history"] = [_serialize_history(h) for h in (inv.history or [])]
    data["attachments"] = [
        {
            "id": a.id,
            "attachment_type": a.attachment_type,
            "filename": a.filename,
            "file_url": a.file_url,
            "file_size_bytes": a.file_size_bytes,
            "notes": a.notes,
            "uploaded_at": str(a.uploaded_at) if a.uploaded_at else None,
        }
        for a in (inv.attachments or [])
    ]

    net_result = await db.execute(
        select(SettlementNetPosition).where(
            and_(
                SettlementNetPosition.site_name == inv.site_name,
                SettlementNetPosition.billing_period == inv.billing_period,
            )
        )
    )
    net_pos = net_result.scalar_one_or_none()
    if net_pos:
        data["net_position"] = {
            "total_dev_owes_usd": net_pos.total_dev_owes_usd,
            "total_disco_owes_usd": net_pos.total_disco_owes_usd,
            "net_position_usd": net_pos.net_position_usd,
            "has_arrears": net_pos.has_arrears,
            "milestone_3_risk": net_pos.milestone_3_risk,
        }

    return data


@router.post("/settlement/invoices", status_code=201)
async def create_invoice(
    body: InvoiceCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("settlement")),
):
    if body.invoice_type not in TYPE_CODES:
        raise HTTPException(400, f"Invalid invoice_type. Must be one of: {', '.join(TYPE_CODES.keys())}")

    direction = DIRECTION_MAP.get(body.invoice_type, "dev_to_disco")
    invoice_ref = await _generate_invoice_ref(db, body.disco_name, body.invoice_type)

    inv = SettlementInvoice(
        invoice_ref=invoice_ref,
        site_id=body.site_id,
        site_name=body.site_name,
        award_id=body.award_id,
        disco_name=body.disco_name,
        developer_name=body.developer_name,
        invoice_type=body.invoice_type,
        direction=direction,
        billing_period=body.billing_period,
        amount_usd=body.amount_usd,
        amount_ngn=body.amount_ngn,
        exchange_rate=body.exchange_rate,
        kwh_quantity=body.kwh_quantity,
        rate_per_kwh=body.rate_per_kwh,
        bulk_meter_reading_start=body.bulk_meter_reading_start,
        bulk_meter_reading_end=body.bulk_meter_reading_end,
        bulk_meter_id=body.bulk_meter_id,
        status="pending",
        issued_date=body.issued_date,
        due_date=body.due_date,
        issuer_role=body.issuer_role,
        notes=body.notes,
        milestone_id=body.milestone_id,
    )
    db.add(inv)

    db.add(SettlementInvoiceHistory(
        invoice_id=inv.id,
        actor_id=auth.user_id,
        actor_name=auth.name,
        action="created",
        new_status="pending",
        note=f"Invoice {invoice_ref} created",
    ))
    db.add(_add_audit(auth, "SETTLEMENT_INVOICE_CREATED", inv.id, {
        "invoice_ref": invoice_ref,
        "amount_usd": body.amount_usd,
        "invoice_type": body.invoice_type,
    }))

    await db.commit()
    await db.refresh(inv)

    await _compute_net_position(db, inv.site_name, inv.billing_period)
    await db.commit()

    return _serialize_invoice(inv)


@router.patch("/settlement/invoices/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    body: InvoiceUpdate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("settlement")),
):
    result = await db.execute(
        select(SettlementInvoice).where(SettlementInvoice.id == invoice_id)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Invoice not found")

    changes = {}
    for field in ("amount_usd", "status", "notes", "payment_reference", "due_date"):
        val = getattr(body, field, None)
        if val is not None:
            old_val = getattr(inv, field)
            setattr(inv, field, val)
            changes[field] = {"old": str(old_val), "new": str(val)}

            if field == "status":
                db.add(SettlementInvoiceHistory(
                    invoice_id=inv.id,
                    actor_id=auth.user_id,
                    actor_name=auth.name,
                    action="status_changed",
                    old_status=str(old_val),
                    new_status=str(val),
                ))

    inv.updated_at = utcnow()
    db.add(_add_audit(auth, "SETTLEMENT_STATUS_CHANGED", inv.id, changes))
    await db.commit()
    await db.refresh(inv)

    if "status" in changes or "amount_usd" in changes:
        await _compute_net_position(db, inv.site_name, inv.billing_period)
        await db.commit()

    return _serialize_invoice(inv)


# ── Payment ───────────────────────────────────────────────────────

@router.post("/settlement/invoices/{invoice_id}/pay")
async def record_payment(
    invoice_id: str,
    body: PaymentBody,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("settlement")),
):
    result = await db.execute(
        select(SettlementInvoice).where(SettlementInvoice.id == invoice_id)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.status in ("paid", "cancelled"):
        raise HTTPException(400, f"Cannot record payment on {inv.status} invoice")

    old_status = inv.status
    old_paid = inv.amount_paid_usd or 0.0
    new_paid = old_paid + body.amount_paid_usd

    inv.amount_paid_usd = new_paid
    inv.payment_reference = body.payment_reference or inv.payment_reference
    inv.paid_date = body.paid_date or utcnow()
    if body.notes:
        inv.notes = (inv.notes or "") + f"\n{body.notes}" if inv.notes else body.notes

    if new_paid >= inv.amount_usd:
        inv.status = "paid"
        action = "payment_recorded"
    else:
        inv.status = "partial"
        action = "partial_payment"

    inv.updated_at = utcnow()

    db.add(SettlementInvoiceHistory(
        invoice_id=inv.id,
        actor_id=auth.user_id,
        actor_name=auth.name,
        action=action,
        old_status=old_status,
        new_status=inv.status,
        old_amount_paid=old_paid,
        new_amount_paid=new_paid,
        note=f"Payment: ${body.amount_paid_usd:,.2f} ref={body.payment_reference}",
    ))
    db.add(_add_audit(auth, "SETTLEMENT_PAYMENT_RECORDED", inv.id, {
        "amount_paid": body.amount_paid_usd,
        "payment_reference": body.payment_reference,
        "new_total_paid": new_paid,
    }))

    await db.commit()
    await db.refresh(inv)
    await _compute_net_position(db, inv.site_name, inv.billing_period)
    await db.commit()

    return _serialize_invoice(inv)


# ── Dispute ───────────────────────────────────────────────────────

@router.post("/settlement/invoices/{invoice_id}/dispute")
async def raise_dispute(
    invoice_id: str,
    body: DisputeBody,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("settlement")),
):
    result = await db.execute(
        select(SettlementInvoice).where(SettlementInvoice.id == invoice_id)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.status in ("paid", "cancelled", "disputed"):
        raise HTTPException(400, f"Cannot dispute a {inv.status} invoice")

    old_status = inv.status
    inv.status = "disputed"
    inv.dispute_reason = body.dispute_reason
    inv.dispute_raised_at = utcnow()
    inv.dispute_raised_by = auth.user_id
    inv.updated_at = utcnow()

    ticket = Ticket(
        ticket_ref=f"TKT-{datetime.utcnow().year}-D{invoice_id[:4]}",
        title=f"Settlement dispute: {inv.invoice_ref} — {inv.site_name}",
        description=body.dispute_reason,
        category="Commercial",
        priority="High",
        status="open",
        sla_hours=72,
        reporter_name=auth.name,
        reporter_org="REA PMU",
        site_name=inv.site_name,
        site_id=inv.site_id,
        award_id=inv.award_id,
        tags=["settlement", "dispute", inv.disco_name],
    )
    db.add(ticket)
    await db.flush()
    inv.linked_ticket_id = ticket.id

    db.add(SettlementInvoiceHistory(
        invoice_id=inv.id,
        actor_id=auth.user_id,
        actor_name=auth.name,
        action="dispute_raised",
        old_status=old_status,
        new_status="disputed",
        note=body.dispute_reason,
    ))
    db.add(_add_audit(auth, "SETTLEMENT_DISPUTE_RAISED", inv.id, {
        "dispute_reason": body.dispute_reason,
        "linked_ticket_id": ticket.id,
    }))

    await db.commit()
    await db.refresh(inv)
    await _compute_net_position(db, inv.site_name, inv.billing_period)
    await db.commit()

    data = _serialize_invoice(inv)
    data["linked_ticket_ref"] = ticket.ticket_ref
    return data


@router.post("/settlement/invoices/{invoice_id}/resolve-dispute")
async def resolve_dispute(
    invoice_id: str,
    body: ResolveDisputeBody,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("settlement")),
):
    result = await db.execute(
        select(SettlementInvoice).where(SettlementInvoice.id == invoice_id)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.status != "disputed":
        raise HTTPException(400, "No active dispute to resolve")

    inv.dispute_resolved_at = utcnow()
    inv.dispute_resolved_by = auth.user_id
    inv.dispute_resolution_note = body.resolution_note

    if body.agreed_amount_usd is not None:
        inv.amount_usd = body.agreed_amount_usd

    inv.status = body.new_status
    inv.updated_at = utcnow()

    if inv.linked_ticket_id:
        ticket_result = await db.execute(
            select(Ticket).where(Ticket.id == inv.linked_ticket_id)
        )
        ticket = ticket_result.scalar_one_or_none()
        if ticket:
            ticket.status = "resolved"
            ticket.resolved_at = utcnow()
            ticket.resolution_summary = body.resolution_note

    db.add(SettlementInvoiceHistory(
        invoice_id=inv.id,
        actor_id=auth.user_id,
        actor_name=auth.name,
        action="dispute_resolved",
        old_status="disputed",
        new_status=inv.status,
        note=body.resolution_note,
    ))
    db.add(_add_audit(auth, "SETTLEMENT_DISPUTE_RESOLVED", inv.id, {
        "resolution_note": body.resolution_note,
        "new_status": inv.status,
        "agreed_amount_usd": body.agreed_amount_usd,
    }))

    await db.commit()
    await db.refresh(inv)
    await _compute_net_position(db, inv.site_name, inv.billing_period)
    await db.commit()

    return _serialize_invoice(inv)


# ── Escalate ──────────────────────────────────────────────────────

@router.post("/settlement/invoices/{invoice_id}/escalate")
async def escalate_invoice(
    invoice_id: str,
    body: EscalateBody,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("settlement")),
):
    result = await db.execute(
        select(SettlementInvoice).where(SettlementInvoice.id == invoice_id)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Invoice not found")

    old_status = inv.status
    inv.status = "escalated"
    inv.escalated_at = utcnow()
    inv.escalated_by = auth.user_id
    inv.escalation_note = body.escalation_note
    inv.escalated_to = body.escalated_to
    inv.updated_at = utcnow()

    if not inv.linked_ticket_id:
        ticket = Ticket(
            ticket_ref=f"TKT-{datetime.utcnow().year}-E{invoice_id[:4]}",
            title=f"Escalated settlement: {inv.invoice_ref} — {inv.site_name}",
            description=body.escalation_note,
            category="Commercial",
            priority="Critical",
            status="escalated",
            sla_hours=24,
            reporter_name=auth.name,
            reporter_org="REA PMU",
            site_name=inv.site_name,
            site_id=inv.site_id,
            tags=["settlement", "escalation", inv.disco_name],
        )
        db.add(ticket)
        await db.flush()
        inv.linked_ticket_id = ticket.id

    db.add(SettlementInvoiceHistory(
        invoice_id=inv.id,
        actor_id=auth.user_id,
        actor_name=auth.name,
        action="escalated",
        old_status=old_status,
        new_status="escalated",
        note=body.escalation_note,
    ))
    db.add(_add_audit(auth, "SETTLEMENT_ESCALATED", inv.id, {
        "escalation_note": body.escalation_note,
        "escalated_to": body.escalated_to,
    }))

    await db.commit()
    await db.refresh(inv)
    return _serialize_invoice(inv)


# ── History ───────────────────────────────────────────────────────

@router.get("/settlement/invoices/{invoice_id}/history")
async def invoice_history(
    invoice_id: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("settlement")),
):
    result = await db.execute(
        select(SettlementInvoiceHistory)
        .where(SettlementInvoiceHistory.invoice_id == invoice_id)
        .order_by(SettlementInvoiceHistory.created_at.asc())
    )
    return {"history": [_serialize_history(h) for h in result.scalars().all()]}


# ── Net Positions ─────────────────────────────────────────────────

@router.get("/settlement/net-positions")
async def list_net_positions(
    site_name: Optional[str] = Query(None),
    period: Optional[str] = Query(None),
    has_arrears: Optional[bool] = Query(None),
    milestone_3_risk: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("settlement")),
):
    query = select(SettlementNetPosition).order_by(
        SettlementNetPosition.billing_period.desc()
    )
    if site_name:
        query = query.where(SettlementNetPosition.site_name == site_name)
    if period:
        query = query.where(SettlementNetPosition.billing_period == period)
    if has_arrears is not None:
        query = query.where(SettlementNetPosition.has_arrears == has_arrears)
    if milestone_3_risk is not None:
        query = query.where(SettlementNetPosition.milestone_3_risk == milestone_3_risk)

    result = await db.execute(query)
    positions = result.scalars().all()
    return {
        "positions": [
            {
                "id": p.id,
                "site_id": p.site_id,
                "site_name": p.site_name,
                "billing_period": p.billing_period,
                "total_dev_owes_usd": p.total_dev_owes_usd,
                "total_disco_owes_usd": p.total_disco_owes_usd,
                "net_position_usd": p.net_position_usd,
                "invoices_count": p.invoices_count,
                "paid_count": p.paid_count,
                "overdue_count": p.overdue_count,
                "disputed_count": p.disputed_count,
                "has_arrears": p.has_arrears,
                "arrears_months": p.arrears_months,
                "milestone_3_risk": p.milestone_3_risk,
                "computed_at": str(p.computed_at) if p.computed_at else None,
            }
            for p in positions
        ]
    }


@router.post("/settlement/net-positions/recompute")
async def recompute_net_positions(
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("settlement")),
):
    result = await db.execute(
        select(
            SettlementInvoice.site_name,
            SettlementInvoice.billing_period,
        ).distinct()
    )
    combos = result.all()
    computed = 0
    for site_name, period in combos:
        if site_name:
            await _compute_net_position(db, site_name, period)
            computed += 1
    await db.commit()
    return {"recomputed": computed}


# ── Export ─────────────────────────────────────────────────────────

@router.get("/settlement/export")
async def export_invoices(
    format: str = Query("json"),
    status: Optional[str] = Query(None),
    disco_name: Optional[str] = Query(None),
    period: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("settlement")),
):
    query = select(SettlementInvoice).order_by(SettlementInvoice.billing_period.desc())
    if status:
        query = query.where(SettlementInvoice.status == status)
    if disco_name:
        query = query.where(SettlementInvoice.disco_name == disco_name)
    if period:
        query = query.where(SettlementInvoice.billing_period == period)

    result = await db.execute(query)
    invoices = [_serialize_invoice(i) for i in result.scalars().all()]

    if format == "csv":
        if not invoices:
            return {"csv": ""}
        headers = list(invoices[0].keys())
        lines = [",".join(headers)]
        for inv in invoices:
            lines.append(",".join(str(inv.get(h, "")).replace(",", ";") for h in headers))
        return {"csv": "\n".join(lines), "count": len(invoices)}

    return {"invoices": invoices, "count": len(invoices)}


# ── Keep old endpoints working (backward compat) ─────────────────

@router.get("/settlements-ledger")
async def old_list(
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("settlement")),
):
    result = await db.execute(
        select(SettlementInvoice).order_by(SettlementInvoice.created_at.desc()).limit(50)
    )
    invoices = result.scalars().all()
    return {
        "items": [_serialize_invoice(i) for i in invoices],
        "total": len(invoices),
        "offset": 0,
        "limit": 50,
    }


@router.get("/settlements-ledger/dashboard")
async def old_dashboard(
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("settlement")),
):
    return await settlement_dashboard(db=db, auth=auth)
