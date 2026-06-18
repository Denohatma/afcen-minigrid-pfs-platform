from __future__ import annotations

from src.registry import BaseAdapter, AdapterKind
from src.models.grid_arrival import (
    GridArrivalOutput, ScenarioScore,
    ESMAP_SCENARIOS, SCENARIO_LABELS,
)

WEIGHTS = {
    "timeline_certainty": 0.30,
    "financial_viability": 0.25,
    "regulatory_alignment": 0.20,
    "implementation_complexity": 0.15,
    "stakeholder_acceptability": 0.10,
}


class GridArrivalAdapter(BaseAdapter):
    name = "grid_arrival"
    kind = AdapterKind.TOOL
    dependencies = []

    def __init__(self):
        self._output = None

    def is_available(self) -> bool:
        return True

    def validate_inputs(self, site_data, context: dict) -> list[str]:
        return []

    def run(self, site_data, context: dict) -> GridArrivalOutput:
        ev = site_data.grid_arrival_evidence
        warnings = []

        grid_imminent = (
            ev.funding_committed
            and ev.contractor_mobilised
            and ev.timeline_years is not None
            and ev.timeline_years <= 3
        )
        grid_likely = (
            ev.grid_extension_planned
            and ev.funding_committed
            and not ev.contractor_mobilised
        )
        grid_aspirational = (
            ev.grid_extension_planned
            and not ev.funding_committed
        )
        no_grid_evidence = not ev.grid_extension_planned

        disco_reliable = ev.disco_track_record == "good"
        disco_mixed = ev.disco_track_record == "mixed"

        scores = []
        for scenario in ESMAP_SCENARIOS:
            s = ScenarioScore(scenario=scenario, label=SCENARIO_LABELS[scenario])

            if scenario == "no_arrival":
                s.timeline_certainty = 8 if grid_aspirational or no_grid_evidence else (4 if grid_likely else 2)
                s.financial_viability = 8
                s.regulatory_alignment = 7
                s.implementation_complexity = 9
                s.stakeholder_acceptability = 7 if not grid_imminent else 4

            elif scenario == "overlap_risk":
                s.timeline_certainty = 6 if grid_aspirational else (7 if grid_likely else 3)
                s.financial_viability = 6
                s.regulatory_alignment = 7
                s.implementation_complexity = 7
                s.stakeholder_acceptability = 7

            elif scenario == "compensation_exit":
                s.timeline_certainty = 5
                s.financial_viability = 5
                s.regulatory_alignment = 6
                s.implementation_complexity = 5
                s.stakeholder_acceptability = 6

            elif scenario == "side_by_side":
                s.timeline_certainty = 5
                s.financial_viability = 6
                s.regulatory_alignment = 6
                s.implementation_complexity = 5
                s.stakeholder_acceptability = 7

            elif scenario == "distributor_conversion":
                s.timeline_certainty = 4
                s.financial_viability = 5
                s.regulatory_alignment = 5
                s.implementation_complexity = 4
                s.stakeholder_acceptability = 6

            elif scenario == "producer_conversion":
                s.timeline_certainty = 4
                s.financial_viability = 4
                s.regulatory_alignment = 4
                s.implementation_complexity = 4
                s.stakeholder_acceptability = 5

            elif scenario == "hybrid_interconnection":
                s.timeline_certainty = 3 if not grid_imminent else 8
                s.financial_viability = 4 if not grid_imminent else 7
                s.regulatory_alignment = 5
                s.implementation_complexity = 3
                s.stakeholder_acceptability = 5 if not grid_imminent else 7

            mg_type = getattr(site_data, "minigrid_type", "isolated")
            if mg_type == "interconnected" and scenario == "hybrid_interconnection":
                s.timeline_certainty = max(s.timeline_certainty, 7)
                s.financial_viability = max(s.financial_viability, 7)
                s.regulatory_alignment = max(s.regulatory_alignment, 7)
                s.stakeholder_acceptability = max(s.stakeholder_acceptability, 7)
            elif mg_type == "undergrid" and scenario in ("side_by_side", "distributor_conversion"):
                s.financial_viability = max(s.financial_viability, 6)
                s.regulatory_alignment = max(s.regulatory_alignment, 6)

            if not disco_reliable:
                if scenario in ("distributor_conversion", "producer_conversion", "hybrid_interconnection"):
                    s.financial_viability = max(2, s.financial_viability - 2)
                    s.implementation_complexity = max(2, s.implementation_complexity - 1)

            s.weighted_score = round(
                s.timeline_certainty * WEIGHTS["timeline_certainty"]
                + s.financial_viability * WEIGHTS["financial_viability"]
                + s.regulatory_alignment * WEIGHTS["regulatory_alignment"]
                + s.implementation_complexity * WEIGHTS["implementation_complexity"]
                + s.stakeholder_acceptability * WEIGHTS["stakeholder_acceptability"],
                2,
            )
            scores.append(s)

        scores.sort(key=lambda x: x.weighted_score, reverse=True)
        best = scores[0]

        evidence_summary = {
            "grid_extension_planned": ev.grid_extension_planned,
            "timeline_confirmed": ev.timeline_years is not None,
            "funding_committed": ev.funding_committed,
            "contractor_mobilised": ev.contractor_mobilised,
            "disco_track_record": ev.disco_track_record,
            "recent_extensions_in_district": ev.recent_extensions_in_district,
            "assessment": (
                "imminent" if grid_imminent
                else "likely" if grid_likely
                else "aspirational" if grid_aspirational
                else "no evidence"
            ),
        }

        disco_label = getattr(site_data, "disco_name", "") or "DisCo"
        mg_type = getattr(site_data, "minigrid_type", "isolated")

        if mg_type == "interconnected":
            rationale = (
                f"Site {site_data.site_name} is designed as an interconnected minigrid (IMG) within "
                f"{disco_label}'s service territory. The IMG will operate under a tripartite agreement "
                f"between the developer, {disco_label}, and the community. "
                f"{disco_label}'s track record is assessed as '{ev.disco_track_record}'. "
                f"The recommended strategy is '{best.label}' (score: {best.weighted_score}/10)."
            )
            design_implications = (
                f"Design as grid-interconnected system with DUOS arrangement. "
                f"Size PV/BESS to complement {disco_label} supply "
                f"({getattr(site_data, 'disco_supply_hours', 0):.0f} hrs/day). "
                f"Include interconnection equipment (step-down transformer, bulk meter, protection). "
                f"Ensure tripartite agreement covers energy dispatch, DUOS charges, and metering."
            )
            timeline = f"Already interconnected with {disco_label} network. Monitor DUOS and supply terms."
        elif grid_aspirational:
            rationale = (
                f"Grid extension to {site_data.site_name} is planned by the Federal Ministry of Power "
                f"but has no confirmed funding, no contractor mobilisation, and no timeline. "
                f"{disco_label}'s track record in {site_data.district} LGA is assessed as '{ev.disco_track_record}' "
                f"with {ev.recent_extensions_in_district} recent extensions. "
                f"Under these conditions, the grid arrival risk is low in the near term. "
                f"The recommended strategy is '{best.label}' (score: {best.weighted_score}/10)."
            )
            design_implications = (
                "Design the minigrid as a full standalone system. "
                "Include provisions for future grid interconnection in the inverter specification "
                "(grid-forming capable) but do not size for grid-tied operation. "
                f"Monitor {disco_label}/TCN grid extension progress annually."
            )
            timeline = "Grid arrival unlikely within 5-7 years based on current evidence. Review annually."
        elif grid_imminent:
            rationale = (
                f"Grid extension is funded and contractor is mobilised. "
                f"Expected arrival within {ev.timeline_years} years. "
                f"A full standalone minigrid carries significant stranded-asset risk."
            )
            design_implications = (
                "Design for grid-tied operation from day one. "
                "Size system to complement grid supply rather than replace it. "
                "Consider interconnected minigrid (IMG) model with tripartite agreement."
            )
            timeline = f"Grid expected within {ev.timeline_years} years."
        else:
            rationale = (
                f"Grid extension status for {site_data.site_name}: "
                f"planned={ev.grid_extension_planned}, funded={ev.funding_committed}. "
                f"The recommended strategy is '{best.label}' (score: {best.weighted_score}/10)."
            )
            design_implications = "Design primarily as standalone with grid-ready provisions."
            timeline = f"Grid arrival timing uncertain. Monitor {disco_label}/TCN planning updates."

        if ev.notes:
            rationale += f" Additional context: {ev.notes}"

        self._output = GridArrivalOutput(
            recommended_scenario=best.scenario,
            recommended_label=best.label,
            scenario_scores=scores,
            rationale=rationale,
            evidence_summary=evidence_summary,
            design_implications=design_implications,
            transition_timeline=timeline,
            warnings=warnings,
        )
        return self._output

    def get_standardized_outputs(self) -> dict:
        if self._output is None:
            return {}
        return {
            "recommended_scenario": self._output.recommended_scenario,
            "grid_arrival_assessment": self._output.evidence_summary.get("assessment", ""),
        }
