from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

_DATA_PATH = Path("/app/src/data/ranked_settlements.json")
if not _DATA_PATH.exists():
    _DATA_PATH = Path(__file__).resolve().parent.parent.parent.parent.parent / "src" / "data" / "ranked_settlements.json"

_cache: list[dict] | None = None


def _load():
    global _cache
    if _cache is None:
        with open(_DATA_PATH) as f:
            _cache = json.load(f)
    return _cache


def _build_summary() -> dict:
    data = _load()
    total = len(data)
    discos = {}
    states = {}
    lgas = {}
    mg_types = {"interconnected": 0, "undergrid": 0, "isolated": 0}
    risk_counts = {"low": 0, "medium": 0, "high": 0}
    total_pop = 0
    total_conn = 0
    total_demand = 0.0
    scores = []

    for s in data:
        disco = s["disco"]
        discos.setdefault(disco, {"count": 0, "pop": 0, "conn": 0, "demand": 0.0, "scores": []})
        discos[disco]["count"] += 1
        discos[disco]["pop"] += s["population"]
        discos[disco]["conn"] += s["connections"]
        discos[disco]["demand"] += s["demand_kwh"]
        discos[disco]["scores"].append(s["score"])

        st = s["state"]
        states.setdefault(st, 0)
        states[st] += 1

        lg = s["lga"]
        lgas.setdefault(lg, 0)
        lgas[lg] += 1

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

    for d in discos.values():
        d["avg_score"] = round(sum(d["scores"]) / len(d["scores"]), 1) if d["scores"] else 0
        del d["scores"]

    return {
        "total": total,
        "total_population": total_pop,
        "total_connections": total_conn,
        "total_demand_kwh": round(total_demand, 1),
        "avg_score": round(sum(scores) / len(scores), 1) if scores else 0,
        "by_disco": discos,
        "states": states,
        "top_lgas": dict(sorted(lgas.items(), key=lambda x: -x[1])[:20]),
        "mg_types": mg_types,
        "security_risk": risk_counts,
    }


