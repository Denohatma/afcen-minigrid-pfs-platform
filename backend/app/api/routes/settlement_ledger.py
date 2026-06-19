"""
Module 11 -- DisCo Settlement & Dispute

Settlement ledger between DisCo and mini-grid developer: monthly
energy metering, invoicing, dispute lifecycle, and payment tracking.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import SettlementLedger, AuditLog, utcnow
from app.dependencies.auth import (
    AuthContext,
    get_current_user,
    require_module,
    require_module_write,
)

router = APIRouter()

# -- Pydantic schemas -------------------------------------------------------


class SettlementCreate(BaseModel):
    site_id: str
    grant_agreement_id: Optional[str] = None
    month: str = Field(..., pattern=r"^\d{4}-\d{2}$", description="YYYY-MM")
    bulk_meter_kwh: float = 0.0
    grid_import_kwh: float = 0.0
    der_generation_kwh: float = 0.0
    duos_charge_usd: float = 0.0
    grid_energy_charge_usd: float = 0.0
    total_settlement_usd: float = 0.0
    invoice_ref: str = ""
    invoice_file_key: str = ""


class DisputeBody(BaseModel):
    dispute_reason: str
    dispute_category: str = "metering"


class ResolveBody(BaseModel):
    resolution_notes: str
    resolved_amount_usd: float


class ConfirmPaymentBody(BaseModel):
    payment_reference: str = ""


# -- Helpers -----------------------------------------------------------------


def _row_to_dict(row: SettlementLedger) -> dict:
    return {
        "id": row.id,
        "site_id": row.site_id,
        "grant_agreement_id": row.grant_agreement_id,
        "month": row.month,
        "bulk_meter_kwh": row.bulk_meter_kwh,
        "grid_import_kwh": row.grid_import_kwh,
        "der_generation_kwh": row.der_generation_kwh,
        "duos_charge_usd": row.duos_charge_usd,
        "grid_energy_charge_usd": row.grid_energy_charge_usd,
        "total_settlement_usd": row.total_settlement_usd,
        "invoice_ref": row.invoice_ref,
        "invoice_file_key": row.invoice_file_key,
        "developer_accepted": row.developer_accepted,
        "dispute_status": row.dispute_status,
        "dispute_reason": row.dispute_reason,
        "dispute_category": row.dispute_category,
        "resolution_notes": row.resolution_notes,
        "resolved_amount_usd": row.resolved_amount_usd,
        "payment_status": row.payment_status,
        "payment_confirmed_at": str(row.payment_confirmed_at) if row.payment_confirmed_at else None,
        "created_at": str(row.created_at),
        "updated_at": str(row.updated_at),
    }


async def _get_record_or_404(
    record_id: str,
    db: AsyncSession,
) -> SettlementLedger:
    result = await db.execute(
        select(SettlementLedger).where(SettlementLedger.id == record_id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Settlement record not found")
    return record


async def _audit(
    db: AsyncSession,
    auth: AuthContext,
    action: str,
    entity_id: str | None,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    db.add(AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action=action,
        entity_type="settlement_ledger",
        entity_id=entity_id,
        before_json=before,
        after_json=after,
    ))


# -- Routes ------------------------------------------------------------------


@router.get("/settlements-ledger")
async def list_settlement_records(
    site_id: Optional[str] = Query(None, description="Filter by site"),
    month: Optional[str] = Query(None, description="Filter by month YYYY-MM"),
    payment_status: Optional[str] = Query(None, description="Filter by payment status"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("settlement")),
):
    """List settlement ledger records with optional filters."""
    query = select(SettlementLedger).order_by(
        SettlementLedger.month.desc(), SettlementLedger.created_at.desc()
    )
    count_query = select(func.count(SettlementLedger.id))

    if site_id:
        query = query.where(SettlementLedger.site_id == site_id)
        count_query = count_query.where(SettlementLedger.site_id == site_id)
    if month:
        query = query.where(SettlementLedger.month == month)
        count_query = count_query.where(SettlementLedger.month == month)
    if payment_status:
        query = query.where(SettlementLedger.payment_status == payment_status)
        count_query = count_query.where(SettlementLedger.payment_status == payment_status)

    total = (await db.execute(count_query)).scalar() or 0
    query = query.offset(offset).limit(limit)
    rows = (await db.execute(query)).scalars().all()

    return {
        "items": [_row_to_dict(r) for r in rows],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.get("/settlements-ledger/dashboard")
async def settlement_dashboard(
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("settlement")),
):
    """Aggregate settlement dashboard statistics."""
    result = await db.execute(select(SettlementLedger))
    records = result.scalars().all()

    total_billed = sum(r.total_settlement_usd for r in records)
    total_paid = sum(
        r.total_settlement_usd
        for r in records
        if r.payment_status == "confirmed"
    )
    total_resolved = sum(
        (r.resolved_amount_usd or 0.0)
        for r in records
        if r.dispute_status == "resolved"
    )

    by_payment_status: dict[str, dict] = {}
    for r in records:
        status = r.payment_status or "pending"
        if status not in by_payment_status:
            by_payment_status[status] = {"count": 0, "amount_usd": 0.0}
        by_payment_status[status]["count"] += 1
        by_payment_status[status]["amount_usd"] += r.total_settlement_usd

    disputed_count = sum(1 for r in records if r.dispute_status == "open")
    resolved_count = sum(1 for r in records if r.dispute_status == "resolved")
    accepted_count = sum(1 for r in records if r.developer_accepted is True)

    unique_sites = len(set(r.site_id for r in records))
    unique_months = len(set(r.month for r in records))

    total_bulk_kwh = sum(r.bulk_meter_kwh for r in records)
    total_grid_import_kwh = sum(r.grid_import_kwh for r in records)
    total_der_kwh = sum(r.der_generation_kwh for r in records)

    return {
        "total_records": len(records),
        "unique_sites": unique_sites,
        "unique_months": unique_months,
        "total_billed_usd": round(total_billed, 2),
        "total_paid_usd": round(total_paid, 2),
        "total_outstanding_usd": round(total_billed - total_paid, 2),
        "total_resolved_disputes_usd": round(total_resolved, 2),
        "collection_rate_pct": round(total_paid / total_billed * 100, 1) if total_billed > 0 else 0.0,
        "by_payment_status": by_payment_status,
        "disputes_open": disputed_count,
        "disputes_resolved": resolved_count,
        "developer_accepted": accepted_count,
        "energy_totals": {
            "bulk_meter_kwh": round(total_bulk_kwh, 2),
            "grid_import_kwh": round(total_grid_import_kwh, 2),
            "der_generation_kwh": round(total_der_kwh, 2),
        },
    }


@router.get("/settlements-ledger/{record_id}")
async def get_settlement_record(
    record_id: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module("settlement")),
):
    """Retrieve a single settlement ledger record."""
    record = await _get_record_or_404(record_id, db)
    return _row_to_dict(record)


@router.post("/settlements-ledger", status_code=201)
async def create_settlement_record(
    body: SettlementCreate,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("settlement")),
):
    """Create a new settlement ledger record for a site-month."""
    record = SettlementLedger(
        site_id=body.site_id,
        grant_agreement_id=body.grant_agreement_id,
        month=body.month,
        bulk_meter_kwh=body.bulk_meter_kwh,
        grid_import_kwh=body.grid_import_kwh,
        der_generation_kwh=body.der_generation_kwh,
        duos_charge_usd=body.duos_charge_usd,
        grid_energy_charge_usd=body.grid_energy_charge_usd,
        total_settlement_usd=body.total_settlement_usd,
        invoice_ref=body.invoice_ref,
        invoice_file_key=body.invoice_file_key,
        payment_status="pending",
    )
    db.add(record)
    await db.flush()

    await _audit(db, auth, "settlement_created", record.id, after=body.model_dump())
    await db.commit()
    await db.refresh(record)

    return _row_to_dict(record)


@router.put("/settlements-ledger/{record_id}/accept")
async def accept_settlement(
    record_id: str,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("settlement")),
):
    """Developer accepts the settlement statement."""
    record = await _get_record_or_404(record_id, db)

    if record.developer_accepted is True:
        raise HTTPException(400, "Settlement already accepted")
    if record.dispute_status == "open":
        raise HTTPException(400, "Cannot accept while a dispute is open")

    before = {"developer_accepted": record.developer_accepted}
    record.developer_accepted = True
    record.updated_at = utcnow()

    await _audit(
        db, auth, "settlement_accepted", record.id,
        before=before,
        after={"developer_accepted": True},
    )
    await db.commit()
    await db.refresh(record)

    return _row_to_dict(record)


@router.put("/settlements-ledger/{record_id}/dispute")
async def raise_dispute(
    record_id: str,
    body: DisputeBody,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("settlement")),
):
    """Raise a dispute against a settlement record."""
    record = await _get_record_or_404(record_id, db)

    if record.dispute_status == "open":
        raise HTTPException(400, "Dispute already open for this record")
    if record.payment_status == "confirmed":
        raise HTTPException(400, "Cannot dispute an already-confirmed payment")

    before = {
        "dispute_status": record.dispute_status,
        "developer_accepted": record.developer_accepted,
    }

    record.dispute_status = "open"
    record.dispute_reason = body.dispute_reason
    record.dispute_category = body.dispute_category
    record.developer_accepted = False
    record.updated_at = utcnow()

    await _audit(
        db, auth, "settlement_disputed", record.id,
        before=before,
        after={
            "dispute_status": "open",
            "dispute_reason": body.dispute_reason,
            "dispute_category": body.dispute_category,
        },
    )
    await db.commit()
    await db.refresh(record)

    return _row_to_dict(record)


@router.put("/settlements-ledger/{record_id}/resolve")
async def resolve_dispute(
    record_id: str,
    body: ResolveBody,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("settlement")),
):
    """Resolve an open dispute on a settlement record."""
    record = await _get_record_or_404(record_id, db)

    if record.dispute_status != "open":
        raise HTTPException(400, "No open dispute to resolve")

    before = {
        "dispute_status": record.dispute_status,
        "resolved_amount_usd": record.resolved_amount_usd,
    }

    record.dispute_status = "resolved"
    record.resolution_notes = body.resolution_notes
    record.resolved_amount_usd = body.resolved_amount_usd
    record.updated_at = utcnow()

    await _audit(
        db, auth, "settlement_dispute_resolved", record.id,
        before=before,
        after={
            "dispute_status": "resolved",
            "resolution_notes": body.resolution_notes,
            "resolved_amount_usd": body.resolved_amount_usd,
        },
    )
    await db.commit()
    await db.refresh(record)

    return _row_to_dict(record)


@router.put("/settlements-ledger/{record_id}/confirm-payment")
async def confirm_payment(
    record_id: str,
    body: ConfirmPaymentBody,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(require_module_write("settlement")),
):
    """Confirm payment has been made for a settlement record."""
    record = await _get_record_or_404(record_id, db)

    if record.payment_status == "confirmed":
        raise HTTPException(400, "Payment already confirmed")
    if record.dispute_status == "open":
        raise HTTPException(400, "Cannot confirm payment while dispute is open")

    before = {"payment_status": record.payment_status}

    record.payment_status = "confirmed"
    record.payment_confirmed_at = utcnow()
    record.updated_at = utcnow()

    await _audit(
        db, auth, "settlement_payment_confirmed", record.id,
        before=before,
        after={
            "payment_status": "confirmed",
            "payment_reference": body.payment_reference,
        },
    )
    await db.commit()
    await db.refresh(record)

    return _row_to_dict(record)
