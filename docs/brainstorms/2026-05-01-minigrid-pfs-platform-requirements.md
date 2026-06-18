---
date: 2026-05-01
topic: minigrid-pfs-platform
---

# AfCEN Minigrid PFS Generation Platform

## Problem Frame

The current Megaza v2 PFS is a solid desktop screening document, but has critical quantitative gaps: demand scenarios are "TBC," there is no distribution network design or costing, no carbon assessment, no 25-year financial model, and no grid-arrival scenario analysis. These gaps exist because each section requires computation that manual desktop study cannot deliver efficiently. A platform that ingests site data and GIS sources, runs simplified but real models, and generates a structured PFS would close these gaps systematically — not just for Megaza but for any candidate minigrid site.

The validation target is an improved Megaza PFS (v3) that fills every TBC in the current v2 with computed values, adds the missing sections (distribution design, carbon, grid-arrival), and produces a partner-facing deliverable that demonstrates the platform's value.

## Requirements

- R1. **Adapter registry and base pattern.** The platform implements a tool registry where each computational module registers as a BaseAdapter with `is_available`, `validate_inputs`, `run`, and `get_standardized_outputs` methods. Adapters are classified as TOOL or AGENT.

- R2. **Demand assessment module.** Given a site's customer segmentation (households by tier, shops, institutions, productive-use anchors), the system produces: diversified peak load (kW), annual energy demand (kWh/year), 8760 hourly load profiles, and three growth scenarios (conservative/base/growth). Load estimation uses sector benchmarks from the build spec's load library (Table 3.3) when field data is unavailable.

- R3. **Solar resource assessment.** The system queries PVGIS API for the site coordinates and returns monthly GHI, DNI, temperature, and optimal tilt. It calculates annual energy yield with a documented loss model (temperature, soiling, wiring, inverter, battery, availability, degradation).

- R4. **Hybrid system sizing.** Given demand profiles (R2) and solar resource (R3), the system sizes PV capacity (kWp), battery storage (kWh usable), and inverter capacity (kWac). It runs an hourly dispatch simulation showing solar generation, battery charge/discharge, unmet demand, and curtailment. Output includes capacity utilization and autonomy hours.

- R5. **Distribution network design.** The system pulls the OSM road network for the site boundary via OSMnx, builds a corridor graph, computes a minimum-cost network topology (Steiner tree approximation), sizes conductors per segment based on downstream diversified demand, and produces: total line length by conductor class, pole count, a bill of quantities with unit costs, cost-per-connection, and network GeoJSON. Simplified voltage drop calculation included; full pandapower validation deferred.

- R6. **Carbon assessment.** The system calculates annual emission reductions (tCO2e/year) from displaced diesel using IPCC emission factors, projects total eligible tonnage over a crediting period, and produces a carbon revenue tail under four price scenarios (zero / USD 5 / USD 12 / USD 20 per tCO2e). A simplified methodology recommendation (Verra VM0103, Gold Standard TPDDTEC, or CDM AMS-I.L) is included based on project characteristics.

- R7. **Financial model.** The system produces a 25-year cash flow projection including: component-by-component CAPEX, annual OPEX, battery and inverter replacement cycles, revenue from tariff scenarios, carbon revenue, grant/debt/equity splits. Key outputs: LCOE (USD/kWh), project IRR, equity IRR, NPV at 10% discount, DSCR, simple payback, and subsidy required (USD/connection and % of CAPEX). Sensitivity analysis across at least 6 variables with tornado chart data.

- R8. **Grid-arrival scenario engine.** For sites classified as on-grid or grid-expected, the system evaluates the seven ESMAP framework options (no arrival, overlap risk, compensation/exit, side-by-side, distributor conversion, producer conversion, hybrid interconnection) against available evidence (grid extension timeline, funding commitments, historical project delivery in the district) and recommends one with rationale.

- R9. **PFS generator.** The system assembles outputs from all adapters into a structured PFS document following the 15-section template from the build spec (Section 6.1): Executive Summary, Project Context, Site Description, Demand Assessment, Resource Assessment, Environmental & Social Screening, Generation System Design, Distribution System Design, Capex & Opex, Financial Model, Carbon Assessment, Regulatory & Grid-Arrival Scenario, Risk Register, Implementation Roadmap, Recommendation & Decision, plus Annexes. Sections with missing adapter data are rendered with explicit gap markers. Output formats: Markdown and DOCX.

