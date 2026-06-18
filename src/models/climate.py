from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ClimateHazard:
    hazard_type: str  # flood, drought, heat_stress, windstorm, conflict
    risk_level: str = "low"  # low, moderate, high
    description: str = ""
    adaptation_measures: list[str] = field(default_factory=list)


@dataclass
class ClimateOutput:
    ndc_alignment: str = ""
    emission_reduction_contribution: str = ""
    climate_hazards: list[ClimateHazard] = field(default_factory=list)
    climate_finance_eligibility: list[str] = field(default_factory=list)
    adaptation_score: float = 0.0
    warnings: list[str] = field(default_factory=list)
