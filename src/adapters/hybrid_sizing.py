from __future__ import annotations

import math
import logging

from src.registry import BaseAdapter, AdapterKind
from src.models.sizing import HybridSizingOutput

logger = logging.getLogger("minigrid")


class HybridSizingAdapter(BaseAdapter):
    name = "hybrid_sizing"
    kind = AdapterKind.TOOL
    dependencies = ["demand_assessment", "solar_resource"]

    def __init__(self):
        self._output = None

    def is_available(self) -> bool:
        return True

    def validate_inputs(self, site_data, context: dict) -> list[str]:
        errors = []
        if "demand_assessment" not in context:
            errors.append("Demand assessment output required")
        if "solar_resource" not in context:
            errors.append("Solar resource output required")
        return errors

    def run(self, site_data, context: dict) -> HybridSizingOutput:
        demand = context["demand_assessment"]
        solar = context["solar_resource"]
        warnings = []

        peak_load = demand.peak_load_kw
        annual_demand = demand.annual_demand_kwh
        hourly_demand = demand.hourly_profile_8760
        hourly_solar_norm = solar.hourly_solar_factors
        specific_yield = solar.specific_yield_kwh_per_kwp

        evening_peak = max(hourly_demand[h] for h in range(365 * 24) if (h % 24) >= 17 and (h % 24) <= 22) if hourly_demand else peak_load * 0.8
        target_autonomy_hours = 3.5

        best_pv = None
        best_batt = None
        best_result = None
        best_score = float("inf")

        pv_candidates = [round(peak_load * f, 1) for f in [0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0]]

        for pv_kwp in pv_candidates:
            batt_kwh = round(evening_peak * target_autonomy_hours / 0.8, 0)

            result = self._simulate(pv_kwp, batt_kwh, hourly_demand, hourly_solar_norm, specific_yield)

            score = result["unmet_pct"] * 10 + result["curtailment_pct"] * 2 + pv_kwp * 0.1

            if result["unmet_pct"] <= 5.0 and (best_result is None or score < best_score):
                best_pv = pv_kwp
                best_batt = batt_kwh
                best_result = result
                best_score = score

        if best_result is None:
            best_pv = pv_candidates[-1]
            best_batt = round(evening_peak * target_autonomy_hours / 0.8, 0)
            best_result = self._simulate(best_pv, best_batt, hourly_demand, hourly_solar_norm, specific_yield)
            warnings.append(f"Could not meet ≤5% unmet demand target. Best unmet: {best_result['unmet_pct']:.1f}%")

        inverter_kwac = round(max(peak_load, best_pv * 0.83), 1)
        dc_ac_ratio = round(best_pv / inverter_kwac, 2) if inverter_kwac > 0 else 1.2

        annual_gen = best_pv * specific_yield
        monthly_gen = []
        days_per_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        for m_ghi in solar.monthly_ghi_kwh_m2:
            frac = m_ghi / solar.annual_ghi_kwh_m2 if solar.annual_ghi_kwh_m2 > 0 else 1 / 12
            monthly_gen.append(round(annual_gen * frac, 1))

        cap_util = round(best_result["energy_served"] / (best_pv * 8760) * 100, 1) if best_pv > 0 else 0
        cycles = round(best_result["battery_throughput"] / best_batt, 0) if best_batt > 0 else 0

        self._output = HybridSizingOutput(
            pv_capacity_kwp=best_pv,
            battery_capacity_kwh=best_batt,
            inverter_capacity_kwac=inverter_kwac,
            dc_ac_ratio=dc_ac_ratio,
            hourly_dispatch=best_result["dispatch_summary"],
            annual_generation_kwh=round(annual_gen, 0),
            annual_energy_served_kwh=round(best_result["energy_served"], 0),
            capacity_utilization_pct=cap_util,
            curtailment_pct=round(best_result["curtailment_pct"], 1),
            unmet_demand_pct=round(best_result["unmet_pct"], 1),
            autonomy_hours=target_autonomy_hours,
            battery_cycles_per_year=cycles,
            monthly_generation_kwh=monthly_gen,
            warnings=warnings,
        )
        return self._output

    def _simulate(self, pv_kwp, batt_kwh, hourly_demand, hourly_solar_norm, specific_yield):
        min_soc = 0.2
        max_soc = 1.0
        charge_rate = batt_kwh * 0.5
        discharge_rate = batt_kwh * 0.5
        round_trip_eff = 0.92

        soc = 0.5
        total_demand = 0.0
        total_served = 0.0
        total_curtailed = 0.0
        total_unmet = 0.0
        battery_throughput = 0.0

        n_hours = min(len(hourly_demand), len(hourly_solar_norm), 8760)
        dispatch_summary = []

        for i in range(n_hours):
            demand_kw = hourly_demand[i]
            solar_kw = pv_kwp * hourly_solar_norm[i] * specific_yield / 8760 * 8760 / (sum(hourly_solar_norm[:n_hours]) or 1)

            total_demand += demand_kw

            net = solar_kw - demand_kw

            if net >= 0:
                can_charge = min(net, charge_rate, (max_soc - soc) * batt_kwh / round_trip_eff)
                actual_charge = can_charge * round_trip_eff
                soc += actual_charge / batt_kwh if batt_kwh > 0 else 0
                battery_throughput += actual_charge
                curtailed = net - can_charge
                total_served += demand_kw
                total_curtailed += curtailed
                served = demand_kw
                unmet = 0
            else:
                deficit = -net
                can_discharge = min(deficit, discharge_rate, (soc - min_soc) * batt_kwh)
                soc -= can_discharge / batt_kwh if batt_kwh > 0 else 0
                battery_throughput += can_discharge
                served_from_battery = can_discharge
                served = solar_kw + served_from_battery
                unmet = demand_kw - served
                total_served += served
                total_unmet += unmet
                curtailed = 0

            if i % (24 * 30) == 0:
                dispatch_summary.append({
                    "hour": i,
                    "demand_kw": round(demand_kw, 2),
                    "solar_kw": round(solar_kw, 2),
                    "served_kw": round(served, 2),
                    "soc": round(soc, 3),
                })

        unmet_pct = (total_unmet / total_demand * 100) if total_demand > 0 else 0
        curt_pct = (total_curtailed / (pv_kwp * specific_yield) * 100) if pv_kwp > 0 and specific_yield > 0 else 0

        return {
            "energy_served": total_served,
            "unmet_pct": unmet_pct,
            "curtailment_pct": curt_pct,
            "battery_throughput": battery_throughput,
            "dispatch_summary": dispatch_summary,
        }

    def get_standardized_outputs(self) -> dict:
        if self._output is None:
            return {}
        return {
            "pv_capacity_kwp": self._output.pv_capacity_kwp,
            "battery_capacity_kwh": self._output.battery_capacity_kwh,
            "inverter_capacity_kwac": self._output.inverter_capacity_kwac,
            "annual_generation_kwh": self._output.annual_generation_kwh,
        }
