from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SolarResourceOutput:
    monthly_ghi_kwh_m2: list[float] = field(default_factory=list)  # 12 values
    monthly_dni_kwh_m2: list[float] = field(default_factory=list)
    monthly_temp_c: list[float] = field(default_factory=list)
    annual_ghi_kwh_m2: float = 0.0
    optimal_tilt_deg: float = 0.0
    specific_yield_kwh_per_kwp: float = 0.0
    performance_ratio: float = 0.77
    loss_breakdown: dict = field(default_factory=dict)
    data_source: str = ""
    data_years: str = ""
    hourly_solar_factors: list[float] = field(default_factory=list)  # 8760 normalized
    warnings: list[str] = field(default_factory=list)
