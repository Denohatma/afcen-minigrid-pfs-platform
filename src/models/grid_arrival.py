from __future__ import annotations

from dataclasses import dataclass, field


ESMAP_SCENARIOS = [
    "no_arrival",
    "overlap_risk",
    "compensation_exit",
    "side_by_side",
    "distributor_conversion",
    "producer_conversion",
    "hybrid_interconnection",
]

SCENARIO_LABELS = {
    "no_arrival": "No Arrival — Full minigrid build assuming grid does not materialise",
    "overlap_risk": "Overlap Risk — Smaller transitional minigrid with explicit timeline",
    "compensation_exit": "Compensation & Exit — Minigrid with negotiated buyout terms",
    "side_by_side": "Side-by-Side — Minigrid continues as embedded generation post-grid",
    "distributor_conversion": "Distributor Conversion — Convert to local distributor under utility licence",
    "producer_conversion": "Producer Conversion — Convert to wholesale generator selling to utility",
    "hybrid_interconnection": "Hybrid Interconnection — Design for grid-tied operation from day one",
}


@dataclass
class ScenarioScore:
    scenario: str
    label: str
    timeline_certainty: float = 0.0  # 0-10
    financial_viability: float = 0.0
    regulatory_alignment: float = 0.0
    implementation_complexity: float = 0.0  # higher = simpler
    stakeholder_acceptability: float = 0.0
    weighted_score: float = 0.0
    rationale: str = ""


@dataclass
class GridArrivalOutput:
    recommended_scenario: str = ""
    recommended_label: str = ""
    scenario_scores: list[ScenarioScore] = field(default_factory=list)
    rationale: str = ""
    evidence_summary: dict = field(default_factory=dict)
    design_implications: str = ""
    transition_timeline: str = ""
    warnings: list[str] = field(default_factory=list)
