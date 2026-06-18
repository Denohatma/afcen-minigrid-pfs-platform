from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class CarbonAssessmentOutput:
    annual_emission_reductions_tco2e: float = 0.0
    diesel_displaced_litres_yr: float = 0.0
    pms_displaced_litres_yr: float = 0.0
    crediting_period_years: int = 7
    total_eligible_tco2e: float = 0.0
    revenue_by_scenario: dict = field(default_factory=dict)  # {zero, conservative, market, premium} -> annual USD
    npv_carbon_revenue: dict = field(default_factory=dict)   # same keys -> NPV USD
    issuance_start_year: int = 3
    recommended_methodology: str = ""
    methodology_rationale: str = ""
    alternative_methodology: str = ""
    validation_cost_estimate_usd: float = 0.0
    annual_verification_cost_usd: float = 0.0
    warnings: list[str] = field(default_factory=list)
