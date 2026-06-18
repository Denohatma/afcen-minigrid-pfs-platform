from __future__ import annotations

import json
import math
from pathlib import Path

from src.registry import BaseAdapter, AdapterKind
from src.models.demand import DemandAssessmentOutput, CustomerDemandDetail

DATA_DIR = Path(__file__).parent.parent / "data"


def load_json(filename: str) -> dict:
    with open(DATA_DIR / filename) as f:
        return json.load(f)


def get_diversity_factor(count: int, is_anchor: bool, factors: dict) -> float:
    if is_anchor:
        return factors.get("anchor", 1.0)
    if count <= 5:
        return factors.get("1_to_5", 0.9)
    if count <= 20:
        return factors.get("6_to_20", 0.7)
    if count <= 50:
        return factors.get("21_to_50", 0.5)
    if count <= 100:
        return factors.get("51_to_100", 0.4)
    if count <= 200:
        return factors.get("101_to_200", 0.35)
    return factors.get("200_plus", 0.3)


def load_shape(shape_key: str) -> list[float]:
    path = DATA_DIR / "load_shapes" / f"{shape_key}.json"
    if not path.exists():
        path = DATA_DIR / "load_shapes" / "residential.json"
    with open(path) as f:
        data = json.load(f)
    shape = data["shape"]
    total = sum(shape)
    if total > 0:
        shape = [v / total for v in shape]
    return shape


class DemandAssessmentAdapter(BaseAdapter):
    name = "demand_assessment"
    kind = AdapterKind.TOOL
    dependencies = []

    def __init__(self):
        self._output = None

    def is_available(self) -> bool:
        return (DATA_DIR / "load_benchmarks.json").exists()

    def validate_inputs(self, site_data, context: dict) -> list[str]:
        errors = []
        if not site_data.customers and not site_data.anchors:
            errors.append("No customer segments or anchor loads defined")
        return errors

    def run(self, site_data, context: dict) -> DemandAssessmentOutput:
        benchmarks = load_json("load_benchmarks.json")
        diversity_factors = benchmarks["diversity_factors"]

        details = []
        total_peak = 0.0
        total_annual = 0.0
        composite_hourly = [0.0] * 8760
        warnings = []

        for anchor in site_data.anchors:
            anchor_data = benchmarks["anchors"].get(anchor.load_type)
            if anchor_data is None:
                warnings.append(f"No benchmark for anchor type '{anchor.load_type}', using 10 kW default")
                peak_per_unit = 10.0
                shape_key = "institutional"
            else:
                peak_per_unit = anchor.estimated_load_kw or anchor_data["peak_kw_mid"]
                shape_key = anchor.load_shape or anchor_data.get("load_shape", "institutional")

            df = get_diversity_factor(anchor.count, True, diversity_factors)
            diversified_peak = peak_per_unit * anchor.count * df

            hourly_shape = load_shape(shape_key)
            daily_kwh = diversified_peak * sum(hourly_shape) * 24
            annual_kwh = daily_kwh * 365

            detail = CustomerDemandDetail(
                category="anchor",
                sub_type=anchor.load_type,
                count=anchor.count,
                peak_load_per_unit_kw=peak_per_unit,
                diversity_factor=df,
                diversified_peak_kw=diversified_peak,
                annual_demand_kwh=annual_kwh,
                load_shape_key=shape_key,
            )
            details.append(detail)
            total_peak += diversified_peak
            total_annual += annual_kwh

            for day in range(365):
                for hour in range(24):
                    idx = day * 24 + hour
                    composite_hourly[idx] += diversified_peak * hourly_shape[hour] * 24

        for segment in site_data.customers:
            cat = segment.category
            sub = segment.sub_type

            bench = None
            if cat == "residential":
                bench = benchmarks["residential"].get(sub)
            elif cat == "commercial":
                bench = benchmarks["commercial"].get(sub)

            if bench is None:
                warnings.append(f"No benchmark for '{cat}/{sub}', using 0.3 kW default")
                peak_per_unit = 0.3
                shape_key = "residential"
            else:
                peak_per_unit = segment.estimated_load_kw or bench["peak_kw_mid"]
                shape_key = bench.get("load_shape", "residential")

            is_anchor = cat not in ("residential", "commercial")
            df = get_diversity_factor(segment.count, is_anchor, diversity_factors)
            diversified_peak = peak_per_unit * segment.count * df

            hourly_shape = load_shape(shape_key)
            daily_kwh = diversified_peak * sum(hourly_shape) * 24
            annual_kwh = daily_kwh * 365

            detail = CustomerDemandDetail(
                category=cat,
                sub_type=sub,
                count=segment.count,
                peak_load_per_unit_kw=peak_per_unit,
                diversity_factor=df,
                diversified_peak_kw=diversified_peak,
                annual_demand_kwh=annual_kwh,
                load_shape_key=shape_key,
            )
            details.append(detail)
            total_peak += diversified_peak
            total_annual += annual_kwh

            for day in range(365):
                for hour in range(24):
                    idx = day * 24 + hour
                    composite_hourly[idx] += diversified_peak * hourly_shape[hour] * 24

        growth_rates = {
            "conservative": 0.03,
            "base": 0.08,
            "growth": 0.12,
        }
        growth_scenarios = {}
        for scenario, rate in growth_rates.items():
            yearly_demand = []
            for yr in range(26):
                yearly_demand.append(round(total_annual * (1 + rate) ** yr, 0))
            growth_scenarios[scenario] = yearly_demand

        n_total = site_data.total_customers + sum(a.count for a in site_data.anchors)
        acpu = round(total_annual / 365 / n_total, 2) if n_total > 0 else 0.0

        self._output = DemandAssessmentOutput(
            peak_load_kw=round(total_peak, 2),
            annual_demand_kwh=round(total_annual, 0),
            hourly_profile_8760=composite_hourly,
            daily_average_kwh=round(total_annual / 365, 1),
            customer_details=details,
            growth_scenarios=growth_scenarios,
            total_customers=n_total,
            acpu_kwh_per_day=acpu,
            warnings=warnings,
        )
        return self._output

    def get_standardized_outputs(self) -> dict:
        if self._output is None:
            return {}
        return {
            "peak_load_kw": self._output.peak_load_kw,
            "annual_demand_kwh": self._output.annual_demand_kwh,
            "total_customers": self._output.total_customers,
        }
