from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class StakeholderGroup:
    name: str
    role: str
    engagement_priority: str = "medium"  # low, medium, high, critical


@dataclass
class ESSOutput:
    esia_category: str = "B"
    esia_framework: str = "EIA Act Cap E12 LFN 2004 / NESREA Act 2007"
    biodiversity_risk: str = "low"
    resettlement_risk: str = "none"
    cultural_heritage_risk: str = "low"
    stakeholders: list[StakeholderGroup] = field(default_factory=list)
    gesi_considerations: list[str] = field(default_factory=list)
    key_permits: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
