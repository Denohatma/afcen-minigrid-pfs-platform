"""
Module 5 — Lots, Data Rooms & Tenders
Routes for lot assembly, data-room management, tender lifecycle,
bidder registration, bid submission, and tender Q&A.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.db.models import (
    Lot, LotSite, DataRoom, DataRoomDocument,
    Tender, TenderQuestion, TenderAddendum,
    Bidder, NDAAcceptance, Bid,
    SiteRegistry, AuditLog,
    utcnow, new_uuid,
)
from app.dependencies.auth import (
    AuthContext, get_current_user, require_module, require_module_write,
)

router = APIRouter()

# ── 8-folder standard for DARES data rooms ───────────────────────────

DATA_ROOM_FOLDERS = {
    1: "Project Overview & Site Data",
    2: "Technical Design & Specifications",
    3: "Environmental & Social Documents",
    4: "Financial Model & Tariff Methodology",
    5: "Legal & Regulatory Framework",
    6: "DisCo Interconnection Agreements",
    7: "Land & Community Agreements",
    8: "Procurement & Evaluation Criteria",
}

# ── Pydantic request / response bodies ───────────────────────────────


class LotCreate(BaseModel):
    program_id: Optional[str] = None
    lot_name: str
    disco: str
    state: str = ""
    grant_ceiling_pct: float = 0.40
    grant_ceiling_usd: float = 0.0
    evaluation_method: str = "quality_cost"


class LotUpdate(BaseModel):
    lot_name: Optional[str] = None
    disco: Optional[str] = None
    state: Optional[str] = None
    grant_ceiling_pct: Optional[float] = None
    grant_ceiling_usd: Optional[float] = None
    evaluation_method: Optional[str] = None


class SiteIds(BaseModel):
    site_ids: List[str]


class DataRoomDocCreate(BaseModel):
    folder_number: int
    folder_name: str = ""
    filename: str
    storage_key: str = ""
    file_size: int = 0


class TenderCreate(BaseModel):
    tender_reference: str = ""
    procurement_method: str = "open_competitive"
    title: str = ""
    description: str = ""
    currency: str = "USD"
    grant_ceiling_pct: float = 0.40
    bid_validity_days: int = 90
    bid_security_amount: float = 0.0
    eoi_deadline: Optional[str] = None
    clarification_deadline: Optional[str] = None
    submission_deadline: Optional[str] = None
    bid_opening_date: Optional[str] = None
    bids_encrypted: bool = True


class TenderUpdate(BaseModel):
    tender_reference: Optional[str] = None
    procurement_method: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    currency: Optional[str] = None
    grant_ceiling_pct: Optional[float] = None
    bid_validity_days: Optional[int] = None
    bid_security_amount: Optional[float] = None
    eoi_deadline: Optional[str] = None
    clarification_deadline: Optional[str] = None
    submission_deadline: Optional[str] = None
    bid_opening_date: Optional[str] = None
    bids_encrypted: Optional[bool] = None


class BidderCreate(BaseModel):
    company_name: str
    registration_number: str = ""
    country: str = "Nigeria"
    contact_name: str
    contact_email: str
    contact_phone: str = ""
    financial_capacity: dict = {}
    track_record: dict = {}
    years_experience: int = 0
    completed_sites: int = 0
    total_capacity_kwp: float = 0.0


class BidderUpdate(BaseModel):
    company_name: Optional[str] = None
    registration_number: Optional[str] = None
    country: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    qualification_status: Optional[str] = None
    kyc_status: Optional[str] = None
    sanctions_check: Optional[str] = None
    financial_capacity: Optional[dict] = None
    track_record: Optional[dict] = None
    docs_status: Optional[dict] = None
    beneficial_ownership: Optional[dict] = None
    years_experience: Optional[int] = None
    completed_sites: Optional[int] = None
    total_capacity_kwp: Optional[float] = None


class BidCreate(BaseModel):
    bidder_id: str
    grant_ask_pct: float = 0.0
    eligible_capex_usd: float = 0.0
    total_capex_usd: float = 0.0
    grant_amount_usd: float = 0.0
    tariff_residential: float = 0.0
    tariff_commercial: float = 0.0
    tariff_pue: float = 0.0
    pv_kwp: float = 0.0
    bess_kwh: float = 0.0
    connections: int = 0
    timeline_months: int = 0
    financing_plan: dict = {}
    technical_proposal: dict = {}
    financial_proposal: dict = {}
    es_proposal: dict = {}
    programme_of_works: dict = {}
    deviations: list = []
    bid_security_ref: str = ""


class QuestionCreate(BaseModel):
    bidder_id: Optional[str] = None
    company_name: str = ""
    question: str


class AnswerBody(BaseModel):
    answer: str
    published: bool = True


# ── Helpers ──────────────────────────────────────────────────────────

def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    """Parse ISO-8601 string to datetime, return None if empty/invalid."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(400, f"Invalid datetime format: {value}. Use ISO 8601.")


