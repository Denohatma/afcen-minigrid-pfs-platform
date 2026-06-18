#!/usr/bin/env python3
"""AfCEN Minigrid PFS Generation Platform — CLI Entry Point."""
import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.models.site import SiteData
from src.registry import AdapterRegistry
from src.orchestrator import Orchestrator


def build_registry() -> AdapterRegistry:
    registry = AdapterRegistry()

    from src.adapters.gis_engine import GISScreeningAdapter
    from src.adapters.demand_assessment import DemandAssessmentAdapter
    from src.adapters.solar_resource import SolarResourceAdapter
    from src.adapters.grid_arrival import GridArrivalAdapter
    from src.adapters.hybrid_sizing import HybridSizingAdapter
    from src.adapters.distribution_routing import DistributionRoutingAdapter
    from src.adapters.carbon_assessment import CarbonAssessmentAdapter
    from src.adapters.financial_model import FinancialModelAdapter
    from src.adapters.productive_use import ProductiveUseAdapter
    from src.adapters.ess_engine import ESSScreeningAdapter
    from src.adapters.climate_engine import ClimateAssessmentAdapter
    from src.adapters.pbg_calculator import PBGCalculatorAdapter
    from src.adapters.risk_engine import RiskAssessmentAdapter
    from src.adapters.confidence_engine import ConfidenceAssessmentAdapter
    from src.adapters.concession_engine import ConcessionGeneratorAdapter

    registry.register(GISScreeningAdapter())
    registry.register(DemandAssessmentAdapter())
    registry.register(SolarResourceAdapter())
    registry.register(GridArrivalAdapter())
    registry.register(HybridSizingAdapter())
    registry.register(DistributionRoutingAdapter())
    registry.register(CarbonAssessmentAdapter())
    registry.register(FinancialModelAdapter())
    registry.register(ProductiveUseAdapter())
    registry.register(PBGCalculatorAdapter())
    registry.register(ESSScreeningAdapter())
    registry.register(ClimateAssessmentAdapter())
    registry.register(RiskAssessmentAdapter())
    registry.register(ConfidenceAssessmentAdapter())
    registry.register(ConcessionGeneratorAdapter())

    return registry


def main():
    parser = argparse.ArgumentParser(description="Generate a Minigrid Pre-Feasibility Study")
    parser.add_argument("--site", required=True, help="Path to site data JSON file")
    parser.add_argument("--output", default="output", help="Output directory")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose logging")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )
    logger = logging.getLogger("minigrid")

    site_path = Path(args.site)
    if not site_path.exists():
        logger.error(f"Site file not found: {site_path}")
        sys.exit(1)

    logger.info(f"Loading site data from {site_path}")
    site_data = SiteData.from_json(site_path)
    logger.info(f"Site: {site_data.site_name}, {site_data.district}, {site_data.country}")

    output_dir = Path(args.output) / site_data.site_name.lower().replace(" ", "_")
    output_dir.mkdir(parents=True, exist_ok=True)

    registry = build_registry()
    orchestrator = Orchestrator(registry)
    ctx = orchestrator.run(site_data, str(output_dir))

    from src.generator.pfs_generator import PFSGenerator
    generator = PFSGenerator()
    generator.generate(site_data, ctx, str(output_dir))

    logger.info(f"PFS output written to {output_dir}/")


if __name__ == "__main__":
    main()
