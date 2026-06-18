from __future__ import annotations

from src.registry import BaseAdapter, AdapterKind
from src.models.concession import ConcessionOutput, ConcessionSection


class ConcessionGeneratorAdapter(BaseAdapter):
    name = "concession_generator"
    kind = AdapterKind.TOOL
    dependencies = ["financial_model", "risk_assessment", "ess_screening"]

    def __init__(self):
        self._output = None

    def is_available(self) -> bool:
        return True

    def validate_inputs(self, site_data, context: dict) -> list[str]:
        errors = []
        if "financial_model" not in context:
            errors.append("Financial model output required for concession data sheet")
        return errors

    def run(self, site_data, context: dict) -> ConcessionOutput:
        financial = context["financial_model"]
        risk = context.get("risk_assessment")
        demand = context.get("demand_assessment")
        solar = context.get("solar_resource")
        sizing = context.get("hybrid_sizing")
        distribution = context.get("distribution_routing")
        carbon = context.get("carbon_assessment")
        grid_arrival = context.get("grid_arrival")
        pbg = context.get("pbg_calculator")
        ess = context.get("ess_screening")
        warnings = []

        sections = []

        # ---- Section 1: Site + DisCo identification ----
        sections.append(ConcessionSection(
            section_number=1,
            title="Site & DisCo Identification",
            content={
                "site_name": site_data.site_name,
                "lga": site_data.district,
                "state": site_data.province,
                "coordinates": {"lat": site_data.lat, "lon": site_data.lon},
                "developer": site_data.developer,
                "disco_name": site_data.disco_name,
                "minigrid_type": site_data.minigrid_type,
                "settlement_radius_m": site_data.settlement_radius_m,
                "population": site_data.population,
                "mapped_structures": site_data.mapped_structures,
            },
        ))

        # ---- Section 2: Feeder band + supply hours baseline ----
        sections.append(ConcessionSection(
            section_number=2,
            title="Feeder Band & Supply Hours Baseline",
            content={
                "disco_supply_hours_per_day": site_data.disco_supply_hours,
                "grid_status": site_data.grid_status,
                "minigrid_type": site_data.minigrid_type,
                "target_supply_hours": 24,
                "der_supply_hours": 24 - site_data.disco_supply_hours,
                "baseline_note": (
                    f"Current {site_data.disco_name or 'DisCo'} supply: "
                    f"{site_data.disco_supply_hours:.0f} hours/day. "
                    f"DER system will provide remaining "
                    f"{24 - site_data.disco_supply_hours:.0f} hours/day to achieve 24-hour supply."
                ),
            },
        ))

        # ---- Section 3: Demand projections ----
        demand_content = {}
        if demand:
            demand_content = {
                "peak_load_kw": demand.peak_load_kw,
                "annual_demand_kwh": demand.annual_demand_kwh,
                "daily_average_kwh": demand.daily_average_kwh,
                "total_customers": demand.total_customers,
                "acpu_kwh_per_day": demand.acpu_kwh_per_day,
                "growth_scenarios": demand.growth_scenarios,
            }
        else:
            demand_content = {"note": "Demand assessment not available"}
            warnings.append("Section 3: Demand data not available from demand_assessment adapter")
        sections.append(ConcessionSection(
            section_number=3,
            title="Demand Projections",
            content=demand_content,
        ))

        # ---- Section 4: Anchor customers ----
        anchor_content = {}
        if site_data.anchors:
            anchor_list = []
            for a in site_data.anchors:
                anchor_list.append({
                    "type": a.load_type,
                    "name": a.name,
                    "count": a.count,
                    "estimated_load_kw": a.estimated_load_kw,
                    "operating_hours": a.operating_hours,
                })
            anchor_content = {
                "anchor_count": len(site_data.anchors),
                "anchors": anchor_list,
            }
        else:
            anchor_content = {"note": "No anchor customers identified"}
            warnings.append("Section 4: No anchor customers defined in site data")
        sections.append(ConcessionSection(
            section_number=4,
            title="Anchor Customers",
            content=anchor_content,
        ))

        # ---- Section 5: Productive use ----
        pu_content = {
            "economic_activities": site_data.economic_activities or ["Not specified"],
            "social_services": site_data.social_services or ["Not specified"],
        }
        if demand and demand.customer_details:
            productive = [
                c for c in demand.customer_details
                if c.category not in ("residential",)
            ]
            pu_content["productive_use_customers"] = len(productive)
            pu_content["productive_use_peak_kw"] = round(
                sum(c.diversified_peak_kw for c in productive), 2
            )
        sections.append(ConcessionSection(
            section_number=5,
            title="Productive Use",
            content=pu_content,
        ))

        # ---- Section 6: Solar resource + system design ----
        system_content = {}
        if solar:
            system_content["annual_ghi_kwh_m2"] = solar.annual_ghi_kwh_m2
            system_content["data_source"] = solar.data_source
            system_content["optimal_tilt_deg"] = solar.optimal_tilt_deg
            system_content["performance_ratio"] = solar.performance_ratio
        if sizing:
            system_content["pv_capacity_kwp"] = sizing.pv_capacity_kwp
            system_content["battery_capacity_kwh"] = sizing.battery_capacity_kwh
            system_content["inverter_capacity_kwac"] = sizing.inverter_capacity_kwac
            system_content["annual_generation_kwh"] = sizing.annual_generation_kwh
            system_content["autonomy_hours"] = sizing.autonomy_hours
            system_content["unmet_demand_pct"] = sizing.unmet_demand_pct
        if not system_content:
            system_content = {"note": "Solar resource and system sizing not available"}
            warnings.append("Section 6: Solar/sizing data not available")
        sections.append(ConcessionSection(
            section_number=6,
            title="Solar Resource & System Design",
            content=system_content,
        ))

        # ---- Section 7: CAPEX + DARES PBG calculation ----
        capex_content = {
            "total_capex_usd": financial.total_capex_usd,
            "capex_per_wp": financial.capex_per_wp,
            "capex_breakdown": financial.capex_breakdown,
            "grant_amount_usd": financial.grant_amount_usd,
            "grant_pct_capex": financial.subsidy_pct_capex,
            "subsidy_per_connection_usd": financial.subsidy_per_connection_usd,
        }
        if pbg:
            capex_content["pbg_grant_total_usd"] = pbg.grant_total_usd
            capex_content["pbg_grant_per_connection_usd"] = pbg.grant_per_connection_usd
            capex_content["pbg_dares_compliant"] = pbg.dares_compliant
            capex_content["pbg_milestones"] = [
                {
                    "milestone": m.milestone,
                    "trigger": m.trigger,
                    "pct": m.pct_of_grant,
                    "amount_usd": m.amount_usd,
                    "max_months": m.max_months,
                }
                for m in pbg.milestones
            ]
        sections.append(ConcessionSection(
            section_number=7,
            title="CAPEX & DARES PBG Calculation",
            content=capex_content,
        ))

        # ---- Section 8: MYTO-aligned tariff + financing ----
        tariff_content = {
            "tariff_scenarios": site_data.tariff_scenarios,
            "base_tariff_usd_kwh": site_data.tariff_scenarios.get("base", 0.40),
            "lcoe_usd_kwh": financial.lcoe_usd_kwh,
            "project_irr": financial.project_irr,
            "equity_irr": financial.equity_irr,
            "npv_at_10pct": financial.npv_at_10pct,
            "dscr_min": financial.dscr_min,
            "simple_payback_years": financial.simple_payback_years,
            "financing_structure": {
                "grant_pct": site_data.financing_structure.get("grant_pct", 0.40),
                "debt_pct": site_data.financing_structure.get("debt_pct", 0.35),
                "equity_pct": site_data.financing_structure.get("equity_pct", 0.25),
            },
            "grant_amount_usd": financial.grant_amount_usd,
            "debt_amount_usd": financial.debt_amount_usd,
            "equity_amount_usd": financial.equity_amount_usd,
            "debt_interest_rate": site_data.debt_interest_rate,
            "debt_tenor_years": site_data.debt_tenor_years,
            "fx_rate_ngn_usd": site_data.fx_rate_ngn_usd,
        }
        sections.append(ConcessionSection(
            section_number=8,
            title="MYTO-Aligned Tariff & Financing",
            content=tariff_content,
        ))

        # ---- Section 9: NESREA ESIA ----
        esia_content = {
            "ifc_category": site_data.ifc_category,
            "protected_area_overlap": site_data.protected_area_overlap,
            "flood_risk": site_data.flood_risk,
            "biodiversity_risk": site_data.biodiversity_risk,
        }
        if ess:
            esia_content["ess_screening"] = "Completed"
            if hasattr(ess, "ifc_category"):
                esia_content["ess_ifc_category"] = ess.ifc_category
        else:
            esia_content["ess_screening"] = "Not completed — using site data defaults"
            warnings.append("Section 9: ESS screening adapter not available; using site data defaults")
        sections.append(ConcessionSection(
            section_number=9,
            title="NESREA ESIA",
            content=esia_content,
        ))

        # ---- Section 10: Climate rationale + NDC ----
        climate_content = {
            "ndc_alignment": (
                "Nigeria's Updated NDC (2021) targets 47% emission reduction by 2030 (conditional). "
                "Mini-grid electrification directly contributes to NDC goals by displacing "
                "diesel and petrol (PMS) self-generation."
            ),
            "sdg_alignment": [
                "SDG 7 — Affordable and Clean Energy",
                "SDG 8 — Decent Work and Economic Growth",
                "SDG 13 — Climate Action",
            ],
        }
        if carbon:
            climate_content["annual_emission_reductions_tco2e"] = carbon.annual_emission_reductions_tco2e
            climate_content["diesel_displaced_litres_yr"] = carbon.diesel_displaced_litres_yr
            climate_content["pms_displaced_litres_yr"] = carbon.pms_displaced_litres_yr
            climate_content["carbon_methodology"] = carbon.recommended_methodology
        sections.append(ConcessionSection(
            section_number=10,
            title="Climate Rationale & NDC Alignment",
            content=climate_content,
        ))

        # ---- Section 11: Risk analysis ----
        risk_content = {}
        if risk:
            risk_content = {
                "overall_risk_score": risk.overall_risk_score,
                "risk_rating": risk.risk_rating,
                "top_risks": risk.top_risks,
                "currency_risk_note": risk.currency_risk_note,
                "security_risk_note": risk.security_risk_note,
                "risk_items": [
                    {
                        "category": r.category,
                        "description": r.description,
                        "likelihood": r.likelihood,
                        "impact": r.impact,
                        "score": r.score,
                        "mitigation": r.mitigation,
                        "owner": r.owner,
                    }
                    for r in risk.risk_items
                ],
            }
        else:
            risk_content = {"note": "Risk assessment not available"}
            warnings.append("Section 11: Risk assessment adapter not available")
        sections.append(ConcessionSection(
            section_number=11,
            title="Risk Analysis",
            content=risk_content,
        ))

        # ---- Section 12: Performance standards (SAIDI/SAIFI + connection ramp) ----
        n_customers = demand.total_customers if demand else site_data.total_customers
        perf_content = {
            "saidi_target_hours_yr": 48,
            "saifi_target_events_yr": 24,
            "availability_target_pct": 98.0,
            "connection_ramp": {
                "year_1_pct": 60,
                "year_2_pct": 80,
                "year_3_pct": 95,
                "year_5_pct": 100,
            },
            "total_customers": n_customers,
            "year_1_connections": round(n_customers * 0.60),
            "year_3_connections": round(n_customers * 0.95),
            "quality_of_supply": (
                "Voltage within +/-10% of nominal (230V single-phase / 400V three-phase). "
                "Frequency within +/-1% of 50 Hz. "
                "Maximum planned outage duration: 4 hours with 24-hour advance notice."
            ),
        }
        sections.append(ConcessionSection(
            section_number=12,
            title="Performance Standards",
            content=perf_content,
        ))

        # ---- Section 13: Tripartite agreement heads of terms ----
        tripartite_terms = {
            "disco_supply_commitment": f"{site_data.disco_supply_hours} hours/day from grid",
            "der_supply_commitment": f"{24 - site_data.disco_supply_hours} hours/day from DER",
            "distribution_usage_fee": "2% of generation value payable to DisCo",
            "billing_responsibility": "Developer (prepaid metering)",
            "grid_fault_protocol": "DisCo notifies developer within 2 hours of fault",
            "asset_ownership": "Developer owns generation + new distribution; DisCo owns existing network",
            "exclusivity_zone": f"{site_data.settlement_radius_m / 1000:.1f} km radius",
            "exit_provisions": "12-month notice if grid expands per DARES PBC 3.2",
            "community_rights": "Per DARES PBC 3.3 — community grievance mechanism required",
            "term_years": site_data.debt_tenor_years,
        }
        sections.append(ConcessionSection(
            section_number=13,
            title="Tripartite Agreement — Heads of Terms",
            content={
                "parties": [
                    site_data.developer or "Developer",
                    site_data.disco_name or "DisCo",
                    f"Community of {site_data.site_name}",
                ],
                "terms": tripartite_terms,
            },
        ))

        # ---- Section 14: Attachments list ----
        attachments = [
            "Site photographs and GPS coordinates",
            "Community engagement evidence and meeting minutes",
            "Demand assessment methodology and data sources",
            "Solar resource report (PVGIS/Global Solar Atlas)",
            "System single-line diagram",
            "Distribution network layout",
            "Financial model spreadsheet",
            "NESREA ESIA screening report",
            "Carbon credit feasibility note",
            "Land lease / community agreement (draft)",
            "DisCo acknowledgment letter",
            "Developer company profile and track record",
        ]
        sections.append(ConcessionSection(
            section_number=14,
            title="Attachments",
            content={"attachments": attachments},
        ))

        # ---- Determine submission readiness ----
        all_have_content = all(bool(s.content) for s in sections)
        critical_warnings = [w for w in warnings if "not available" in w.lower()]
        dares_ready = all_have_content and len(critical_warnings) == 0

        self._output = ConcessionOutput(
            sections=sections,
            tripartite_terms=tripartite_terms,
            dares_submission_ready=dares_ready,
            warnings=warnings,
        )
        return self._output

    def get_standardized_outputs(self) -> dict:
        if self._output is None:
            return {}
        return {
            "dares_submission_ready": self._output.dares_submission_ready,
            "sections_count": len(self._output.sections),
            "tripartite_terms": self._output.tripartite_terms,
        }