def _lot_dict(lot: Lot, *, include_sites: bool = False) -> dict:
    out = {
        "id": lot.id,
        "program_id": lot.program_id,
        "lot_name": lot.lot_name,
        "disco": lot.disco,
        "state": lot.state,
        "grant_ceiling_pct": lot.grant_ceiling_pct,
        "grant_ceiling_usd": lot.grant_ceiling_usd,
        "evaluation_method": lot.evaluation_method,
        "data_room_status": lot.data_room_status,
        "tender_status": lot.tender_status,
        "approval_to_tender": lot.approval_to_tender,
        "approved_by": lot.approved_by,
        "approved_at": str(lot.approved_at) if lot.approved_at else None,
        "site_count": lot.site_count,
        "total_connections": lot.total_connections,
        "created_at": str(lot.created_at) if lot.created_at else None,
        "updated_at": str(lot.updated_at) if lot.updated_at else None,
    }
    if include_sites:
        out["sites"] = [
            {
                "id": ls.id,
                "site_id": ls.site_id,
                "settlement_rank": ls.settlement_rank,
            }
            for ls in (lot.sites or [])
        ]
        dr = lot.data_room
        out["data_room"] = {
            "id": dr.id,
            "completeness_status": dr.completeness_status,
            "nda_required": dr.nda_required,
            "created_at": str(dr.created_at) if dr.created_at else None,
        } if dr else None
    return out


def _tender_dict(t: Tender) -> dict:
    return {
        "id": t.id,
        "lot_id": t.lot_id,
        "tender_reference": t.tender_reference,
        "procurement_method": t.procurement_method,
        "status": t.status,
        "title": t.title,
        "description": t.description,
        "currency": t.currency,
        "grant_ceiling_pct": t.grant_ceiling_pct,
        "bid_validity_days": t.bid_validity_days,
        "bid_security_amount": t.bid_security_amount,
        "eoi_deadline": str(t.eoi_deadline) if t.eoi_deadline else None,
        "clarification_deadline": str(t.clarification_deadline) if t.clarification_deadline else None,
        "submission_deadline": str(t.submission_deadline) if t.submission_deadline else None,
        "bid_opening_date": str(t.bid_opening_date) if t.bid_opening_date else None,
        "bids_encrypted": t.bids_encrypted,
        "issued_at": str(t.issued_at) if t.issued_at else None,
        "closed_at": str(t.closed_at) if t.closed_at else None,
        "awarded_at": str(t.awarded_at) if t.awarded_at else None,
        "created_at": str(t.created_at) if t.created_at else None,
    }


def _bidder_dict(b: Bidder) -> dict:
    return {
        "id": b.id,
        "company_name": b.company_name,
        "registration_number": b.registration_number,
        "country": b.country,
        "contact_name": b.contact_name,
        "contact_email": b.contact_email,
        "contact_phone": b.contact_phone,
        "qualification_status": b.qualification_status,
        "kyc_status": b.kyc_status,
        "sanctions_check": b.sanctions_check,
        "financial_capacity": b.financial_capacity,
        "track_record": b.track_record,
        "docs_status": b.docs_status,
        "beneficial_ownership": b.beneficial_ownership,
        "years_experience": b.years_experience,
        "completed_sites": b.completed_sites,
        "total_capacity_kwp": b.total_capacity_kwp,
        "created_at": str(b.created_at) if b.created_at else None,
        "updated_at": str(b.updated_at) if b.updated_at else None,
    }


def _bid_dict(b: Bid) -> dict:
    return {
        "id": b.id,
        "lot_id": b.lot_id,
        "tender_id": b.tender_id,
        "bidder_id": b.bidder_id,
        "grant_ask_pct": b.grant_ask_pct,
        "eligible_capex_usd": b.eligible_capex_usd,
        "total_capex_usd": b.total_capex_usd,
        "grant_amount_usd": b.grant_amount_usd,
        "tariff_residential": b.tariff_residential,
        "tariff_commercial": b.tariff_commercial,
        "tariff_pue": b.tariff_pue,
        "pv_kwp": b.pv_kwp,
        "bess_kwh": b.bess_kwh,
        "connections": b.connections,
        "timeline_months": b.timeline_months,
        "financing_plan": b.financing_plan,
        "technical_proposal": b.technical_proposal,
        "financial_proposal": b.financial_proposal,
        "es_proposal": b.es_proposal,
        "programme_of_works": b.programme_of_works,
        "deviations": b.deviations,
        "bid_security_ref": b.bid_security_ref,
        "status": b.status,
        "submitted_at": str(b.submitted_at) if b.submitted_at else None,
        "opened_at": str(b.opened_at) if b.opened_at else None,
    }


