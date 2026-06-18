from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class GISScreeningOutput:
    settlement_name: str = ""
    state: str = ""
    lga: str = ""
    population: int = 0
    num_buildings: int = 0
    has_health_facility: bool = False
    has_education_facility: bool = False
    pv_irradiance_kwh_m2_yr: float = 0.0
    distance_to_grid_km: float = 0.0
    distance_to_transmission_km: float = 0.0
    security_risk: str = "low"
    estimated_demand_kwh: float = 0.0
    estimated_connections: int = 0
    nearest_hub: str = ""
    distance_to_hub_km: float = 0.0
    match_distance_km: float = 0.0
    suitability_score: float = 0.0
    warnings: list[str] = field(default_factory=list)
