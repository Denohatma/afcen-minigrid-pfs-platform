from __future__ import annotations

import csv
import sys

csv.field_size_limit(sys.maxsize)
import json
import logging
import math
from pathlib import Path
from typing import Any

from src.registry import BaseAdapter, AdapterKind
from src.models.gis import GISScreeningOutput

logger = logging.getLogger("minigrid")

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_CSV_PATH = _PROJECT_ROOT / "Source files" / "nigeria_dre_atlas_settlements.csv"
_INDEX_PATH = _PROJECT_ROOT / "src" / "data" / "dre_atlas_index.json"

# Columns to extract from the CSV into the lightweight index
_INDEX_COLUMNS = [
    "lat", "lon", "village_name", "admin_cgaz_1", "admin_cgaz_2",
    "population", "num_buildings", "has_health_facility",
    "has_education_facility", "pv_value",
    "distance_to_existing_transmission_lines", "security_risk",
    "demand", "num_connections",
    "nearest_hub_name", "dist_nearest_hub_km",
]

# Maximum distance (km) to consider a DRE Atlas settlement a valid match
_MAX_MATCH_DISTANCE_KM = 5.0

# Cached index (module-level so it persists across calls within one process)
_cached_index: list[dict] | None = None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km between two WGS-84 points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _parse_bool(val: str) -> bool:
    """Parse a boolean value from CSV string."""
    return str(val).strip().lower() in ("true", "1", "yes")


def _parse_float(val: str, default: float = 0.0) -> float:
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _parse_int(val: str, default: int = 0) -> int:
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


def _build_index() -> list[dict]:
    """Read the full CSV once and write a compact JSON index to disk."""
    logger.info(f"Building DRE Atlas index from {_CSV_PATH} ...")
    records: list[dict] = []

    with open(_CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            lat = _parse_float(row.get("lat", ""))
            lon = _parse_float(row.get("lon", ""))
            if lat == 0.0 and lon == 0.0:
                continue

            rec = {
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "village_name": (row.get("village_name") or "").strip(),
                "state": (row.get("admin_cgaz_1") or "").strip(),
                "lga": (row.get("admin_cgaz_2") or "").strip(),
                "population": _parse_int(row.get("population", "")),
                "num_buildings": _parse_int(row.get("num_buildings", "")),
                "has_health_facility": _parse_bool(row.get("has_health_facility", "")),
                "has_education_facility": _parse_bool(row.get("has_education_facility", "")),
                "pv_value": _parse_float(row.get("pv_value", "")),
                "dist_transmission_km": _parse_float(
                    row.get("distance_to_existing_transmission_lines", "")
                ),
                "security_risk": (row.get("security_risk") or "low").strip().lower(),
                "demand": _parse_float(row.get("demand", "")),
                "num_connections": _parse_int(row.get("num_connections", "")),
                "nearest_hub": (row.get("nearest_hub_name") or "").strip(),
                "dist_hub_km": _parse_float(row.get("dist_nearest_hub_km", "")),
            }
            records.append(rec)

    # Write compact index
    _INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, separators=(",", ":"))

    logger.info(f"DRE Atlas index built: {len(records)} settlements -> {_INDEX_PATH}")
    return records


_spatial_grid: dict[tuple[int, int], list[int]] | None = None


def _load_index() -> list[dict]:
    """Load the index from JSON cache or build it from the CSV."""
    global _cached_index, _spatial_grid
    if _cached_index is not None:
        return _cached_index

    if _INDEX_PATH.exists():
        logger.info(f"Loading DRE Atlas index from {_INDEX_PATH}")
        with open(_INDEX_PATH, encoding="utf-8") as f:
            _cached_index = json.load(f)
        logger.info(f"Loaded {len(_cached_index)} settlements from index")
    elif _CSV_PATH.exists():
        _cached_index = _build_index()
    else:
        logger.warning(f"DRE Atlas CSV not found at {_CSV_PATH}")
        _cached_index = []
        return _cached_index

    _spatial_grid = {}
    for i, rec in enumerate(_cached_index):
        key = (int(rec["lat"] * 10), int(rec["lon"] * 10))
        _spatial_grid.setdefault(key, []).append(i)

    return _cached_index


def _find_nearest(lat: float, lon: float, index: list[dict]) -> tuple[dict | None, float]:
    """Fast nearest-neighbor using spatial grid (0.1-degree cells)."""
    global _spatial_grid
    if not _spatial_grid:
        best_rec, best_dist = None, float("inf")
        for rec in index:
            d = _haversine_km(lat, lon, rec["lat"], rec["lon"])
            if d < best_dist:
                best_dist, best_rec = d, rec
        return best_rec, best_dist

    key_lat, key_lon = int(lat * 10), int(lon * 10)
    best_rec, best_dist = None, float("inf")

    for dlat in range(-2, 3):
        for dlon in range(-2, 3):
            cell = (key_lat + dlat, key_lon + dlon)
            for idx in _spatial_grid.get(cell, []):
                rec = index[idx]
                d = _haversine_km(lat, lon, rec["lat"], rec["lon"])
                if d < best_dist:
                    best_dist, best_rec = d, rec

    return best_rec, best_dist


