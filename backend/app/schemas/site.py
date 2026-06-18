from __future__ import annotations

from pydantic import BaseModel, Field, field_validator, model_validator


class CustomerSegmentSchema(BaseModel):
    category: str = Field(..., description="residential, commercial, institutional, productive_use")
    sub_type: str = Field(..., description="e.g. shop, hospital, grain_mill")
    count: int = Field(..., gt=0, description="Must be positive")
    tier: str = Field(default="basic")
    estimated_load_kw: float | None = None
    operating_hours: str = ""


class AnchorLoadSchema(BaseModel):
    load_type: str
    name: str
    count: int = Field(default=1, gt=0)
    estimated_load_kw: float | None = None
    operating_hours: str = ""
    load_shape: str = "institutional"


class GridArrivalEvidenceSchema(BaseModel):
    grid_extension_planned: bool = False
    timeline_years: float | None = None
    funding_committed: bool = False
    funding_source: str = ""
    contractor_mobilised: bool = False
    disco_track_record: str = Field(default="poor", pattern="^(poor|mixed|good)$")
    recent_extensions_in_district: int = 0
    notes: str = ""


class ExistingPFSMetricsSchema(BaseModel):
    pv_capacity_kwp: float | None = None
    battery_capacity_kwh: float | None = None
    inverter_capacity_kwac: float | None = None
    total_capex_usd: float | None = None
    lcoe_usd_kwh: float | None = None
    tariff_usd_kwh: float | None = None
    annual_generation_mwh: float | None = None
    distribution_length_km: float | None = None
    customer_count: int | None = None


class FinancingStructureSchema(BaseModel):
    grant_pct: float = Field(default=0.40, ge=0, le=1)
    debt_pct: float = Field(default=0.35, ge=0, le=1)
    equity_pct: float = Field(default=0.25, ge=0, le=1)

    @model_validator(mode="after")
    def financing_sums_to_one(self):
        total = self.grant_pct + self.debt_pct + self.equity_pct
        if abs(total - 1.0) > 0.01:
            raise ValueError(f"Financing split must sum to 100% (got {total * 100:.1f}%)")
        return self


class TariffScenariosSchema(BaseModel):
    low: float = Field(default=0.09, gt=0)
    base: float = Field(default=0.20, gt=0)
    high: float = Field(default=0.35, gt=0)


class SiteDataSchema(BaseModel):
    site_name: str = Field(..., min_length=1, max_length=200)
    district: str = ""
    province: str = ""
    country: str = ""
    coordinates: list[float] = Field(..., min_length=2, max_length=2)
    developer: str = ""
    disco_name: str = Field(default="", description="Distribution company: AEDC, BEDC, EKEDC, EEDC, IBEDC, IE, JED, KE, KEDCO, PHEDC, YEDC")
    minigrid_type: str = Field(default="isolated", pattern="^(isolated|undergrid|interconnected)$")
    disco_supply_hours: float = Field(default=0.0, ge=0, le=24)

    population: int = Field(default=0, ge=0)
    mapped_structures: int = Field(default=0, ge=0)
    settlement_radius_m: float = Field(default=2000.0, ge=100, le=50000)

    customers: list[CustomerSegmentSchema] = Field(default_factory=list)
    anchors: list[AnchorLoadSchema] = Field(default_factory=list)

    grid_status: str = Field(default="off_grid", pattern="^(off_grid|on_grid_expected|grid_connected)$")
    grid_arrival_evidence: GridArrivalEvidenceSchema = Field(default_factory=GridArrivalEvidenceSchema)

    tariff_scenarios: TariffScenariosSchema = Field(default_factory=TariffScenariosSchema)
    discount_rate: float = Field(default=0.10, gt=0, lt=1)
    inflation_rate: float = Field(default=0.05, ge=0, lt=1)
    fx_rate_ngn_usd: float = Field(default=1600.0, gt=0)
    financing_structure: FinancingStructureSchema = Field(default_factory=FinancingStructureSchema)
    debt_interest_rate: float = Field(default=0.08, gt=0, lt=1)
    debt_tenor_years: int = Field(default=15, gt=0)

    protected_area_overlap: bool = False
    flood_risk: str = Field(default="low", pattern="^(low|moderate|high)$")
    biodiversity_risk: str = Field(default="low", pattern="^(low|moderate|high)$")
    ifc_category: str = Field(default="B", pattern="^(A|B|C)$")

    terrain: str = Field(default="rolling", pattern="^(flat|rolling|hilly|mountainous)$")
    economic_activities: list[str] = Field(default_factory=list)
    social_services: list[str] = Field(default_factory=list)
    access_description: str = ""

    existing_pfs: ExistingPFSMetricsSchema = Field(default_factory=ExistingPFSMetricsSchema)

    @field_validator("coordinates")
    @classmethod
    def validate_coordinates(cls, v):
        lat, lon = v
        if not (-90 <= lat <= 90):
            raise ValueError("Latitude must be between -90 and 90")
        if not (-180 <= lon <= 180):
            raise ValueError("Longitude must be between -180 and 180")
        return v

    def to_cli_dict(self) -> dict:
        """Convert to the dict format expected by SiteData.from_json()."""
        data = self.model_dump()
        data["tariff_scenarios"] = {
            "low": data["tariff_scenarios"]["low"],
            "base": data["tariff_scenarios"]["base"],
            "high": data["tariff_scenarios"]["high"],
        }
        data["financing_structure"] = {
            "grant_pct": data["financing_structure"]["grant_pct"],
            "debt_pct": data["financing_structure"]["debt_pct"],
            "equity_pct": data["financing_structure"]["equity_pct"],
        }
        return data


class SiteCreateRequest(BaseModel):
    site_data: SiteDataSchema


class SiteUpdateRequest(BaseModel):
    site_data: SiteDataSchema


class SiteResponse(BaseModel):
    id: str
    org_id: str
    site_name: str
    district: str
    country: str
    status: str
    site_data: dict
    created_at: str
    updated_at: str


class SiteListResponse(BaseModel):
    sites: list[SiteResponse]
    total: int
