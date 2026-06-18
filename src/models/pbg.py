from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PBGMilestone:
    milestone: int
    trigger: str
    pct_of_grant: float
    amount_usd: float = 0.0
    max_months: int = 0

@dataclass
class PBGOutput:
    grant_total_usd: float = 0.0
    grant_pct_of_capex: float = 0.0
    grant_per_connection_usd: float = 0.0
    grant_per_kwp_usd: float = 0.0
    ifc_revolver_eligible_usd: float = 0.0
    milestones: list[PBGMilestone] = field(default_factory=list)
    dares_compliant: bool = False
    compliance_notes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
