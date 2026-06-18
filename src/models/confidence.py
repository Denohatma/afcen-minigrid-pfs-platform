from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ConfidenceDimension:
    dimension: str
    score: float = 0.0  # 0-10
    data_source: str = ""
    notes: str = ""


@dataclass
class ConfidenceOutput:
    dimensions: list[ConfidenceDimension] = field(default_factory=list)
    overall_confidence: float = 0.0  # 0-10
    confidence_rating: str = ""  # low, moderate, high
    data_completeness_pct: float = 0.0
    key_gaps: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
