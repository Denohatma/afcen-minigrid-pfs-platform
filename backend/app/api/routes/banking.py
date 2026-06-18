from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    BankOffer, Portfolio, PortfolioSite, Tender, Milestone,
    AuditLog, utcnow, new_uuid,
)
from app.dependencies.auth import AuthContext, get_current_user, require_role

router = APIRouter()

# --- Schemas ---


class BankOfferCreate(BaseModel):
    tender_id: Optional[str] = None
    portfolio_id: Optional[str] = None
    bank_name: str
    contact_name: str = ""
    contact_email: str = ""
    loan_amount_usd: float = 0.0
    interest_rate: float = 0.0
    tenor_years: int = 0
    grace_period_months: int = 0
    collateral_requirements: str = ""
    conditions: str = ""


class InterestBody(BaseModel):
    developer_name: str = ""
    notes: str = ""


# --- Routes ---


@router.post("/banking/offers")
async def create_bank_offer(
    body: BankOfferCreate,
    auth: AuthContext = Depends(require_role("bank", "afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Bank posts an indicative financing offer for a portfolio or tender."""
    # Validate that at least one reference is provided
    if not body.tender_id and not body.portfolio_id:
        raise HTTPException(400, "Either tender_id or portfolio_id must be provided")

    # Validate references exist
    if body.portfolio_id:
        result = await db.execute(select(Portfolio).where(Portfolio.id == body.portfolio_id))
        if not result.scalar_one_or_none():
            raise HTTPException(404, "Portfolio not found")

    if body.tender_id:
        result = await db.execute(select(Tender).where(Tender.id == body.tender_id))
        if not result.scalar_one_or_none():
            raise HTTPException(404, "Tender not found")

    offer = BankOffer(
        tender_id=body.tender_id,
        portfolio_id=body.portfolio_id,
        bank_name=body.bank_name,
        contact_name=body.contact_name,
        contact_email=body.contact_email,
        loan_amount_usd=body.loan_amount_usd,
        interest_rate=body.interest_rate,
        tenor_years=body.tenor_years,
        grace_period_months=body.grace_period_months,
        collateral_requirements=body.collateral_requirements,
        conditions=body.conditions,
        status="indicative",
    )
    db.add(offer)

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="bank_offer_created",
        entity_type="bank_offer",
        entity_id=offer.id,
        details={"bank_name": body.bank_name, "loan_amount_usd": body.loan_amount_usd},
    )
    db.add(audit)

    await db.commit()
    await db.refresh(offer)

    return {
        "id": offer.id,
        "bank_name": offer.bank_name,
        "loan_amount_usd": offer.loan_amount_usd,
        "interest_rate": offer.interest_rate,
        "tenor_years": offer.tenor_years,
        "status": offer.status,
        "created_at": str(offer.created_at),
    }


@router.get("/banking/offers")
async def list_bank_offers(
    portfolio_id: Optional[str] = None,
    tender_id: Optional[str] = None,
    bank_name: Optional[str] = None,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List financing offers with optional filters."""
    query = select(BankOffer).order_by(BankOffer.created_at.desc())

    if portfolio_id:
        query = query.where(BankOffer.portfolio_id == portfolio_id)
    if tender_id:
        query = query.where(BankOffer.tender_id == tender_id)
    if bank_name:
        query = query.where(BankOffer.bank_name.ilike(f"%{bank_name}%"))

    result = await db.execute(query)
    offers = result.scalars().all()

    return {
        "offers": [
            {
                "id": o.id,
                "tender_id": o.tender_id,
                "portfolio_id": o.portfolio_id,
                "bank_name": o.bank_name,
                "contact_name": o.contact_name,
                "contact_email": o.contact_email,
                "loan_amount_usd": o.loan_amount_usd,
                "interest_rate": o.interest_rate,
                "tenor_years": o.tenor_years,
                "grace_period_months": o.grace_period_months,
                "collateral_requirements": o.collateral_requirements,
                "conditions": o.conditions,
                "status": o.status,
                "developer_interest": o.developer_interest,
                "created_at": str(o.created_at),
            }
            for o in offers
        ],
        "total": len(offers),
    }


@router.put("/banking/offers/{offer_id}/interest")
async def express_interest(
    offer_id: str,
    body: InterestBody,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Developer expresses interest in a bank financing offer."""
    result = await db.execute(
        select(BankOffer).where(BankOffer.id == offer_id)
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(404, "Bank offer not found")

    offer.developer_interest = True
    offer.status = "interest_expressed"
    offer.updated_at = utcnow()

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="bank_offer_interest",
        entity_type="bank_offer",
        entity_id=offer_id,
        details={
            "bank_name": offer.bank_name,
            "developer_name": body.developer_name,
            "notes": body.notes,
        },
    )
    db.add(audit)

    await db.commit()
    return {
        "id": offer_id,
        "developer_interest": True,
        "status": "interest_expressed",
    }


@router.get("/banking/investment-summary/{portfolio_id}")
async def investment_summary(
    portfolio_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Auto-generated investment brief for a portfolio."""
    # Get portfolio
    portfolio_result = await db.execute(
        select(Portfolio).where(Portfolio.id == portfolio_id)
    )
    portfolio = portfolio_result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(404, "Portfolio not found")

    # Get portfolio sites
    sites_result = await db.execute(
        select(PortfolioSite).where(PortfolioSite.portfolio_id == portfolio_id)
    )
    sites = sites_result.scalars().all()
    completed_sites = [s for s in sites if s.pipeline_status == "completed"]

    # Aggregate from PFS results
    total_capex = 0.0
    total_connections = 0
    total_pv_kwp = 0.0
    total_battery_kwh = 0.0
    total_grant = 0.0
    lcoes = []
    irrs = []
    total_annual_revenue = 0.0

    for s in completed_sites:
        r = s.results or {}
        fin = r.get("financial_model", {})
        dem = r.get("demand_assessment", {})
        siz = r.get("hybrid_sizing", {})
        pbg = r.get("pbg_calculator", {})

        total_capex += fin.get("total_capex_usd", 0)
        total_connections += dem.get("total_customers", 0)
        total_pv_kwp += siz.get("pv_capacity_kwp", 0)
        total_battery_kwh += siz.get("battery_capacity_kwh", 0)
        total_grant += pbg.get("grant_total_usd", 0)
        total_annual_revenue += fin.get("annual_revenue_base_usd", 0)
        if fin.get("lcoe_usd_kwh"):
            lcoes.append(fin["lcoe_usd_kwh"])
        if fin.get("project_irr"):
            irrs.append(fin["project_irr"])

    equity_required = total_capex - total_grant
    debt_portion = equity_required * 0.70  # assume 70:30 debt-equity
    equity_portion = equity_required * 0.30

    # Get existing bank offers
    offers_result = await db.execute(
        select(BankOffer).where(BankOffer.portfolio_id == portfolio_id)
    )
    offers = offers_result.scalars().all()

    # Get grant disbursement status
    tender_result = await db.execute(
        select(Tender).where(Tender.portfolio_id == portfolio_id)
    )
    tender = tender_result.scalar_one_or_none()

    grant_disbursed = 0.0
    if tender:
        milestones_result = await db.execute(
            select(Milestone).where(Milestone.tender_id == tender.id)
        )
        milestones = milestones_result.scalars().all()
        grant_disbursed = sum(m.grant_amount_usd for m in milestones if m.status == "disbursed")

    return {
        "portfolio_id": portfolio_id,
        "portfolio_name": portfolio.name,
        "disco_name": portfolio.disco_name,
        "status": portfolio.status,
        "investment_overview": {
            "total_sites": len(completed_sites),
            "total_capex_usd": round(total_capex, 0),
            "total_grant_usd": round(total_grant, 0),
            "equity_required_usd": round(equity_required, 0),
            "estimated_debt_usd": round(debt_portion, 0),
            "estimated_equity_usd": round(equity_portion, 0),
            "total_annual_revenue_usd": round(total_annual_revenue, 0),
        },
        "technical_summary": {
            "total_connections": total_connections,
            "total_pv_kwp": round(total_pv_kwp, 1),
            "total_pv_mwp": round(total_pv_kwp / 1000, 2) if total_pv_kwp > 0 else 0,
            "total_battery_kwh": round(total_battery_kwh, 0),
            "total_battery_mwh": round(total_battery_kwh / 1000, 2) if total_battery_kwh > 0 else 0,
            "avg_lcoe_usd_kwh": round(sum(lcoes) / len(lcoes), 4) if lcoes else 0,
            "avg_project_irr": round(sum(irrs) / len(irrs), 4) if irrs else 0,
        },
        "grant_status": {
            "total_committed_usd": round(total_grant, 0),
            "total_disbursed_usd": round(grant_disbursed, 0),
            "remaining_usd": round(total_grant - grant_disbursed, 0),
            "disbursement_mechanism": "Results-Based Financing (30/40/30 milestone tranches)",
        },
        "risk_mitigants": [
            "DARES performance-based grant reduces upfront capital requirement",
            "Pre-qualified developer with proven track record",
            "Standardized minigrid designs reduce technology risk",
            "Metered prepaid systems ensure revenue collection",
            "PUE anchor loads provide stable baseline demand",
            "AfCEN program management and technical oversight",
        ],
        "existing_offers": [
            {
                "bank_name": o.bank_name,
                "loan_amount_usd": o.loan_amount_usd,
                "interest_rate": o.interest_rate,
                "tenor_years": o.tenor_years,
                "status": o.status,
            }
            for o in offers
        ],
    }
