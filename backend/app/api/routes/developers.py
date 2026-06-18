from __future__ import annotations

from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    DeveloperRegistration, TenderInvitee, Tender, PortfolioSite,
    AuditLog, utcnow, new_uuid,
)
from app.dependencies.auth import AuthContext, get_current_user, require_role

router = APIRouter()

# --- Schemas ---


class DeveloperCreate(BaseModel):
    company_name: str
    registration_number: str = ""
    country_of_incorporation: str = "Nigeria"
    contact_name: str
    contact_email: str
    contact_phone: str = ""
    years_experience: int = 0
    completed_sites: int = 0
    total_capacity_kwp: float = 0.0
    qualification_docs: dict = {}


class DeveloperUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    years_experience: Optional[int] = None
    completed_sites: Optional[int] = None
    total_capacity_kwp: Optional[float] = None
    qualification_docs: Optional[dict] = None


class RejectBody(BaseModel):
    reason: str


# --- Routes ---


@router.post("/developers")
async def register_developer(
    body: DeveloperCreate,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register a new developer company for pre-qualification."""
    dev = DeveloperRegistration(
        company_name=body.company_name,
        registration_number=body.registration_number,
        country_of_incorporation=body.country_of_incorporation,
        contact_name=body.contact_name,
        contact_email=body.contact_email,
        contact_phone=body.contact_phone,
        years_experience=body.years_experience,
        completed_sites=body.completed_sites,
        total_capacity_kwp=body.total_capacity_kwp,
        qualification_docs=body.qualification_docs,
        approval_status="pending",
    )
    db.add(dev)

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="developer_registered",
        entity_type="developer_registration",
        entity_id=dev.id,
        details={"company_name": body.company_name},
    )
    db.add(audit)

    await db.commit()
    await db.refresh(dev)

    return {
        "id": dev.id,
        "company_name": dev.company_name,
        "contact_email": dev.contact_email,
        "approval_status": dev.approval_status,
        "created_at": str(dev.created_at),
    }


@router.get("/developers")
async def list_developers(
    status: Optional[str] = None,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all developer registrations, optionally filtered by approval status."""
    query = select(DeveloperRegistration).order_by(DeveloperRegistration.created_at.desc())
    if status:
        query = query.where(DeveloperRegistration.approval_status == status)

    result = await db.execute(query)
    devs = result.scalars().all()

    return {
        "developers": [
            {
                "id": d.id,
                "company_name": d.company_name,
                "contact_name": d.contact_name,
                "contact_email": d.contact_email,
                "years_experience": d.years_experience,
                "completed_sites": d.completed_sites,
                "total_capacity_kwp": d.total_capacity_kwp,
                "approval_status": d.approval_status,
                "created_at": str(d.created_at),
            }
            for d in devs
        ],
        "total": len(devs),
    }


@router.get("/developers/{developer_id}")
async def get_developer(
    developer_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full developer registration details."""
    result = await db.execute(
        select(DeveloperRegistration).where(DeveloperRegistration.id == developer_id)
    )
    dev = result.scalar_one_or_none()
    if not dev:
        raise HTTPException(404, "Developer registration not found")

    return {
        "id": dev.id,
        "company_name": dev.company_name,
        "registration_number": dev.registration_number,
        "country_of_incorporation": dev.country_of_incorporation,
        "contact_name": dev.contact_name,
        "contact_email": dev.contact_email,
        "contact_phone": dev.contact_phone,
        "years_experience": dev.years_experience,
        "completed_sites": dev.completed_sites,
        "total_capacity_kwp": dev.total_capacity_kwp,
        "qualification_docs": dev.qualification_docs,
        "approval_status": dev.approval_status,
        "approval_notes": dev.approval_notes,
        "approved_by": dev.approved_by,
        "approved_at": str(dev.approved_at) if dev.approved_at else None,
        "valid_until": str(dev.valid_until) if dev.valid_until else None,
        "created_at": str(dev.created_at),
        "updated_at": str(dev.updated_at),
    }


@router.put("/developers/{developer_id}/approve")
async def approve_developer(
    developer_id: str,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Approve a developer registration (AfCEN Admin or PM only)."""
    result = await db.execute(
        select(DeveloperRegistration).where(DeveloperRegistration.id == developer_id)
    )
    dev = result.scalar_one_or_none()
    if not dev:
        raise HTTPException(404, "Developer registration not found")

    if dev.approval_status == "approved":
        raise HTTPException(400, "Developer already approved")

    now = utcnow()
    dev.approval_status = "approved"
    dev.approved_by = auth.user_id
    dev.approved_at = now
    dev.valid_until = now + timedelta(days=365)
    dev.approval_notes = "Approved"

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="developer_approved",
        entity_type="developer_registration",
        entity_id=dev.id,
        details={"company_name": dev.company_name},
    )
    db.add(audit)

    await db.commit()
    return {
        "id": dev.id,
        "approval_status": dev.approval_status,
        "approved_at": str(dev.approved_at),
        "valid_until": str(dev.valid_until),
    }


@router.put("/developers/{developer_id}/reject")
async def reject_developer(
    developer_id: str,
    body: RejectBody,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Reject a developer registration with reason."""
    result = await db.execute(
        select(DeveloperRegistration).where(DeveloperRegistration.id == developer_id)
    )
    dev = result.scalar_one_or_none()
    if not dev:
        raise HTTPException(404, "Developer registration not found")

    dev.approval_status = "rejected"
    dev.approved_by = auth.user_id
    dev.approved_at = utcnow()
    dev.approval_notes = body.reason

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="developer_rejected",
        entity_type="developer_registration",
        entity_id=dev.id,
        details={"company_name": dev.company_name, "reason": body.reason},
    )
    db.add(audit)

    await db.commit()
    return {
        "id": dev.id,
        "approval_status": dev.approval_status,
        "approval_notes": dev.approval_notes,
    }


@router.get("/developers/{developer_id}/lots")
async def get_developer_lots(
    developer_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the tender lots (portfolio sites) this developer can access via invitations."""
    result = await db.execute(
        select(DeveloperRegistration).where(DeveloperRegistration.id == developer_id)
    )
    dev = result.scalar_one_or_none()
    if not dev:
        raise HTTPException(404, "Developer registration not found")

    # Find tenders where this developer was invited (by email match)
    invitee_result = await db.execute(
        select(TenderInvitee).where(TenderInvitee.email == dev.contact_email)
    )
    invitees = invitee_result.scalars().all()
    tender_ids = [inv.tender_id for inv in invitees]

    if not tender_ids:
        return {"developer_id": developer_id, "company_name": dev.company_name, "lots": []}

    # Get tenders and their portfolio sites
    lots = []
    for tender_id in tender_ids:
        tender_result = await db.execute(select(Tender).where(Tender.id == tender_id))
        tender = tender_result.scalar_one_or_none()
        if not tender:
            continue

        sites_result = await db.execute(
            select(PortfolioSite).where(PortfolioSite.portfolio_id == tender.portfolio_id)
        )
        sites = sites_result.scalars().all()

        lots.append({
            "tender_id": tender.id,
            "tender_status": tender.status,
            "portfolio_id": tender.portfolio_id,
            "sites": [
                {
                    "id": s.id,
                    "settlement_rank": s.settlement_rank,
                    "settlement_data": s.settlement_data,
                    "pipeline_status": s.pipeline_status,
                }
                for s in sites
            ],
        })

    return {
        "developer_id": developer_id,
        "company_name": dev.company_name,
        "lots": lots,
    }
