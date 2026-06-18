from __future__ import annotations

from src.registry import BaseAdapter, AdapterKind
from src.models.pbg import PBGOutput, PBGMilestone


DARES_GRANT_RANGE = (0.20, 0.40)
DARES_GRANT_PER_CONNECTION_RANGE = (300, 800)
IFC_REVOLVER_PCT_OF_PBG = 0.80

MILESTONES = [
    {"milestone": 1, "trigger": "construction_complete", "pct": 0.50, "max_months": 12},
    {"milestone": 2, "trigger": "customer_connections_verified", "pct": 0.30, "max_months": 18},
    {"milestone": 3, "trigger": "utilisation_threshold_year1", "pct": 0.20, "max_months": 24},
]


class PBGCalculatorAdapter(BaseAdapter):
    name = "pbg_calculator"
    kind = AdapterKind.TOOL
    dependencies = ["financial_model"]

    def __init__(self):
        self._output = None

    def is_available(self) -> bool:
        return True

    def validate_inputs(self, site_data, context: dict) -> list[str]:
        errors = []
        if "financial_model" not in context:
            errors.append("Financial model output required for PBG calculation")
        return errors

    def run(self, site_data, context: dict) -> PBGOutput:
        financial = context["financial_model"]
        demand = context.get("demand_assessment")
        sizing = context.get("hybrid_sizing")
        warnings = []

        total_capex = financial.total_capex_usd
        grant_pct = site_data.financing_structure.get("grant_pct", 0.25)
        grant_total = total_capex * grant_pct

        n_connections = demand.total_customers if demand else site_data.total_customers
        pv_kwp = sizing.pv_capacity_kwp if sizing else 0

        grant_per_connection = round(grant_total / n_connections, 2) if n_connections > 0 else 0
        grant_per_kwp = round(grant_total / pv_kwp, 2) if pv_kwp > 0 else 0

        ifc_eligible = grant_total * IFC_REVOLVER_PCT_OF_PBG

        milestones = []
        for m in MILESTONES:
            amount = grant_total * m["pct"]
            milestones.append(PBGMilestone(
                milestone=m["milestone"],
                trigger=m["trigger"],
                pct_of_grant=m["pct"],
                amount_usd=round(amount, 0),
                max_months=m["max_months"],
            ))

        compliance_notes = []
        dares_compliant = True

        if grant_pct < DARES_GRANT_RANGE[0]:
            compliance_notes.append(f"Grant % ({grant_pct*100:.0f}%) below DARES minimum ({DARES_GRANT_RANGE[0]*100:.0f}%)")
        elif grant_pct > DARES_GRANT_RANGE[1]:
            compliance_notes.append(f"Grant % ({grant_pct*100:.0f}%) exceeds DARES maximum ({DARES_GRANT_RANGE[1]*100:.0f}%)")
            dares_compliant = False

        if grant_per_connection < DARES_GRANT_PER_CONNECTION_RANGE[0]:
            compliance_notes.append(
                f"Grant/connection (${grant_per_connection:.0f}) below DARES floor "
                f"(${DARES_GRANT_PER_CONNECTION_RANGE[0]})"
            )
        elif grant_per_connection > DARES_GRANT_PER_CONNECTION_RANGE[1]:
            compliance_notes.append(
                f"Grant/connection (${grant_per_connection:.0f}) exceeds DARES ceiling "
                f"(${DARES_GRANT_PER_CONNECTION_RANGE[1]}). May require justification."
            )
            warnings.append("Grant per connection exceeds DARES typical range")

        if n_connections == 0:
            dares_compliant = False
            warnings.append("No connections — cannot compute grant per connection")

        self._output = PBGOutput(
            grant_total_usd=round(grant_total, 0),
            grant_pct_of_capex=round(grant_pct * 100, 1),
            grant_per_connection_usd=grant_per_connection,
            grant_per_kwp_usd=grant_per_kwp,
            ifc_revolver_eligible_usd=round(ifc_eligible, 0),
            milestones=milestones,
            dares_compliant=dares_compliant,
            compliance_notes=compliance_notes,
            warnings=warnings,
        )
        return self._output

    def get_standardized_outputs(self) -> dict:
        if self._output is None:
            return {}
        return {
            "grant_total_usd": self._output.grant_total_usd,
            "grant_per_connection_usd": self._output.grant_per_connection_usd,
            "dares_compliant": self._output.dares_compliant,
        }
