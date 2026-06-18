from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class CustomerDemandDetail:
    category: str
    sub_type: str
    count: int
    peak_load_per_unit_kw: float
    diversity_factor: float
    diversified_peak_kw: float
    annual_demand_kwh: float
    load_shape_key: str


@dataclass
class DemandAssessmentOutput:
    peak_load_kw: float = 0.0
    annual_demand_kwh: float = 0.0
    hourly_profile_8760: list[float] = field(default_factory=list)
    daily_average_kwh: float = 0.0
    customer_details: list[CustomerDemandDetail] = field(default_factory=list)
    growth_scenarios: dict = field(default_factory=dict)
    total_customers: int = 0
    acpu_kwh_per_day: float = 0.0
    warnings: list[str] = field(default_factory=list)
