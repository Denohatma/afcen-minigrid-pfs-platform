from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class RiskItem:
    category: str  # technical, financial, regulatory, commercial, environmental, social, security, currency
    description: str
    likelihood: str = "medium"  # low, medium, high
    impact: str = "medium"  # low, medium, high
    score: float = 0.0  # 1-5
    mitigation: str = ""
    owner: str = ""  # developer, disco, rea, nerc, community


@dataclass
class RiskOutput:
    risk_items: list[RiskItem] = field(default_factory=list)
    overall_risk_score: float = 0.0  # 1-25 scale
    risk_rating: str = ""  # low, moderate, elevated, high, critical
    top_risks: list[str] = field(default_factory=list)
    currency_risk_note: str = ""
    security_risk_note: str = ""
    warnings: list[str] = field(default_factory=list)
