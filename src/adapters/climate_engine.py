from __future__ import annotations

from src.registry import BaseAdapter, AdapterKind
from src.models.climate import ClimateOutput, ClimateHazard

# States with elevated conflict/security risk
CONFLICT_STATES = ["Borno", "Yobe", "Adamawa", "Zamfara", "Katsina"]

# Niger Delta states (flood-prone low-lying coastal)
NIGER_DELTA_STATES = ["Bayelsa", "Rivers", "Delta", "Akwa Ibom", "Cross River", "Edo"]

# Flood-plain states along major rivers
FLOOD_PLAIN_STATES = ["Benue", "Kogi", "Niger", "Kwara", "Anambra"]


class ClimateAssessmentAdapter(BaseAdapter):
    name = "climate_assessment"
    kind = AdapterKind.TOOL
    dependencies = ["carbon_assessment"]

    def __init__(self):
        self._output = None

    def is_available(self) -> bool:
        return True

    def validate_inputs(self, site_data, context: dict) -> list[str]:
        errors = []
        if "carbon_assessment" not in context:
            errors.append("Carbon assessment output required for climate analysis")
        return errors

    def run(self, site_data, context: dict) -> ClimateOutput:
        carbon = context["carbon_assessment"]
        warnings = []

        lat = site_data.lat
        site_state = site_data.province.strip()

        # ---- NDC alignment ----
        ndc_alignment = (
            "Nigeria's Nationally Determined Contribution (NDC) targets a 47% emission "
            "reduction by 2030 (conditional) and net-zero emissions by 2060, as articulated "
            "in the Climate Change Act 2021 and the Energy Transition Plan (ETP). This "
            "mini-grid project directly supports NDC implementation by displacing fossil-fuel "
            "self-generation and expanding clean energy access in underserved communities."
        )

        # ---- Emission reduction contribution ----
        annual_tco2e = carbon.annual_emission_reductions_tco2e
        crediting_years = carbon.crediting_period_years
        total_reductions = round(annual_tco2e * crediting_years, 1)

        emission_reduction_contribution = (
            f"The project is estimated to avoid {annual_tco2e:.1f} tCO2e per year by "
            f"displacing diesel and petrol (PMS) generator use, totalling approximately "
            f"{total_reductions:.0f} tCO2e over the {crediting_years}-year crediting period. "
            f"This contributes to Nigeria's NDC target and supports the country's Energy "
            f"Transition Plan for the power sector."
        )

        # ---- Climate hazards assessment ----
        hazards = []

        # 1. Flood risk
        if lat < 6 or site_state in NIGER_DELTA_STATES:
            flood_risk = "high"
            flood_desc = (
                f"Site is in the Niger Delta / low-lying coastal zone ({site_state}). "
                "High seasonal and tidal flood risk, especially during June-October rainy season."
            )
        elif site_state in FLOOD_PLAIN_STATES:
            flood_risk = "high"
            flood_desc = (
                f"Site is in a major river flood plain ({site_state}). "
                "High risk of riverine flooding during peak rainy season (August-October)."
            )
        elif lat < 8:
            flood_risk = "moderate"
            flood_desc = "Moderate flood risk in the southern / middle belt zone during rainy season."
        else:
            flood_risk = "low"
            flood_desc = "Low flood risk in the northern savannah zone."

        hazards.append(ClimateHazard(
            hazard_type="flood",
            risk_level=flood_risk,
            description=flood_desc,
            adaptation_measures=[
                "Elevate PV mounting structures and battery enclosures above historical flood level",
                "Install drainage channels around the power house and distribution infrastructure",
                "Use IP65-rated enclosures for all ground-level electrical equipment",
                "Develop emergency response protocol for flood events",
            ],
        ))

        # 2. Drought
        if lat > 11:
            drought_risk = "high"
            drought_desc = (
                "Site is in the Sahel / semi-arid zone. High risk of extended dry seasons "
                "affecting water-dependent productive uses and community livelihoods."
            )
        elif lat > 9:
            drought_risk = "moderate"
            drought_desc = "Moderate drought risk in the Guinea savannah zone with seasonal variability."
        else:
            drought_risk = "low"
            drought_desc = "Low drought risk in the southern forest / derived savannah zone."

        hazards.append(ClimateHazard(
            hazard_type="drought",
            risk_level=drought_risk,
            description=drought_desc,
            adaptation_measures=[
                "Pair mini-grid with solar-powered water pumping for community resilience",
                "Size battery storage to account for haze-related irradiance reduction during Harmattan",
                "Include dry-season demand scenarios in financial modelling",
            ],
        ))

        # 3. Heat stress
        if lat > 10:
            heat_risk = "high"
            heat_desc = (
                "Northern Nigeria experiences extreme heat (>40C) from March to May. "
                "High risk of PV derating and accelerated battery degradation."
            )
        else:
            heat_risk = "moderate"
            heat_desc = (
                "Moderate heat stress year-round in the tropical zone. "
                "PV temperature derating and battery thermal management should be considered."
            )

        hazards.append(ClimateHazard(
            hazard_type="heat_stress",
            risk_level=heat_risk,
            description=heat_desc,
            adaptation_measures=[
                "Apply temperature derating factor to PV sizing (0.4-0.5%/C above 25C STC)",
                "Specify batteries rated for high-temperature operation (up to 45C ambient)",
                "Ensure adequate ventilation or active cooling in battery enclosures",
                "Use elevated open-rack PV mounting for improved air circulation",
            ],
        ))

        # 4. Windstorm (Harmattan, November-March in the North)
        if lat > 9:
            wind_risk = "moderate"
            wind_desc = (
                "Harmattan winds (November-March) carry dust and can gust to 80+ km/h in the "
                "northern savannah. Risk of panel soiling and structural damage."
            )
        else:
            wind_risk = "low"
            wind_desc = "Low windstorm risk in the southern zone. Occasional thunderstorm gusts possible."

        hazards.append(ClimateHazard(
            hazard_type="windstorm",
            risk_level=wind_risk,
            description=wind_desc,
            adaptation_measures=[
                "Design PV mounting for wind speeds per Nigerian building code (Zone III: 50 m/s)",
                "Schedule panel cleaning during and after Harmattan season",
                "Use dust-resistant connectors and sealed cable glands",
                "Anchor battery containers and power house to concrete foundations",
            ],
        ))

        # 5. Conflict / security
        if site_state in CONFLICT_STATES:
            conflict_risk = "high"
            conflict_desc = (
                f"{site_state} is affected by insurgency, banditry, or communal conflict. "
                "High risk of asset damage, supply chain disruption, and staff safety concerns."
            )
            warnings.append(
                f"Site is in {site_state}, a high-security-risk state. Comprehensive security "
                "assessment and community engagement strategy required before investment."
            )
        elif site_state in ["Plateau", "Benue", "Taraba", "Niger", "Kaduna"]:
            conflict_risk = "moderate"
            conflict_desc = (
                f"{site_state} experiences periodic communal tensions (farmer-herder, ethno-religious). "
                "Moderate security risk requiring community-based conflict mitigation."
            )
        else:
            conflict_risk = "low"
            conflict_desc = "Low conflict risk. Standard community engagement protocols apply."

        hazards.append(ClimateHazard(
            hazard_type="conflict",
            risk_level=conflict_risk,
            description=conflict_desc,
            adaptation_measures=[
                "Engage traditional and religious leaders as project champions",
                "Hire local staff and security guards from the host community",
                "Install perimeter fencing, CCTV, and motion-sensor lighting",
                "Develop community benefit-sharing mechanism to build social licence",
            ],
        ))

        # ---- Climate finance eligibility ----
        climate_finance_eligibility = [
            "Green Climate Fund (GCF) — Simplified Approval Process for small-scale RE",
            "Adaptation Fund — community-based adaptation co-benefits",
            "Climate Investment Funds (CIF) — Scaling Up Renewable Energy Program (SREP)",
            "Nigeria Climate Change Fund (established under Climate Change Act 2021)",
        ]

        # Additional eligibility based on project characteristics
        if annual_tco2e > 50:
            climate_finance_eligibility.append(
                "Voluntary carbon market (Gold Standard / Verra VCS) — bundled or standalone"
            )
        if any(h.risk_level == "high" for h in hazards if h.hazard_type in ("flood", "drought")):
            climate_finance_eligibility.append(
                "GEF Small Grants Programme — climate adaptation and community resilience"
            )

        # ---- Adaptation score (0-10) ----
        # Higher score = better adapted / lower residual risk
        high_count = sum(1 for h in hazards if h.risk_level == "high")
        moderate_count = sum(1 for h in hazards if h.risk_level == "moderate")
        # Start at 10, deduct for risks
        adaptation_score = max(0.0, 10.0 - (high_count * 2.5) - (moderate_count * 1.0))
        adaptation_score = round(adaptation_score, 1)

        if adaptation_score < 4.0:
            warnings.append(
                f"Climate adaptation score is low ({adaptation_score}/10). "
                "Consider enhanced resilience measures in project design."
            )

        self._output = ClimateOutput(
            ndc_alignment=ndc_alignment,
            emission_reduction_contribution=emission_reduction_contribution,
            climate_hazards=hazards,
            climate_finance_eligibility=climate_finance_eligibility,
            adaptation_score=adaptation_score,
            warnings=warnings,
        )
        return self._output

    def get_standardized_outputs(self) -> dict:
        if self._output is None:
            return {}
        return {
            "ndc_alignment": "Nigeria NDC — 47% reduction by 2030, net-zero by 2060",
            "adaptation_score": self._output.adaptation_score,
            "high_risk_hazards": [
                h.hazard_type for h in self._output.climate_hazards
                if h.risk_level == "high"
            ],
            "climate_finance_options": len(self._output.climate_finance_eligibility),
        }
