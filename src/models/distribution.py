from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class BoQItem:
    category: str  # conductor, pole, service_drop, transformer, protection
    description: str
    unit: str
    quantity: float
    unit_cost_usd: float
    total_cost_usd: float


@dataclass
class DistributionDesignOutput:
    total_line_length_m: float = 0.0
    line_lengths_by_class: dict = field(default_factory=dict)  # conductor_class -> meters
    pole_count: int = 0
    bill_of_quantities: list[BoQItem] = field(default_factory=list)
    total_network_cost_usd: float = 0.0
    cost_per_connection_usd: float = 0.0
    voltage_drop_max_pct: float = 0.0
    technical_losses_pct: float = 0.0
    method_used: str = ""  # osm_steiner, building_mst, radial_estimate
    network_geojson: dict = field(default_factory=dict)
    customers_connected: int = 0
    avg_span_m: float = 40.0
    construction_multiplier: float = 1.45
    warnings: list[str] = field(default_factory=list)
