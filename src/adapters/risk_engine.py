from __future__ import annotations

from src.registry import BaseAdapter, AdapterKind
from src.models.risk import RiskOutput, RiskItem

LIKELIHOOD_MAP = {"low": 1, "medium": 2, "high": 3}
IMPACT_MAP = {"low": 1, "medium": 2, "high": 3}

# States with elevated security risk
HIGH_SECURITY_STATES = {"borno", "yobe", "adamawa", "zamfara", "katsina"}
MODERATE_SECURITY_STATES = {"kaduna", "niger", "plateau"}


def _likelihood_label(score: float) -> str:
    if score <= 2.0:
        return "low"
    if score <= 3.5:
        return "medium"
    return "high"


def _impact_label(score: float) -> str:
    if score <= 2.0:
        return "low"
    if score <= 3.5:
        return "medium"
    return "high"


def _risk_rating(avg_score: float) -> str:
    if avg_score < 2.0:
        return "low"
    if avg_score <= 3.0:
        return "moderate"
    if avg_score <= 3.5:
        return "elevated"
    if avg_score <= 4.0:
        return "high"
    return "critical"


class RiskAssessmentAdapter(BaseAdapter):
    name = "risk_assessment"
    kind = AdapterKind.TOOL
    dependencies = ["financial_model", "grid_arrival"]

    def __init__(self):
        self._output = None

    def is_available(self) -> bool:
        return True

    def validate_inputs(self, site_data, context: dict) -> list[str]:
        errors = []
        if "financial_model" not in context:
            errors.append("Financial model output required for risk assessment")
        return errors

    def run(self, site_data, context: dict) -> RiskOutput:
        financial = context["financial_model"]
        grid_arrival = context.get("grid_arrival")
        demand = context.get("demand_assessment")
        sizing = context.get("hybrid_sizing")
        warnings = []

        risk_items = []

        # ---- 1. Technical risk ----
        tech_score = 2.5
        tech_desc = "Battery degradation, inverter failure, PV soiling"
        if sizing:
            if sizing.pv_capacity_kwp > 100:
                tech_score = 3.0
                tech_desc += ". Larger system increases maintenance complexity"
            elif sizing.pv_capacity_kwp > 50:
                tech_score = 2.5
            else:
                tech_score = 2.0
        risk_items.append(RiskItem(
            category="technical",
            description=tech_desc,
            likelihood=_likelihood_label(tech_score),
            impact=_impact_label(tech_score),
            score=round(tech_score, 1),
            mitigation=(
                "Comprehensive O&M contract with SLA-based KPIs. "
                "Remote monitoring system with automated alerts. "
                "Scheduled preventive maintenance per OEM recommendations. "
                "Spare parts inventory for critical components."
            ),
            owner="developer",
        ))

        # ---- 2. Financial risk ----
        fin_score = 2.5
        fin_desc_parts = []

        lcoe = financial.lcoe_usd_kwh
        base_tariff = site_data.tariff_scenarios.get("base", 0.40)
        if lcoe > base_tariff:
            gap_pct = (lcoe - base_tariff) / base_tariff * 100
            fin_score += min(gap_pct / 50, 1.5)
            fin_desc_parts.append(f"LCOE (${lcoe:.3f}/kWh) exceeds base tariff (${base_tariff:.3f}/kWh)")

        collection_assumed = 0.85
        if financial.project_irr < 0.08:
            fin_score += 0.5
            fin_desc_parts.append(f"Project IRR ({financial.project_irr*100:.1f}%) below 8% threshold")

        if financial.dscr_min > 0 and financial.dscr_min < 1.2:
            fin_score += 0.5
            fin_desc_parts.append(f"DSCR ({financial.dscr_min:.2f}x) below 1.2x comfort level")

        fin_desc_parts.append("CAPEX overrun risk")
        fin_desc_parts.append(f"Collection rate assumed at {collection_assumed*100:.0f}%")
        fin_score = min(fin_score, 5.0)

        risk_items.append(RiskItem(
            category="financial",
            description=". ".join(fin_desc_parts),
            likelihood=_likelihood_label(fin_score),
            impact=_impact_label(fin_score + 0.5),
            score=round(fin_score, 1),
            mitigation=(
                "Prepaid metering to ensure collection. "
                "Tariff escalation clause linked to inflation. "
                "CAPEX contingency of 10-15%. "
                "Carbon credit revenue as additional income stream."
            ),
            owner="developer",
        ))

        # ---- 3. Regulatory risk ----
        reg_score = 3.0  # Base score 3 for Nigeria
        reg_desc = "NERC permit delays, DisCo non-compliance, tariff review risk"
        if grid_arrival:
            assessment = grid_arrival.evidence_summary.get("assessment", "")
            if assessment == "imminent":
                reg_score = 4.0
                reg_desc += ". Grid arrival imminent — regulatory overlap risk elevated"
            elif assessment == "likely":
                reg_score = 3.5
                reg_desc += ". Grid extension likely — monitor NERC/DisCo coordination"

        risk_items.append(RiskItem(
            category="regulatory",
            description=reg_desc,
            likelihood=_likelihood_label(reg_score),
            impact="high",
            score=round(reg_score, 1),
            mitigation=(
                "Early engagement with NERC for minigrid permit. "
                "Tripartite agreement with DisCo to clarify roles. "
                "Compliance with DARES Performance-Based Contract (PBC) requirements. "
                "Regular regulatory monitoring and stakeholder updates."
            ),
            owner="nerc",
        ))

        # ---- 4. Commercial risk ----
        com_score = 2.5
        com_desc_parts = ["Low demand uptake", "customer defection", "competition from grid improvement"]
        if demand:
            if demand.total_customers < 100:
                com_score = 3.0
                com_desc_parts.append(f"Small customer base ({demand.total_customers})")
            elif demand.total_customers < 200:
                com_score = 2.5
            else:
                com_score = 2.0
            if demand.acpu_kwh_per_day < 0.5:
                com_score += 0.5
                com_desc_parts.append(f"Low per-capita demand ({demand.acpu_kwh_per_day:.2f} kWh/day)")

        risk_items.append(RiskItem(
            category="commercial",
            description=". ".join(com_desc_parts),
            likelihood=_likelihood_label(com_score),
            impact=_impact_label(com_score),
            score=round(min(com_score, 5.0), 1),
            mitigation=(
                "Productive use development programme to stimulate demand. "
                "Flexible tariff tiers for different customer segments. "
                "Community engagement and awareness campaigns. "
                "Anchor customer agreements to secure base load."
            ),
            owner="developer",
        ))

        # ---- 5. Environmental risk ----
        env_score = 2.0
        env_desc_parts = []
        lat = site_data.lat

        if site_data.flood_risk == "high":
            env_score += 1.5
            env_desc_parts.append("High flood risk zone")
        elif site_data.flood_risk == "moderate":
            env_score += 0.5
            env_desc_parts.append("Moderate flood risk")

        # Northern Nigeria — extreme heat
        if lat > 10.0:
            env_score += 0.5
            env_desc_parts.append("Sahel zone — extreme heat and dust exposure")
        # Southern Nigeria — heavy rainfall
        if lat < 7.0:
            env_score += 0.3
            env_desc_parts.append("Coastal/forest zone — heavy rainfall and humidity")

        if site_data.biodiversity_risk != "low":
            env_score += 0.5
            env_desc_parts.append(f"Biodiversity risk: {site_data.biodiversity_risk}")

        if not env_desc_parts:
            env_desc_parts = ["Flood, drought, extreme heat — standard environmental risks"]

        risk_items.append(RiskItem(
            category="environmental",
            description=". ".join(env_desc_parts),
            likelihood=_likelihood_label(env_score),
            impact=_impact_label(env_score),
            score=round(min(env_score, 5.0), 1),
            mitigation=(
                "Elevated equipment mounting (flood risk areas). "
                "Enhanced cooling and dust-resistant enclosures for Sahel sites. "
                "NESREA ESIA screening and compliance. "
                "Climate-resilient design per IFC PS standards."
            ),
            owner="developer",
        ))

        # ---- 6. Social risk ----
        soc_score = 2.0  # Base score 2
        soc_desc = "Community resistance, land disputes, gender exclusion"

        risk_items.append(RiskItem(
            category="social",
            description=soc_desc,
            likelihood="low",
            impact="medium",
            score=round(soc_score, 1),
            mitigation=(
                "Community engagement and free prior informed consent (FPIC). "
                "Land lease agreements with community leaders and LGA. "
                "Gender-inclusive tariff design and productive use programmes. "
                "Community grievance redress mechanism per DARES PBC 3.3."
            ),
            owner="community",
        ))

        # ---- 7. Security risk ----
        state_lower = (site_data.province or "").strip().lower()
        if state_lower in HIGH_SECURITY_STATES:
            sec_score = 4.5
            sec_desc = (
                f"High security risk — {site_data.province} State. "
                "Active insurgency/banditry zone. Theft and vandalism risk elevated."
            )
            sec_note = (
                f"Site is located in {site_data.province} State, classified as a high-risk security zone "
                "due to Boko Haram/ISWAP insurgency and/or armed banditry. "
                "Physical security measures, insurance, and operational security protocols are essential. "
                "Engagement with local security agencies and community watch groups recommended."
            )
        elif state_lower in MODERATE_SECURITY_STATES:
            sec_score = 3.5
            sec_desc = (
                f"Moderate security risk — {site_data.province} State. "
                "Periodic security incidents. Equipment theft possible."
            )
            sec_note = (
                f"Site is located in {site_data.province} State with moderate security concerns. "
                "Periodic communal conflicts and occasional banditry reported. "
                "Perimeter fencing, CCTV, and community security partnership recommended."
            )
        else:
            sec_score = 2.0
            sec_desc = "Low security risk — standard theft and vandalism prevention"
            sec_note = (
                f"Site is in {site_data.province or 'a'} State with generally stable security conditions. "
                "Standard perimeter security and community engagement measures are sufficient."
            )

        risk_items.append(RiskItem(
            category="security",
            description=sec_desc,
            likelihood=_likelihood_label(sec_score),
            impact=_impact_label(sec_score),
            score=round(sec_score, 1),
            mitigation=(
                "Perimeter fencing and security lighting. "
                "CCTV and remote monitoring with alert system. "
                "Community security partnership and local employment. "
                "Insurance coverage for theft and vandalism."
            ),
            owner="developer",
        ))

        # ---- 8. Currency risk ----
        cur_score = 4.0  # Always score 4 for Nigeria
        cur_desc = (
            "NGN/USD volatility (35-50% per year). "
            "CAPEX denominated in USD, revenue collected in NGN. "
            "DARES grant disbursement in USD creates FX mismatch with local costs."
        )
        cur_note = (
            "The Nigerian Naira (NGN) has experienced sustained depreciation against the USD, "
            f"with current rates around NGN {site_data.fx_rate_ngn_usd:,.0f}/USD. "
            "DARES performance-based grants are denominated in USD but operational revenue is collected "
            "in NGN, creating a structural currency mismatch. Equipment procurement in USD/EUR further "
            "exposes the project to FX risk. Tariff adjustments lag currency movements, compressing "
            "margins in real terms. The MYTO tariff methodology provides partial indexation but "
            "review cycles are typically 3-5 years."
        )

        risk_items.append(RiskItem(
            category="currency",
            description=cur_desc,
            likelihood="high",
            impact="high",
            score=round(cur_score, 1),
            mitigation=(
                "USD-indexed tariff escalation clause in concession agreement. "
                "Hedging via forward contracts where available. "
                "Local procurement where feasible to reduce USD exposure. "
                "DARES grant milestone timing aligned with CAPEX disbursement schedule."
            ),
            owner="developer",
        ))

        # ---- Aggregate scoring ----
        scores = [item.score for item in risk_items]
        overall = round(sum(scores) / len(scores), 2) if scores else 0.0
        rating = _risk_rating(overall)

        sorted_items = sorted(risk_items, key=lambda r: r.score, reverse=True)
        top_risks = [f"{r.category}: {r.description.split('.')[0]}" for r in sorted_items[:3]]

        self._output = RiskOutput(
            risk_items=risk_items,
            overall_risk_score=overall,
            risk_rating=rating,
            top_risks=top_risks,
            currency_risk_note=cur_note,
            security_risk_note=sec_note,
            warnings=warnings,
        )
        return self._output

    def get_standardized_outputs(self) -> dict:
        if self._output is None:
            return {}
        return {
            "overall_risk_score": self._output.overall_risk_score,
            "risk_rating": self._output.risk_rating,
            "top_risks": self._output.top_risks,
        }
