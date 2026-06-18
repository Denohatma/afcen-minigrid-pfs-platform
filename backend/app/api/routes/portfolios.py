from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from typing import Optional
import json

from app.db.session import async_session
from app.config import settings
from app.db.models import (
    Portfolio, PortfolioSite, Tender, TenderInvitee,
    TenderQuestion, TenderSubmission, utcnow, new_uuid,
)

router = APIRouter()

# --- Schemas ---


class PortfolioCreate(BaseModel):
    name: str
    disco_name: str
    filters: dict = {}
    settlement_ranks: list[int] = []  # ranks from ranked_settlements.json


class PortfolioResponse(BaseModel):
    id: str
    name: str
    disco_name: str
    status: str
    filters: dict
    sites: list[dict]
    site_count: int
    created_at: str


class TenderLaunch(BaseModel):
    deadline: Optional[str] = None


class InviteeCreate(BaseModel):
    company_name: str
    contact_name: str
    email: str


class QuestionCreate(BaseModel):
    asked_by: str = ""
    company_name: str = ""
    question: str


class SubmissionCreate(BaseModel):
    company_name: str
    contact_name: str
    email: str
    proposal_data: dict = {}


# --- Helper to get DB session ---

async def get_db():
    async with async_session() as session:
        yield session


# --- Load settlements data ---

_settlements = None


def _load_settlements():
    global _settlements
    if _settlements is None:
        from pathlib import Path
        p = Path("/app/src/data/ranked_settlements.json")
        if not p.exists():
            p = Path(__file__).resolve().parent.parent.parent.parent.parent / "src" / "data" / "ranked_settlements.json"
        with open(p) as f:
            data = json.load(f)
        _settlements = {s["rank"]: s for s in data}
    return _settlements


# --- Portfolio CRUD ---

@router.post("/portfolios")
async def create_portfolio(body: PortfolioCreate, db: AsyncSession = Depends(get_db)):
    settlements = _load_settlements()

    portfolio = Portfolio(
        name=body.name,
        disco_name=body.disco_name,
        status="screening",
        filters=body.filters,
    )
    db.add(portfolio)
    await db.flush()

    for rank in body.settlement_ranks[:50]:  # cap at 50 sites
        s = settlements.get(rank)
        if not s:
            continue
        ps = PortfolioSite(
            portfolio_id=portfolio.id,
            settlement_rank=rank,
            settlement_data=s,
            pipeline_status="pending",
            arpu=0.0,
        )
        db.add(ps)

    await db.commit()
    await db.refresh(portfolio)
    return {"id": portfolio.id, "name": portfolio.name, "site_count": len(body.settlement_ranks)}


@router.get("/portfolios")
async def list_portfolios(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Portfolio).order_by(Portfolio.created_at.desc()))
    portfolios = result.scalars().all()
    return {
        "portfolios": [
            {
                "id": p.id, "name": p.name, "disco_name": p.disco_name,
                "status": p.status, "created_at": str(p.created_at),
            }
            for p in portfolios
        ]
    }


@router.get("/portfolios/{portfolio_id}")
async def get_portfolio(portfolio_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Portfolio).where(Portfolio.id == portfolio_id))
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(404, "Portfolio not found")

    sites_result = await db.execute(
        select(PortfolioSite).where(PortfolioSite.portfolio_id == portfolio_id)
        .order_by(PortfolioSite.arpu.desc())
    )
    sites = sites_result.scalars().all()

    # Check for tender
    tender_result = await db.execute(select(Tender).where(Tender.portfolio_id == portfolio_id))
    tender = tender_result.scalar_one_or_none()

    return {
        "id": portfolio.id,
        "name": portfolio.name,
        "disco_name": portfolio.disco_name,
        "status": portfolio.status,
        "filters": portfolio.filters,
        "created_at": str(portfolio.created_at),
        "sites": [
            {
                "id": s.id,
                "settlement_rank": s.settlement_rank,
                "settlement_data": s.settlement_data,
                "pipeline_status": s.pipeline_status,
                "results": s.results,
                "arpu": s.arpu,
            }
            for s in sites
        ],
        "tender": {
            "id": tender.id,
            "status": tender.status,
            "launched_at": str(tender.launched_at) if tender.launched_at else None,
            "deadline": str(tender.deadline) if tender.deadline else None,
        } if tender else None,
    }


