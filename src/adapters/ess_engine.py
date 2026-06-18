from __future__ import annotations

from src.registry import BaseAdapter, AdapterKind
from src.models.ess import ESSOutput, StakeholderGroup

# Protected area bounding boxes: (lat_min, lat_max, lon_min, lon_max)
PROTECTED_AREAS = {
    "Cross River National Park": (5.2, 6.1, 8.5, 9.5),
    "Yankari Game Reserve": (9.5, 10.0, 9.7, 10.5),
    "Chad Basin National Park": (11.5, 13.0, 12.0, 14.5),
    "Gashaka Gumti National Park": (6.8, 7.8, 11.0, 12.0),
    "Kainji Lake National Park": (9.5, 10.5, 3.5, 4.5),
    "Old Oyo National Park": (8.0, 9.0, 3.5, 4.5),
    "Okomu National Park": (6.2, 6.5, 5.0, 5.5),
    "Kamuku National Park": (10.0, 10.8, 6.5, 7.5),
}

# Northern states where Emir is the traditional authority
NORTHERN_STATES = [
    "Adamawa", "Bauchi", "Borno", "Gombe", "Jigawa", "Kaduna", "Kano",
    "Katsina", "Kebbi", "Kwara", "Nasarawa", "Niger", "Plateau", "Sokoto",
    "Taraba", "Yobe", "Zamfara", "FCT", "Benue", "Kogi",
]


