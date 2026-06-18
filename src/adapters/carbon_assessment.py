from __future__ import annotations

import json
from pathlib import Path

from src.registry import BaseAdapter, AdapterKind
from src.models.carbon import CarbonAssessmentOutput

DATA_DIR = Path(__file__).parent.parent / "data"

DIESEL_EF_KG_CO2_PER_LITRE = 2.68
DIESEL_CH4_N2O_KG_CO2E_PER_LITRE = 0.12
TOTAL_DIESEL_EF = DIESEL_EF_KG_CO2_PER_LITRE + DIESEL_CH4_N2O_KG_CO2E_PER_LITRE

PMS_EF_KG_CO2_PER_LITRE = 2.31
PMS_CH4_N2O_KG_CO2E_PER_LITRE = 0.10
TOTAL_PMS_EF = PMS_EF_KG_CO2_PER_LITRE + PMS_CH4_N2O_KG_CO2E_PER_LITRE

PMS_GENSET_SHARE = 0.70

PRICE_SCENARIOS = {
    "zero": 0.0,
    "conservative": 5.0,
    "market": 12.0,
    "premium": 20.0,
}


class CarbonAssessmentAdapter(BaseAdapter):
    name = "carbon_assessment"
    kind = AdapterKind.TOOL
    dependencies = ["hybrid_sizing"]

    def __init__(self):
        self._output = None

    def is_available(self) -> bool:
        return True

    def validate_inputs(self, site_data, context: dict) -> list[str]:
        errors = []
        if "hybrid_sizing" not in context:
            errors.append("Hybrid sizing output required for carbon calculation")
        return errors

    def run(self, site_data, context: dict) -> CarbonAssessmentOutput:
        sizing = context["hybrid_sizing"]
        warnings = []

        with open(DATA_DIR / "financial_defaults.json") as f:
            fin = json.load(f)

        genset_eff = fin["technical"]["genset_efficiency"]
        diesel_density = fin["technical"]["diesel_energy_density_kwh_per_litre"]
        pms_density = fin["technical"].get("pms_energy_density_kwh_per_litre", 9.1)

        annual_energy_kwh = sizing.annual_energy_served_kwh
        total_fuel_kwh = annual_energy_kwh / genset_eff

        pms_kwh = total_fuel_kwh * PMS_GENSET_SHARE
        diesel_kwh = total_fuel_kwh * (1 - PMS_GENSET_SHARE)
        pms_litres = pms_kwh / pms_density
        diesel_litres = diesel_kwh / diesel_density

        annual_tco2e = (diesel_litres * TOTAL_DIESEL_EF + pms_litres * TOTAL_PMS_EF) / 1000

        crediting_period = 7
        total_eligible = annual_tco2e * crediting_period

        issuance_start = 3
        discount_rate = site_data.discount_rate

        revenue_by_scenario = {}
        npv_by_scenario = {}
        for name, price in PRICE_SCENARIOS.items():
            annual_rev = annual_tco2e * price
            revenue_by_scenario[name] = round(annual_rev, 0)

            npv = 0.0
            for yr in range(issuance_start, issuance_start + crediting_period):
                npv += annual_rev / (1 + discount_rate) ** yr
            npv_by_scenario[name] = round(npv, 0)

        if annual_tco2e < 100:
            methodology = "Gold Standard TPDDTEC"
            rationale = (
                "Project is small-scale off-grid/distributed renewable electrification with strong SDG impact credentials. "
                "Gold Standard TPDDTEC is recommended for premium carbon credit pricing and SDG co-benefit "
                "documentation. The small volume (<100 tCO2e/year) benefits from Gold Standard's "
                "micro-scale provisions. Aligned with Nigeria's NDC target of 47% emission reduction by 2030."
            )
            alternative = "Verra VM0103"
        else:
            methodology = "Verra VM0103"
            rationale = (
                "Project displaces fossil-fuel self-generation (diesel and petrol/PMS generators) for rural "
                "and peri-urban communities. Nigeria has an estimated 22 million petrol generators. "
                "Verra VM0103 is the standard methodology for mini-grid projects with established African "
                "deployments. Aligned with Nigeria's NDC target of 47% emission reduction by 2030."
            )
            alternative = "Gold Standard TPDDTEC"

        validation_cost = 15000
        annual_verification = 5000

        if annual_tco2e * PRICE_SCENARIOS["market"] < annual_verification:
            warnings.append(
                f"Annual carbon revenue at market price (USD {annual_tco2e * PRICE_SCENARIOS['market']:.0f}) "
                f"is less than annual verification cost (USD {annual_verification}). "
                "Carbon registration may not be cost-effective for this project alone. "
                "Consider bundling with other mini-grid projects."
            )

        self._output = CarbonAssessmentOutput(
            annual_emission_reductions_tco2e=round(annual_tco2e, 1),
            diesel_displaced_litres_yr=round(diesel_litres, 0),
            pms_displaced_litres_yr=round(pms_litres, 0),
            crediting_period_years=crediting_period,
            total_eligible_tco2e=round(total_eligible, 0),
            revenue_by_scenario=revenue_by_scenario,
            npv_carbon_revenue=npv_by_scenario,
            issuance_start_year=issuance_start,
            recommended_methodology=methodology,
            methodology_rationale=rationale,
            alternative_methodology=alternative,
            validation_cost_estimate_usd=validation_cost,
            annual_verification_cost_usd=annual_verification,
            warnings=warnings,
        )
        return self._output

    def get_standardized_outputs(self) -> dict:
        if self._output is None:
            return {}
        return {
            "annual_tco2e": self._output.annual_emission_reductions_tco2e,
            "methodology": self._output.recommended_methodology,
            "market_revenue_usd": self._output.revenue_by_scenario.get("market", 0),
        }
