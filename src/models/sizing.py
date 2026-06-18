from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class HybridSizingOutput:
    pv_capacity_kwp: float = 0.0
    battery_capacity_kwh: float = 0.0
    inverter_capacity_kwac: float = 0.0
    dc_ac_ratio: float = 0.0
    hourly_dispatch: list[dict] = field(default_factory=list)  # 8760 entries with solar, battery, unmet, curtailed
    annual_generation_kwh: float = 0.0
    annual_energy_served_kwh: float = 0.0
    capacity_utilization_pct: float = 0.0
    curtailment_pct: float = 0.0
    unmet_demand_pct: float = 0.0
    autonomy_hours: float = 0.0
    battery_cycles_per_year: float = 0.0
    monthly_generation_kwh: list[float] = field(default_factory=list)  # 12 values
    warnings: list[str] = field(default_factory=list)