- R10. **Megaza v3 pilot output.** The platform generates an improved PFS for Megaza (-17.1439 S, 35.3189 E) that supersedes the v2 document. The v3 PFS fills all TBC demand fields, adds distribution network design, adds carbon assessment, includes a 25-year financial model, and includes a grid-arrival scenario recommendation. The document is structured for an investor/developer audience.

## Success Criteria

- The Megaza v3 PFS has zero "TBC" fields — every quantitative section is filled with computed values and stated assumptions.
- Distribution network section includes a real topology derived from OSM road data with line lengths, conductor sizing, and a costed BoQ.
- Financial model produces LCOE, IRR, NPV, and subsidy-required figures that are internally consistent and benchmarkable against ESMAP/RMI ranges.
- Carbon section produces tCO2e/year and revenue projections under multiple price scenarios.
- Grid-arrival section commits to a recommended transition strategy with cited evidence.
- The platform architecture is extensible — adding a new site requires only a site data file, not code changes.

## Scope Boundaries

- **Not building:** Web UI, database persistence, user authentication, or deployment infrastructure. The platform runs as a CLI/script tool.
- **Not building:** Full pandapower AC validation for distribution — simplified voltage drop calculation only.
- **Not building:** Demand Intelligence Agent (the LLM-based opportunity scanner from Layer 1 of the spec). Demand inputs are provided as structured site data.
- **Not building:** Carbon Methodology Selector agent (the LLM-based methodology reader). Using simplified rule-based methodology recommendation.
- **Not building:** GISEle adapter, Calliope adapter, or multi-engine ensemble. Single simplified sizing algorithm for v1.
- **Not building:** REopt or PyPSA integration. Simplified hybrid sizing algorithm serves the same purpose at screening fidelity.
- **Not building:** Chululu and Mugulama PFS documents in this session — Megaza is the pilot target.
- **Deferred:** PDF output (Markdown + DOCX sufficient for v1).
- **Deferred:** Audience adaptation modes (investor/developer/regulator) — single combined mode for v1.

## Key Decisions

- **Python, no framework:** Pure Python with standard libraries (requests, jinja2, networkx, osmnx, python-docx, numpy). No web framework needed since this is a CLI tool.
- **Simplified computation over full simulation:** Use PVGIS API (real solar data) + sector benchmarks (demand) + simplified algorithms (sizing, distribution, financial) rather than PySAM/REopt/pandapower. This delivers credible screening-level results without heavy dependencies.
- **Template-based PFS, not agent-written:** All PFS sections generated from Jinja templates over structured adapter outputs. No LLM synthesis in v1 — keeps output deterministic and auditable.
- **Megaza ground truth as validation:** The Megaza v2 PFS provides a comparison baseline. The platform should produce numbers in the same ballpark (60 kWp range, ~USD 230k CAPEX range) or explain divergence.
- **Grid-arrival as rule-based assessment:** The seven ESMAP options are evaluated against a scoring rubric, not an LLM. Evidence inputs (grid timeline, funding status) are provided as site data.

## Dependencies / Assumptions

- PVGIS API is accessible without authentication for the Megaza coordinates.
- OSMnx can pull road network data for the Megaza area (rural Mozambique — coverage may be sparse).
- python-docx is available for DOCX generation.
- NetworkX is available for graph algorithms (Steiner tree approximation).
- The build spec's sector benchmark library (Table 3.3) and conductor cost library (Section 4.3) provide sufficient data for simplified calculation.
- Megaza's customer segmentation from the site information document (~844 structures, ~518 households, hospital, schools, administration, fish chilling, grain mill, rice/cotton processing) is the demand input.

## Outstanding Questions

### Resolve Before Planning

(None — all product decisions resolved during brainstorm.)

### Deferred to Planning

- [Affects R5][Needs research] How complete is OSM road coverage for Megaza? If sparse, the distribution routing may need a fallback (e.g., straight-line distance with terrain multiplier).
- [Affects R3][Technical] Which PVGIS API endpoint and parameters are optimal for Mozambique coordinates? Need to confirm data availability for -17.1439, 35.3189.
- [Affects R7][Technical] What discount rate, inflation, and FX assumptions are appropriate for Mozambique rural minigrids? The v2 PFS uses 10% discount rate.
- [Affects R8][Needs research] What evidence is available on Mozambique grid extension timelines and EDM delivery track record in Zambezia to inform the grid-arrival assessment?
- [Affects R9][Technical] Best approach for DOCX generation — python-docx with manual formatting, or Markdown-to-DOCX conversion via pandoc?

## Next Steps

-> `/ce:plan` for structured implementation planning
