from __future__ import annotations

from dataclasses import dataclass, field
import json
from pathlib import Path


@dataclass
class CustomerSegment:
    category: str  # residential_improved, residential_basic, commercial, institutional, productive_use
    sub_type: str  # e.g. "shop", "hospital", "grain_mill"
    count: int
    tier: str = "basic"  # basic, improved, anchor
    estimated_load_kw: float | None = None  # per-unit peak, if known from field data
    operating_hours: str = ""  # e.g. "06:00-18:00"


@dataclass
class AnchorLoad:
    load_type: str  # hospital, school, administration, fish_chilling, grain_mill, etc.
    name: str
    count: int = 1
    estimated_load_kw: float | None = None
    operating_hours: str = ""
    load_shape: str = "institutional"  # key into load_shapes/ library


@dataclass
class GridArrivalEvidence:
    grid_extension_planned: bool = False
    timeline_years: float | None = None  # expected years until arrival
    funding_committed: bool = False
    funding_source: str = ""
    contractor_mobilised: bool = False
    disco_track_record: str = "poor"  # poor, mixed, good
    recent_extensions_in_district: int = 0
    notes: str = ""


@dataclass
class ExistingPFSMetrics:
    """For calibration — known values from a previous PFS or built system."""
    pv_capacity_kwp: float | None = None
    battery_capacity_kwh: float | None = None
    inverter_capacity_kwac: float | None = None
    total_capex_usd: float | None = None
    lcoe_usd_kwh: float | None = None
    tariff_usd_kwh: float | None = None
    annual_generation_mwh: float | None = None
    distribution_length_km: float | None = None
    customer_count: int | None = None


@dataclass
class SiteData:
    # Identity
    site_name: str = ""
    district: str = ""  # LGA in Nigeria
    province: str = ""  # State in Nigeria
    country: str = "Nigeria"
    coordinates: tuple[float, float] = (0.0, 0.0)  # (lat, lon)
    developer: str = ""
    disco_name: str = ""  # DisCo: AEDC, BEDC, EKEDC, EEDC, IBEDC, IE, JED, KE, KEDCO, PHEDC, YEDC
    minigrid_type: str = "isolated"  # isolated, undergrid, interconnected
    disco_supply_hours: float = 0.0  # hours/day of DisCo grid supply (for IMG/undergrid)

    # Settlement
    population: int = 0
    mapped_structures: int = 0
    settlement_radius_m: float = 2000.0

    # Customer segmentation
    customers: list[CustomerSegment] = field(default_factory=list)

    # Anchor loads
    anchors: list[AnchorLoad] = field(default_factory=list)

    # Grid status
    grid_status: str = "off_grid"  # off_grid, on_grid_expected, grid_connected
    grid_arrival_evidence: GridArrivalEvidence = field(default_factory=GridArrivalEvidence)

    # Financial assumptions
    tariff_scenarios: dict = field(default_factory=lambda: {
        "low": 0.09, "base": 0.20, "high": 0.35
    })
    discount_rate: float = 0.10
    inflation_rate: float = 0.05
    fx_rate_ngn_usd: float = 1600.0
    financing_structure: dict = field(default_factory=lambda: {
        "grant_pct": 0.40, "debt_pct": 0.35, "equity_pct": 0.25
    })
    debt_interest_rate: float = 0.08
    debt_tenor_years: int = 15

    # E&S context
    protected_area_overlap: bool = False
    flood_risk: str = "low"  # low, moderate, high
    biodiversity_risk: str = "low"
    ifc_category: str = "B"

    # Site context
    terrain: str = "rolling"  # flat, rolling, hilly, mountainous
    economic_activities: list[str] = field(default_factory=list)
    social_services: list[str] = field(default_factory=list)
    access_description: str = ""

    # Calibration
    existing_pfs: ExistingPFSMetrics = field(default_factory=ExistingPFSMetrics)

    @classmethod
    def from_json(cls, path: str | Path) -> "SiteData":
        path = Path(path)
        with open(path) as f:
            data = json.load(f)

        customers = [CustomerSegment(**c) for c in data.pop("customers", [])]
        anchors = [AnchorLoad(**a) for a in data.pop("anchors", [])]
        grid_evidence = GridArrivalEvidence(**data.pop("grid_arrival_evidence", {}))
        existing_pfs = ExistingPFSMetrics(**data.pop("existing_pfs", {}))
        coords = data.pop("coordinates", [0.0, 0.0])

        return cls(
            customers=customers,
            anchors=anchors,
            grid_arrival_evidence=grid_evidence,
            existing_pfs=existing_pfs,
            coordinates=tuple(coords),
            **data,
        )

    @property
    def lat(self) -> float:
        return self.coordinates[0]

    @property
    def lon(self) -> float:
        return self.coordinates[1]

    @property
    def total_customers(self) -> int:
        return sum(c.count for c in self.customers)
