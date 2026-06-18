from __future__ import annotations

from src.registry import BaseAdapter, AdapterKind
from src.models.productive_use import ProductiveUseOutput, PUESector

NIGERIA_PUE_SECTORS = [
    {
        "name": "Grain & cereal processing",
        "equipment": ["Maize mill", "Rice huller"],
        "daily_kwh": 45,
        "capex": 8000,
        "jobs_direct": 4,
        "jobs_indirect": 8,
        "priority_states": ["Kano", "Katsina", "Jigawa", "Kaduna"],
    },
    {
        "name": "Groundnut & oilseed",
        "equipment": ["Oil press", "Groundnut decorticator"],
        "daily_kwh": 30,
        "capex": 6000,
        "jobs_direct": 3,
        "jobs_indirect": 6,
        "priority_states": ["Kano", "Katsina", "Jigawa"],
    },
    {
        "name": "Cassava & yam processing",
        "equipment": ["Cassava grater", "Yam pounder", "Garri fryer"],
        "daily_kwh": 35,
        "capex": 7000,
        "jobs_direct": 4,
        "jobs_indirect": 6,
        "priority_states": ["Niger", "Kogi", "Nasarawa", "Oyo", "Ogun"],
    },
    {
        "name": "Cold chain — food & fish",
        "equipment": ["Ice maker", "Cold room", "Vaccine fridge"],
        "daily_kwh": 50,
        "capex": 15000,
        "jobs_direct": 3,
        "jobs_indirect": 5,
        "priority_states": ["Lagos", "Kano", "Rivers", "Cross River"],
    },
    {
        "name": "Irrigation & water pumping",
        "equipment": ["Solar pump", "Drip irrigation"],
        "daily_kwh": 25,
        "capex": 5000,
        "jobs_direct": 2,
        "jobs_indirect": 4,
        "priority_states": ["Niger", "Nasarawa", "Kano", "Jigawa"],
    },
    {
        "name": "Light manufacturing",
        "equipment": ["Welding machine", "Carpentry tools", "Sewing machine"],
        "daily_kwh": 20,
        "capex": 4000,
        "jobs_direct": 5,
        "jobs_indirect": 3,
        "priority_states": ["ALL"],
    },
    {
        "name": "ICT & digital services",
        "equipment": ["POS terminals", "Internet equipment", "Printing"],
        "daily_kwh": 15,
        "capex": 3000,
        "jobs_direct": 3,
        "jobs_indirect": 2,
        "priority_states": ["Lagos", "FCT", "Kano"],
    },
    {
        "name": "Healthcare",
        "equipment": ["Vaccine fridge", "Diagnostic equipment", "Sterilizer"],
        "daily_kwh": 20,
        "capex": 10000,
        "jobs_direct": 5,
        "jobs_indirect": 2,
        "priority_states": ["ALL"],
    },
    {
        "name": "Education",
        "equipment": ["Computers", "Projectors", "Lighting"],
        "daily_kwh": 15,
        "capex": 5000,
        "jobs_direct": 3,
        "jobs_indirect": 1,
        "priority_states": ["ALL"],
    },
    {
        "name": "Market electrification",
        "equipment": ["Market lighting", "Refrigerated display", "Fans"],
        "daily_kwh": 40,
        "capex": 8000,
        "jobs_direct": 2,
        "jobs_indirect": 10,
        "priority_states": ["ALL"],
    },
    {
        "name": "Public services",
        "equipment": ["Street lighting", "Water pumping station"],
        "daily_kwh": 30,
        "capex": 12000,
        "jobs_direct": 2,
        "jobs_indirect": 3,
        "priority_states": ["ALL"],
    },
]

# Map anchor load types to PUE sector names for relevance boosting
ANCHOR_TO_SECTOR = {
    "grain_mill": "Grain & cereal processing",
    "rice_mill": "Grain & cereal processing",
    "oil_press": "Groundnut & oilseed",
    "groundnut_mill": "Groundnut & oilseed",
    "cassava_processing": "Cassava & yam processing",
    "garri_processing": "Cassava & yam processing",
    "cold_room": "Cold chain — food & fish",
    "fish_chilling": "Cold chain — food & fish",
    "ice_maker": "Cold chain — food & fish",
    "irrigation": "Irrigation & water pumping",
    "water_pump": "Irrigation & water pumping",
    "welding": "Light manufacturing",
    "carpentry": "Light manufacturing",
    "tailoring": "Light manufacturing",
    "ict_hub": "ICT & digital services",
    "telecom_tower": "ICT & digital services",
    "hospital": "Healthcare",
    "health_center": "Healthcare",
    "clinic": "Healthcare",
    "school": "Education",
    "market": "Market electrification",
    "street_lighting": "Public services",
    "administration": "Public services",
}


