"""
Alfred — Intelligent Assistant for DARES IMG Platform

Accesses all platform data: settlements, tickets, invoices, MEL submissions,
targets, financial defaults, Nigeria config, and reference documents.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    Ticket, SettlementInvoice, MELSubmission, MELTarget, MELLearningLog,
    GrantAgreement, Milestone, Disbursement, Lot,
)

router = APIRouter()

_BASE = Path(__file__).resolve().parent.parent.parent.parent.parent
_DATA = _BASE / "src" / "data"
_DOCKER_DATA = Path("/app/src/data")

def _data_path(name: str) -> Path:
    p = _DOCKER_DATA / name
    return p if p.exists() else _DATA / name

_settlement_cache: list[dict] | None = None
_config_cache: dict | None = None
_financial_cache: dict | None = None


def _load_settlements():
    global _settlement_cache
    if _settlement_cache is None:
        with open(_data_path("ranked_settlements.json")) as f:
            _settlement_cache = json.load(f)
    return _settlement_cache


def _load_config():
    global _config_cache
    if _config_cache is None:
        with open(_data_path("nigeria_config.json")) as f:
            _config_cache = json.load(f)
    return _config_cache


def _load_financial():
    global _financial_cache
    if _financial_cache is None:
        with open(_data_path("financial_defaults.json")) as f:
            _financial_cache = json.load(f)
    return _financial_cache


def _settlement_summary() -> dict:
    data = _load_settlements()
    total = len(data)
    discos: dict = {}
    states: dict = {}
    mg_types = {"interconnected": 0, "undergrid": 0, "isolated": 0}
    risk_counts = {"low": 0, "medium": 0, "high": 0}
    total_pop = total_conn = 0
    total_demand = 0.0
    scores = []

    for s in data:
        d = s["disco"]
        discos.setdefault(d, {"count": 0, "pop": 0, "conn": 0, "demand": 0.0, "scores": []})
        discos[d]["count"] += 1
        discos[d]["pop"] += s["population"]
        discos[d]["conn"] += s["connections"]
        discos[d]["demand"] += s["demand_kwh"]
        discos[d]["scores"].append(s["score"])
        states.setdefault(s["state"], 0)
        states[s["state"]] += 1
        mt = s.get("recommended_mg_type", "")
        if mt in mg_types:
            mg_types[mt] += 1
        risk = s.get("security_risk", "")
        if risk in risk_counts:
            risk_counts[risk] += 1
        total_pop += s["population"]
        total_conn += s["connections"]
        total_demand += s["demand_kwh"]
        scores.append(s["score"])

    for dv in discos.values():
        dv["avg_score"] = round(sum(dv["scores"]) / len(dv["scores"]), 1) if dv["scores"] else 0
        del dv["scores"]

    return {
        "total": total, "total_population": total_pop,
        "total_connections": total_conn, "total_demand_kwh": round(total_demand, 1),
        "avg_score": round(sum(scores) / len(scores), 1) if scores else 0,
        "by_disco": discos, "states": states, "mg_types": mg_types,
        "security_risk": risk_counts,
    }


async def _ticket_summary(db: AsyncSession) -> str:
    total = (await db.execute(select(func.count(Ticket.id)))).scalar() or 0
    if total == 0:
        return "No tickets in the system."
    open_c = (await db.execute(select(func.count(Ticket.id)).where(Ticket.status == "open"))).scalar() or 0
    in_prog = (await db.execute(select(func.count(Ticket.id)).where(Ticket.status == "in_progress"))).scalar() or 0
    escalated = (await db.execute(select(func.count(Ticket.id)).where(Ticket.status == "escalated"))).scalar() or 0
    breached = (await db.execute(select(func.count(Ticket.id)).where(Ticket.sla_breached == True))).scalar() or 0
    result = await db.execute(select(Ticket).order_by(Ticket.created_at.desc()).limit(5))
    recent = result.scalars().all()
    lines = [f"Tickets: {total} total, {open_c} open, {in_prog} in-progress, {escalated} escalated, {breached} SLA breached."]
    lines.append("Recent tickets:")
    for t in recent:
        lines.append(f"  {t.ticket_ref}: {t.title} [{t.status}, {t.priority}]")
    return "\n".join(lines)


async def _settlement_summary_db(db: AsyncSession) -> str:
    total = (await db.execute(select(func.count(SettlementInvoice.id)))).scalar() or 0
    if total == 0:
        return "No settlement invoices in the system."
    paid = (await db.execute(select(func.sum(SettlementInvoice.amount_paid_usd)))).scalar() or 0
    total_usd = (await db.execute(select(func.sum(SettlementInvoice.amount_usd)))).scalar() or 0
    overdue = (await db.execute(select(func.count(SettlementInvoice.id)).where(SettlementInvoice.status == "overdue"))).scalar() or 0
    disputed = (await db.execute(select(func.count(SettlementInvoice.id)).where(SettlementInvoice.status == "disputed"))).scalar() or 0
    return f"Settlement Ledger: {total} invoices, ${total_usd:,.2f} total invoiced, ${paid:,.2f} paid, {overdue} overdue, {disputed} disputed."


async def _mel_summary(db: AsyncSession) -> str:
    total = (await db.execute(select(func.count(MELSubmission.id)))).scalar() or 0
    if total == 0:
        return "No MEL submissions yet."
    verified = (await db.execute(select(func.count(MELSubmission.id)).where(MELSubmission.status == "verified"))).scalar() or 0
    result = await db.execute(select(MELSubmission).where(MELSubmission.status == "verified"))
    subs = result.scalars().all()
    hh = sum(s.hh_connected or 0 for s in subs)
    msme = sum(s.msme_connected or 0 for s in subs)
    co2 = sum(s.co2_avoided_cumulative or 0 for s in subs)
    jobs = sum(s.direct_jobs_created or 0 for s in subs)
    gen_disp = sum(s.diesel_generators_decommissioned or 0 for s in subs)

    target_result = await db.execute(select(MELTarget))
    targets = {t.indicator_key: t.target_value for t in target_result.scalars().all()}

    lines = [f"MEL: {total} submissions ({verified} verified)."]
    lines.append(f"  HH connected: {hh:,} (target: {targets.get('hh_connected_cumulative', 'N/A'):,})")
    lines.append(f"  MSMEs: {msme:,} (target: {targets.get('msme_connected_cumulative', 'N/A'):,})")
    lines.append(f"  CO₂ avoided: {co2:,.1f} tCO₂e (target: {targets.get('co2_avoided_cumulative', 'N/A'):,})")
    lines.append(f"  Direct jobs: {jobs:,} (target: {targets.get('direct_jobs_created', 'N/A'):,})")
    lines.append(f"  Generators displaced: {gen_disp:,} (target: {targets.get('diesel_generators_decommissioned', 'N/A'):,})")

    log_result = await db.execute(select(MELLearningLog).order_by(MELLearningLog.created_at.desc()).limit(3))
    entries = log_result.scalars().all()
    if entries:
        lines.append("Recent learning entries:")
        for e in entries:
            lines.append(f"  [{e.tag}] {e.title}")
    return "\n".join(lines)


async def _answer(question: str, db: AsyncSession) -> str:
    q = question.lower().strip()
    data = _load_settlements()
    summary = _settlement_summary()
    config = _load_config()
    financial = _load_financial()

    # Tickets
    if any(w in q for w in ["ticket", "grievance", "issue", "sla", "escalat"]):
        return await _ticket_summary(db)

    # Settlement invoices
    if any(w in q for w in ["invoice", "settlement ledger", "settle", "payment", "overdue", "disputed"]):
        return await _settlement_summary_db(db)

    # MEL / M&E
    if any(w in q for w in ["mel", "m&e", "monitoring", "evaluation", "learning", "pdo", "indicator", "target", "co2", "carbon", "job", "gesi", "female", "gender"]):
        return await _mel_summary(db)

    # Financial / costs / tariff
    if any(w in q for w in ["cost", "capex", "tariff", "financial", "lcoe", "grant", "financing", "opex"]):
        cu = financial["capex_unit_costs"]
        fin = financial["financing"]
        tb = financial.get("tariff_benchmarks", {})
        lines = [
            "Financial defaults (DARES Nigeria):",
            f"  PV: ${cu['pv_modules_usd_per_kwp']}/kWp, Battery: ${cu['battery_ems_usd_per_kwh']}/kWh, Inverter: ${cu['inverters_usd_per_kwac']}/kVA",
            f"  Civil works: ${cu['civil_works_fixed_usd']:,}, Distribution: ${cu['distribution_cost_usd_per_connection']}/conn",
            f"  Grant: {fin['default_grant_pct']*100:.0f}%, Debt: {fin['default_debt_pct']*100:.0f}% at {fin['concessional_debt_rate']*100:.0f}%, Equity: {fin['default_equity_pct']*100:.0f}%",
            f"  Project life: {financial['project_lifetime_years']}y, Discount rate: {financial['discount_rate']*100:.0f}%",
            f"  Exchange rate: ₦{config['exchange_rate_ngn_usd']:,}/USD",
        ]
        if tb:
            lines.append(f"  NERC Band A tariff: ₦{tb.get('nerc_band_a_ngn_kwh', 'N/A')}/kWh")
            lines.append(f"  Self-generation cost: ₦{tb.get('self_generation_low_ngn_kwh', 'N/A')}–{tb.get('self_generation_high_ngn_kwh', 'N/A')}/kWh")
        return "\n".join(lines)

    # Programme / DARES / config
    if any(w in q for w in ["programme", "program", "dares", "img", "pfs", "afcen", "rea", "world bank"]):
        if "sizing" in q or "design" in q:
            return ("AfCEN PUE-First System Sizing (Design Document v2):\n"
                    "  Scenario 1: 50% of potential connections + 100% PUE anchors. Grid import for remainder.\n"
                    "  Scenario 2: 100% of potential connections + 100% PUE anchors. Full self-sufficiency.\n"
                    "  Method: 84-combination HOMER-style optimisation (12 PV × 7 battery factors) against LPSP targets.\n"
                    "  LPSP: Tier 1=10%, Tier 2=7%, Tier 3=5%, Tier 4=3%.\n"
                    f"  Cost basis: PV ${financial['capex_unit_costs']['pv_modules_usd_per_kwp']}/kWp, "
                    f"Battery ${financial['capex_unit_costs']['battery_ems_usd_per_kwh']}/kWh, "
                    f"Inverter ${financial['capex_unit_costs']['inverters_usd_per_kwac']}/kVA.")
        if "milestone" in q or "pbg" in q or "disburs" in q:
            return ("DARES PBG (Performance-Based Grant) milestones:\n"
                    "  M1 (30%): Goods delivery + site preparation\n"
                    "  M2 (40%): Commissioning + connections verified\n"
                    "  M3 (30%): 3 months sustained operation\n"
                    "  Grant range: $350–$600 per connection\n"
                    "  Total DARES budget: $750M (World Bank IDA)\n"
                    "  MST subsidy envelope: $215M, PBG envelope: $195M\n"
                    "  National target: 2.7M connections via minigrids")
        return (f"DARES IMG (Distributed Access through Renewable Energy Scale – Interconnected Mini Grids).\n"
                f"  Funder: World Bank IDA ($750M total).\n"
                f"  Implementer: Nigeria REA (Rural Electrification Agency).\n"
                f"  Regulator: NERC. DisCos: {', '.join(d['name'] for d in config['discos'][:3])}.\n"
                f"  Platform: {summary['total']:,} candidate settlements across {len(summary['states'])} states.\n"
                f"  Total population covered: {summary['total_population']:,}.\n"
                f"  Total estimated connections: {summary['total_connections']:,}.")

    # Settlement counts
    if any(w in q for w in ["how many", "total", "count"]) and any(w in q for w in ["settlement", "site", "village"]):
        for disco_key in ["aedc", "kedco", "ie"]:
            if disco_key in q:
                dk = disco_key.upper()
                d = summary["by_disco"].get(dk, {})
                return f"{dk}: {d.get('count', 0):,} settlements, population {d.get('pop', 0):,}, {d.get('conn', 0):,} connections, avg score {d.get('avg_score', 0)}."
        return f"Platform has {summary['total']:,} settlements across 3 DisCos: AEDC ({summary['by_disco']['AEDC']['count']:,}), KEDCO ({summary['by_disco']['KEDCO']['count']:,}), IE ({summary['by_disco']['IE']['count']:,}). Total population: {summary['total_population']:,}."

    # Population
    if any(w in q for w in ["population", "people"]):
        for disco_key in ["aedc", "kedco", "ie"]:
            if disco_key in q:
                dk = disco_key.upper()
                d = summary["by_disco"].get(dk, {})
                return f"{dk}: population {d.get('pop', 0):,} across {d.get('count', 0):,} settlements."
        return f"Total population: {summary['total_population']:,}. AEDC: {summary['by_disco']['AEDC']['pop']:,}, KEDCO: {summary['by_disco']['KEDCO']['pop']:,}, IE: {summary['by_disco']['IE']['pop']:,}."

    # Demand
    if any(w in q for w in ["demand", "kwh", "energy", "electricity"]):
        return f"Total demand: {summary['total_demand_kwh']:,.0f} kWh/yr. AEDC: {summary['by_disco']['AEDC']['demand']:,.0f}, KEDCO: {summary['by_disco']['KEDCO']['demand']:,.0f}, IE: {summary['by_disco']['IE']['demand']:,.0f}."

    # Connections
    if any(w in q for w in ["connection", "meter"]):
        return f"Total connections: {summary['total_connections']:,}. AEDC: {summary['by_disco']['AEDC']['conn']:,}, KEDCO: {summary['by_disco']['KEDCO']['conn']:,}, IE: {summary['by_disco']['IE']['conn']:,}."

    # Top / rankings
    if any(w in q for w in ["top", "best", "highest", "ranked", "ranking"]):
        n = 10
        match = re.search(r"top\s*(\d+)", q)
        if match:
            n = min(int(match.group(1)), 50)
        top = data[:n]
        lines = [f"Top {n} settlements by score:"]
        for s in top:
            lines.append(f"  {s['rank']}. {s['village']} ({s['disco']}, {s['lga']}) — Score: {s['score']}, Pop: {s['population']:,}, Demand: {s['demand_kwh']:.0f} kWh/yr")
        return "\n".join(lines)

    # Security / risk
    if any(w in q for w in ["security", "risk", "safe"]):
        rc = summary["security_risk"]
        return f"Security risk: Low {rc['low']:,} ({rc['low']/summary['total']*100:.1f}%), Medium {rc['medium']:,} ({rc['medium']/summary['total']*100:.1f}%), High {rc['high']:,} ({rc['high']/summary['total']*100:.1f}%)."

    # DisCo info
    if any(w in q for w in ["disco", "distribution", "concession"]):
        lines = ["DisCo breakdown:"]
        for d, info in summary["by_disco"].items():
            lines.append(f"  {d}: {info['count']:,} sites, Pop: {info['pop']:,}, Conn: {info['conn']:,}, Avg Score: {info['avg_score']}")
        return "\n".join(lines)

    # States
    if any(w in q for w in ["state", "states"]):
        lines = ["Settlements by state:"]
        for st, cnt in sorted(summary["states"].items(), key=lambda x: -x[1]):
            lines.append(f"  {st}: {cnt:,}")
        return "\n".join(lines)

    # LGA
    if "lga" in q or "local government" in q:
        lgas: dict = {}
        for s in data:
            lgas.setdefault(s["lga"], 0)
            lgas[s["lga"]] += 1
        lines = ["Top 20 LGAs:"]
        for lg, cnt in sorted(lgas.items(), key=lambda x: -x[1])[:20]:
            lines.append(f"  {lg}: {cnt:,}")
        return "\n".join(lines)

    # Score
    if "score" in q and "average" in q:
        return f"Average score: {summary['avg_score']}. AEDC: {summary['by_disco']['AEDC']['avg_score']}, KEDCO: {summary['by_disco']['KEDCO']['avg_score']}, IE: {summary['by_disco']['IE']['avg_score']}."

    # Overview / status / dashboard
    if any(w in q for w in ["overview", "status", "dashboard", "summary", "report"]):
        ticket_info = await _ticket_summary(db)
        settle_info = await _settlement_summary_db(db)
        mel_info = await _mel_summary(db)
        lines = [
            f"=== DARES IMG Platform Status ===",
            f"Sites: {summary['total']:,} settlements, {summary['total_population']:,} population, {summary['total_connections']:,} connections.",
            "",
            ticket_info,
            "",
            settle_info,
            "",
            mel_info,
        ]
        return "\n".join(lines)

    # Search settlement by name
    for s in data:
        if s["village"].lower() in q or (len(s["village"]) > 4 and s["village"].lower()[:5] in q):
            return (f"{s['village']} ({s['disco']}, {s['lga']}, {s['state']}) — "
                    f"Rank: {s['rank']}, Score: {s['score']}, Pop: {s['population']:,}, "
                    f"Connections: {s['connections']:,}, Demand: {s['demand_kwh']:.0f} kWh/yr, "
                    f"Grid: {s['grid_dist_km']:.1f} km, Security: {s['security_risk']}, "
                    f"Type: {s['recommended_mg_type']}.")

    return (f"I have access to all DARES IMG platform data ({summary['total']:,} settlements, tickets, invoices, MEL data, financial parameters, and programme intelligence). Ask about:\n"
            "• Settlements, population, demand by DisCo/state\n"
            "• Tickets, SLA breaches, escalations\n"
            "• Settlement invoices, payments, disputes\n"
            "• MEL indicators, PDO targets, learning log\n"
            "• Financial costs, tariffs, grant parameters\n"
            "• Programme info (DARES, PBG milestones, sizing methodology)\n"
            "• Platform overview / status dashboard\n"
            "• Any settlement by name")


class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    source: str = "platform_data"


@router.post("/alfred/chat")
async def alfred_chat(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    reply = await _answer(req.message, db)
    return ChatResponse(reply=reply)
