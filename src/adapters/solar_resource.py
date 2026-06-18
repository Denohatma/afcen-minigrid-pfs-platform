from __future__ import annotations

import logging
import math
import requests

from src.registry import BaseAdapter, AdapterKind
from src.models.solar import SolarResourceOutput

logger = logging.getLogger("minigrid")

PVGIS_BASE = "https://re.jrc.ec.europa.eu/api/v5_3"

FALLBACK_MONTHLY_GHI = [178, 185, 190, 186, 175, 148, 130, 128, 148, 175, 185, 178]
FALLBACK_MONTHLY_DNI = [152, 158, 160, 155, 145, 120, 105, 100, 120, 148, 155, 150]
FALLBACK_MONTHLY_TEMP = [25.5, 28.0, 31.0, 32.0, 30.0, 27.5, 26.0, 25.5, 26.5, 28.0, 27.0, 25.0]


def build_solar_hour_profile() -> list[float]:
    """24-hour normalized solar production shape (bell curve, sunrise ~05:30 sunset ~18:00)."""
    shape = [0.0] * 24
    for h in range(6, 18):
        angle = math.pi * (h - 6) / 12
        shape[h] = math.sin(angle)
    total = sum(shape)
    return [v / total for v in shape]


class SolarResourceAdapter(BaseAdapter):
    name = "solar_resource"
    kind = AdapterKind.TOOL
    dependencies = []

    def __init__(self):
        self._output = None

    def is_available(self) -> bool:
        return True

    def validate_inputs(self, site_data, context: dict) -> list[str]:
        errors = []
        if site_data.lat == 0.0 and site_data.lon == 0.0:
            errors.append("Coordinates not set")
        return errors

    def run(self, site_data, context: dict) -> SolarResourceOutput:
        lat, lon = site_data.lat, site_data.lon
        monthly_ghi = []
        monthly_dni = []
        monthly_temp = []
        data_source = ""
        data_years = ""
        warnings = []

        try:
            url = (
                f"{PVGIS_BASE}/MRcalc"
                f"?lat={lat}&lon={lon}"
                "&horirrad=1&mr_dni=1&avtemp=1&outputformat=json"
            )
            logger.info(f"Querying PVGIS: lat={lat}, lon={lon}")
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
            result = resp.json()

            records = result["outputs"]["monthly"]
            from collections import defaultdict
            monthly_sums = defaultdict(lambda: {"ghi": [], "dni": [], "temp": []})
            for rec in records:
                m = rec["month"]
                monthly_sums[m]["ghi"].append(rec.get("H(h)_m", 0))
                monthly_sums[m]["dni"].append(rec.get("Hb(n)_m", 0))
                monthly_sums[m]["temp"].append(rec.get("T2m", 25))

            for m in range(1, 13):
                vals = monthly_sums[m]
                monthly_ghi.append(round(sum(vals["ghi"]) / len(vals["ghi"]), 1))
                monthly_dni.append(round(sum(vals["dni"]) / len(vals["dni"]), 1))
                monthly_temp.append(round(sum(vals["temp"]) / len(vals["temp"]), 1))

            meta = result.get("inputs", {}).get("meteo_data", {})
            data_source = f"PVGIS 5.3 ({meta.get('radiation_db', 'unknown')})"
            data_years = f"{meta.get('year_min', '?')}-{meta.get('year_max', '?')}"
            logger.info(f"PVGIS data received: {data_source}, {data_years}")

        except Exception as e:
            logger.warning(f"PVGIS API failed: {e}. Using fallback values.")
            warnings.append(f"PVGIS API failed ({e}). Using fallback solar data for central Nigeria (Abuja region).")
            monthly_ghi = list(FALLBACK_MONTHLY_GHI)
            monthly_dni = list(FALLBACK_MONTHLY_DNI)
            monthly_temp = list(FALLBACK_MONTHLY_TEMP)
            data_source = "Fallback (Global Solar Atlas/PVGIS screening values)"
            data_years = "N/A"

        annual_ghi = sum(monthly_ghi)
        optimal_tilt = round(abs(lat), 1)

        loss_breakdown = {
            "temperature": 0.07,
            "soiling": 0.025,
            "wiring_mismatch": 0.025,
            "inverter": 0.025,
            "battery_dispatch": 0.08,
            "availability": 0.015,
            "year1_degradation": 0.0175,
        }
        total_loss = 1.0
        for loss in loss_breakdown.values():
            total_loss *= (1 - loss)
        performance_ratio = round(total_loss, 4)

        daily_ghi_avg = annual_ghi / 365
        specific_yield = round(daily_ghi_avg * performance_ratio * 365 / 1.0, 0)

        solar_hour_shape = build_solar_hour_profile()
        days_per_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        hourly_factors = []
        for m in range(12):
            daily_ghi_m = monthly_ghi[m] / days_per_month[m]
            for d in range(days_per_month[m]):
                for h in range(24):
                    factor = daily_ghi_m * solar_hour_shape[h] * 24 / annual_ghi * 365
                    hourly_factors.append(round(factor, 6))

        while len(hourly_factors) < 8760:
            hourly_factors.append(0.0)
        hourly_factors = hourly_factors[:8760]

        self._output = SolarResourceOutput(
            monthly_ghi_kwh_m2=monthly_ghi,
            monthly_dni_kwh_m2=monthly_dni,
            monthly_temp_c=monthly_temp,
            annual_ghi_kwh_m2=round(annual_ghi, 1),
            optimal_tilt_deg=optimal_tilt,
            specific_yield_kwh_per_kwp=specific_yield,
            performance_ratio=performance_ratio,
            loss_breakdown=loss_breakdown,
            data_source=data_source,
            data_years=data_years,
            hourly_solar_factors=hourly_factors,
            warnings=warnings,
        )
        return self._output

    def get_standardized_outputs(self) -> dict:
        if self._output is None:
            return {}
        return {
            "annual_ghi_kwh_m2": self._output.annual_ghi_kwh_m2,
            "specific_yield": self._output.specific_yield_kwh_per_kwp,
            "performance_ratio": self._output.performance_ratio,
        }