def _answer(question: str) -> str:
    q = question.lower().strip()
    data = _load()
    summary = _build_summary()

    if any(w in q for w in ["how many", "total", "count"]) and any(w in q for w in ["settlement", "site", "village"]):
        if "aedc" in q:
            return f"There are {summary['by_disco']['AEDC']['count']:,} settlements in the AEDC concession area, with a total population of {summary['by_disco']['AEDC']['pop']:,} and {summary['by_disco']['AEDC']['conn']:,} estimated connections."
        if "kedco" in q:
            return f"There are {summary['by_disco']['KEDCO']['count']:,} settlements in the KEDCO concession area, with a total population of {summary['by_disco']['KEDCO']['pop']:,} and {summary['by_disco']['KEDCO']['conn']:,} estimated connections."
        if "ie" in q:
            return f"There are {summary['by_disco']['IE']['count']:,} settlements in the IE (Ikeja Electric) concession area, with a total population of {summary['by_disco']['IE']['pop']:,} and {summary['by_disco']['IE']['conn']:,} estimated connections."
        return f"The platform has {summary['total']:,} settlements across 3 DisCos: AEDC ({summary['by_disco']['AEDC']['count']:,}), KEDCO ({summary['by_disco']['KEDCO']['count']:,}), and IE ({summary['by_disco']['IE']['count']:,}). Total population: {summary['total_population']:,}. Total estimated connections: {summary['total_connections']:,}."

    if any(w in q for w in ["population", "people", "inhabitants"]):
        if "aedc" in q:
            return f"AEDC concession: total population {summary['by_disco']['AEDC']['pop']:,} across {summary['by_disco']['AEDC']['count']:,} settlements."
        if "kedco" in q:
            return f"KEDCO concession: total population {summary['by_disco']['KEDCO']['pop']:,} across {summary['by_disco']['KEDCO']['count']:,} settlements."
        if "ie" in q:
            return f"IE concession: total population {summary['by_disco']['IE']['pop']:,} across {summary['by_disco']['IE']['count']:,} settlements."
        return f"Total population across all settlements: {summary['total_population']:,}. By DisCo — AEDC: {summary['by_disco']['AEDC']['pop']:,}, KEDCO: {summary['by_disco']['KEDCO']['pop']:,}, IE: {summary['by_disco']['IE']['pop']:,}."

    if any(w in q for w in ["demand", "kwh", "energy", "electricity"]):
        return f"Total daily demand estimate: {summary['total_demand_kwh']:,.0f} kWh/day across {summary['total']:,} settlements. By DisCo — AEDC: {summary['by_disco']['AEDC']['demand']:,.0f} kWh/d, KEDCO: {summary['by_disco']['KEDCO']['demand']:,.0f} kWh/d, IE: {summary['by_disco']['IE']['demand']:,.0f} kWh/d."

    if any(w in q for w in ["connection", "meter"]):
        return f"Total estimated connections: {summary['total_connections']:,}. By DisCo — AEDC: {summary['by_disco']['AEDC']['conn']:,}, KEDCO: {summary['by_disco']['KEDCO']['conn']:,}, IE: {summary['by_disco']['IE']['conn']:,}."

    if any(w in q for w in ["top", "best", "highest score", "ranked", "ranking"]):
        n = 10
        match = re.search(r"top\s*(\d+)", q)
        if match:
            n = min(int(match.group(1)), 50)
        top = data[:n]
        lines = [f"Top {n} settlements by score:"]
        for s in top:
            lines.append(f"  {s['rank']}. {s['village']} ({s['disco']}, {s['lga']}) — Score: {s['score']}, Pop: {s['population']:,}, Demand: {s['demand_kwh']:.0f} kWh/d")
        return "\n".join(lines)

    if any(w in q for w in ["security", "risk", "safe", "danger"]):
        rc = summary["security_risk"]
        high_pct = round(rc["high"] / summary["total"] * 100, 1)
        med_pct = round(rc["medium"] / summary["total"] * 100, 1)
        low_pct = round(rc["low"] / summary["total"] * 100, 1)
        return f"Security risk breakdown: Low: {rc['low']:,} ({low_pct}%), Medium: {rc['medium']:,} ({med_pct}%), High: {rc['high']:,} ({high_pct}%). Sites with high security risk may require additional safeguards in the PFS assessment."

    if any(w in q for w in ["disco", "distribution", "concession"]):
        lines = ["Distribution Company (DisCo) breakdown:"]
        for d, info in summary["by_disco"].items():
            lines.append(f"  {d}: {info['count']:,} settlements, Pop: {info['pop']:,}, Connections: {info['conn']:,}, Avg Score: {info['avg_score']}")
        return "\n".join(lines)

    if any(w in q for w in ["state", "states"]):
        lines = ["Settlements by state:"]
        for st, cnt in sorted(summary["states"].items(), key=lambda x: -x[1]):
            lines.append(f"  {st}: {cnt:,}")
        return "\n".join(lines)

    if any(w in q for w in ["lga", "local government"]):
        lines = ["Top 20 LGAs by settlement count:"]
        for lg, cnt in summary["top_lgas"].items():
            lines.append(f"  {lg}: {cnt:,}")
        return "\n".join(lines)

    if any(w in q for w in ["minigrid", "mg type", "type", "interconnected", "undergrid", "isolated"]):
        mt = summary["mg_types"]
        return f"Minigrid type recommendations: Interconnected: {mt['interconnected']:,}, Under-grid: {mt['undergrid']:,}, Isolated: {mt['isolated']:,}."

    if any(w in q for w in ["score", "average"]):
        return f"Average settlement score: {summary['avg_score']}. By DisCo — AEDC: {summary['by_disco']['AEDC']['avg_score']}, KEDCO: {summary['by_disco']['KEDCO']['avg_score']}, IE: {summary['by_disco']['IE']['avg_score']}."

    if any(w in q for w in ["what is", "what are", "explain", "dares", "img", "pfs"]):
        if "dares" in q or "img" in q:
            return "DARES IMG (Distributed Access through Renewable Energy Scale – Interconnected Mini Grids) is a World Bank-funded program implemented by Nigeria's Rural Electrification Agency (REA). It aims to deploy interconnected mini-grids across unserved and underserved areas in AEDC, KEDCO, and IE concession territories."
        if "pfs" in q:
            return "PFS (Pre-Feasibility Study) is the initial assessment phase where settlements are scored and ranked based on population, wealth index, demand projection, security risks, and grid line distance to identify the most viable sites for minigrid deployment."
        if "afcen" in q:
            return "AfCEN (Africa Clean Energy Network) provides the technology platform for the DARES IMG program, including this InvestIQ platform for pre-feasibility assessment, tender management, and performance monitoring."

    # Search for a specific settlement
    for s in data:
        if s["village"].lower() in q or (len(s["village"]) > 4 and s["village"].lower()[:5] in q):
            return f"{s['village']} ({s['disco']}, {s['lga']}, {s['state']}) — Rank: {s['rank']}, Score: {s['score']}, Population: {s['population']:,}, Buildings: {s['buildings']:,}, Connections: {s['connections']:,}, Demand: {s['demand_kwh']:.0f} kWh/d, Grid distance: {s['grid_dist_km']:.1f} km, Security: {s['security_risk']}, Type: {s['recommended_mg_type']}."

    return f"I can help you with information about the {summary['total']:,} settlements in the DARES IMG program. Try asking about:\n• Settlement counts, population, or demand by DisCo\n• Top-ranked settlements\n• Security risk distribution\n• States and LGAs covered\n• Minigrid type breakdown\n• Specific settlement details (by name)\n• What DARES IMG or PFS means"


class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    source: str = "settlement_data"


@router.post("/alfred/chat")
async def alfred_chat(req: ChatRequest):
    reply = _answer(req.message)
    return ChatResponse(reply=reply)
