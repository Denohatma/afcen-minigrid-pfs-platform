from __future__ import annotations

import json
import logging
import math
from pathlib import Path

from src.registry import BaseAdapter, AdapterKind
from src.models.distribution import DistributionDesignOutput, BoQItem

logger = logging.getLogger("minigrid")
DATA_DIR = Path(__file__).parent.parent / "data"

TERRAIN_MULTIPLIERS = {
    "flat": 1.05,
    "rolling": 1.25,
    "hilly": 1.40,
    "mountainous": 1.60,
}


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class DistributionRoutingAdapter(BaseAdapter):
    name = "distribution_routing"
    kind = AdapterKind.TOOL
    dependencies = ["demand_assessment"]

    def __init__(self):
        self._output = None

    def is_available(self) -> bool:
        return True

    def validate_inputs(self, site_data, context: dict) -> list[str]:
        errors = []
        if "demand_assessment" not in context:
            errors.append("Demand assessment required for distribution sizing")
        return errors

    def run(self, site_data, context: dict) -> DistributionDesignOutput:
        demand = context["demand_assessment"]
        warnings = []

        with open(DATA_DIR / "conductor_library.json") as f:
            cond_lib = json.load(f)

        n_customers = demand.total_customers
        peak_kw = demand.peak_load_kw
        terrain = site_data.terrain or "rolling"
        terrain_mult = TERRAIN_MULTIPLIERS.get(terrain, 1.25)

        method = "radial_estimate"
        total_line_m = 0
        network_geojson = {"type": "FeatureCollection", "features": []}

        try:
            import networkx as nx
            osm_available = False
            try:
                import osmnx as ox
                osm_available = True
            except ImportError:
                pass

            if osm_available:
                total_line_m, network_geojson, method = self._try_osm_routing(
                    site_data, n_customers, nx, ox, terrain_mult, warnings
                )

            if total_line_m == 0:
                total_line_m, method = self._radial_estimate(n_customers, terrain_mult)
                warnings.append(f"Used radial estimation: {n_customers} customers × 25m/connection × {terrain_mult} terrain multiplier")

        except ImportError:
            total_line_m, method = self._radial_estimate(n_customers, terrain_mult)
            warnings.append("NetworkX not available. Used radial estimation.")

        boq, line_lengths, total_cost = self._compile_boq(
            total_line_m, n_customers, peak_kw, cond_lib, terrain_mult
        )

        cost_per_conn = round(total_cost / n_customers, 2) if n_customers > 0 else 0
        avg_span = cond_lib["poles"]["treated_wood_8m"]["typical_span_m"]
        pole_count = max(1, int(math.ceil(total_line_m / avg_span)))

        v_drop_max = self._estimate_voltage_drop(total_line_m, peak_kw, n_customers, cond_lib)
        tech_losses = round(0.04 + 0.02 * (total_line_m / 1000), 3)

        self._output = DistributionDesignOutput(
            total_line_length_m=round(total_line_m, 0),
            line_lengths_by_class=line_lengths,
            pole_count=pole_count,
            bill_of_quantities=boq,
            total_network_cost_usd=round(total_cost, 0),
            cost_per_connection_usd=round(cost_per_conn, 0),
            voltage_drop_max_pct=round(v_drop_max, 1),
            technical_losses_pct=round(tech_losses * 100, 1),
            method_used=method,
            network_geojson=network_geojson,
            customers_connected=n_customers,
            avg_span_m=avg_span,
            construction_multiplier=terrain_mult,
            warnings=warnings,
        )
        return self._output

    def _try_osm_routing(self, site_data, n_customers, nx, ox, terrain_mult, warnings):
        try:
            center = (site_data.lat, site_data.lon)
            radius = site_data.settlement_radius_m

            logger.info(f"Querying OSMnx for roads at {center}, radius={radius}m")
            G = ox.graph_from_point(center, dist=radius, network_type="all",
                                    retain_all=True, truncate_by_edge=True, simplify=True)

            n_edges = G.number_of_edges()
            logger.info(f"OSM road network: {G.number_of_nodes()} nodes, {n_edges} edges")

            if n_edges < 10:
                warnings.append(f"OSM road coverage sparse ({n_edges} edges). Using radial estimate.")
                return 0, "osm_insufficient"

            G_u = ox.convert.to_undirected(G)
            components = list(nx.connected_components(G_u))
            if len(components) > 1:
                largest = max(components, key=len)
                G_u = G_u.subgraph(largest).copy()

            total_length = sum(d.get("length", 0) for u, v, d in G_u.edges(data=True))
            network_length = min(total_length, n_customers * 30) * terrain_mult

            nodes_gdf, edges_gdf = ox.graph_to_gdfs(G_u)
            geojson = json.loads(edges_gdf.to_json())

            warnings.append(f"OSM network: {n_edges} edges, {total_length:.0f}m total. Estimated distribution: {network_length:.0f}m.")
            return network_length, geojson, "osm_network"

        except Exception as e:
            logger.warning(f"OSMnx routing failed: {e}")
            warnings.append(f"OSMnx failed: {e}. Falling back to radial estimate.")
            return 0, {"type": "FeatureCollection", "features": []}, "osm_failed"

    def _radial_estimate(self, n_customers, terrain_mult):
        line_per_customer_m = 25
        spine_overhead = 1.20
        total = n_customers * line_per_customer_m * spine_overhead * terrain_mult
        return round(total, 0), "radial_estimate"

    def _compile_boq(self, total_line_m, n_customers, peak_kw, cond_lib, terrain_mult):
        spine_pct = 0.25
        feeder_pct = 0.45
        service_pct = 0.30

        spine_m = total_line_m * spine_pct
        feeder_m = total_line_m * feeder_pct
        service_m = total_line_m * service_pct

        conductors = cond_lib["conductors"]
        spine_cond = "ABC_35mm2"
        feeder_cond = "ABC_16mm2"
        service_cond = "ACSR_Rabbit"

        line_lengths = {
            spine_cond: round(spine_m, 0),
            feeder_cond: round(feeder_m, 0),
            service_cond: round(service_m, 0),
        }

        boq = []

        for cond_key, length_m in line_lengths.items():
            cond = conductors[cond_key]
            cost = length_m / 1000 * cond["cost_usd_per_km"]
            boq.append(BoQItem(
                category="conductor",
                description=f"{cond_key} conductor",
                unit="km",
                quantity=round(length_m / 1000, 2),
                unit_cost_usd=cond["cost_usd_per_km"],
                total_cost_usd=round(cost, 0),
            ))

        pole = cond_lib["poles"]["treated_wood_8m"]
        pole_count = max(1, int(math.ceil(total_line_m / pole["typical_span_m"])))
        boq.append(BoQItem(
            category="pole",
            description="Treated wood pole 8m",
            unit="unit",
            quantity=pole_count,
            unit_cost_usd=pole["cost_usd"],
            total_cost_usd=round(pole_count * pole["cost_usd"], 0),
        ))

        sd = cond_lib["service_drop"]
        boq.append(BoQItem(
            category="service_drop",
            description="Service drop incl. meter",
            unit="connection",
            quantity=n_customers,
            unit_cost_usd=sd["cost_per_connection_usd"],
            total_cost_usd=round(n_customers * sd["cost_per_connection_usd"], 0),
        ))

        materials_cost = sum(item.total_cost_usd for item in boq)

        protection_cost = round(materials_cost * cond_lib["protection"]["pct_of_conductor_plus_pole"], 0)
        boq.append(BoQItem(
            category="protection",
            description="Fuses, surge arresters, earthing",
            unit="lump sum",
            quantity=1,
            unit_cost_usd=protection_cost,
            total_cost_usd=protection_cost,
        ))

        subtotal = materials_cost + protection_cost
        construction = round(subtotal * (terrain_mult - 1 + 0.30), 0)
        boq.append(BoQItem(
            category="construction",
            description=f"Labour, transport, supervision ({terrain_mult}x terrain)",
            unit="lump sum",
            quantity=1,
            unit_cost_usd=construction,
            total_cost_usd=construction,
        ))

        hard_cost = subtotal + construction
        soft_cost = round(hard_cost * cond_lib["soft_cost_pct"], 0)
        boq.append(BoQItem(
            category="soft_costs",
            description="Permitting, design, owner's engineer",
            unit="lump sum",
            quantity=1,
            unit_cost_usd=soft_cost,
            total_cost_usd=soft_cost,
        ))

        total_cost = hard_cost + soft_cost
        return boq, line_lengths, total_cost

    def _estimate_voltage_drop(self, total_line_m, peak_kw, n_customers, cond_lib):
        avg_feeder_length_km = (total_line_m * 0.45 / max(1, n_customers // 80)) / 1000
        current = peak_kw / (math.sqrt(3) * 0.4 * cond_lib["power_factor"]) / max(1, n_customers // 80)
        resistance = cond_lib["conductors"]["ABC_16mm2"]["resistance_ohm_per_km"]
        v_drop_v = current * resistance * avg_feeder_length_km
        v_drop_pct = v_drop_v / 400 * 100
        return min(v_drop_pct, 15.0)

    def get_standardized_outputs(self) -> dict:
        if self._output is None:
            return {}
        return {
            "total_network_cost_usd": self._output.total_network_cost_usd,
            "cost_per_connection_usd": self._output.cost_per_connection_usd,
            "total_line_length_m": self._output.total_line_length_m,
            "method_used": self._output.method_used,
        }