def _compute_suitability(
    rec: dict,
    minigrid_type: str = "isolated",
) -> float:
    """
    Compute a suitability score (0-100) from settlement attributes.

    Weight breakdown:
      - population          20%  (larger settlements = better viability)
      - pv_irradiance       15%  (higher GHI = better solar resource)
      - grid_distance       20%  (for isolated: farther is better;
                                   for IMG: closer is better)
      - health/education    10%  (social infrastructure = higher demand)
      - security            20%  (low risk = better)
      - demand              15%  (higher estimated demand = better)
    """
    score = 0.0

    # --- Population (0-20) ---
    pop = rec.get("population", 0)
    # Scale: 0 at 0, 20 at 2000+
    pop_score = min(pop / 2000.0, 1.0) * 20
    score += pop_score

    # --- PV irradiance (0-15) ---
    pv = rec.get("pv_value", 0.0)
    # Nigeria range roughly 1100-2100 kWh/m2/yr
    pv_norm = max(0.0, min((pv - 1100) / 1000.0, 1.0)) if pv > 0 else 0.5
    score += pv_norm * 15

    # --- Grid distance (0-20) ---
    dist_tx = rec.get("dist_transmission_km", 0.0)
    if minigrid_type == "isolated":
        # Farther from grid = better for isolated minigrid
        grid_score = min(dist_tx / 50.0, 1.0) * 20
    else:
        # Closer to grid = better for IMG/interconnected
        grid_score = max(0.0, 1.0 - dist_tx / 50.0) * 20
    score += grid_score

    # --- Health / Education (0-10) ---
    social = 0.0
    if rec.get("has_health_facility"):
        social += 5.0
    if rec.get("has_education_facility"):
        social += 5.0
    score += social

    # --- Security (0-20) ---
    risk = rec.get("security_risk", "low")
    security_map = {"low": 20.0, "medium": 12.0, "high": 4.0}
    score += security_map.get(risk, 10.0)

    # --- Demand (0-15) ---
    demand = rec.get("demand", 0.0)
    # Scale: 0 at 0, 15 at 100+ kWh
    demand_score = min(demand / 100.0, 1.0) * 15
    score += demand_score

    return round(score, 1)


class GISScreeningAdapter(BaseAdapter):
    name = "gis_screening"
    kind = AdapterKind.TOOL
    dependencies: list[str] = []

    def __init__(self):
        self._output: GISScreeningOutput | None = None

    def is_available(self) -> bool:
        return True

    def validate_inputs(self, site_data, context: dict) -> list[str]:
        errors: list[str] = []
        if site_data.lat == 0.0 and site_data.lon == 0.0:
            errors.append("Site coordinates not set (lat/lon both 0)")
        return errors

    def run(self, site_data, context: dict) -> GISScreeningOutput:
        lat, lon = site_data.lat, site_data.lon
        warnings: list[str] = []

        index = _load_index()
        if not index:
            warnings.append("DRE Atlas index is empty or unavailable. No settlement match.")
            self._output = GISScreeningOutput(warnings=warnings)
            return self._output

        best_rec, best_dist = _find_nearest(lat, lon, index)

        if best_rec is None or best_dist > _MAX_MATCH_DISTANCE_KM:
            warnings.append(
                f"No DRE Atlas settlement found within {_MAX_MATCH_DISTANCE_KM} km "
                f"of ({lat}, {lon}). Nearest was {best_dist:.1f} km away."
            )
            self._output = GISScreeningOutput(warnings=warnings)
            return self._output

        if best_dist > 2.0:
            warnings.append(
                f"Nearest settlement '{best_rec['village_name']}' is {best_dist:.1f} km away. "
                f"Verify this is the intended site."
            )

        minigrid_type = getattr(site_data, "minigrid_type", "isolated")
        suitability = _compute_suitability(best_rec, minigrid_type)

        self._output = GISScreeningOutput(
            settlement_name=best_rec.get("village_name", ""),
            state=best_rec.get("state", ""),
            lga=best_rec.get("lga", ""),
            population=best_rec.get("population", 0),
            num_buildings=best_rec.get("num_buildings", 0),
            has_health_facility=best_rec.get("has_health_facility", False),
            has_education_facility=best_rec.get("has_education_facility", False),
            pv_irradiance_kwh_m2_yr=best_rec.get("pv_value", 0.0),
            distance_to_grid_km=best_rec.get("dist_transmission_km", 0.0),
            distance_to_transmission_km=best_rec.get("dist_transmission_km", 0.0),
            security_risk=best_rec.get("security_risk", "low"),
            estimated_demand_kwh=best_rec.get("demand", 0.0),
            estimated_connections=best_rec.get("num_connections", 0),
            nearest_hub=best_rec.get("nearest_hub", ""),
            distance_to_hub_km=best_rec.get("dist_hub_km", 0.0),
            match_distance_km=round(best_dist, 3),
            suitability_score=suitability,
            warnings=warnings,
        )

        logger.info(
            f"GIS match: {self._output.settlement_name} ({self._output.state}, "
            f"{self._output.lga}) — {best_dist:.2f} km away, "
            f"suitability={suitability}/100"
        )
        return self._output

    def get_standardized_outputs(self) -> dict:
        if self._output is None:
            return {}
        return {
            "settlement_name": self._output.settlement_name,
            "state": self._output.state,
            "lga": self._output.lga,
            "population": self._output.population,
            "num_buildings": self._output.num_buildings,
            "pv_irradiance_kwh_m2_yr": self._output.pv_irradiance_kwh_m2_yr,
            "distance_to_grid_km": self._output.distance_to_grid_km,
            "security_risk": self._output.security_risk,
            "estimated_demand_kwh": self._output.estimated_demand_kwh,
            "estimated_connections": self._output.estimated_connections,
            "suitability_score": self._output.suitability_score,
        }
