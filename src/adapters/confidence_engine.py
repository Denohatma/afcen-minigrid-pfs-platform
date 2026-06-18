from __future__ import annotations

from src.registry import BaseAdapter, AdapterKind
from src.models.confidence import ConfidenceOutput, ConfidenceDimension


class ConfidenceAssessmentAdapter(BaseAdapter):
    name = "confidence_assessment"
    kind = AdapterKind.TOOL
    dependencies = ["demand_assessment", "solar_resource", "financial_model"]

    def __init__(self):
        self._output = None

    def is_available(self) -> bool:
        return True

    def validate_inputs(self, site_data, context: dict) -> list[str]:
        errors = []
        if "demand_assessment" not in context:
            errors.append("Demand assessment output required for confidence scoring")
        return errors

    def run(self, site_data, context: dict) -> ConfidenceOutput:
        demand = context.get("demand_assessment")
        solar = context.get("solar_resource")
        financial = context.get("financial_model")
        sizing = context.get("hybrid_sizing")
        distribution = context.get("distribution_routing")
        grid_arrival = context.get("grid_arrival")
        carbon = context.get("carbon_assessment")
        warnings = []

        dimensions = []

        # ---- 1. Population data quality ----
        pop_score = 5.0
        pop_source = "settlement data"
        pop_notes = ""
        if site_data.mapped_structures > 0:
            pop_score = 8.0
            pop_source = "DRE Atlas / satellite mapping"
            pop_notes = f"{site_data.mapped_structures} structures mapped"
        elif site_data.population > 0:
            pop_score = 6.0
            pop_source = "census / field estimate"
            pop_notes = f"Population: {site_data.population}"
        else:
            pop_score = 3.0
            pop_source = "no verified data"
            pop_notes = "No population or structure data available"
        dimensions.append(ConfidenceDimension(
            dimension="Population data quality",
            score=pop_score,
            data_source=pop_source,
            notes=pop_notes,
        ))

        # ---- 2. Solar resource ----
        solar_score = 5.0
        solar_source = "not assessed"
        solar_notes = ""
        if solar:
            solar_warnings = solar.warnings or []
            uses_fallback = any("fallback" in w.lower() or "failed" in w.lower() for w in solar_warnings)
            if uses_fallback:
                solar_score = 4.0
                solar_source = "fallback / screening values"
                solar_notes = "PVGIS API unavailable; used regional fallback data"
            else:
                solar_score = 9.0
                solar_source = solar.data_source
                solar_notes = f"Data years: {solar.data_years}. Annual GHI: {solar.annual_ghi_kwh_m2} kWh/m2"
        else:
            solar_score = 2.0
            solar_source = "not available"
            solar_notes = "Solar resource adapter did not run"
        dimensions.append(ConfidenceDimension(
            dimension="Solar resource",
            score=solar_score,
            data_source=solar_source,
            notes=solar_notes,
        ))

        # ---- 3. Demand estimation ----
        demand_score = 5.0
        demand_source = "not assessed"
        demand_notes = ""
        if demand:
            demand_warnings = demand.warnings or []
            uses_benchmark = any("benchmark" in w.lower() or "default" in w.lower() for w in demand_warnings)
            has_field_data = any(
                c.peak_load_per_unit_kw is not None and c.peak_load_per_unit_kw > 0
                for c in (demand.customer_details or [])
                if hasattr(c, "peak_load_per_unit_kw")
            )
            if has_field_data and not uses_benchmark:
                demand_score = 8.0
                demand_source = "field survey / metered data"
                demand_notes = f"{demand.total_customers} customers with field-measured loads"
            elif uses_benchmark:
                demand_score = 5.0
                demand_source = "benchmark estimates"
                demand_notes = "Some or all loads estimated from sector benchmarks"
            else:
                demand_score = 6.0
                demand_source = "customer segmentation"
                demand_notes = f"{demand.total_customers} customers segmented"
        else:
            demand_score = 2.0
            demand_source = "not available"
            demand_notes = "Demand assessment adapter did not run"
        dimensions.append(ConfidenceDimension(
            dimension="Demand estimation",
            score=demand_score,
            data_source=demand_source,
            notes=demand_notes,
        ))

        # ---- 4. System sizing ----
        sizing_score = 5.0
        sizing_source = "not assessed"
        sizing_notes = ""
        if sizing:
            has_dispatch = bool(sizing.hourly_dispatch)
            if has_dispatch and len(sizing.hourly_dispatch) > 6:
                sizing_score = 8.0
                sizing_source = "hourly dispatch simulation"
                sizing_notes = (
                    f"PV: {sizing.pv_capacity_kwp} kWp, Battery: {sizing.battery_capacity_kwh} kWh. "
                    f"Unmet demand: {sizing.unmet_demand_pct}%"
                )
            else:
                sizing_score = 5.0
                sizing_source = "simplified sizing"
                sizing_notes = "Limited dispatch data; sizing may be approximate"
        else:
            sizing_score = 2.0
            sizing_source = "not available"
            sizing_notes = "Hybrid sizing adapter did not run"
        dimensions.append(ConfidenceDimension(
            dimension="System sizing",
            score=sizing_score,
            data_source=sizing_source,
            notes=sizing_notes,
        ))

        # ---- 5. Distribution cost ----
        dist_score = 5.0
        dist_source = "not assessed"
        dist_notes = ""
        if distribution:
            method = distribution.method_used or ""
            if "osm" in method.lower() and "fail" not in method.lower() and "insufficient" not in method.lower():
                dist_score = 8.0
                dist_source = "OSM road network routing"
                dist_notes = f"Method: {method}. Network: {distribution.total_line_length_m:.0f}m"
            else:
                dist_score = 5.0
                dist_source = "radial estimate"
                dist_notes = f"Method: {method}. Estimated length: {distribution.total_line_length_m:.0f}m"
        else:
            dist_score = 3.0
            dist_source = "not available"
            dist_notes = "Distribution routing adapter did not run"
        dimensions.append(ConfidenceDimension(
            dimension="Distribution cost",
            score=dist_score,
            data_source=dist_source,
            notes=dist_notes,
        ))

        # ---- 6. Financial assumptions ----
        fin_score = 5.0
        fin_source = "not assessed"
        fin_notes = ""
        if financial:
            fin_warnings = financial.warnings or []
            has_calibration = (
                site_data.existing_pfs
                and site_data.existing_pfs.total_capex_usd is not None
                and site_data.existing_pfs.total_capex_usd > 0
            )
            if has_calibration:
                fin_score = 8.0
                fin_source = "calibrated against existing PFS"
                fin_notes = (
                    f"Calibrated to known CAPEX: ${site_data.existing_pfs.total_capex_usd:,.0f}. "
                    f"Model CAPEX: ${financial.total_capex_usd:,.0f}"
                )
            elif fin_warnings:
                fin_score = 5.0
                fin_source = "generic assumptions with warnings"
                fin_notes = f"{len(fin_warnings)} warnings flagged"
            else:
                fin_score = 6.0
                fin_source = "generic Nigeria defaults"
                fin_notes = f"LCOE: ${financial.lcoe_usd_kwh:.3f}/kWh, IRR: {financial.project_irr*100:.1f}%"
        else:
            fin_score = 2.0
            fin_source = "not available"
            fin_notes = "Financial model adapter did not run"
        dimensions.append(ConfidenceDimension(
            dimension="Financial assumptions",
            score=fin_score,
            data_source=fin_source,
            notes=fin_notes,
        ))

        # ---- 7. Grid arrival evidence ----
        grid_score = 5.0
        grid_source = "not assessed"
        grid_notes = ""
        if grid_arrival:
            evidence = grid_arrival.evidence_summary or {}
            assessment = evidence.get("assessment", "")
            has_docs = evidence.get("funding_committed", False) or evidence.get("timeline_confirmed", False)
            if has_docs:
                grid_score = 8.0
                grid_source = "documented evidence"
                grid_notes = f"Assessment: {assessment}. Funding committed: {evidence.get('funding_committed', False)}"
            elif assessment in ("aspirational", "no evidence"):
                grid_score = 6.0
                grid_source = "qualitative assessment"
                grid_notes = f"Assessment: {assessment}. No hard evidence of grid arrival"
            else:
                grid_score = 5.0
                grid_source = "assumed"
                grid_notes = f"Assessment: {assessment}"
        else:
            grid_score = 3.0
            grid_source = "not available"
            grid_notes = "Grid arrival adapter did not run"
        dimensions.append(ConfidenceDimension(
            dimension="Grid arrival evidence",
            score=grid_score,
            data_source=grid_source,
            notes=grid_notes,
        ))

        # ---- 8. Environmental data ----
        env_score = 4.0
        env_source = "screening only"
        env_notes = ""
        if site_data.ifc_category == "C":
            env_score = 7.0
            env_source = "IFC Category C — low impact"
            env_notes = "No significant environmental or social impacts anticipated"
        elif site_data.ifc_category == "B":
            if site_data.protected_area_overlap:
                env_score = 3.0
                env_source = "screening — protected area overlap"
                env_notes = "Protected area overlap detected; full ESIA may be required"
            else:
                env_score = 5.0
                env_source = "NESREA screening"
                env_notes = f"IFC Category B. Flood risk: {site_data.flood_risk}"
        elif site_data.ifc_category == "A":
            env_score = 3.0
            env_source = "screening — Category A"
            env_notes = "Full ESIA required for IFC Category A projects"
        dimensions.append(ConfidenceDimension(
            dimension="Environmental data",
            score=env_score,
            data_source=env_source,
            notes=env_notes,
        ))

        # ---- 9. Productive use assessment ----
        pu_score = 4.0
        pu_source = "desk study"
        pu_notes = ""
        anchor_count = len(site_data.anchors)
        if anchor_count > 0:
            has_field_loads = any(
                a.estimated_load_kw is not None and a.estimated_load_kw > 0
                for a in site_data.anchors
            )
            if has_field_loads:
                pu_score = 8.0
                pu_source = "field survey"
                pu_notes = f"{anchor_count} anchor loads with field-measured demand"
            else:
                pu_score = 5.0
                pu_source = "desk study with anchor identification"
                pu_notes = f"{anchor_count} anchor loads identified (benchmark estimates)"
        else:
            pu_score = 3.0
            pu_source = "no productive use data"
            pu_notes = "No anchor loads or productive use customers identified"
        dimensions.append(ConfidenceDimension(
            dimension="Productive use assessment",
            score=pu_score,
            data_source=pu_source,
            notes=pu_notes,
        ))

        # ---- 10. Regulatory compliance ----
        reg_score = 4.0
        reg_source = "assumed"
        reg_notes = ""
        mg_type = getattr(site_data, "minigrid_type", "isolated")
        disco = site_data.disco_name or "unknown DisCo"
        if mg_type == "interconnected":
            reg_score = 5.0
            reg_source = "tripartite agreement framework"
            reg_notes = f"IMG model with {disco}. Tripartite agreement terms assumed"
        elif mg_type == "undergrid":
            reg_score = 4.0
            reg_source = "undergrid — NERC registration assumed"
            reg_notes = f"Undergrid minigrid in {disco} territory. Permit status assumed"
        else:
            reg_score = 4.0
            reg_source = "isolated — NERC permit assumed"
            reg_notes = "Isolated minigrid. NERC mini-grid regulation compliance assumed"
        dimensions.append(ConfidenceDimension(
            dimension="Regulatory compliance",
            score=reg_score,
            data_source=reg_source,
            notes=reg_notes,
        ))

        # ---- Aggregate scoring ----
        all_scores = [d.score for d in dimensions]
        overall = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0.0

        if overall < 4.0:
            rating = "low"
        elif overall <= 7.0:
            rating = "moderate"
        else:
            rating = "high"

        above_5 = sum(1 for s in all_scores if s > 5)
        completeness = round(above_5 / len(all_scores) * 100, 1) if all_scores else 0.0

        key_gaps = [d.dimension for d in dimensions if d.score < 4.0]

        self._output = ConfidenceOutput(
            dimensions=dimensions,
            overall_confidence=overall,
            confidence_rating=rating,
            data_completeness_pct=completeness,
            key_gaps=key_gaps,
            warnings=warnings,
        )
        return self._output

    def get_standardized_outputs(self) -> dict:
        if self._output is None:
            return {}
        return {
            "overall_confidence": self._output.overall_confidence,
            "confidence_rating": self._output.confidence_rating,
            "data_completeness_pct": self._output.data_completeness_pct,
        }