class ESSScreeningAdapter(BaseAdapter):
    name = "ess_screening"
    kind = AdapterKind.TOOL
    dependencies = ["hybrid_sizing"]

    def __init__(self):
        self._output = None

    def is_available(self) -> bool:
        return True

    def validate_inputs(self, site_data, context: dict) -> list[str]:
        errors = []
        if "hybrid_sizing" not in context:
            errors.append("Hybrid sizing output required for ESS screening")
        return errors

    def run(self, site_data, context: dict) -> ESSOutput:
        sizing = context["hybrid_sizing"]
        warnings = []

        pv_kw = sizing.pv_capacity_kwp

        # ---- ESIA category based on PV capacity ----
        if pv_kw < 100:
            esia_category = "C"
            esia_note = "Minimal environmental review required"
        elif pv_kw <= 1000:
            esia_category = "B"
            esia_note = "Standard ESIA required"
        else:
            esia_category = "A"
            esia_note = "Full ESIA required — large-scale project"

        # ---- Stakeholder list ----
        site_state = site_data.province.strip()
        is_north = site_state in NORTHERN_STATES

        stakeholders = []

        # Traditional rulers — priority depends on region
        if is_north:
            stakeholders.append(StakeholderGroup(
                name="Emir / District Head",
                role="Traditional authority, community gatekeeper, land arbitration",
                engagement_priority="critical",
            ))
        else:
            stakeholders.append(StakeholderGroup(
                name="Oba / Chief / Igwe",
                role="Traditional authority, community gatekeeper, land arbitration",
                engagement_priority="critical",
            ))

        stakeholders.extend([
            StakeholderGroup(
                name="LGA Chairman",
                role="Local government approval, community mobilisation",
                engagement_priority="high",
            ),
            StakeholderGroup(
                name="State Ministry of Energy",
                role="State-level policy alignment, co-funding, permitting",
                engagement_priority="high",
            ),
            StakeholderGroup(
                name="NERC Zonal Office",
                role="Regulatory oversight, mini-grid licence issuance",
                engagement_priority="high",
            ),
            StakeholderGroup(
                name=f"DisCo Franchise Manager ({site_data.disco_name})",
                role="Interconnection agreement, tariff coordination, non-objection",
                engagement_priority="high" if site_data.minigrid_type != "isolated" else "medium",
            ),
            StakeholderGroup(
                name="REA State Coordinator",
                role="Federal programme alignment, subsidy coordination",
                engagement_priority="high",
            ),
            StakeholderGroup(
                name="Community Women's Groups",
                role="Gender inclusion, productive use identification, demand validation",
                engagement_priority="high",
            ),
            StakeholderGroup(
                name="Market Association Leaders",
                role="Commercial demand validation, willingness-to-pay insights",
                engagement_priority="medium",
            ),
            StakeholderGroup(
                name="Religious Leaders (Imam / Pastor)",
                role="Community trust, social licence, conflict mediation",
                engagement_priority="medium",
            ),
            StakeholderGroup(
                name="NESREA State Office",
                role="Environmental compliance monitoring, ESIA review",
                engagement_priority="medium",
            ),
        ])

        # ---- GESI considerations ----
        gesi_considerations = [
            "Female market traders — ensure tariff schedules and connection timing support women-led businesses",
            "Female-headed households — prioritise affordable basic tier connections",
            "Women in agro-processing — target productive use equipment grants for women's cooperatives",
            "Youth ICT hubs — allocate subsidised connections for digital skills and employment centres",
        ]

        # ---- Key permits ----
        key_permits = [
            "NESREA ESIA approval (Environmental Impact Assessment)",
            "NERC mini-grid permit / licence",
            "State Governor's Consent on land (Land Use Act 1978)",
        ]

        if site_data.minigrid_type in ("interconnected", "undergrid"):
            key_permits.append(
                f"DisCo interconnection permit ({site_data.disco_name})"
            )

        # ---- Biodiversity risk ----
        biodiversity_risk = "low"
        lat, lon = site_data.lat, site_data.lon

        for area_name, (lat_min, lat_max, lon_min, lon_max) in PROTECTED_AREAS.items():
            # Check if site is within or near (0.1 degree buffer ~11 km) a protected area
            if (lat_min - 0.1 <= lat <= lat_max + 0.1) and (lon_min - 0.1 <= lon <= lon_max + 0.1):
                biodiversity_risk = "high"
                warnings.append(
                    f"Site is within or near {area_name}. A detailed biodiversity assessment "
                    "and NESREA consultation are strongly recommended."
                )
                break

        if site_data.protected_area_overlap:
            biodiversity_risk = "high"
            warnings.append(
                "Site data indicates protected area overlap. Verify with NESREA."
            )

        # ---- Resettlement risk ----
        resettlement_risk = "none"
        if site_data.mapped_structures > 0 and pv_kw > 200:
            resettlement_risk = "low"
            warnings.append(
                "Large PV footprint may require land acquisition verification. "
                "Confirm no involuntary resettlement with community leaders."
            )

        # ---- Cultural heritage risk ----
        cultural_heritage_risk = "low"
        if is_north:
            cultural_heritage_risk = "low"
            # Note: northern Nigeria has historical sites (Kano walls, Sukur landscape, etc.)
            if site_state in ("Kano", "Borno", "Adamawa"):
                warnings.append(
                    f"Site is in {site_state} — verify no proximity to UNESCO/heritage sites "
                    "(e.g. Sukur Cultural Landscape, Kano City Walls)."
                )

        # ---- Category warning ----
        if esia_category == "A":
            warnings.append(
                f"Project classified as ESIA Category A ({esia_note}). "
                "Budget for full Environmental and Social Impact Assessment."
            )

        self._output = ESSOutput(
            esia_category=esia_category,
            esia_framework="EIA Act Cap E12 LFN 2004 / NESREA Act 2007",
            biodiversity_risk=biodiversity_risk,
            resettlement_risk=resettlement_risk,
            cultural_heritage_risk=cultural_heritage_risk,
            stakeholders=stakeholders,
            gesi_considerations=gesi_considerations,
            key_permits=key_permits,
            warnings=warnings,
        )
        return self._output

    def get_standardized_outputs(self) -> dict:
        if self._output is None:
            return {}
        return {
            "esia_category": self._output.esia_category,
            "biodiversity_risk": self._output.biodiversity_risk,
            "resettlement_risk": self._output.resettlement_risk,
            "stakeholder_count": len(self._output.stakeholders),
            "key_permits": self._output.key_permits,
        }
