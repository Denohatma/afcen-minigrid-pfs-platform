from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ConcessionSection:
    section_number: int
    title: str
    content: dict = field(default_factory=dict)


@dataclass
class ConcessionOutput:
    sections: list[ConcessionSection] = field(default_factory=list)
    tripartite_terms: dict = field(default_factory=dict)
    dares_submission_ready: bool = False
    warnings: list[str] = field(default_factory=list)
