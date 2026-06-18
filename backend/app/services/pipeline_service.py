from __future__ import annotations

import asyncio
import json
import logging
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PipelineRun, AdapterResult, Site

logger = logging.getLogger("minigrid.pipeline")

SRC_ROOT = Path(__file__).resolve().parent.parent.parent.parent / "src"


def _build_registry():
    from src.registry import AdapterRegistry
    from src.adapters.gis_engine import GISScreeningAdapter
    from src.adapters.demand_assessment import DemandAssessmentAdapter
    from src.adapters.solar_resource import SolarResourceAdapter
    from src.adapters.grid_arrival import GridArrivalAdapter
    from src.adapters.hybrid_sizing import HybridSizingAdapter
    from src.adapters.distribution_routing import DistributionRoutingAdapter
    from src.adapters.carbon_assessment import CarbonAssessmentAdapter
    from src.adapters.productive_use import ProductiveUseAdapter
    from src.adapters.financial_model import FinancialModelAdapter
    from src.adapters.pbg_calculator import PBGCalculatorAdapter
    from src.adapters.ess_engine import ESSScreeningAdapter
    from src.adapters.climate_engine import ClimateAssessmentAdapter
    from src.adapters.risk_engine import RiskAssessmentAdapter
    from src.adapters.confidence_engine import ConfidenceAssessmentAdapter
    from src.adapters.concession_engine import ConcessionGeneratorAdapter

    registry = AdapterRegistry()
    registry.register(GISScreeningAdapter())
    registry.register(DemandAssessmentAdapter())
    registry.register(SolarResourceAdapter())
    registry.register(GridArrivalAdapter())
    registry.register(HybridSizingAdapter())
    registry.register(DistributionRoutingAdapter())
    registry.register(CarbonAssessmentAdapter())
    registry.register(ProductiveUseAdapter())
    registry.register(FinancialModelAdapter())
    registry.register(PBGCalculatorAdapter())
    registry.register(ESSScreeningAdapter())
    registry.register(ClimateAssessmentAdapter())
    registry.register(RiskAssessmentAdapter())
    registry.register(ConfidenceAssessmentAdapter())
    registry.register(ConcessionGeneratorAdapter())
    return registry


def _run_pipeline_sync(site_data_dict: dict) -> dict:
    """Run the full pipeline synchronously (called via asyncio.to_thread)."""
    from src.models.site import SiteData, CustomerSegment, AnchorLoad, GridArrivalEvidence, ExistingPFSMetrics
    from src.orchestrator import Orchestrator

    customers = [CustomerSegment(**c) for c in site_data_dict.pop("customers", [])]
    anchors = [AnchorLoad(**a) for a in site_data_dict.pop("anchors", [])]
    grid_ev = site_data_dict.pop("grid_arrival_evidence", {})
    if "edm_track_record" in grid_ev and "disco_track_record" not in grid_ev:
        grid_ev["disco_track_record"] = grid_ev.pop("edm_track_record")
    grid_evidence = GridArrivalEvidence(**grid_ev)
    existing_pfs = ExistingPFSMetrics(**site_data_dict.pop("existing_pfs", {}))
    coords = site_data_dict.pop("coordinates", [0.0, 0.0])

    # Backward-compat: rename old Mozambique fx field to Nigeria equivalent
    if "fx_rate_mzn_usd" in site_data_dict and "fx_rate_ngn_usd" not in site_data_dict:
        site_data_dict["fx_rate_ngn_usd"] = site_data_dict.pop("fx_rate_mzn_usd")

    site_data = SiteData(
        customers=customers,
        anchors=anchors,
        grid_arrival_evidence=grid_evidence,
        existing_pfs=existing_pfs,
        coordinates=tuple(coords),
        **site_data_dict,
    )

    registry = _build_registry()
    orchestrator = Orchestrator(registry)

    with tempfile.TemporaryDirectory() as tmpdir:
        ctx = orchestrator.run(site_data, output_dir=tmpdir)

    serialized_outputs = {}
    for name, output in ctx.outputs.items():
        if hasattr(output, "__dict__"):
            serialized_outputs[name] = _dataclass_to_dict(output)
        else:
            serialized_outputs[name] = output

    return {
        "outputs": serialized_outputs,
        "errors": ctx.errors,
        "timings": ctx.timings,
    }


