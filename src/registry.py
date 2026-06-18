from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any


class AdapterKind(Enum):
    TOOL = "tool"
    AGENT = "agent"


class BaseAdapter(ABC):
    name: str = ""
    kind: AdapterKind = AdapterKind.TOOL
    dependencies: list[str] = []

    @abstractmethod
    def is_available(self) -> bool:
        ...

    @abstractmethod
    def validate_inputs(self, site_data, context: dict) -> list[str]:
        ...

    @abstractmethod
    def run(self, site_data, context: dict) -> Any:
        ...

    @abstractmethod
    def get_standardized_outputs(self) -> dict:
        ...


class AdapterRegistry:
    def __init__(self):
        self._adapters: dict[str, BaseAdapter] = {}

    def register(self, adapter: BaseAdapter):
        self._adapters[adapter.name] = adapter

    def get(self, name: str) -> BaseAdapter | None:
        return self._adapters.get(name)

    def all_adapters(self) -> dict[str, BaseAdapter]:
        return dict(self._adapters)

    def resolve_execution_order(self) -> list[str]:
        visited = set()
        order = []
        visiting = set()

        def visit(name: str):
            if name in visited:
                return
            if name in visiting:
                raise ValueError(f"Circular dependency detected involving {name}")
            visiting.add(name)
            adapter = self._adapters[name]
            for dep in adapter.dependencies:
                if dep in self._adapters:
                    visit(dep)
            visiting.remove(name)
            visited.add(name)
            order.append(name)

        for name in self._adapters:
            visit(name)
        return order