@router.delete("/portfolios/{portfolio_id}")
async def delete_portfolio(portfolio_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Portfolio).where(Portfolio.id == portfolio_id))
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(404, "Portfolio not found")
    await db.delete(portfolio)
    await db.commit()
    return {"ok": True}


# --- Batch pipeline run ---

import threading
import logging
from sqlalchemy import create_engine, update as sql_update
from sqlalchemy.orm import Session as SyncSession

_running_portfolios: set[str] = set()
_batch_logger = logging.getLogger("minigrid.batch")


def _get_sync_db_url():
    url = settings.database_url
    return url.replace("+asyncpg", "").replace("+aiosqlite", "")


def _build_site_data(sd: dict, disco_name: str):
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path("/app")))
    from src.models.site import SiteData, CustomerSegment, AnchorLoad, GridArrivalEvidence

    return SiteData(
        site_name=sd.get("village", "Unknown"),
        district=sd.get("lga", ""),
        province=sd.get("state", ""),
        country="Nigeria",
        coordinates=(sd.get("lat", 0), sd.get("lon", 0)),
        disco_name=sd.get("disco", disco_name),
        minigrid_type=sd.get("recommended_mg_type", "isolated"),
        disco_supply_hours=0.0,
        population=sd.get("population", 0),
        mapped_structures=sd.get("buildings", 0),
        customers=[
            CustomerSegment(category="residential_improved", sub_type="household",
                            count=max(sd.get("connections", 0), sd.get("buildings", 0) // 2), tier="improved"),
            CustomerSegment(category="commercial", sub_type="shop",
                            count=max(sd.get("buildings", 0) // 20, 5), tier="basic"),
        ],
        anchors=[
            AnchorLoad(load_type="welding_shop", name="Welding Workshop", count=max(sd.get("buildings", 0) // 200, 1)),
        ] + ([AnchorLoad(load_type="hospital_health_centre", name="Health Centre", count=1)] if sd.get("has_health") else [])
          + ([AnchorLoad(load_type="primary_school", name="School", count=1)] if sd.get("has_education") else []),
        grid_status="grid_connected" if sd.get("grid_dist_km", 99) < 2 else "off_grid",
        grid_arrival_evidence=GridArrivalEvidence(
            disco_track_record="mixed",
            grid_extension_planned=sd.get("grid_dist_km", 99) < 10,
        ),
        tariff_scenarios={"low": 0.09, "base": 0.20, "high": 0.35},
        fx_rate_ngn_usd=1600.0,
        debt_interest_rate=0.08,
    )


def _run_pipeline_thread(portfolio_id: str, site_records: list[dict], disco_name: str):
    """Run pipeline in background thread using sync DB."""
    try:
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path("/app")))
        from src.orchestrator import Orchestrator
        from app.services.pipeline_service import _build_registry

        sync_engine = create_engine(_get_sync_db_url())
        registry = _build_registry()
        orchestrator = Orchestrator(registry)

        _batch_logger.info(f"Starting batch pipeline for {portfolio_id}: {len(site_records)} sites")

        for i, rec in enumerate(site_records):
            ps_id = rec["id"]
            sd = rec["settlement_data"]
            village = sd.get("village", "Unknown")

            _batch_logger.info(f"[{i+1}/{len(site_records)}] Processing {village}...")

            with SyncSession(sync_engine) as db:
                db.execute(
                    sql_update(PortfolioSite)
                    .where(PortfolioSite.id == ps_id)
                    .values(pipeline_status="running")
                )
                db.commit()

            try:
                site = _build_site_data(sd, disco_name)
                ctx = orchestrator.run(site, "/tmp/portfolio_run")

                results_dict = {}
                for adapter_name in registry.resolve_execution_order():
                    output = ctx.outputs.get(adapter_name)
                    if output:
                        std = registry.get(adapter_name).get_standardized_outputs()
                        results_dict[adapter_name] = std

                financial = ctx.outputs.get("financial_model")
                demand = ctx.outputs.get("demand_assessment")
                arpu = financial.annual_revenue_base_usd / demand.total_customers if financial and demand and demand.total_customers > 0 else 0.0

                with SyncSession(sync_engine) as db:
                    db.execute(
                        sql_update(PortfolioSite)
                        .where(PortfolioSite.id == ps_id)
                        .values(pipeline_status="completed", results=results_dict, arpu=round(arpu, 2))
                    )
                    db.commit()

                _batch_logger.info(f"  {village}: completed (ARPU=${arpu:.2f})")

            except Exception as e:
                _batch_logger.error(f"  {village}: FAILED - {e}")
                with SyncSession(sync_engine) as db:
                    db.execute(
                        sql_update(PortfolioSite)
                        .where(PortfolioSite.id == ps_id)
                        .values(pipeline_status="failed", results={"error": str(e)})
                    )
                    db.commit()

        with SyncSession(sync_engine) as db:
            db.execute(
                sql_update(Portfolio)
                .where(Portfolio.id == portfolio_id)
                .values(status="designed")
            )
            db.commit()

        sync_engine.dispose()
        _batch_logger.info(f"Batch pipeline complete for {portfolio_id}")

    except Exception as e:
        _batch_logger.error(f"Batch pipeline crashed for {portfolio_id}: {e}")
    finally:
        _running_portfolios.discard(portfolio_id)


@router.post("/portfolios/{portfolio_id}/run")
async def run_portfolio_pipeline(portfolio_id: str, db: AsyncSession = Depends(get_db)):
    """Start batch pipeline in background. Poll GET /portfolios/{id} for progress."""
    if portfolio_id in _running_portfolios:
        return {"status": "already_running", "message": "Pipeline is already running for this portfolio"}

    result = await db.execute(select(Portfolio).where(Portfolio.id == portfolio_id))
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(404, "Portfolio not found")

    sites_result = await db.execute(
        select(PortfolioSite).where(PortfolioSite.portfolio_id == portfolio_id)
    )
    psites = sites_result.scalars().all()
    site_records = [{"id": ps.id, "settlement_data": ps.settlement_data} for ps in psites]

    est_seconds = len(site_records) * 5
    est_minutes = est_seconds / 60

    _running_portfolios.add(portfolio_id)
    thread = threading.Thread(
        target=_run_pipeline_thread,
        args=(portfolio_id, site_records, portfolio.disco_name),
        daemon=True,
    )
    thread.start()

    return {
        "status": "started",
        "sites_queued": len(site_records),
        "estimated_seconds": est_seconds,
        "estimated_minutes": round(est_minutes, 1),
    }


# --- Portfolio aggregated results ---

@router.get("/portfolios/{portfolio_id}/results")
async def portfolio_results(portfolio_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Portfolio).where(Portfolio.id == portfolio_id))
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(404)

    sites_result = await db.execute(
        select(PortfolioSite).where(
            PortfolioSite.portfolio_id == portfolio_id,
            PortfolioSite.pipeline_status == "completed",
        ).order_by(PortfolioSite.arpu.desc())
    )
    sites = sites_result.scalars().all()

    total_capex = 0
    total_connections = 0
    total_pv = 0
    total_battery = 0
    total_grant = 0
    lcoes = []
    irrs = []

    for s in sites:
        r = s.results or {}
        fin = r.get("financial_model", {})
        dem = r.get("demand_assessment", {})
        siz = r.get("hybrid_sizing", {})
        pbg = r.get("pbg_calculator", {})

        total_capex += fin.get("total_capex_usd", 0)
        total_connections += dem.get("total_customers", 0)
        total_pv += siz.get("pv_capacity_kwp", 0)
        total_battery += siz.get("battery_capacity_kwh", 0)
        total_grant += pbg.get("grant_total_usd", 0)
        if fin.get("lcoe_usd_kwh"):
            lcoes.append(fin["lcoe_usd_kwh"])
        if fin.get("project_irr"):
            irrs.append(fin["project_irr"])

    return {
        "portfolio_id": portfolio_id,
        "portfolio_name": portfolio.name,
        "disco_name": portfolio.disco_name,
        "sites_completed": len(sites),
        "total_capex_usd": round(total_capex, 0),
        "total_connections": total_connections,
        "total_pv_kwp": round(total_pv, 1),
        "total_pv_mwp": round(total_pv / 1000, 2),
        "total_battery_kwh": round(total_battery, 0),
        "total_battery_mwh": round(total_battery / 1000, 2),
        "total_grant_usd": round(total_grant, 0),
        "avg_grant_per_connection": round(total_grant / total_connections, 0) if total_connections else 0,
        "avg_lcoe": round(sum(lcoes) / len(lcoes), 4) if lcoes else 0,
        "avg_irr": round(sum(irrs) / len(irrs), 4) if irrs else 0,
    }


# --- Tender endpoints ---

@router.post("/portfolios/{portfolio_id}/tender")
async def launch_tender(portfolio_id: str, body: TenderLaunch, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Portfolio).where(Portfolio.id == portfolio_id))
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(404)

    tender = Tender(
        portfolio_id=portfolio_id,
        status="open",
        launched_at=utcnow(),
    )
    db.add(tender)
    portfolio.status = "tendered"
    await db.commit()
    await db.refresh(tender)
    return {"tender_id": tender.id, "status": "open"}


@router.post("/tenders/{tender_id}/invitees")
async def add_invitee(tender_id: str, body: InviteeCreate, db: AsyncSession = Depends(get_db)):
    invitee = TenderInvitee(
        tender_id=tender_id,
        company_name=body.company_name,
        contact_name=body.contact_name,
        email=body.email,
    )
    db.add(invitee)
    await db.commit()
    return {"id": invitee.id, "email": body.email}


@router.get("/tenders/{tender_id}")
async def get_tender(tender_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tender).where(Tender.id == tender_id))
    tender = result.scalar_one_or_none()
    if not tender:
        raise HTTPException(404)

    invitees_r = await db.execute(select(TenderInvitee).where(TenderInvitee.tender_id == tender_id))
    questions_r = await db.execute(select(TenderQuestion).where(TenderQuestion.tender_id == tender_id))
    submissions_r = await db.execute(select(TenderSubmission).where(TenderSubmission.tender_id == tender_id))

    return {
        "id": tender.id,
        "portfolio_id": tender.portfolio_id,
        "status": tender.status,
        "launched_at": str(tender.launched_at) if tender.launched_at else None,
        "invitees": [{"id": i.id, "company": i.company_name, "contact": i.contact_name, "email": i.email} for i in invitees_r.scalars().all()],
        "questions": [{"id": q.id, "asked_by": q.asked_by, "company": q.company_name, "question": q.question, "answer": q.answer, "asked_at": str(q.asked_at)} for q in questions_r.scalars().all()],
        "submissions": [{"id": s.id, "company": s.company_name, "contact": s.contact_name, "email": s.email, "submitted_at": str(s.submitted_at)} for s in submissions_r.scalars().all()],
    }


@router.post("/tenders/{tender_id}/questions")
async def ask_question(tender_id: str, body: QuestionCreate, db: AsyncSession = Depends(get_db)):
    q = TenderQuestion(tender_id=tender_id, asked_by=body.asked_by, company_name=body.company_name, question=body.question)
    db.add(q)
    await db.commit()
    return {"id": q.id}


@router.put("/tenders/{tender_id}/questions/{question_id}/answer")
async def answer_question(tender_id: str, question_id: str, answer: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TenderQuestion).where(TenderQuestion.id == question_id))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(404)
    q.answer = answer
    q.answered_at = utcnow()
    await db.commit()
    return {"ok": True}


@router.post("/tenders/{tender_id}/submissions")
async def submit_bid(tender_id: str, body: SubmissionCreate, db: AsyncSession = Depends(get_db)):
    sub = TenderSubmission(
        tender_id=tender_id, company_name=body.company_name,
        contact_name=body.contact_name, email=body.email, proposal_data=body.proposal_data,
    )
    db.add(sub)
    await db.commit()
    return {"id": sub.id}