def _dataclass_to_dict(obj) -> dict:
    """Recursively convert a dataclass to a JSON-serializable dict."""
    import dataclasses
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        result = {}
        for f in dataclasses.fields(obj):
            value = getattr(obj, f.name)
            result[f.name] = _dataclass_to_dict(value)
        return result
    elif isinstance(obj, list):
        return [_dataclass_to_dict(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: _dataclass_to_dict(v) for k, v in obj.items()}
    elif isinstance(obj, tuple):
        return list(obj)
    return obj


async def execute_pipeline(
    db: AsyncSession,
    run: PipelineRun,
    site: Site,
) -> PipelineRun:
    """Execute the pipeline in a background thread and update DB with results."""
    site_data_dict = dict(site.site_data)

    try:
        result = await asyncio.to_thread(_run_pipeline_sync, site_data_dict)

        run.status = "completed"
        run.adapter_timings = result["timings"]
        run.adapter_errors = result["errors"]

        summary = {}
        sizing = result["outputs"].get("hybrid_sizing", {})
        financial = result["outputs"].get("financial_model", {})
        if sizing:
            summary["pv_capacity_kwp"] = sizing.get("pv_capacity_kwp")
            summary["battery_capacity_kwh"] = sizing.get("battery_capacity_kwh")
        if financial:
            summary["total_capex_usd"] = financial.get("total_capex_usd")
            summary["lcoe_usd_kwh"] = financial.get("lcoe_usd_kwh")
            summary["base_irr"] = financial.get("base_irr")
        run.summary_metrics = summary

        for adapter_name, output in result["outputs"].items():
            adapter_result = AdapterResult(
                run_id=run.id,
                adapter_name=adapter_name,
                status="completed",
                output=output if isinstance(output, dict) else {"value": output},
                duration_seconds=result["timings"].get(adapter_name),
            )
            db.add(adapter_result)

        for adapter_name, error in result["errors"].items():
            if adapter_name not in result["outputs"]:
                adapter_result = AdapterResult(
                    run_id=run.id,
                    adapter_name=adapter_name,
                    status="failed",
                    output={"error": error},
                    duration_seconds=result["timings"].get(adapter_name),
                )
                db.add(adapter_result)

    except Exception as e:
        logger.exception("Pipeline execution failed")
        run.status = "failed"
        run.adapter_errors = {"pipeline": str(e)}

    run.completed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(run)
    return run


async def stream_pipeline_progress(
    db: AsyncSession,
    run: PipelineRun,
    site: Site,
) -> AsyncIterator[str]:
    """Execute pipeline and yield SSE events as adapters complete."""
    site_data_dict = dict(site.site_data)

    yield f"data: {json.dumps({'event': 'started', 'run_id': run.id})}\n\n"

    try:
        result = await asyncio.to_thread(_run_pipeline_sync, site_data_dict)

        for adapter_name, timing in result["timings"].items():
            status = "completed" if adapter_name in result["outputs"] else "failed"
            error = result["errors"].get(adapter_name)
            yield f"data: {json.dumps({'event': 'adapter_complete', 'adapter': adapter_name, 'status': status, 'duration': round(timing, 2), 'error': error})}\n\n"

            adapter_result = AdapterResult(
                run_id=run.id,
                adapter_name=adapter_name,
                status=status,
                output=result["outputs"].get(adapter_name, {"error": error}),
                duration_seconds=timing,
            )
            db.add(adapter_result)

        run.status = "completed"
        run.adapter_timings = result["timings"]
        run.adapter_errors = result["errors"]

        summary = {}
        sizing = result["outputs"].get("hybrid_sizing", {})
        financial = result["outputs"].get("financial_model", {})
        if sizing:
            summary["pv_capacity_kwp"] = sizing.get("pv_capacity_kwp")
            summary["battery_capacity_kwh"] = sizing.get("battery_capacity_kwh")
        if financial:
            summary["total_capex_usd"] = financial.get("total_capex_usd")
            summary["lcoe_usd_kwh"] = financial.get("lcoe_usd_kwh")
            summary["base_irr"] = financial.get("base_irr")
        run.summary_metrics = summary

    except Exception as e:
        logger.exception("Pipeline execution failed")
        run.status = "failed"
        run.adapter_errors = {"pipeline": str(e)}
        yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"

    run.completed_at = datetime.utcnow()
    await db.commit()

    yield f"data: {json.dumps({'event': 'completed', 'run_id': run.id, 'status': run.status})}\n\n"
