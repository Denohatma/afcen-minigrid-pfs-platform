"""
Alfred — Intelligent Assistant for DARES IMG Platform

Accesses all platform data: settlements, tickets, invoices, MEL submissions,
targets, financial defaults, Nigeria config, reference documents, and
comprehensive knowledge from DARES PAD, Mission 300 Compact, RMI/GEAPP
first-wave IMG reports, DER scaling roadmap, and Nigerian electrification
policies and regulations.
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
        if any(w in q for w in ["lcoe", "levelized", "levelised", "cost reduction", "cost pathway",
                                 "blended tariff", "duos", "second wave", "second-wave"]):
            return ("IMG Economics and Cost Pathway:\n"
                    "  First-wave LCOE: $0.57/kWh (across 4 pilot IMGs).\n"
                    "  Target second-wave LCOE: $0.18/kWh (68% reduction).\n"
                    "  Reduction breakdown:\n"
                    "    Generation CAPEX: –$0.21/kWh (bulk procurement, technology cost declines)\n"
                    "    Distribution/interconnection CAPEX: –$0.20/kWh (standardised design, DisCo-approved contractors)\n"
                    "    Project development CAPEX: –$0.02/kWh (streamlined permitting)\n"
                    "    Grid cost increase: +$0.04/kWh (higher grid utilisation)\n"
                    "  Median CAPEX: $2,547/kW or $1,323/connection.\n"
                    "  Interconnection cost median: $73,087/project ($15K–$121K range).\n"
                    "  Distribution cost: $503/connection median ($216–$725 range).\n"
                    "  Blended tariff: customers pay one rate; developer reimburses DisCo for grid energy + DUOS.\n"
                    "  Current regulations allow cost-reflective tariffs.\n"
                    f"  Average grid tariff: ~$0.12/kWh. Generator fuel: >$0.40/kWh.\n"
                    "  IMG tariffs ($0.09–$0.28/kWh) are competitive with generator costs.")
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
        if "nep" in q or "predecessor" in q or "lesson" in q:
            return ("NEP (Nigeria Electrification Project) — DARES predecessor:\n"
                    "  Benefited 7M+ people, deployed 50+ MW DRE, leveraged $550M WB + $200M AfDB.\n"
                    "  Key lessons carried into DARES:\n"
                    "  1. Untargeted subsidies scaled in easy areas, not hardest-to-reach populations.\n"
                    "  2. Productive use of electricity (PUE) is key to sustainability — almost all NEP connections went to HH not MSMEs.\n"
                    "  3. Urban under-served populations reliant on generators cannot be ignored.\n"
                    "  4. Direct USD grant disbursement provides greater private capital leverage than Naira.\n"
                    "  5. Big data / Odyssey platform delivers efficiency gains.\n"
                    "  6. Local commercial bank financing is bottleneck (interest 20–30%, high collateral).\n"
                    "  7. Coordinated development platform (FGN-owned) needed to avoid siloed operations.")
        if "component" in q or "budget" in q or "ida" in q:
            return ("DARES Project Components (PAD, Nov 2023):\n"
                    "  Total project cost: $1,818M.\n"
                    "  World Bank IDA financing: $750M ($150M credit + $600M Scale-Up Window).\n"
                    "  Commercial financing: $1,028M. Foundation grants: $40M.\n"
                    "  Component 1 — Solar Hybrid Mini Grids for Economic Development: $1,023M\n"
                    "    Subcomponent 1.1 — MST subsidy envelope: $215M\n"
                    "    Subcomponent 1.2 — PBG grant envelope: $195M\n"
                    "  Component 2 — Stand-alone Solar Systems (HH, MSMEs, Agribusiness): $715M\n"
                    "  Component 3 — Technical Assistance: $80M\n"
                    "  Expected closing: 31 December 2028.\n"
                    "  Implementing agencies: REA and Lagos State Electricity Board (LSEB).\n"
                    "  Leverage ratio: $1 public : $1.25 private (from NEP experience).")
        if "pad" in q or "appraisal" in q:
            return ("DARES Project Appraisal Document (World Bank, November 2023):\n"
                    "  Project ID: P179687. Approval: Board-approved Nov 2023.\n"
                    "  PDO: Increase access to electricity services for HH and MSMEs with private-sector-led DRE.\n"
                    "  Total cost: $1,818M. IDA: $750M. Commercial: $1,028M. Grants: $40M.\n"
                    "  Target: 2.7M connections via minigrids + 6.6M HH via standalone solar.\n"
                    "  Exchange rate at appraisal: $1 = ₦780.50.\n"
                    "  Overall risk rating: Substantial. Political/Governance and Macro risks: High.\n"
                    "  Closing date: 31 December 2028.\n"
                    "  IFC complementary debt facility. GEAPP philanthropic capital ($40M).\n"
                    "  DARES cited as flagship model for Mission 300 replicable DRE framework.")
        return (f"DARES IMG (Distributed Access through Renewable Energy Scale – Interconnected Mini Grids).\n"
                f"  Funder: World Bank IDA ($750M total).\n"
                f"  Implementer: Nigeria REA (Rural Electrification Agency).\n"
                f"  Regulator: NERC. DisCos: {', '.join(d['name'] for d in config['discos'][:3])}.\n"
                f"  Platform: {summary['total']:,} candidate settlements across {len(summary['states'])} states.\n"
                f"  Total population covered: {summary['total_population']:,}.\n"
                f"  Total estimated connections: {summary['total_connections']:,}.\n"
                f"  Ask me about: DARES components/budget, PAD details, NEP lessons, PBG milestones, system sizing.")

    # Pilot projects / first-wave IMGs
    if any(w in q for w in ["pilot", "first wave", "first-wave", "toto", "zawaciki", "robinyan", "wuse", "powergen", "bagaja", "darway", "gve"]):
        if "toto" in q:
            return ("Toto IMG (AEDC franchise, Nasarawa State):\n"
                    "  Developer: PowerGen. DisCo: AEDC.\n"
                    "  Solar PV: 352 kW. Battery: 972 kWh.\n"
                    "  Connections: 1,756. Total CAPEX: $3.0M ($1,708/connection).\n"
                    "  Average supply: 16 hrs/day (DisCo alone: 3 hrs/day).\n"
                    "  End-user tariff: ₦450/kWh ($0.28/kWh).\n"
                    "  Monthly DisCo revenues: ₦580K.\n"
                    "  Interconnection voltage: 33 kV.\n"
                    "  ACPU: 1.0 kWh/day (vs 0.3 kWh/day avg for isolated minigrids).\n"
                    "  CO₂ abated: ~800 tons since inception (Dec 2023 – Dec 2024).\n"
                    "  Context: community had NO grid electricity 2019–2022; 500+ generators previously in use.\n"
                    "  DisCo collection rate: 100% (previously unprofitable area).")
        if "zawaciki" in q:
            return ("Zawaciki IMG (KEDCO franchise, Kano State):\n"
                    "  Developer: Bagaja. DisCo: KEDCO.\n"
                    "  Solar PV: 1,000 kW. Battery: N/A (grid-reliant).\n"
                    "  Connections: 1,039. Total CAPEX: $2.5M ($2,406/connection).\n"
                    "  Average supply: 18 hrs/day (DisCo alone: 16 hrs/day).\n"
                    "  End-user tariff: ₦150/kWh ($0.09/kWh).\n"
                    "  Monthly DisCo revenues: ₦5.2M.\n"
                    "  Interconnection voltage: 33 kV.\n"
                    "  ACPU: 4.4 kWh/day. Collection rate: 100%.")
        if "robinyan" in q:
            return ("Robinyan IMG (Ikeja Electric franchise, Ogun State):\n"
                    "  Developer: Darway Coast. DisCo: Ikeja Electric.\n"
                    "  Solar PV: 500 kW. Battery: 625 kWh.\n"
                    "  Connections: 1,400. Total CAPEX: $1.3M ($929/connection).\n"
                    "  Average supply: 15 hrs/day (DisCo alone: 8 hrs/day).\n"
                    "  End-user tariff: ₦209/kWh ($0.13/kWh).\n"
                    "  Monthly DisCo revenues: ₦396K.\n"
                    "  Interconnection voltage: 11 kV.")
        if "wuse" in q:
            return ("Wuse IMG (AEDC franchise, FCT/Abuja):\n"
                    "  Developer: GVE. DisCo: AEDC.\n"
                    "  Solar PV: 1,000 kW. Battery: 1,200 kWh.\n"
                    "  Connections: 2,166. Total CAPEX: $2.4M ($1,108/connection).\n"
                    "  Average supply: 13 hrs/day (DisCo alone: 7 hrs/day).\n"
                    "  End-user tariff: ₦215/kWh ($0.13/kWh).\n"
                    "  Monthly DisCo revenues: ₦4.8M.\n"
                    "  Interconnection voltage: 11 kV.")
        return ("Nigeria First-Wave Interconnected Minigrids (RMI/GEAPP, May 2025):\n"
                "  4 operational IMGs under DER Pilot Support Programme (Oct 2022 – Apr 2025):\n"
                "  1. Toto (AEDC, Nasarawa) — PowerGen, 352 kW PV, 1,756 conn, $3.0M CAPEX\n"
                "  2. Zawaciki (KEDCO, Kano) — Bagaja, 1,000 kW PV, 1,039 conn, $2.5M CAPEX\n"
                "  3. Robinyan (IE, Ogun) — Darway Coast, 500 kW PV, 1,400 conn, $1.3M CAPEX\n"
                "  4. Wuse (AEDC, FCT) — GVE, 1,000 kW PV, 2,166 conn, $2.4M CAPEX\n"
                "  Collective: 3 MW solar, 3 MWh battery, ~6,300 connections.\n"
                "  95% increase in customer connections vs pre-IMG baseline.\n"
                "  15x increase in avg consumption per user vs isolated minigrids.\n"
                "  First-wave LCOE: $0.57/kWh → target second-wave: $0.18/kWh (68% reduction).\n"
                "  Median CAPEX: $2,547/kW or $1,323/connection.\n"
                "  Distribution + interconnection = ~50% of total project costs.\n"
                "  Average completion time: 4 years (procurement delays, equipment import, inspections).\n"
                "  RMI identified 22 GW DER opportunity across Nigeria = 4,000–8,000 potential IMGs.")

    # Regulations / policy / legal framework
    if any(w in q for w in ["regulation", "policy", "regulatory", "nerc", "law", "act", "legal",
                             "mini-grid regulation", "minigrid regulation", "electricity act",
                             "embedded generation", "franchising", "myto", "nemsa"]):
        if "embedded" in q:
            return ("Regulation for Embedded Generation (NERC, 2012):\n"
                    "  Enables DERs up to 20 MW to be embedded within DisCo distribution networks.\n"
                    "  Allows developers to sell power directly to DisCos.\n"
                    "  Foundational regulation for all IMG and C&I DER projects.\n"
                    "  NERC 2024 MYTO Supplementary Order: mandated DisCos to meet minimum 10%\n"
                    "  demand allocation through embedded generation by April 2025, half from renewables.")
        if "franchising" in q or "franchise" in q:
            return ("Guidelines on Distribution Franchising (NERC, 2020):\n"
                    "  Permits third-party sub-franchising of DisCo network areas.\n"
                    "  Enables private developers to manage distribution in underserved areas.\n"
                    "  Key mechanism for IMG developers to operate within DisCo franchise zones.\n"
                    "  Developer takes on distribution responsibilities, DisCo retains overall licence.")
        if "electricity act" in q or "act 2023" in q:
            return ("Electricity Act 2023:\n"
                    "  Major legislative reform empowering states to create independent electricity markets.\n"
                    "  Enables state-level licensing and regulation alongside NERC federal framework.\n"
                    "  Supports decentralised energy governance — critical for DER scaling.\n"
                    "  Lagos State Electricity Board (LSEB) is a direct result of this Act.\n"
                    "  Opens pathway for state-level mini-grid and DER procurement.")
        if "myto" in q:
            return ("NERC Multi-Year Tariff Order (MYTO):\n"
                    "  Cost-reflective tariff methodology for Nigeria's electricity sector.\n"
                    "  2024 MYTO Supplementary Order: mandates DisCos to source ≥10% of demand\n"
                    "  from embedded generation (DERs) by April 2025, with ≥50% from renewables.\n"
                    "  Band classification (A–E) determines tariff levels by feeder quality:\n"
                    "    Band A: ≥20 hrs supply/day (cost-reflective tariff)\n"
                    "    Band B: 16–20 hrs, Band C: 12–16 hrs, Band D: 8–12 hrs, Band E: <8 hrs.\n"
                    "  DARES targets Band C, D, E feeders (worst-served areas).")
        if "nemsa" in q:
            return ("NEMSA (Nigerian Electricity Management Services Agency):\n"
                    "  Statutory body responsible for technical inspection and certification of electrical installations.\n"
                    "  NEMSA certification is required before commissioning milestone disbursement under DARES.\n"
                    "  First-wave IMG experience: NEMSA inspection delays were a key bottleneck.\n"
                    "  Platform tracks NEMSA pathway as a Condition Precedent (CP) category.\n"
                    "  Automated deadline alerts for NEMSA certification in CP tracker.")
        return ("Nigerian Electrification Regulatory Framework:\n"
                "  1. Mini-Grid Regulation 2023 (updated from 2016): supports tripartite agreements;\n"
                "     includes Distribution Use of System (DUOS) charges; fast-tracks pipeline approvals.\n"
                "  2. Regulation for Embedded Generation 2012: enables DERs up to 20 MW within DisCo networks.\n"
                "  3. Guidelines on Distribution Franchising 2020: permits third-party sub-franchising.\n"
                "  4. Electricity Act 2023: empowers states to create independent electricity markets.\n"
                "  5. NERC 2024 MYTO Supplementary Order: 10% embedded generation mandate for DisCos.\n"
                "  6. Energy Transition Plan (ETP) 2022: carbon-neutral by 2060, universal access by 2030.\n"
                "  Nigeria has 'most progressive and comprehensive' mini-grid regulations in SSA (World Bank).\n"
                "  Key bodies: NERC (regulator), NEMSA (technical certification), REA (implementing agency).")

    # Mission 300 / Energy Compact / universal access
    if any(w in q for w in ["mission 300", "compact", "universal access", "sdg7", "sdg 7",
                             "energy summit", "2030 target"]):
        if "funding" in q or "investment" in q or "need" in q:
            return ("Mission 300 Funding Needs (US$ Million by 2030):\n"
                    "  Generation: Public $3,000 + Private TBD\n"
                    "  Transmission: $5,300 (public)\n"
                    "  Distribution: Public $3,400 + Private $5,100\n"
                    "  Off-grid (incl. last mile): Public $4,300 + Private $10,500\n"
                    "  Clean cooking: $1,200 (public)\n"
                    "  Total: $32,700M (Public $17,200M + Private $15,500M).\n"
                    "  Private capital target: $15.5 billion.")
        if "pillar" in q or "commitment" in q:
            return ("Mission 300 Compact — Five Policy Pillars:\n"
                    "  1. Generation Expansion: NIEP-SIP by 2025; Least-Cost Power Dev Plan by 2026; IRP by 2027; TCN unbundling.\n"
                    "  2. Financially Viable Utilities: Close 7M meter gap (1.5M smart meters 2025, 4M 2026, 1.5M 2027);\n"
                    "     cost-reflective tariffs; DisCo Performance Improvement Plans (PIPs).\n"
                    "  3. Private Sector Participation: Licensing limits above 1 MW; streamlined registration;\n"
                    "     standardised tripartite contracts; net billing policy; $100M local currency DRE capital by 2026.\n"
                    "  4. Last Mile Access: National Electrification Strategy (NESIP) by 2025; MTF survey;\n"
                    "     DARES as replicable DRE framework.\n"
                    "  5. Regional Integration: West African grid synchronisation; ECOWAS Master Plan (28 projects, 22,932 km HV).")
        return ("Nigeria Mission 300 National Energy Compact (Africa Energy Summit):\n"
                "  Roadmap for accelerating universal electricity access aligned with SDG7.\n"
                "  86+ million people without electricity access (2022: 61% access rate).\n"
                "  160+ million lack clean cooking (3rd largest deficit globally).\n"
                "  Targets:\n"
                "    Electricity access growth: from 5% to 9% p.a. → universal access by 2030.\n"
                "    Renewable energy share: from 22% (hydro only) to 50% by 2030.\n"
                "    Private capital mobilised: $15.5 billion.\n"
                "  Total investment needed: $32.7 billion ($17.2B public + $15.5B private).\n"
                "  DARES cited as flagship model for replicable DRE framework.\n"
                "  Petrol subsidy eliminated 2023 (was 2.2% GDP / ₦4.5T forgone revenue in 2022).")

    # Nigeria country context / power sector
    if any(w in q for w in ["power sector", "grid capacity", "access rate", "electrification rate",
                             "generator", "genset", "genco", "tcn", "nbet", "atc"]):
        if "generator" in q or "genset" in q or "diesel" in q or "self-generation" in q:
            return ("Generator/Self-Generation in Nigeria:\n"
                    "  150M Nigerians (75%) have no or unreliable electricity.\n"
                    "  HH and SMEs spend $12 billion/year on generators.\n"
                    "  Generator fuel costs: >₦600/kWh ($0.40/kWh) — 4x the average grid tariff.\n"
                    "  Manufacturers allocate up to 40% of operating costs to energy.\n"
                    "  Economic losses from unreliable power: ₦7–10 trillion ($25B annually, 5–7% of GDP).\n"
                    "  Toto IMG example: 500+ generators previously in use, community had NO grid 2019–2022.\n"
                    "  IMG end-user tariffs (₦150–450/kWh) are cheaper than generator costs.")
        if "atc" in q or "loss" in q:
            return ("DisCo ATC&C (Aggregate Technical, Commercial & Collection) Losses:\n"
                    "  National average: ~42% total.\n"
                    "  Breakdown: 21% technical/commercial losses + 26% collection losses.\n"
                    "  DERs can reduce ATC&C losses by up to 20% across service territories.\n"
                    "  Customer savings: up to 25% by displacing diesel generators.\n"
                    "  DISCOs added 4.7M 'legal' connections 2015–2023 (mostly from metering, not new connections).")
        if "tcn" in q or "transmission" in q:
            return ("Transmission Company of Nigeria (TCN):\n"
                    "  State-owned, operates 330kV and 132kV transmission network.\n"
                    "  Can only meet 70–80% of forecasted DisCo demand.\n"
                    "  Even with 8% increase in TCN supply, gap persists.\n"
                    "  Mission 300 plans TCN unbundling into ISO (Independent System Operator) and TSPs.\n"
                    "  $5.3 billion transmission investment needed by 2030.")
        return ("Nigeria Power Sector Overview:\n"
                "  Most populous African country, largest SSA economy, GDP ~$471B.\n"
                "  ~80 million people in poverty; 85+ million without electricity.\n"
                "  Electricity access: 60% (2021). Urban: 89%, Rural: 26%.\n"
                "  Grid capacity: ~5 GW available (10% of South Africa's, serving 4x the population).\n"
                "  79% generation from thermal; rest hydro. Average plant: >20 years old.\n"
                "  Structure: 6 GENCOs, 11 DISCOs, 1 TCN, NBET (transitioning from single buyer).\n"
                "  ATC&C losses: ~42%. Generator dependency: $12B/year.\n"
                "  Electrification pathway (PAD): 64M of 94M unelectrified best served by distributed access.\n"
                "  31.4M people (5.6M HH) → minigrids. 32.7M (6.6M HH) → standalone solar.\n"
                "  Universal access requires $20B+ investment; $7.5B from private sector.")

    # DER roadmap / scaling / business models
    if any(w in q for w in ["der", "distributed energy", "scaling", "roadmap", "business model",
                             "c&i", "commercial industrial", "reg ", "bulk power"]):
        if "business model" in q or "model" in q:
            return ("Three IMG/DER Business Models in Nigeria:\n"
                    "  1. Interconnected Minigrid (IMG): Developer builds DER + upgrades distribution network.\n"
                    "     Customers pay blended tariff to developer. Developer reimburses DisCo for grid energy + DUOS.\n"
                    "     Tripartite agreement (developer-DisCo-community) governs operations.\n"
                    "  2. Commercial & Industrial (C&I) DER: Large customers (factories, malls) partner with\n"
                    "     developer for on-site solar/storage. DisCo benefits from reduced peak load.\n"
                    "  3. Renewable Embedded Generation (REG): Developer sells bulk power directly into DisCo feeder.\n"
                    "     DisCo distributes to existing customers. Simplest model but limited to generation only.")
        if "opportunity" in q or "market" in q or "potential" in q:
            return ("Nigeria DER Market Opportunity (RMI Roadmap, June 2024):\n"
                    "  Total: 20+ GW over 10 years across Nigeria.\n"
                    "  Five DisCos alone: ~1 GW/year needed. Nationwide: ~2 GW/year.\n"
                    "  Investment opportunity: $8B+ over 10 years (five DisCos); ~$14B nationwide.\n"
                    "  4,000–8,000 potential IMG sites identified.\n"
                    "  Solar PV is leading modelled DER technology outside Lagos.\n"
                    "  Gas plays larger role in Lagos due to space constraints.\n"
                    "  Each DisCo: avg revenue increase of ₦70B+ ($50M) per year over next decade.\n"
                    "  ATC&C loss reduction: up to 20% with distribution network upgrades.")
        return ("Scaling Utility-Enabled DERs in Nigeria (RMI, June 2024):\n"
                "  150M Nigerians have no or unreliable electricity. Grid meets only 20% of demand.\n"
                "  DER market: 20+ GW over 10 years, $14B investment opportunity nationwide.\n"
                "  Three business models: IMG, C&I DER, Renewable Embedded Generation (REG).\n"
                "  NERC mandate (March 2024): DisCos must meet ≥10% demand from embedded generation by Apr 2025.\n"
                "  Each DisCo: avg revenue increase ₦70B+ ($50M)/yr from DER integration.\n"
                "  Four priority areas: data-driven planning, efficient project dev, dedicated DER teams, leadership.\n"
                "  Based on engagement with 5 of Nigeria's 11 DisCos (AEDC, BEDC, EKEDC, KEDCO, IE).")

    # Procurement / tender process / 21-gate
    if any(w in q for w in ["procurement", "tender", "rfp", "eoi", "bid", "evaluation",
                             "data room", "gate", "21-gate", "21 gate", "no-objection",
                             "prequalification", "pre-qualification"]):
        if "gate" in q or "process" in q or "workflow" in q:
            return ("DARES IMG 21-Gate Procurement Process (State Machine):\n"
                    "  1. Site Identification → 2. Site Readiness Screening → 3. DisCo Validation\n"
                    "  4. E&S Baseline → 5. Lot Packaging → 6. Approval to Tender\n"
                    "  7. EOI/Prequalification → 8. RFP/Data Room Issued → 9. Clarifications\n"
                    "  10. Bid Submission → 11. Administrative Responsiveness Check\n"
                    "  12. Technical Evaluation → 13. Financial/Grant Evaluation → 14. Clarifications\n"
                    "  15. Award Recommendation → 16. No-Objection/Approval → 17. Grant/Project Agreements\n"
                    "  18. Conditions Precedent → 19. Commissioning Verification\n"
                    "  20. Connections/Utilisation Verification → 21. Final Settlement\n"
                    "  Each gate has defined authority: REA/PMU, World Bank, DisCo, NERC, NEMSA, or IVA.\n"
                    "  World Bank prior review and no-objection required at key gates.")
        if "data room" in q:
            return ("DARES IMG Data Room — 8-Folder Structure per Tender Lot:\n"
                    "  Folder 1: GIS Data & Maps (settlement locations, feeder maps, land survey)\n"
                    "  Folder 2: Feeder & Customer Baselines (DisCo customer data, load profiles)\n"
                    "  Folder 3: E&S Screening (environmental/social baseline, ESIA framework)\n"
                    "  Folder 4: Permitting Pathways (NERC, NEMSA, land, local authority permits)\n"
                    "  Folder 5: Contract Templates (grant agreement, tripartite template, DisCo protocol)\n"
                    "  Folder 6: Technical Specifications (system sizing, interconnection requirements)\n"
                    "  Folder 7: Financial Parameters (grant caps, eligible CAPEX, tariff benchmarks)\n"
                    "  Folder 8: Community & PUE Data (productive use anchors, community engagement records)\n"
                    "  Completeness gating: no lot issued without confirmed feeder data, customer data,\n"
                    "  POI approval, and settlement terms from DisCo.")
        if "evaluation" in q or "scoring" in q:
            return ("DARES IMG Bid Evaluation Process:\n"
                    "  Phase 1: Administrative Responsiveness — completeness check against RFP checklist.\n"
                    "  Phase 2: Technical Evaluation — scored against technical requirements.\n"
                    "  Phase 3: Financial/Grant Evaluation — LCOE, grant per connection, financial viability.\n"
                    "  AI-assisted evaluation: flags compliance gaps and technical inconsistencies.\n"
                    "  Mandatory human acknowledgement of all AI flags. Full audit trail.\n"
                    "  World Bank no-objection required for award recommendation.\n"
                    "  COI (Conflict of Interest) declarations required from all evaluators.")
        return ("DARES IMG Procurement Overview:\n"
                "  21-gate state machine from site identification to final settlement.\n"
                "  Competitive procurement in lots (multiple sites per lot).\n"
                "  8-folder structured data room per tender lot.\n"
                "  DisCo readiness module gates sites before tendering.\n"
                "  AI-assisted bid evaluation with human oversight and full audit trail.\n"
                "  World Bank prior review and no-objection at key gates.\n"
                "  COI declarations, bid encryption, immutable audit log.\n"
                "  Key documents: EOI, RFP, Bid Data Sheet, Evaluation Manual, Grant Agreement,\n"
                "  Tripartite Agreement, DisCo Protocol, IVA Terms of Reference.")

    # Conditions Precedent / CP tracking
    if any(w in q for w in ["condition precedent", "conditions precedent", "cp tracker",
                             "cp tracking", "tripartite", "poi", "point of interconnection"]):
        return ("DARES IMG Conditions Precedent (CP) Tracking:\n"
                "  8 CP categories tracked in platform:\n"
                "  1. Corporate — company registration, board approvals, key personnel\n"
                "  2. Financing — equity evidence, debt commitment, financial close\n"
                "  3. NERC — mini-grid permit, tariff approval, licence conditions\n"
                "  4. NEMSA — inspection request, site inspection, certification\n"
                "  5. DisCo — POI approval, protection study, bulk meter, feeder upgrade\n"
                "  6. E&S — ESIA approval, RAP (if required), community consultation evidence\n"
                "  7. Land — lease/purchase agreement, land survey, access rights\n"
                "  8. Procurement — equipment orders, contractor mobilisation\n"
                "  Tripartite agreement (developer-DisCo-community) is a CP before first disbursement.\n"
                "  NEMSA certification required before commissioning milestone disbursement.\n"
                "  POI approval, protection study, and bulk meter location tracked as DisCo CPs.\n"
                "  Automated deadline alerts, verifier routing, waiver controls, immutable audit trail.")

    # DisCo directory / all 11 DisCos
    if any(w in q for w in ["aedc", "kedco", "ikeja", "bedc", "ekedc", "eko", "ibedc",
                             "eedc", "jed", "kaduna electric", "phedc", "yedc",
                             "all disco", "11 disco", "which disco"]):
        if "aedc" in q:
            return ("AEDC (Abuja Electricity Distribution Company):\n"
                    "  Franchise area: FCT/Abuja, Nasarawa, Niger, Kogi states.\n"
                    f"  DARES platform: {summary['by_disco'].get('AEDC', {}).get('count', 0):,} settlements.\n"
                    "  Pilot IMGs: Toto (PowerGen, Nasarawa) and Wuse (GVE, FCT).\n"
                    "  Toto: 352 kW, 1,756 connections. Wuse: 1,000 kW, 2,166 connections.\n"
                    "  Partner in RMI DER roadmap engagement.")
        if "kedco" in q:
            return ("KEDCO (Kano Electricity Distribution Company):\n"
                    "  Franchise area: Kano, Katsina, Jigawa states.\n"
                    f"  DARES platform: {summary['by_disco'].get('KEDCO', {}).get('count', 0):,} settlements.\n"
                    "  Pilot IMG: Zawaciki (Bagaja, Kano) — 1,000 kW, 1,039 connections.\n"
                    "  Highest DisCo revenue from IMG pilot: ₦5.2M/month at Zawaciki.\n"
                    "  Partner in RMI DER roadmap engagement.")
        if any(w in q for w in ["ikeja", "ie "]):
            return ("Ikeja Electric (IE):\n"
                    "  Franchise area: Lagos Mainland/North (Northern Lagos).\n"
                    f"  DARES platform: {summary['by_disco'].get('IE', {}).get('count', 0):,} settlements.\n"
                    "  Pilot IMG: Robinyan (Darway Coast, Ogun) — 500 kW, 1,400 connections.\n"
                    "  Partner in RMI DER roadmap engagement.")
        return ("Nigeria's 11 Distribution Companies (DisCos):\n"
                "  DARES Platform DisCos (3):\n"
                "    • AEDC — FCT/Abuja, Nasarawa, Niger, Kogi\n"
                "    • KEDCO — Kano, Katsina, Jigawa\n"
                "    • Ikeja Electric (IE) — Lagos Mainland/North\n"
                "  Other DisCos (8):\n"
                "    • BEDC — Benin (Edo, Delta, Ondo, Ekiti)\n"
                "    • EKEDC/Eko — Lagos Island/South\n"
                "    • IBEDC — Ibadan (Oyo, Ogun, Osun, Kwara)\n"
                "    • EEDC — Enugu (Enugu, Anambra, Imo, Abia, Ebonyi)\n"
                "    • JED — Jos (Plateau, Bauchi, Benue, Gombe)\n"
                "    • KE — Kaduna (Kaduna, Sokoto, Kebbi, Zamfara)\n"
                "    • PHEDC — Port Harcourt (Rivers, Bayelsa, Cross River, Akwa Ibom)\n"
                "    • YEDC — Yola (Adamawa, Borno, Taraba, Yobe)\n"
                "  All 11 are privately owned. NBET transitioning from single buyer model.\n"
                "  RMI engaged with 5 DisCos for DER roadmaps: AEDC, BEDC, EKEDC, KEDCO, IE.")

    # Stakeholders / institutional
    if any(w in q for w in ["stakeholder", "institution", "who is responsible", "authority",
                             "iva", "independent verif", "geapp", "rmi", "ifc", "jica",
                             "afdb", "giz", "usaid"]):
        return ("DARES IMG Institutional Authority Map:\n"
                "  REA/DARES PMU — procurement, award recommendation, grant administration, disbursement approval.\n"
                "  World Bank — prior review, no-objection, fiduciary oversight.\n"
                "  DisCos (AEDC, KEDCO, IE) — site approval, POI, network access, monthly settlement.\n"
                "  NERC — permits, tariffs, regulatory compliance.\n"
                "  NEMSA — technical inspection and certification.\n"
                "  IVAs (Independent Verification Agents) — milestone verification.\n"
                "  AfCEN — platform operation, analytics, training (NO procurement decision authority).\n"
                "  LSEB (Lagos State Electricity Board) — co-implementing agency.\n"
                "  Development Partners:\n"
                "    • IFC — complementary debt facility for developers.\n"
                "    • GEAPP — $40M philanthropic capital.\n"
                "    • RMI — DER technical assistance, pilot support, DER roadmaps.\n"
                "    • JICA, AfDB, GIZ, USAID — complementary programmes.\n"
                "  AfCEN boundary: neutral technical platform provider, no award authority.")

    # LCOE / cost reduction / economics
    if any(w in q for w in ["lcoe", "levelized", "levelised", "cost reduction", "cost pathway",
                             "economics", "viability", "blended tariff", "duos"]):
        return ("IMG Economics and Cost Pathway:\n"
                "  First-wave LCOE: $0.57/kWh (across 4 pilot IMGs).\n"
                "  Target second-wave LCOE: $0.18/kWh (68% reduction).\n"
                "  Reduction breakdown:\n"
                "    Generation CAPEX: –$0.21/kWh (bulk procurement, technology cost declines)\n"
                "    Distribution/interconnection CAPEX: –$0.20/kWh (standardised design, DisCo-approved contractors)\n"
                "    Project development CAPEX: –$0.02/kWh (streamlined permitting)\n"
                "    Grid cost increase: +$0.04/kWh (higher grid utilisation)\n"
                "  Median CAPEX: $2,547/kW or $1,323/connection.\n"
                "  Interconnection cost median: $73,087/project ($15K–$121K range).\n"
                "  Distribution cost: $503/connection median ($216–$725 range).\n"
                "  Blended tariff: customers pay one rate; developer reimburses DisCo for grid energy + DUOS.\n"
                "  Current regulations allow cost-reflective tariffs.\n"
                "  Average grid tariff: ~$0.12/kWh. Generator fuel: >$0.40/kWh.\n"
                "  IMG tariffs ($0.09–$0.28/kWh) are competitive with generator costs.")

    # Interconnection / technical architecture
    if any(w in q for w in ["interconnection", "interconnect", "voltage", "33kv", "11kv",
                             "132kv", "330kv", "feeder", "substation", "protection study",
                             "bulk meter", "smart meter"]):
        return ("IMG Interconnection & Technical Architecture:\n"
                "  Interconnection voltages: 33 kV (Toto, Zawaciki) or 11 kV (Robinyan, Wuse).\n"
                "  National transmission: 330 kV and 132 kV (TCN-operated).\n"
                "  Distribution: 33 kV (primary) and 11 kV (secondary) — DisCo-operated.\n"
                "  DARES platform maps:\n"
                "    330kV/132kV transmission lines (hardcoded from TCN data)\n"
                "    33kV lines: 2,963 features (KEDCO/World Bank NEAP 2016 + OSM)\n"
                "    11kV lines: 1,928 features (KEDCO/World Bank NEAP 2016 + OSM)\n"
                "    44 substations (KEDCO dataset)\n"
                "  POI (Point of Interconnection) approval is a DisCo CP before construction.\n"
                "  Protection study required at POI to ensure grid stability.\n"
                "  Bulk meter at POI for grid import/export measurement.\n"
                "  Smart meters for end-user consumption tracking.\n"
                "  NERC capacity waiver sought: 1 MW → 10 MW for DARES Phase 1 (40 selected sites).\n"
                "  Standardised interconnection architecture is a key barrier to address.\n"
                "  DisCo-approved contractors needed for distribution network upgrades.")

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

    return (f"I have access to all DARES IMG platform data ({summary['total']:,} settlements, tickets, invoices, MEL data, financial parameters, and programme intelligence) plus comprehensive knowledge from DARES PAD, Mission 300 Compact, RMI/GEAPP reports, and Nigerian electrification policies. Ask about:\n"
            "• Settlements, population, demand, connections by DisCo/state/LGA\n"
            "• Tickets, SLA breaches, escalations\n"
            "• Settlement invoices, payments, disputes\n"
            "• MEL indicators, PDO targets, learning log\n"
            "• Financial costs, tariffs, LCOE, grant parameters, cost pathways\n"
            "• Programme info (DARES, PAD, components, budget, PBG milestones, NEP lessons)\n"
            "• Pilot IMGs (Toto, Zawaciki, Robinyan, Wuse — costs, performance, lessons)\n"
            "• Nigerian regulations (Mini-Grid Reg 2023, Electricity Act 2023, MYTO, NEMSA, embedded gen)\n"
            "• Mission 300 / National Energy Compact (targets, pillars, funding needs)\n"
            "• Nigeria power sector (grid capacity, access rates, generator dependency, ATC&C losses)\n"
            "• DER scaling roadmap (market opportunity, business models, DisCo revenue impact)\n"
            "• Procurement (21-gate process, data room, bid evaluation, no-objection)\n"
            "• Conditions Precedent (8 CP categories, tripartite, POI, NEMSA)\n"
            "• Interconnection & technical (voltages, feeders, substations, protection studies)\n"
            "• DisCo directory (all 11 DisCos with franchise areas)\n"
            "• Stakeholders (REA, World Bank, NERC, NEMSA, IVAs, GEAPP, RMI, IFC)\n"
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