class ProductiveUseAdapter(BaseAdapter):
    name = "productive_use"
    kind = AdapterKind.TOOL
    dependencies = ["demand_assessment"]

    def __init__(self):
        self._output = None

    def is_available(self) -> bool:
        return True

    def validate_inputs(self, site_data, context: dict) -> list[str]:
        errors = []
        if "demand_assessment" not in context:
            errors.append("Demand assessment output required for productive use analysis")
        return errors

    def run(self, site_data, context: dict) -> ProductiveUseOutput:
        demand = context["demand_assessment"]
        warnings = []

        site_state = site_data.province.strip()

        # Collect anchor load types present at the site
        anchor_types = {a.load_type for a in site_data.anchors}
        anchor_sector_names = set()
        for atype in anchor_types:
            sector_name = ANCHOR_TO_SECTOR.get(atype)
            if sector_name:
                anchor_sector_names.add(sector_name)

        scored_sectors = []

        for sector_def in NIGERIA_PUE_SECTORS:
            priority_states = sector_def["priority_states"]

            # Base relevance: 7 if state matches priority list, 5 if ALL, 3 otherwise
            if "ALL" in priority_states:
                base_score = 5.0
            elif site_state in priority_states:
                base_score = 7.0
            else:
                base_score = 3.0

            # Boost relevance if matching anchors exist at the site
            if sector_def["name"] in anchor_sector_names:
                base_score = min(base_score + 3.0, 10.0)

            # Also boost based on economic activities mentioned in site data
            for activity in site_data.economic_activities:
                activity_lower = activity.lower()
                sector_lower = sector_def["name"].lower()
                if any(kw in activity_lower for kw in sector_lower.split()):
                    base_score = min(base_score + 1.0, 10.0)
                    break

            pue_sector = PUESector(
                name=sector_def["name"],
                relevance_score=round(base_score, 1),
                key_equipment=list(sector_def["equipment"]),
                estimated_daily_kwh=sector_def["daily_kwh"],
                estimated_jobs_direct=sector_def["jobs_direct"],
                estimated_jobs_indirect=sector_def["jobs_indirect"],
                capex_usd=sector_def["capex"],
                priority_disco=site_data.disco_name,
            )
            scored_sectors.append(pue_sector)

        # Sort by relevance score descending
        scored_sectors.sort(key=lambda s: s.relevance_score, reverse=True)

        # Pick top 3
        top_3 = scored_sectors[:3]
        top_3_names = [s.name for s in top_3]

        # Calculate totals from top 3 sectors
        total_pue_demand = sum(s.estimated_daily_kwh for s in top_3)
        total_jobs = sum(s.estimated_jobs_direct + s.estimated_jobs_indirect for s in top_3)

        # PUE revenue uplift percentage
        daily_avg = demand.daily_average_kwh
        if daily_avg > 0:
            pue_revenue_uplift = round((total_pue_demand / daily_avg) * 100, 1)
        else:
            pue_revenue_uplift = 0.0
            warnings.append("Daily average demand is zero; cannot calculate PUE revenue uplift")

        if pue_revenue_uplift > 100:
            warnings.append(
                f"PUE demand ({total_pue_demand:.0f} kWh/day) exceeds current daily average "
                f"({daily_avg:.0f} kWh/day). System sizing should account for PUE loads."
            )

        self._output = ProductiveUseOutput(
            sectors=scored_sectors,
            total_pue_demand_kwh_day=round(total_pue_demand, 1),
            total_jobs=total_jobs,
            top_3_sectors=top_3_names,
            pue_revenue_uplift_pct=pue_revenue_uplift,
            warnings=warnings,
        )
        return self._output

    def get_standardized_outputs(self) -> dict:
        if self._output is None:
            return {}
        return {
            "total_pue_demand_kwh_day": self._output.total_pue_demand_kwh_day,
            "total_pue_jobs": self._output.total_jobs,
            "top_3_pue_sectors": self._output.top_3_sectors,
            "pue_revenue_uplift_pct": self._output.pue_revenue_uplift_pct,
        }