# =====================================================================
# LOTS
# =====================================================================


@router.get("/lots")
async def list_lots(
    disco: Optional[str] = None,
    status: Optional[str] = None,
    auth: AuthContext = Depends(require_module("tender")),
    db: AsyncSession = Depends(get_db),
):
    """List lots with optional filters by disco and tender_status."""
    q = select(Lot).order_by(Lot.created_at.desc())
    if disco:
        q = q.where(Lot.disco == disco)
    if status:
        q = q.where(Lot.tender_status == status)
    result = await db.execute(q)
    lots = result.scalars().all()
    return {"lots": [_lot_dict(l) for l in lots], "total": len(lots)}


@router.get("/lots/{lot_id}")
async def get_lot(
    lot_id: str,
    auth: AuthContext = Depends(require_module("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Get lot with sites and data room status."""
    result = await db.execute(
        select(Lot)
        .options(selectinload(Lot.sites), selectinload(Lot.data_room))
        .where(Lot.id == lot_id)
    )
    lot = result.scalar_one_or_none()
    if not lot:
        raise HTTPException(404, "Lot not found")
    return _lot_dict(lot, include_sites=True)


@router.post("/lots", status_code=201)
async def create_lot(
    body: LotCreate,
    auth: AuthContext = Depends(require_module_write("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new lot."""
    lot = Lot(
        program_id=body.program_id,
        lot_name=body.lot_name,
        disco=body.disco,
        state=body.state,
        grant_ceiling_pct=body.grant_ceiling_pct,
        grant_ceiling_usd=body.grant_ceiling_usd,
        evaluation_method=body.evaluation_method,
    )
    db.add(lot)
    await db.flush()

    # Auto-create empty data room
    data_room = DataRoom(
        lot_id=lot.id,
        folder_index=DATA_ROOM_FOLDERS,
        completeness_status={str(k): "missing" for k in DATA_ROOM_FOLDERS},
        nda_required=True,
    )
    db.add(data_room)

    audit = AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="lot_created",
        entity_type="lot",
        entity_id=lot.id,
    )
    db.add(audit)

    await db.commit()
    await db.refresh(lot)
    return _lot_dict(lot)


@router.put("/lots/{lot_id}")
async def update_lot(
    lot_id: str,
    body: LotUpdate,
    auth: AuthContext = Depends(require_module_write("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Update lot fields."""
    result = await db.execute(select(Lot).where(Lot.id == lot_id))
    lot = result.scalar_one_or_none()
    if not lot:
        raise HTTPException(404, "Lot not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(lot, field, value)

    await db.commit()
    await db.refresh(lot)
    return _lot_dict(lot)


@router.post("/lots/{lot_id}/sites", status_code=201)
async def add_sites_to_lot(
    lot_id: str,
    body: SiteIds,
    auth: AuthContext = Depends(require_module_write("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Add sites to a lot by site IDs."""
    result = await db.execute(select(Lot).where(Lot.id == lot_id))
    lot = result.scalar_one_or_none()
    if not lot:
        raise HTTPException(404, "Lot not found")

    # Existing site_ids in this lot
    existing_result = await db.execute(
        select(LotSite.site_id).where(LotSite.lot_id == lot_id)
    )
    existing_ids = {r[0] for r in existing_result.all()}

    added = []
    for sid in body.site_ids:
        if sid in existing_ids:
            continue
        # Verify the site exists
        site_check = await db.execute(
            select(SiteRegistry.id).where(SiteRegistry.id == sid)
        )
        if not site_check.scalar_one_or_none():
            raise HTTPException(404, f"Site {sid} not found")

        ls = LotSite(lot_id=lot_id, site_id=sid)
        db.add(ls)
        added.append(sid)

    # Update lot aggregate counts
    count_result = await db.execute(
        select(func.count()).select_from(LotSite).where(LotSite.lot_id == lot_id)
    )
    new_count = (count_result.scalar() or 0) + len(added)
    lot.site_count = new_count

    conn_result = await db.execute(
        select(func.coalesce(func.sum(SiteRegistry.customers), 0)).where(
            SiteRegistry.id.in_(
                select(LotSite.site_id).where(LotSite.lot_id == lot_id)
            )
        )
    )
    lot.total_connections = conn_result.scalar() or 0

    await db.commit()
    return {"lot_id": lot_id, "added": added, "site_count": lot.site_count}


@router.delete("/lots/{lot_id}/sites/{site_id}", status_code=204)
async def remove_site_from_lot(
    lot_id: str,
    site_id: str,
    auth: AuthContext = Depends(require_module_write("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Remove a site from a lot."""
    result = await db.execute(
        select(LotSite).where(LotSite.lot_id == lot_id, LotSite.site_id == site_id)
    )
    ls = result.scalar_one_or_none()
    if not ls:
        raise HTTPException(404, "Site not in this lot")

    await db.delete(ls)

    # Recalculate aggregates
    lot_result = await db.execute(select(Lot).where(Lot.id == lot_id))
    lot = lot_result.scalar_one_or_none()
    if lot:
        count_result = await db.execute(
            select(func.count()).select_from(LotSite).where(
                LotSite.lot_id == lot_id, LotSite.id != ls.id,
            )
        )
        lot.site_count = count_result.scalar() or 0

    await db.commit()


@router.put("/lots/{lot_id}/approve")
async def approve_lot_for_tender(
    lot_id: str,
    auth: AuthContext = Depends(require_module_write("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Approve lot to proceed to tender stage."""
    result = await db.execute(
        select(Lot).options(selectinload(Lot.sites)).where(Lot.id == lot_id)
    )
    lot = result.scalar_one_or_none()
    if not lot:
        raise HTTPException(404, "Lot not found")

    if lot.approval_to_tender:
        raise HTTPException(400, "Lot already approved for tender")

    if not lot.sites:
        raise HTTPException(400, "Cannot approve lot with no sites")

    lot.approval_to_tender = True
    lot.approved_by = auth.user_id
    lot.approved_at = utcnow()
    lot.tender_status = "approved"

    audit = AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="lot_approved_for_tender",
        entity_type="lot",
        entity_id=lot.id,
    )
    db.add(audit)

    await db.commit()
    await db.refresh(lot)
    return _lot_dict(lot)


# =====================================================================
# DATA ROOMS
# =====================================================================


@router.get("/lots/{lot_id}/data-room")
async def get_data_room(
    lot_id: str,
    auth: AuthContext = Depends(require_module("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Get data room for a lot, including documents."""
    result = await db.execute(
        select(DataRoom)
        .options(selectinload(DataRoom.documents))
        .where(DataRoom.lot_id == lot_id)
    )
    dr = result.scalar_one_or_none()
    if not dr:
        raise HTTPException(404, "Data room not found for this lot")

    return {
        "id": dr.id,
        "lot_id": dr.lot_id,
        "folder_index": dr.folder_index,
        "completeness_status": dr.completeness_status,
        "nda_required": dr.nda_required,
        "bidder_access_log": dr.bidder_access_log,
        "created_at": str(dr.created_at) if dr.created_at else None,
        "updated_at": str(dr.updated_at) if dr.updated_at else None,
        "documents": [
            {
                "id": d.id,
                "folder_number": d.folder_number,
                "folder_name": d.folder_name,
                "filename": d.filename,
                "storage_key": d.storage_key,
                "file_size": d.file_size,
                "version": d.version,
                "status": d.status,
                "uploaded_by": d.uploaded_by,
                "uploaded_at": str(d.uploaded_at) if d.uploaded_at else None,
            }
            for d in dr.documents
        ],
    }


@router.post("/lots/{lot_id}/data-room/documents", status_code=201)
async def add_data_room_document(
    lot_id: str,
    body: DataRoomDocCreate,
    auth: AuthContext = Depends(require_module_write("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Add a document record to the data room."""
    dr_result = await db.execute(
        select(DataRoom).where(DataRoom.lot_id == lot_id)
    )
    dr = dr_result.scalar_one_or_none()
    if not dr:
        raise HTTPException(404, "Data room not found for this lot")

    if body.folder_number not in DATA_ROOM_FOLDERS:
        raise HTTPException(400, f"Invalid folder number. Must be 1-{len(DATA_ROOM_FOLDERS)}.")

    folder_name = body.folder_name or DATA_ROOM_FOLDERS.get(body.folder_number, "")

    doc = DataRoomDocument(
        data_room_id=dr.id,
        folder_number=body.folder_number,
        folder_name=folder_name,
        filename=body.filename,
        storage_key=body.storage_key,
        file_size=body.file_size,
        uploaded_by=auth.user_id,
    )
    db.add(doc)

    # Update completeness for this folder
    completeness = dict(dr.completeness_status or {})
    completeness[str(body.folder_number)] = "provided"
    dr.completeness_status = completeness

    # Update lot data_room_status
    lot_result = await db.execute(select(Lot).where(Lot.id == lot_id))
    lot = lot_result.scalar_one_or_none()
    if lot:
        provided = sum(1 for v in completeness.values() if v == "provided")
        if provided == len(DATA_ROOM_FOLDERS):
            lot.data_room_status = "complete"
            dr.completeness_status = completeness  # already set
        else:
            lot.data_room_status = "in_progress"

    await db.commit()
    await db.refresh(doc)
    return {
        "id": doc.id,
        "folder_number": doc.folder_number,
        "folder_name": doc.folder_name,
        "filename": doc.filename,
        "status": doc.status,
    }


@router.get("/lots/{lot_id}/data-room/completeness")
async def check_data_room_completeness(
    lot_id: str,
    auth: AuthContext = Depends(require_module("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Check 8-folder completeness of the data room."""
    dr_result = await db.execute(
        select(DataRoom)
        .options(selectinload(DataRoom.documents))
        .where(DataRoom.lot_id == lot_id)
    )
    dr = dr_result.scalar_one_or_none()
    if not dr:
        raise HTTPException(404, "Data room not found for this lot")

    # Build per-folder detail
    doc_counts: dict[int, int] = {}
    for d in dr.documents:
        doc_counts[d.folder_number] = doc_counts.get(d.folder_number, 0) + 1

    folders = []
    for num, name in DATA_ROOM_FOLDERS.items():
        count = doc_counts.get(num, 0)
        folders.append({
            "folder_number": num,
            "folder_name": name,
            "status": "provided" if count > 0 else "missing",
            "document_count": count,
        })

    provided = sum(1 for f in folders if f["status"] == "provided")
    return {
        "lot_id": lot_id,
        "total_folders": len(DATA_ROOM_FOLDERS),
        "folders_provided": provided,
        "folders_missing": len(DATA_ROOM_FOLDERS) - provided,
        "complete": provided == len(DATA_ROOM_FOLDERS),
        "folders": folders,
    }


# =====================================================================
# TENDERS
# =====================================================================


@router.post("/lots/{lot_id}/tender", status_code=201)
async def create_tender(
    lot_id: str,
    body: TenderCreate,
    auth: AuthContext = Depends(require_module_write("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Create a tender for a lot. Lot must be approved first."""
    lot_result = await db.execute(select(Lot).where(Lot.id == lot_id))
    lot = lot_result.scalar_one_or_none()
    if not lot:
        raise HTTPException(404, "Lot not found")

    if not lot.approval_to_tender:
        raise HTTPException(400, "Lot must be approved for tender before creating one")

    # Check no existing tender
    existing = await db.execute(
        select(Tender.id).where(Tender.lot_id == lot_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Tender already exists for this lot")

    tender = Tender(
        lot_id=lot_id,
        tender_reference=body.tender_reference,
        procurement_method=body.procurement_method,
        title=body.title,
        description=body.description,
        currency=body.currency,
        grant_ceiling_pct=body.grant_ceiling_pct,
        bid_validity_days=body.bid_validity_days,
        bid_security_amount=body.bid_security_amount,
        eoi_deadline=_parse_dt(body.eoi_deadline),
        clarification_deadline=_parse_dt(body.clarification_deadline),
        submission_deadline=_parse_dt(body.submission_deadline),
        bid_opening_date=_parse_dt(body.bid_opening_date),
        bids_encrypted=body.bids_encrypted,
        status="draft",
    )
    db.add(tender)

    lot.tender_status = "draft"

    audit = AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="tender_created",
        entity_type="tender",
        entity_id=tender.id,
        after_json={"lot_id": lot_id},
    )
    db.add(audit)

    await db.commit()
    await db.refresh(tender)
    return _tender_dict(tender)


@router.get("/tenders/{tender_id}")
async def get_tender(
    tender_id: str,
    auth: AuthContext = Depends(require_module("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Get tender details including questions and addenda."""
    result = await db.execute(
        select(Tender)
        .options(selectinload(Tender.questions), selectinload(Tender.addenda))
        .where(Tender.id == tender_id)
    )
    tender = result.scalar_one_or_none()
    if not tender:
        raise HTTPException(404, "Tender not found")

    out = _tender_dict(tender)
    out["questions"] = [
        {
            "id": q.id,
            "bidder_id": q.bidder_id,
            "company_name": q.company_name,
            "question": q.question,
            "answer": q.answer,
            "asked_at": str(q.asked_at) if q.asked_at else None,
            "answered_at": str(q.answered_at) if q.answered_at else None,
            "published": q.published,
        }
        for q in tender.questions
    ]
    out["addenda"] = [
        {
            "id": a.id,
            "addendum_number": a.addendum_number,
            "title": a.title,
            "description": a.description,
            "issued_by": a.issued_by,
            "issued_at": str(a.issued_at) if a.issued_at else None,
        }
        for a in tender.addenda
    ]
    return out


@router.put("/tenders/{tender_id}")
async def update_tender(
    tender_id: str,
    body: TenderUpdate,
    auth: AuthContext = Depends(require_module_write("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Update tender fields. Tender must be in draft status."""
    result = await db.execute(select(Tender).where(Tender.id == tender_id))
    tender = result.scalar_one_or_none()
    if not tender:
        raise HTTPException(404, "Tender not found")

    if tender.status not in ("draft",):
        raise HTTPException(400, "Can only update tenders in draft status")

    updates = body.model_dump(exclude_unset=True)
    dt_fields = {"eoi_deadline", "clarification_deadline", "submission_deadline", "bid_opening_date"}
    for field, value in updates.items():
        if field in dt_fields:
            setattr(tender, field, _parse_dt(value))
        else:
            setattr(tender, field, value)

    await db.commit()
    await db.refresh(tender)
    return _tender_dict(tender)


@router.put("/tenders/{tender_id}/issue")
async def issue_tender(
    tender_id: str,
    auth: AuthContext = Depends(require_module_write("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Issue (publish) a tender, making it open for bids."""
    result = await db.execute(select(Tender).where(Tender.id == tender_id))
    tender = result.scalar_one_or_none()
    if not tender:
        raise HTTPException(404, "Tender not found")

    if tender.status != "draft":
        raise HTTPException(400, f"Tender must be in 'draft' status to issue, currently '{tender.status}'")

    tender.status = "issued"
    tender.issued_at = utcnow()

    # Update lot status
    lot_result = await db.execute(select(Lot).where(Lot.id == tender.lot_id))
    lot = lot_result.scalar_one_or_none()
    if lot:
        lot.tender_status = "issued"

    audit = AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="tender_issued",
        entity_type="tender",
        entity_id=tender.id,
    )
    db.add(audit)

    await db.commit()
    await db.refresh(tender)
    return _tender_dict(tender)


@router.put("/tenders/{tender_id}/close")
async def close_tender(
    tender_id: str,
    auth: AuthContext = Depends(require_module_write("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Close a tender to further submissions."""
    result = await db.execute(select(Tender).where(Tender.id == tender_id))
    tender = result.scalar_one_or_none()
    if not tender:
        raise HTTPException(404, "Tender not found")

    if tender.status != "issued":
        raise HTTPException(400, f"Tender must be in 'issued' status to close, currently '{tender.status}'")

    tender.status = "closed"
    tender.closed_at = utcnow()

    lot_result = await db.execute(select(Lot).where(Lot.id == tender.lot_id))
    lot = lot_result.scalar_one_or_none()
    if lot:
        lot.tender_status = "closed"

    audit = AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="tender_closed",
        entity_type="tender",
        entity_id=tender.id,
    )
    db.add(audit)

    await db.commit()
    await db.refresh(tender)
    return _tender_dict(tender)


# =====================================================================
# BIDDERS
# =====================================================================


@router.get("/bidders")
async def list_bidders(
    auth: AuthContext = Depends(require_module("tender")),
    db: AsyncSession = Depends(get_db),
):
    """List all registered bidders."""
    result = await db.execute(
        select(Bidder).order_by(Bidder.company_name)
    )
    bidders = result.scalars().all()
    return {"bidders": [_bidder_dict(b) for b in bidders], "total": len(bidders)}


@router.post("/bidders", status_code=201)
async def register_bidder(
    body: BidderCreate,
    auth: AuthContext = Depends(require_module_write("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Register a new bidder."""
    bidder = Bidder(
        company_name=body.company_name,
        registration_number=body.registration_number,
        country=body.country,
        contact_name=body.contact_name,
        contact_email=body.contact_email,
        contact_phone=body.contact_phone,
        financial_capacity=body.financial_capacity,
        track_record=body.track_record,
        years_experience=body.years_experience,
        completed_sites=body.completed_sites,
        total_capacity_kwp=body.total_capacity_kwp,
    )
    db.add(bidder)
    await db.commit()
    await db.refresh(bidder)
    return _bidder_dict(bidder)


@router.get("/bidders/{bidder_id}")
async def get_bidder(
    bidder_id: str,
    auth: AuthContext = Depends(require_module("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Get a single bidder with NDA and bid summary."""
    result = await db.execute(
        select(Bidder)
        .options(selectinload(Bidder.nda_acceptances), selectinload(Bidder.bids))
        .where(Bidder.id == bidder_id)
    )
    bidder = result.scalar_one_or_none()
    if not bidder:
        raise HTTPException(404, "Bidder not found")

    out = _bidder_dict(bidder)
    out["nda_acceptances"] = [
        {
            "id": n.id,
            "lot_id": n.lot_id,
            "accepted_at": str(n.accepted_at) if n.accepted_at else None,
        }
        for n in bidder.nda_acceptances
    ]
    out["bids_count"] = len(bidder.bids)
    return out


@router.put("/bidders/{bidder_id}")
async def update_bidder(
    bidder_id: str,
    body: BidderUpdate,
    auth: AuthContext = Depends(require_module_write("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Update bidder details."""
    result = await db.execute(select(Bidder).where(Bidder.id == bidder_id))
    bidder = result.scalar_one_or_none()
    if not bidder:
        raise HTTPException(404, "Bidder not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(bidder, field, value)

    await db.commit()
    await db.refresh(bidder)
    return _bidder_dict(bidder)


@router.post("/bidders/{bidder_id}/nda/{lot_id}", status_code=201)
async def record_nda_acceptance(
    bidder_id: str,
    lot_id: str,
    request: Request,
    auth: AuthContext = Depends(require_module("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Record NDA acceptance for a bidder on a lot."""
    # Verify bidder
    bidder_result = await db.execute(select(Bidder.id).where(Bidder.id == bidder_id))
    if not bidder_result.scalar_one_or_none():
        raise HTTPException(404, "Bidder not found")

    # Verify lot
    lot_result = await db.execute(select(Lot.id).where(Lot.id == lot_id))
    if not lot_result.scalar_one_or_none():
        raise HTTPException(404, "Lot not found")

    # Check for duplicate
    existing = await db.execute(
        select(NDAAcceptance.id).where(
            NDAAcceptance.bidder_id == bidder_id,
            NDAAcceptance.lot_id == lot_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "NDA already accepted for this lot")

    client_ip = request.client.host if request.client else ""
    nda = NDAAcceptance(
        bidder_id=bidder_id,
        lot_id=lot_id,
        ip_address=client_ip,
    )
    db.add(nda)

    # Log in data room access
    dr_result = await db.execute(
        select(DataRoom).where(DataRoom.lot_id == lot_id)
    )
    dr = dr_result.scalar_one_or_none()
    if dr:
        access_log = list(dr.bidder_access_log or [])
        access_log.append({
            "bidder_id": bidder_id,
            "action": "nda_accepted",
            "timestamp": str(utcnow()),
            "ip": client_ip,
        })
        dr.bidder_access_log = access_log

    await db.commit()
    await db.refresh(nda)
    return {
        "id": nda.id,
        "bidder_id": bidder_id,
        "lot_id": lot_id,
        "accepted_at": str(nda.accepted_at),
    }


# =====================================================================
# BIDS
# =====================================================================


@router.post("/tenders/{tender_id}/bids", status_code=201)
async def submit_bid(
    tender_id: str,
    body: BidCreate,
    auth: AuthContext = Depends(require_module("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Submit a bid for a tender."""
    tender_result = await db.execute(select(Tender).where(Tender.id == tender_id))
    tender = tender_result.scalar_one_or_none()
    if not tender:
        raise HTTPException(404, "Tender not found")

    if tender.status != "issued":
        raise HTTPException(400, f"Tender is not open for bids (status: {tender.status})")

    # Check submission deadline
    if tender.submission_deadline and utcnow() > tender.submission_deadline:
        raise HTTPException(400, "Submission deadline has passed")

    # Verify bidder
    bidder_result = await db.execute(select(Bidder.id).where(Bidder.id == body.bidder_id))
    if not bidder_result.scalar_one_or_none():
        raise HTTPException(404, "Bidder not found")

    # Check duplicate bid
    dup = await db.execute(
        select(Bid.id).where(
            Bid.tender_id == tender_id,
            Bid.bidder_id == body.bidder_id,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(409, "Bidder has already submitted a bid for this tender")

    # Validate grant ceiling
    if body.grant_ask_pct > tender.grant_ceiling_pct:
        raise HTTPException(
            400,
            f"Grant ask ({body.grant_ask_pct:.0%}) exceeds ceiling ({tender.grant_ceiling_pct:.0%})",
        )

    bid = Bid(
        lot_id=tender.lot_id,
        tender_id=tender_id,
        bidder_id=body.bidder_id,
        grant_ask_pct=body.grant_ask_pct,
        eligible_capex_usd=body.eligible_capex_usd,
        total_capex_usd=body.total_capex_usd,
        grant_amount_usd=body.grant_amount_usd,
        tariff_residential=body.tariff_residential,
        tariff_commercial=body.tariff_commercial,
        tariff_pue=body.tariff_pue,
        pv_kwp=body.pv_kwp,
        bess_kwh=body.bess_kwh,
        connections=body.connections,
        timeline_months=body.timeline_months,
        financing_plan=body.financing_plan,
        technical_proposal=body.technical_proposal,
        financial_proposal=body.financial_proposal,
        es_proposal=body.es_proposal,
        programme_of_works=body.programme_of_works,
        deviations=body.deviations,
        bid_security_ref=body.bid_security_ref,
        status="submitted",
    )
    db.add(bid)

    audit = AuditLog(
        actor_id=auth.user_id,
        actor_name=auth.name,
        actor_role=auth.role,
        action="bid_submitted",
        entity_type="bid",
        entity_id=bid.id,
        after_json={"tender_id": tender_id, "bidder_id": body.bidder_id},
    )
    db.add(audit)

    await db.commit()
    await db.refresh(bid)
    return _bid_dict(bid)


@router.get("/tenders/{tender_id}/bids")
async def list_bids_for_tender(
    tender_id: str,
    auth: AuthContext = Depends(require_module("tender")),
    db: AsyncSession = Depends(get_db),
):
    """List all bids for a tender."""
    # Verify tender
    tender_result = await db.execute(select(Tender.id).where(Tender.id == tender_id))
    if not tender_result.scalar_one_or_none():
        raise HTTPException(404, "Tender not found")

    result = await db.execute(
        select(Bid).where(Bid.tender_id == tender_id).order_by(Bid.submitted_at)
    )
    bids = result.scalars().all()
    return {"tender_id": tender_id, "bids": [_bid_dict(b) for b in bids], "total": len(bids)}


@router.get("/bids/{bid_id}")
async def get_bid(
    bid_id: str,
    auth: AuthContext = Depends(require_module("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Get full bid detail."""
    result = await db.execute(select(Bid).where(Bid.id == bid_id))
    bid = result.scalar_one_or_none()
    if not bid:
        raise HTTPException(404, "Bid not found")

    out = _bid_dict(bid)

    # Attach bidder summary
    bidder_result = await db.execute(
        select(Bidder).where(Bidder.id == bid.bidder_id)
    )
    bidder = bidder_result.scalar_one_or_none()
    if bidder:
        out["bidder"] = {
            "company_name": bidder.company_name,
            "contact_name": bidder.contact_name,
            "contact_email": bidder.contact_email,
            "qualification_status": bidder.qualification_status,
        }

    return out


# =====================================================================
# TENDER Q&A
# =====================================================================


@router.post("/tenders/{tender_id}/questions", status_code=201)
async def ask_question(
    tender_id: str,
    body: QuestionCreate,
    auth: AuthContext = Depends(require_module("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Submit a question on a tender."""
    tender_result = await db.execute(select(Tender.id).where(Tender.id == tender_id))
    if not tender_result.scalar_one_or_none():
        raise HTTPException(404, "Tender not found")

    question = TenderQuestion(
        tender_id=tender_id,
        bidder_id=body.bidder_id,
        company_name=body.company_name,
        question=body.question,
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)

    return {
        "id": question.id,
        "tender_id": tender_id,
        "question": question.question,
        "company_name": question.company_name,
        "asked_at": str(question.asked_at) if question.asked_at else None,
    }


@router.get("/tenders/{tender_id}/questions")
async def list_questions(
    tender_id: str,
    auth: AuthContext = Depends(require_module("tender")),
    db: AsyncSession = Depends(get_db),
):
    """List all Q&A for a tender. Published answers are visible to all."""
    tender_result = await db.execute(select(Tender.id).where(Tender.id == tender_id))
    if not tender_result.scalar_one_or_none():
        raise HTTPException(404, "Tender not found")

    result = await db.execute(
        select(TenderQuestion)
        .where(TenderQuestion.tender_id == tender_id)
        .order_by(TenderQuestion.asked_at)
    )
    questions = result.scalars().all()

    return {
        "tender_id": tender_id,
        "questions": [
            {
                "id": q.id,
                "bidder_id": q.bidder_id,
                "company_name": q.company_name,
                "question": q.question,
                "answer": q.answer,
                "asked_at": str(q.asked_at) if q.asked_at else None,
                "answered_at": str(q.answered_at) if q.answered_at else None,
                "published": q.published,
            }
            for q in questions
        ],
        "total": len(questions),
    }


@router.put("/tender-questions/{question_id}/answer")
async def answer_question(
    question_id: str,
    body: AnswerBody,
    auth: AuthContext = Depends(require_module_write("tender")),
    db: AsyncSession = Depends(get_db),
):
    """Answer a tender question (PMU/admin only)."""
    result = await db.execute(
        select(TenderQuestion).where(TenderQuestion.id == question_id)
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(404, "Question not found")

    question.answer = body.answer
    question.answered_at = utcnow()
    question.published = body.published

    await db.commit()
    await db.refresh(question)

    return {
        "id": question.id,
        "question": question.question,
        "answer": question.answer,
        "answered_at": str(question.answered_at),
        "published": question.published,
    }
