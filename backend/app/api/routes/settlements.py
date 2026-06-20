from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Query

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


@router.get("/settlements")
async def list_settlements(
    disco: Optional[str] = Query(None, description="Filter by DisCo: AEDC, KEDCO, IE"),
    state: Optional[str] = Query(None),
    lga: Optional[str] = Query(None),
    mg_type: Optional[str] = Query(None, description="interconnected, undergrid, isolated"),
    min_pop: int = Query(0, ge=0),
    max_grid_dist: Optional[float] = Query(None),
    search: Optional[str] = Query(None, description="Search village name"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    data = _load()
    results = data

    if disco:
        results = [s for s in results if s["disco"] == disco.upper()]
    if state:
        results = [s for s in results if s["state"].lower() == state.lower()]
    if lga:
        results = [s for s in results if s["lga"].lower() == lga.lower()]
    if mg_type:
        results = [s for s in results if s["recommended_mg_type"] == mg_type]
    if min_pop > 0:
        results = [s for s in results if s["population"] >= min_pop]
    if max_grid_dist is not None:
        results = [s for s in results if s["grid_dist_km"] <= max_grid_dist]
    if search:
        q = search.lower()
        results = [s for s in results if q in s["village"].lower() or q in s["lga"].lower()]

    total = len(results)
    page = results[offset:offset + limit]

    return {
        "settlements": page,
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.get("/settlements/stats")
async def settlement_stats():
    data = _load()
    stats = {}
    for disco in ["AEDC", "KEDCO", "IE"]:
        d = [s for s in data if s["disco"] == disco]
        stats[disco] = {
            "total": len(d),
            "img_candidates": sum(1 for s in d if s["recommended_mg_type"] == "interconnected"),
            "undergrid_candidates": sum(1 for s in d if s["recommended_mg_type"] == "undergrid"),
            "isolated_candidates": sum(1 for s in d if s["recommended_mg_type"] == "isolated"),
            "total_population": sum(s["population"] for s in d),
            "total_connections": sum(s["connections"] for s in d),
            "avg_score": round(sum(s["score"] for s in d) / len(d), 1) if d else 0,
        }
    return {
        "total_settlements": len(data),
        "by_disco": stats,
    }


@router.get("/discos/boundaries")
async def disco_boundaries():
    """Return accurate DisCo concession boundary GeoJSON from official shapefiles."""
    import json as _json
    from pathlib import Path
    from fastapi.responses import JSONResponse

    geo_path = Path("/app/src/data/disco_boundaries.geojson")
    if not geo_path.exists():
        geo_path = Path(__file__).resolve().parent.parent.parent.parent.parent / "src" / "data" / "disco_boundaries.geojson"

    if not geo_path.exists():
        return {"type": "FeatureCollection", "features": [], "note": "No boundary data available"}

    with open(geo_path) as f:
        data = _json.load(f)

    return JSONResponse(content=data, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/mv-lines/{disco}")
async def get_mv_lines(disco: str):
    """Return MV line GeoJSON for a DisCo (currently KEDCO only)."""
    import json as _json
    from pathlib import Path

    disco = disco.upper()
    mv_path = Path("/app/src/data/mv_lines")
    if not mv_path.exists():
        mv_path = Path(__file__).resolve().parent.parent.parent.parent.parent / "src" / "data" / "mv_lines"

    file_map = {
        "KEDCO": mv_path / "kedco_mv_simplified.json",
    }

    fpath = file_map.get(disco)
    if not fpath or not fpath.exists():
        return {"type": "FeatureCollection", "features": [], "note": f"No MV line data available for {disco}"}

    with open(fpath) as f:
        return _json.load(f)


@router.get("/settlements/{rank}")
async def get_settlement(rank: int):
    data = _load()
    for s in data:
        if s["rank"] == rank:
            return s
    return {"error": "Settlement not found"}
