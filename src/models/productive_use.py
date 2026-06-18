from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PUESector:
    name: str
    relevance_score: float = 0.0  # 0-10
    key_equipment: list[str] = field(default_factory=list)
    estimated_daily_kwh: float = 0.0
    estimated_jobs_direct: int = 0
    estimated_jobs_indirect: int = 0
    capex_usd: float = 0.0
    priority_disco: str = ""


@dataclass
class ProductiveUseOutput:
    sectors: list[PUESector] = field(default_factory=list)
    total_pue_demand_kwh_day: float = 0.0
    total_jobs: int = 0
    top_3_sectors: list[str] = field(default_factory=list)
    pue_revenue_uplift_pct: float = 0.0
    warnings: list[str] = field(default_factory=list)
