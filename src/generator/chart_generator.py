"""Chart and map generator for PFS documents.

Produces PNG images that are embedded into the DOCX output:
  - 24-hour load profile (demand curve)
  - Monthly generation vs demand (grouped bar)
  - Dispatch sample day (stacked area with battery SOC)
  - Monthly solar irradiance (GHI/DNI bars with temperature line)
  - CAPEX breakdown (horizontal bar)
  - 25-year cumulative cashflow (line)
  - Site location map (OpenStreetMap tile)
"""

from __future__ import annotations

import logging
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

logger = logging.getLogger("minigrid")

_NAVY = "#1B3A5C"
_ACCENT = "#2E75B6"
_SOLAR_GOLD = "#F4A300"
_BATTERY_GREEN = "#27AE60"
_DEMAND_RED = "#C0392B"
_CURTAIL_GRAY = "#BFBFBF"
_LIGHT_BG = "#F5F6F8"
_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def generate_all_charts(site_data, ctx, output_dir: str) -> dict[str, str]:
    """Generate all charts and return {name: absolute_path} dict."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    paths = {}

    demand = ctx.outputs.get("demand_assessment")
    solar = ctx.outputs.get("solar_resource")
    sizing = ctx.outputs.get("hybrid_sizing")
    financial = ctx.outputs.get("financial_model")

    if demand and demand.hourly_profile_8760:
        p = out / "chart_load_profile.png"
        if _chart_load_profile(demand, str(p)):
            paths["load_profile"] = str(p)

    if sizing and sizing.monthly_generation_kwh and demand:
        p = out / "chart_monthly_gen_demand.png"
        if _chart_monthly_gen_demand(demand, sizing, str(p)):
            paths["monthly_gen_demand"] = str(p)

    if sizing and sizing.hourly_dispatch:
        p = out / "chart_dispatch.png"
        if _chart_dispatch(sizing, str(p)):
            paths["dispatch"] = str(p)

    if solar and solar.monthly_ghi_kwh_m2:
        p = out / "chart_solar_resource.png"
        if _chart_solar_resource(solar, str(p)):
            paths["solar_resource"] = str(p)

    if financial and financial.capex_breakdown:
        p = out / "chart_capex.png"
        if _chart_capex(financial, str(p)):
            paths["capex"] = str(p)

    if financial and financial.cashflow_25yr:
        p = out / "chart_cashflow.png"
        if _chart_cashflow(financial, str(p)):
            paths["cashflow"] = str(p)

    if site_data and site_data.lat != 0.0 and site_data.lon != 0.0:
        p = out / "map_location.png"
        if _chart_location_map(site_data, str(p)):
            paths["location_map"] = str(p)

    logger.info(f"Generated {len(paths)} chart(s) in {output_dir}")
    return paths


# ── Shared setup ───────────────────────────────────────────────────────

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Calibri", "Helvetica", "Arial", "DejaVu Sans"],
    "font.size": 9,
    "axes.titlesize": 11,
    "axes.titleweight": "bold",
    "axes.labelsize": 9,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.edgecolor": "#999999",
    "axes.facecolor": _LIGHT_BG,
    "figure.facecolor": "white",
    "figure.dpi": 180,
    "grid.color": "#E0E0E0",
    "grid.linewidth": 0.5,
})


def _save(fig, path):
    fig.savefig(path, bbox_inches="tight", pad_inches=0.15)
    plt.close(fig)
    return True


# ── Load profile ──────────────────────────────────────────────────────

def _chart_load_profile(demand, path):
    try:
        hourly = demand.hourly_profile_8760
        if len(hourly) < 24:
            return False

        avg_day = [0.0] * 24
        for h in range(len(hourly)):
            avg_day[h % 24] += hourly[h]
        n_days = len(hourly) / 24
        avg_day = [v / n_days for v in avg_day]

        fig, ax = plt.subplots(figsize=(7, 3.5))
        hours = list(range(24))
        ax.fill_between(hours, avg_day, alpha=0.3, color=_ACCENT)
        ax.plot(hours, avg_day, color=_ACCENT, linewidth=2)

        peak_h = avg_day.index(max(avg_day))
        ax.annotate(
            f"Peak: {max(avg_day):.1f} kW",
            xy=(peak_h, max(avg_day)),
            xytext=(peak_h - 4, max(avg_day) * 1.08),
            fontsize=8, color=_NAVY, fontweight="bold",
            arrowprops=dict(arrowstyle="->", color=_NAVY, lw=0.8),
        )

        ax.axvspan(17, 22, alpha=0.08, color=_DEMAND_RED, label="Evening peak")
        ax.axvspan(8, 16, alpha=0.06, color=_SOLAR_GOLD, label="Solar hours")

        ax.set_xlabel("Hour of Day")
        ax.set_ylabel("Average Demand (kW)")
        ax.set_title("24-Hour Load Profile", color=_NAVY)
        ax.set_xticks(range(0, 24, 2))
        ax.set_xlim(0, 23)
        ax.set_ylim(bottom=0)
        ax.legend(loc="upper left", fontsize=7, framealpha=0.9)
        ax.grid(axis="y", alpha=0.5)

        return _save(fig, path)
    except Exception as e:
        logger.warning(f"Load profile chart failed: {e}")
        return False


# ── Monthly generation vs demand ──────────────────────────────────────

def _chart_monthly_gen_demand(demand, sizing, path):
    try:

        gen = sizing.monthly_generation_kwh
        if len(gen) < 12:
            return False

        hourly = demand.hourly_profile_8760
        monthly_demand = [0.0] * 12
        days_in_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        h = 0
        for m in range(12):
            hours_in = days_in_month[m] * 24
            monthly_demand[m] = sum(hourly[h:h + hours_in])
            h += hours_in

        fig, ax = plt.subplots(figsize=(7, 3.5))
        x = np.arange(12)
        w = 0.35
        ax.bar(x - w / 2, [g / 1000 for g in gen], w, label="Generation",
               color=_SOLAR_GOLD, edgecolor="white", linewidth=0.5)
        ax.bar(x + w / 2, [d / 1000 for d in monthly_demand], w, label="Demand",
               color=_ACCENT, edgecolor="white", linewidth=0.5)

        ax.set_xlabel("Month")
        ax.set_ylabel("Energy (MWh)")
        ax.set_title("Monthly Generation vs. Demand", color=_NAVY)
        ax.set_xticks(x)
        ax.set_xticklabels(_MONTHS)
        ax.set_ylim(bottom=0)
        ax.legend(fontsize=8, framealpha=0.9)
        ax.grid(axis="y", alpha=0.5)

        return _save(fig, path)
    except Exception as e:
        logger.warning(f"Monthly gen/demand chart failed: {e}")
        return False


# ── Dispatch sample day ───────────────────────────────────────────────

def _chart_dispatch(sizing, path):
    try:

        dispatch = sizing.hourly_dispatch
        if not dispatch or len(dispatch) < 24:
            return False

        # Pick a day near middle of the dataset (representative)
        n = len(dispatch)
        mid = (n // 2) - ((n // 2) % 24)
        day = dispatch[mid:mid + 24]
        if len(day) < 24:
            day = dispatch[:24]

        hours = [d.get("hour", i) % 24 for i, d in enumerate(day)]
        solar = [d.get("solar_kw", 0) for d in day]
        demand_kw = [d.get("demand_kw", 0) for d in day]
        served = [d.get("served_kw", 0) for d in day]
        soc = [d.get("soc", 0) * 100 for d in day]

        fig, ax1 = plt.subplots(figsize=(7, 3.5))

        ax1.fill_between(hours, solar, alpha=0.3, color=_SOLAR_GOLD, label="Solar")
        ax1.plot(hours, solar, color=_SOLAR_GOLD, linewidth=1.5)
        ax1.plot(hours, demand_kw, color=_DEMAND_RED, linewidth=2, label="Demand")
        ax1.plot(hours, served, color=_BATTERY_GREEN, linewidth=1.5,
                 linestyle="--", label="Served")

        ax1.set_xlabel("Hour of Day")
        ax1.set_ylabel("Power (kW)")
        ax1.set_title("Sample Day Dispatch Profile", color=_NAVY)
        ax1.set_xlim(0, 23)
        ax1.set_ylim(bottom=0)

        ax2 = ax1.twinx()
        ax2.plot(hours, soc, color=_NAVY, linewidth=1.5, linestyle=":",
                 alpha=0.7, label="Battery SOC")
        ax2.set_ylabel("Battery SOC (%)", color=_NAVY)
        ax2.set_ylim(0, 105)
        ax2.tick_params(axis="y", labelcolor=_NAVY)
        ax2.spines["right"].set_visible(True)
        ax2.spines["right"].set_color(_NAVY)

        lines1, labels1 = ax1.get_legend_handles_labels()
        lines2, labels2 = ax2.get_legend_handles_labels()
        ax1.legend(lines1 + lines2, labels1 + labels2, loc="upper left",
                   fontsize=7, framealpha=0.9)
        ax1.grid(axis="y", alpha=0.5)

        return _save(fig, path)
    except Exception as e:
        logger.warning(f"Dispatch chart failed: {e}")
        return False


# ── Solar resource ────────────────────────────────────────────────────

def _chart_solar_resource(solar, path):
    try:

        ghi = solar.monthly_ghi_kwh_m2
        dni = solar.monthly_dni_kwh_m2
        temp = solar.monthly_temp_c
        if len(ghi) < 12:
            return False

        fig, ax1 = plt.subplots(figsize=(7, 3.5))
        x = np.arange(12)
        w = 0.35
        ax1.bar(x - w / 2, ghi, w, label="GHI", color=_SOLAR_GOLD,
                edgecolor="white", linewidth=0.5)
        if len(dni) == 12:
            ax1.bar(x + w / 2, dni, w, label="DNI", color=_ACCENT,
                    edgecolor="white", linewidth=0.5)

        ax1.set_xlabel("Month")
        ax1.set_ylabel("Irradiance (kWh/m²)")
        ax1.set_title("Monthly Solar Resource", color=_NAVY)
        ax1.set_xticks(x)
        ax1.set_xticklabels(_MONTHS)
        ax1.set_ylim(bottom=0)

        if len(temp) == 12:
            ax2 = ax1.twinx()
            ax2.plot(x, temp, color=_DEMAND_RED, marker="o", markersize=4,
                     linewidth=1.5, label="Temperature")
            ax2.set_ylabel("Temperature (°C)", color=_DEMAND_RED)
            ax2.tick_params(axis="y", labelcolor=_DEMAND_RED)
            ax2.spines["right"].set_visible(True)
            ax2.spines["right"].set_color(_DEMAND_RED)
            lines1, labels1 = ax1.get_legend_handles_labels()
            lines2, labels2 = ax2.get_legend_handles_labels()
            ax1.legend(lines1 + lines2, labels1 + labels2, loc="upper right",
                       fontsize=7, framealpha=0.9)
        else:
            ax1.legend(fontsize=8, framealpha=0.9)

        ax1.grid(axis="y", alpha=0.5)
        return _save(fig, path)
    except Exception as e:
        logger.warning(f"Solar resource chart failed: {e}")
        return False


# ── CAPEX breakdown ───────────────────────────────────────────────────

def _chart_capex(financial, path):
    try:

        items = financial.capex_breakdown
        total = financial.total_capex_usd
        if not items or total <= 0:
            return False

        sorted_items = sorted(items.items(), key=lambda kv: kv[1])
        labels = [k.replace("_", " ").title() for k, _ in sorted_items]
        values = [v / 1000 for _, v in sorted_items]
        pcts = [v / total * 100 for _, v in sorted_items]

        colors = plt.cm.Blues([0.3 + 0.5 * i / max(len(labels) - 1, 1)
                               for i in range(len(labels))])

        fig, ax = plt.subplots(figsize=(7, max(3, len(labels) * 0.45)))
        bars = ax.barh(labels, values, color=colors, edgecolor="white",
                       linewidth=0.5, height=0.6)

        for bar, pct in zip(bars, pcts):
            ax.text(bar.get_width() + max(values) * 0.02, bar.get_y() + bar.get_height() / 2,
                    f"{pct:.0f}%", va="center", fontsize=8, color=_NAVY)

        ax.set_xlabel("Cost (USD thousands)")
        ax.set_title(f"CAPEX Breakdown — Total: ${total:,.0f}", color=_NAVY)
        ax.grid(axis="x", alpha=0.5)

        return _save(fig, path)
    except Exception as e:
        logger.warning(f"CAPEX chart failed: {e}")
        return False


# ── Cumulative cashflow ───────────────────────────────────────────────

def _chart_cashflow(financial, path):
    try:

        cfs = financial.cashflow_25yr
        if not cfs:
            return False

        years = [cf.year for cf in cfs]
        cumulative = [cf.cumulative_cashflow_usd / 1000 for cf in cfs]
        net = [cf.net_cashflow_usd / 1000 for cf in cfs]

        fig, ax = plt.subplots(figsize=(7, 3.5))

        ax.bar(years, net, color=[_BATTERY_GREEN if v >= 0 else _DEMAND_RED for v in net],
               alpha=0.5, label="Annual net CF", width=0.8)
        ax.plot(years, cumulative, color=_NAVY, linewidth=2.5,
                marker="o", markersize=3, label="Cumulative CF")
        ax.axhline(y=0, color="#999999", linewidth=0.8, linestyle="-")

        payback_year = None
        for i in range(1, len(cumulative)):
            if cumulative[i - 1] < 0 and cumulative[i] >= 0:
                payback_year = years[i]
                break
        if payback_year:
            ax.axvline(x=payback_year, color=_BATTERY_GREEN, linewidth=1,
                       linestyle="--", alpha=0.7)
            ax.annotate(f"Payback: Yr {payback_year}", xy=(payback_year, 0),
                        xytext=(payback_year + 1.5, min(cumulative) * 0.3),
                        fontsize=8, color=_BATTERY_GREEN, fontweight="bold",
                        arrowprops=dict(arrowstyle="->", color=_BATTERY_GREEN, lw=0.8))

        ax.set_xlabel("Year")
        ax.set_ylabel("Cash Flow (USD thousands)")
        ax.set_title("25-Year Cash Flow Summary", color=_NAVY)
        ax.legend(fontsize=7, framealpha=0.9)
        ax.grid(axis="y", alpha=0.5)

        return _save(fig, path)
    except Exception as e:
        logger.warning(f"Cashflow chart failed: {e}")
        return False


# ── Location map ──────────────────────────────────────────────────────

def _chart_location_map(site_data, path):
    try:
        from staticmap import StaticMap, CircleMarker
        m = StaticMap(640, 400, url_template="https://tile.openstreetmap.org/{z}/{x}/{y}.png")
        m.add_marker(CircleMarker((site_data.lon, site_data.lat), _DEMAND_RED, 18))
        m.add_marker(CircleMarker((site_data.lon, site_data.lat), "#FFFFFF", 10))
        m.add_marker(CircleMarker((site_data.lon, site_data.lat), _DEMAND_RED, 6))
        image = m.render(zoom=11)

        from PIL import ImageDraw, ImageFont
        draw = ImageDraw.Draw(image)
        label = f"{site_data.site_name} ({site_data.lat:.4f}, {site_data.lon:.4f})"
        try:
            font = ImageFont.truetype("Arial", 14)
        except (OSError, IOError):
            font = ImageFont.load_default()
        bbox = draw.textbbox((0, 0), label, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x, y = 10, image.height - th - 15
        draw.rectangle([x - 4, y - 4, x + tw + 4, y + th + 4], fill=(255, 255, 255, 200))
        draw.text((x, y), label, fill=(27, 58, 92), font=font)

        attr = "\u00A9 OpenStreetMap contributors"
        abbox = draw.textbbox((0, 0), attr, font=font)
        aw = abbox[2] - abbox[0]
        ah = abbox[3] - abbox[1]
        ax_pos = image.width - aw - 8
        ay_pos = image.height - ah - 8
        draw.rectangle([ax_pos - 3, ay_pos - 2, ax_pos + aw + 3, ay_pos + ah + 2],
                        fill=(255, 255, 255, 180))
        draw.text((ax_pos, ay_pos), attr, fill=(100, 100, 100), font=font)

        image.save(path)
        logger.info(f"Location map saved to {path}")
        return True
    except Exception as e:
        logger.warning(f"Location map failed: {e}")
        return _chart_location_fallback(site_data, path)


def _chart_location_fallback(site_data, path):
    """Fallback when staticmap/network unavailable: simple coordinate marker plot."""
    try:
        fig, ax = plt.subplots(figsize=(6, 4))
        ax.plot(site_data.lon, site_data.lat, "o", color=_DEMAND_RED,
                markersize=14, markeredgecolor="white", markeredgewidth=2)
        ax.set_xlabel("Longitude")
        ax.set_ylabel("Latitude")
        ax.set_title(f"Site Location: {site_data.site_name}", color=_NAVY)
        offset = 0.15
        ax.set_xlim(site_data.lon - offset, site_data.lon + offset)
        ax.set_ylim(site_data.lat - offset, site_data.lat + offset)
        ax.grid(True, alpha=0.3)
        ax.annotate(
            f"{site_data.site_name}\n({site_data.lat:.4f}, {site_data.lon:.4f})",
            xy=(site_data.lon, site_data.lat),
            xytext=(site_data.lon + offset * 0.3, site_data.lat + offset * 0.3),
            fontsize=9, color=_NAVY, fontweight="bold",
            arrowprops=dict(arrowstyle="->", color=_NAVY, lw=1),
        )
        ax.set_facecolor("white")
        return _save(fig, path)
    except Exception as e:
        logger.warning(f"Fallback map also failed: {e}")
        return False
