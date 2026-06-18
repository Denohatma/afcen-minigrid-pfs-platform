---
title: "feat: Minigrid PFS Generation Platform — Megaza Pilot"
type: feat
status: active
date: 2026-05-01
origin: docs/brainstorms/2026-05-01-minigrid-pfs-platform-requirements.md
---

# Minigrid PFS Generation Platform — Megaza Pilot

## Overview

Build a Python CLI platform that ingests structured site data, runs 8 computational adapters (demand, solar, sizing, distribution, carbon, financial, grid-arrival, PFS generation), and outputs a complete pre-feasibility study as Markdown + DOCX. The validation target is an improved Megaza PFS (v3) that fills every "TBC" in the current v2 with computed values, adds distribution network design, carbon assessment, 25-year financial model, and grid-arrival scenario recommendation.

Key architectural decision: adapter registry pattern with BaseAdapter interface, simplified-but-real computation (PVGIS API for solar, sector benchmarks for demand, NetworkX for distribution routing), template-based PFS generation with no LLM synthesis (see origin: `docs/brainstorms/2026-05-01-minigrid-pfs-platform-requirements.md`).

## Problem Statement

The Megaza v2 PFS (`Megaza-60kWp-PFS-v2-Revised (1).docx`) is a solid desktop screening document but has critical quantitative gaps:
- Demand scenarios are "TBC" throughout Section 5.2
- No distribution network design or costing (the single biggest functional gap)
- No carbon assessment or revenue tail
- No 25-year financial model — only screening ranges
- No grid-arrival scenario analysis despite Megaza's on-grid classification

These gaps exist because each section requires computation that manual desktop study cannot deliver. A platform that runs these computations systematically closes the gaps for any site, not just Megaza.

## Proposed Solution

A modular Python CLI tool organized around an adapter registry. Each computational module (demand, solar, sizing, distribution, carbon, financial, grid-arrival) registers as an adapter with a standard interface. An orchestrator resolves the dependency DAG and executes adapters in order. A PFS generator consumes all adapter outputs and renders a 15-section document from Jinja templates.

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  CLI Entry Point (run.py)                           │
│  $ python run.py --site sites/megaza.json           │
├─────────────────────────────────────────────────────┤
│  Orchestrator                                       │
│  - Loads site data                                  │
│  - Resolves adapter dependency DAG                  │
│  - Executes adapters in topological order           │
│  - Collects outputs into shared context             │
├─────────────────────────────────────────────────────┤
│  Adapter Registry                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐    │
│  │ Demand   │ │ Solar    │ │ Grid-Arrival     │    │
│  │ (R2)     │ │ (R3)     │ │ (R8)             │    │
│  └────┬─────┘ └────┬─────┘ └──────────────────┘    │
│       │             │         ← Parallel Group 1     │
│  ┌────▼─────────────▼─┐  ┌────────────────────┐    │
│  │ Hybrid Sizing (R4) │  │ Distribution (R5)  │    │
│  └────────┬───────────┘  └────────┬───────────┘    │
│           │         ← Parallel Group 2  │            │
│  ┌────────▼─────┐                       │            │
│  │ Carbon (R6)  │                       │            │
│  └────────┬─────┘  ← Group 3           │            │
│  ┌────────▼─────────────────────────────▼──┐        │
│  │ Financial Model (R7)                    │        │
│  └────────────────────┬────────────────────┘        │
│                       │  ← Sequential                │
│  ┌────────────────────▼────────────────────┐        │
│  │ PFS Generator (R9)                      │        │
│  │ - Jinja templates per section           │        │
│  │ - Gap markers for missing data          │        │
│  │ - Output: Markdown + DOCX               │        │
│  └─────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

### Adapter Dependency DAG

```
R2 (Demand) ──────┬──→ R4 (Hybrid Sizing) ──→ R6 (Carbon) ──┐
R3 (Solar) ───────┘              │                            │
R2 (Demand) ──→ R5 (Distribution) ─────────────────────────→ R7 (Financial) ──→ R9 (PFS)
R8 (Grid-Arrival) [independent] ─────────────────────────────────────────────→ R9 (PFS)
```

Execution order:
1. **Parallel Group 1:** R2, R3, R8 (no upstream dependencies)
2. **Parallel Group 2:** R4 (needs R2+R3), R5 (needs R2)
3. **Group 3:** R6 (needs R4)
4. **Sequential:** R7 (needs R4+R5+R6)
5. **Final:** R9 (needs all)

### Project Structure

```
Minigrids/
├── src/
│   ├── __init__.py
│   ├── cli.py                         # CLI entry point with argparse
│   ├── orchestrator.py                # DAG resolver + adapter execution
│   ├── registry.py                    # BaseAdapter ABC + tool registry
│   ├── models/
│   │   ├── __init__.py
│   │   ├── site.py                    # SiteData dataclass (input schema)
│   │   ├── demand.py                  # DemandAssessmentOutput
│   │   ├── solar.py                   # SolarResourceOutput
│   │   ├── sizing.py                  # HybridSizingOutput
│   │   ├── distribution.py            # DistributionDesignOutput
│   │   ├── carbon.py                  # CarbonAssessmentOutput
│   │   ├── financial.py               # FinancialModelOutput
│   │   └── grid_arrival.py            # GridArrivalOutput
│   ├── adapters/
│   │   ├── __init__.py
│   │   ├── demand_assessment.py       # R2: sector benchmarks → load profiles
│   │   ├── solar_resource.py          # R3: PVGIS API → monthly/hourly resource
│   │   ├── hybrid_sizing.py           # R4: demand + solar → PV/battery sizing
│   │   ├── distribution_routing.py    # R5: OSMnx/buildings → network design + BoQ
│   │   ├── carbon_assessment.py       # R6: diesel displacement → tCO2e + revenue
│   │   ├── financial_model.py         # R7: all costs → 25yr cashflow + metrics
│   │   └── grid_arrival.py            # R8: evidence → ESMAP scenario recommendation
│   ├── data/
│   │   ├── load_benchmarks.json       # Sector load benchmarks (build spec Table 3.3)
│   │   ├── load_shapes/
│   │   │   ├── residential.json       # Hourly shape: evening peak
│   │   │   ├── commercial.json        # Hourly shape: daytime
│   │   │   ├── institutional.json     # Hourly shape: working hours
│   │   │   └── productive_use.json    # Hourly shape: daytime intensive
│   │   ├── conductor_library.json     # Conductor specs + costs (build spec §4.3)
│   │   ├── pole_library.json          # Pole types + costs
│   │   └── financial_defaults.json    # Discount rate, inflation, OPEX %, etc.
│   └── generator/
│       ├── __init__.py
│       ├── pfs_generator.py           # Assembles sections from adapter outputs
│       ├── docx_writer.py             # python-docx formatting
│       └── templates/
│           ├── 01_executive_summary.md.j2
│           ├── 02_project_context.md.j2
│           ├── 03_site_description.md.j2
│           ├── 04_demand_assessment.md.j2
│           ├── 05_resource_assessment.md.j2
│           ├── 06_environmental_social.md.j2
│           ├── 07_generation_design.md.j2
│           ├── 08_distribution_design.md.j2
│           ├── 09_capex_opex.md.j2
│           ├── 10_financial_model.md.j2
│           ├── 11_carbon_assessment.md.j2
│           ├── 12_regulatory_grid_arrival.md.j2
│           ├── 13_risk_register.md.j2
│           ├── 14_implementation_roadmap.md.j2
│           ├── 15_recommendation.md.j2
│           └── annexes.md.j2
├── sites/
│   └── megaza.json                    # Megaza site data (structured input)
├── output/                            # Generated PFS documents land here
├── requirements.txt
└── run.py                             # Quick-start: python run.py --site sites/megaza.json
```

### Implementation Phases

#### Phase 1: Foundation — Project Structure, Registry, Site Data Schema

**Goal:** Establish the adapter pattern, define all data models, create the Megaza site data file, and extract reference data from the build spec.

**Tasks:**

1.1. **Create project skeleton** — `src/__init__.py`, `src/models/__init__.py`, `src/adapters/__init__.py`, `src/generator/__init__.py`, `requirements.txt`, `run.py`

1.2. **Define BaseAdapter ABC** — `src/registry.py`
```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any

class AdapterKind(Enum):
    TOOL = "tool"
    AGENT = "agent"

class BaseAdapter(ABC):
    name: str
    kind: AdapterKind = AdapterKind.TOOL
    dependencies: list[str] = []  # names of adapters that must run first

    @abstractmethod
    def is_available(self) -> bool: ...

    @abstractmethod
    def validate_inputs(self, site_data, context: dict) -> list[str]: ...

    @abstractmethod
    def run(self, site_data, context: dict) -> Any: ...

    @abstractmethod
    def get_standardized_outputs(self) -> dict: ...
```

1.3. **Define SiteData input schema** — `src/models/site.py`

This is the critical gap identified by SpecFlow analysis. The schema must cover:

```python
@dataclass
class SiteData:
    # Identity
    site_name: str
    district: str
    province: str
    country: str
    coordinates: tuple[float, float]  # (lat, lon)
    developer: str

    # Settlement
    population: int
    mapped_structures: int
    settlement_radius_m: float  # for OSMnx query boundary

    # Customer segmentation
    customers: list[CustomerSegment]  # each has: category, count, tier, load_kw (optional)

    # Anchor loads
    anchors: list[AnchorLoad]  # each has: type, name, estimated_load_kw (optional), operating_hours

    # Grid status
    grid_status: str  # "off_grid" | "on_grid_expected" | "grid_connected"
    grid_arrival_evidence: GridArrivalEvidence  # timeline, funding, EDM track record

    # Financial assumptions (overridable, with defaults from financial_defaults.json)
    tariff_scenarios: dict  # low/base/high USD/kWh
    discount_rate: float
    inflation_rate: float
    fx_rate: float  # MZN/USD
    financing_structure: dict  # grant_pct, debt_pct, equity_pct

    # E&S context flags
    protected_area_overlap: bool
    flood_risk: str  # "low" | "moderate" | "high"
    biodiversity_risk: str
    ifc_category: str  # "A" | "B" | "C"

    # Existing data (from v2 PFS or field surveys)
    existing_pfs_metrics: dict  # for calibration comparison
```

1.4. **Create Megaza site data file** — `sites/megaza.json`

Manually constructed from the v2 PFS proxy estimates and AFCEN site information document:
- Coordinates: (-17.1439, 35.3189)
- Population: ~2,641 (from v2 PFS Table 5-1)
- Structures: ~844
- Households: ~518 (83 improved tier + 435 basic tier)
- Anchors: hospital (1), primary school (1), secondary school (1), administration (1), fish chilling (1), grain mill (1), rice/cotton processing (1)
- Commercial: ~16 shops, ~2 bars/restaurants, ~1 barber
- Grid status: "on_grid_expected"
- Existing PFS metrics: 60 kWp, ~USD 230k CAPEX, USD 0.40/kWh tariff (for calibration)

1.5. **Extract build spec reference data into JSON files:**

- `src/data/load_benchmarks.json` — Sector load benchmarks from build spec Table 3.3:
  - Hospital: 15-50 kW (based on AKTH/LASUTH analogues scaled to rural)
  - Primary/secondary school: 5-15 kW
  - Administration: 3-8 kW
  - Fish chilling: 10-30 kW (GIZ cold chain studies)
  - Grain mill: 15-40 kW (EnDev Africa records)
  - Rice/cotton processing: 20-60 kW
  - Shop: 0.5-2 kW
  - Bar/restaurant: 1-3 kW
  - Residential improved tier: 0.3-0.8 kW peak
  - Residential basic tier: 0.1-0.3 kW peak

- `src/data/load_shapes/` — Hourly load shape templates (24-hour normalized profiles):
  - Residential: evening peak (18:00-22:00), morning dip
  - Commercial: daytime (08:00-18:00)
  - Institutional: working hours (07:00-17:00), hospital 24hr base
  - Productive use: daytime intensive (06:00-18:00)

- `src/data/conductor_library.json` — From build spec Section 4.3:
  - LV conductors: ACSR Rabbit (6.2 A/mm², 0.85 Ω/km), Dog, etc.
  - Per class: ampacity, resistance, reactance, weight, cost USD/km
  - Pole library: concrete (USD 80-150/pole), treated wood (USD 40-80/pole)
  - Service drop: USD 150-300 per connection including meter

- `src/data/financial_defaults.json`:
  - Discount rate: 10% (per v2 PFS)
  - Inflation: 5% (Mozambique average)
  - FX rate: 64 MZN/USD (2026 approximate)
  - OPEX: 3-4% of CAPEX/year for generation O&M
  - Battery replacement: Year 10 at 60% of original cost
  - Inverter replacement: Year 12 at 40% of original cost
  - Construction multiplier: 1.45 (rural Mozambique)
  - Soft costs: 12% of hard costs

1.6. **Build orchestrator** — `src/orchestrator.py`
- Loads site data from JSON file
- Discovers registered adapters
- Resolves dependency DAG using topological sort
- Executes adapters in order, passing shared context dict
- Handles adapter failures gracefully: logs error, marks adapter as failed, downstream adapters that depend on it skip with gap markers
- Reports execution summary

1.7. **Define all adapter output dataclasses** — `src/models/*.py`

Each output model is a Python dataclass that the PFS generator can consume. Key schemas:

- **DemandAssessmentOutput**: `peak_load_kw`, `annual_demand_kwh`, `hourly_profile_8760` (list[float]), `customer_segments` (list with per-segment demand), `growth_scenarios` (dict with conservative/base/growth annual demand)
- **SolarResourceOutput**: `monthly_ghi` (12 floats), `monthly_dni`, `monthly_temp`, `annual_ghi_kwh_m2`, `optimal_tilt_deg`, `specific_yield_kwh_per_kwp`, `annual_generation_kwh`, `loss_breakdown` (dict)
- **HybridSizingOutput**: `pv_capacity_kwp`, `battery_capacity_kwh`, `inverter_capacity_kwac`, `dc_ac_ratio`, `hourly_dispatch` (8760 array), `capacity_utilization_pct`, `curtailment_pct`, `autonomy_hours`, `unmet_demand_pct`
- **DistributionDesignOutput**: `total_line_length_m`, `line_lengths_by_class` (dict), `pole_count`, `bill_of_quantities` (list of BoQ items), `total_network_cost_usd`, `cost_per_connection_usd`, `network_geojson` (dict), `voltage_drop_max_pct`, `method_used` (str: "osm_steiner" | "building_mst" | "radial_estimate")
- **CarbonAssessmentOutput**: `annual_emission_reductions_tco2e`, `crediting_period_years`, `total_eligible_tco2e`, `revenue_by_scenario` (dict: zero/conservative/market/premium), `npv_carbon_revenue` (dict), `recommended_methodology`, `methodology_rationale`, `validation_cost_estimate_usd`
- **FinancialModelOutput**: `capex_breakdown` (dict), `total_capex_usd`, `annual_opex_usd`, `cashflow_25yr` (list of yearly dicts), `lcoe_usd_kwh`, `project_irr`, `equity_irr`, `npv_at_10pct`, `dscr_min`, `simple_payback_years`, `subsidy_required_usd`, `subsidy_per_connection_usd`, `subsidy_pct_capex`, `sensitivity_results` (dict), `tariff_scenario_results` (dict)
- **GridArrivalOutput**: `recommended_scenario` (str), `scenario_scores` (dict of 7 options with scores), `rationale` (str), `evidence_summary` (dict), `recommended_design_implications` (str), `transition_timeline` (str)

**Estimated effort:** 3-4 hours. This is the heaviest phase because it establishes every contract.

**Success criteria:**
- [ ] `python run.py --site sites/megaza.json` loads site data and prints adapter execution plan
- [ ] All dataclass models importable and serializable to JSON
- [ ] Megaza site data file validates against schema
- [ ] Reference data files contain credible benchmarks

---

#### Phase 2: Independent Adapters — Demand, Solar, Grid-Arrival

**Goal:** Build the three adapters with no upstream dependencies so they can run in parallel.

**Tasks:**

2.1. **Demand Assessment Adapter** — `src/adapters/demand_assessment.py`

Input: SiteData (customer segments, anchor loads)
Output: DemandAssessmentOutput

Algorithm:
1. For each customer segment, look up peak load from `load_benchmarks.json` (use midpoint of range, or site-provided value if available)
2. Apply diversity factors by customer count (per build spec: anchor 1.0, residential drops to ~0.4 at 50+ customers)
3. Calculate diversified peak load (kW)
4. For each customer type, load hourly shape from `load_shapes/` templates
5. Scale shapes to match segment peak demand
6. Sum all customer hourly profiles → composite 8760 hourly load profile
7. Calculate annual energy demand (sum of hourly × 1hr intervals)
8. Generate three growth scenarios: conservative (2%/yr), base (5%/yr), growth (8%/yr) over 25 years

For Megaza, expected output:
- ~518 households × 0.15-0.5 kW diversified + anchors (hospital ~25 kW, schools ~10 kW each, mills ~25 kW, fish chilling ~20 kW) → diversified peak likely 40-80 kW range
- Should land near the v2 PFS's 60 kWp sizing basis

2.2. **Solar Resource Adapter** — `src/adapters/solar_resource.py`

Input: SiteData (coordinates)
Output: SolarResourceOutput

Algorithm:
1. Call PVGIS MRcalc API: `GET https://re.jrc.ec.europa.eu/api/v5_3/MRcalc?lat={lat}&lon={lon}&horirrad=1&mr_dni=1&avtemp=1&outputformat=json`
2. Parse monthly GHI, DNI, temperature from response
3. Average across years (2005-2023) to get 12-month profile
4. Calculate optimal tilt (rule of thumb: abs(latitude) for fixed tilt, so ~17° for Megaza)
5. Calculate specific yield: GHI × performance ratio (0.77 per v2 PFS)
6. Calculate annual generation for a given PV capacity: `capacity_kwp × specific_yield`
7. Build loss breakdown: temperature (7%), soiling (2.5%), wiring (2.5%), inverter (2.5%), battery (8%), availability (1.5%), degradation Year 1 (1.75%)

Failure strategy: If PVGIS API fails, fall back to v2 PFS values (GHI 1,810 kWh/m²/yr, specific yield 1,620 kWh/kWp/yr) with a warning flag.

For Megaza, expected output:
- Annual GHI: ~1,810 kWh/m²/yr (confirmed by PVGIS test call)
- Specific yield: ~1,550-1,700 kWh/kWp/yr
- Should match v2 PFS Table 4-1 closely

2.3. **Grid-Arrival Adapter** — `src/adapters/grid_arrival.py`

Input: SiteData (grid_status, grid_arrival_evidence)
Output: GridArrivalOutput

Algorithm — rule-based scoring rubric for 7 ESMAP options:
1. Score each option on 5 dimensions (0-10 each):
   - Grid timeline certainty (funded + contractor mobilised = high; aspiration only = low)
   - Financial viability under scenario (does the project NPV survive?)
   - Regulatory alignment (does Decree 93/2021 support this option?)
   - Implementation complexity
   - Stakeholder acceptability
2. Weight dimensions (timeline certainty: 30%, financial: 25%, regulatory: 20%, complexity: 15%, stakeholder: 10%)
3. Rank options by weighted score
4. Recommend highest-scoring option with rationale

For Megaza: classified as "on_grid_expected" but with no confirmed timeline, no funding commitment, no contractor mobilisation. Given Zambezia Province's track record of grid extension delays, the engine should likely recommend "No arrival" or "Overlap risk — recommend smaller transitional minigrid" unless the evidence input indicates near-term grid arrival is credible.

**Estimated effort:** 3-4 hours total for all three adapters.

**Success criteria:**
- [ ] Demand adapter produces 8760 hourly profile and diversified peak for Megaza
- [ ] Solar adapter successfully calls PVGIS API and returns monthly data
- [ ] Solar adapter falls back gracefully when API is unavailable
- [ ] Grid-arrival adapter scores all 7 options and picks a recommendation
- [ ] All outputs serialize to JSON for inspection

---

#### Phase 3: Dependent Adapters — Hybrid Sizing, Distribution Routing

**Goal:** Build adapters that depend on Phase 2 outputs.

**Tasks:**

3.1. **Hybrid Sizing Adapter** — `src/adapters/hybrid_sizing.py`

Input: DemandAssessmentOutput (hourly profile), SolarResourceOutput (monthly GHI, specific yield)
Output: HybridSizingOutput

Algorithm:
1. Generate hourly solar production profile:
   - Use monthly GHI from R3, distribute across hours using a bell-curve solar shape (sunrise-sunset, peak at solar noon)
   - Scale to 1 kWp of PV capacity
2. Iteratively size PV capacity:
   - Start at `peak_demand_kw / 0.8` (80% solar fraction target)
   - For each candidate PV size, simulate 8760 hours:
     - Solar production = PV_kWp × hourly_solar_factor
     - Excess → charge battery (up to battery capacity, charge rate limit)
     - Deficit → discharge battery (down to minimum SoC 20%)
     - Remaining deficit → unmet demand
   - Target: ≤5% unmet demand, ≤15% curtailment
3. Size battery: autonomy hours × evening peak demand
   - Start at 3 hours × evening peak kW
   - Adjust based on simulation results
4. Inverter capacity: max(peak_demand_kw, PV_kWp × 0.83) — DC/AC ratio ~1.2
5. Output dispatch time series and summary metrics

For Megaza, expected output:
- PV: 55-70 kWp (v2 PFS: 60 kWp — should be close)
- Battery: 100-180 kWh usable (v2 PFS: 120-180 kWh)
- Inverter: ~50 kWac (v2 PFS: ~50 kWac)

3.2. **Distribution Routing Adapter** — `src/adapters/distribution_routing.py`

Input: SiteData (coordinates, settlement_radius_m, customer segments), DemandAssessmentOutput (diversified demand per segment)
Output: DistributionDesignOutput

Algorithm — three-tier approach with automatic fallback:

**Tier 1: OSMnx road network + Steiner tree** (preferred, research-confirmed approach)
```
1. ox.graph_from_point(center, dist=settlement_radius_m, network_type="all", retain_all=True)
2. Convert to undirected: ox.convert.to_undirected(G)
3. Get building footprints: ox.features_from_point(center, tags={"building": True}, dist=radius)
4. Snap building centroids to nearest road nodes
5. Add powerhouse node at demand-weighted centroid
6. Run nx.approximation.steiner_tree(G_undirected, terminals, weight="length")
7. Decompose into feeders, size conductors per segment
```

**Tier 2: Building centroids + MST** (fallback when roads are sparse)
```
1. Get building footprints from OSMnx
2. Build Delaunay triangulation graph over centroids
3. Filter edges > 500m (max realistic LV span)
4. Run MST (nx.minimum_spanning_tree)
5. Apply terrain multiplier 1.25 (rolling terrain, Zambezia lowlands)
6. Size conductors, count poles
```

**Tier 3: Radial estimate** (fallback when building data is also sparse)
```
1. Estimate from heuristics: 25m LV line per connection (literature benchmark)
2. Total line = n_customers × 25m × terrain_multiplier
3. Add 20% for spine/feeder overhead
4. Apply conductor cost per meter
```

The adapter tries Tier 1, falls back to Tier 2 if <10 road segments found, falls back to Tier 3 if <10 buildings found. Records which method was used.

Conductor sizing per segment:
1. Calculate downstream diversified peak demand (kW)
2. Convert to current at 0.4 kV: I = P / (√3 × V × pf) where pf = 0.85
3. Select smallest conductor from `conductor_library.json` where ampacity ≥ I
4. Verify voltage drop: ΔV = I × R × L / 1000 ≤ 7% of nominal
5. If voltage drop exceeded, upsize conductor

BoQ compilation:
- Conductor: length per class × USD/km
- Poles: total_line_length / avg_span (40m) × USD/pole
- Service drops: n_customers × USD/connection
- Protection: 6% of conductor + pole cost
- Construction multiplier: 1.45 (rural Mozambique)
- Soft costs: 12% of hard costs

For Megaza, expected output:
- Likely falls to Tier 2 or Tier 3 (sparse OSM roads in Morrumbala)
- Total line length: 3-8 km (v2 PFS doesn't specify; Mugulama reference: 5.9 km for 231 customers)
- Cost per connection: USD 300-800 (industry benchmark: USD 600-1,200)
- Total distribution cost: USD 30,000-50,000 (v2 PFS: USD 34,000 for distribution)

**Estimated effort:** 4-5 hours. Distribution routing is the most complex adapter.

**Success criteria:**
- [ ] Hybrid sizing produces PV/battery/inverter within 20% of v2 PFS values
- [ ] Distribution adapter successfully queries OSMnx for Megaza coordinates
- [ ] Distribution adapter falls back gracefully to Tier 2 or 3 when data is sparse
- [ ] BoQ produces credible cost-per-connection figure
- [ ] Network GeoJSON is valid and can be loaded in a GIS viewer

---

#### Phase 4: Downstream Adapters — Carbon, Financial Model

**Goal:** Build adapters that consume Phase 3 outputs to complete the financial picture.

**Tasks:**

4.1. **Carbon Assessment Adapter** — `src/adapters/carbon_assessment.py`

Input: HybridSizingOutput (annual generation kWh), SiteData (country)
Output: CarbonAssessmentOutput

Algorithm:
1. Calculate displaced diesel:
   - Assume counterfactual: diesel gensets serving equivalent load
   - Diesel consumption = annual_generation_kwh / genset_efficiency (0.33)
   - Litres diesel = diesel_consumption_kwh / diesel_energy_density (10.0 kWh/litre)
2. Emission reductions:
   - Diesel EF: 2.68 kg CO2/litre (IPCC 2006) + 0.12 kg CO2e for CH4/N2O
   - Annual reduction (tCO2e) = litres × 2.80 / 1000
3. Crediting period: 7 years (renewable once) per Verra/GS standards
4. Total eligible tonnage = annual_reduction × crediting_period
5. Revenue tail by price scenario:
   - Zero: USD 0/tCO2e
   - Conservative: USD 5/tCO2e
   - Market: USD 12/tCO2e
   - Premium: USD 20/tCO2e
6. Apply issuance lag: first credits Year 3 (24-36 month validation cycle)
7. NPV of carbon revenue at discount rate
8. Methodology recommendation (rule-based):
   - Off-grid rural electrification + residential/small productive use → Verra VM0103
   - Strong SDG impact framing → Gold Standard TPDDTEC
   - Small-scale renewable → CDM AMS-I.L (fallback)
   - Pick based on: project size (<15 MW → small scale eligible), country Article 6 readiness, buyer preference

For Megaza:
- ~80-85 MWh/year served → ~24,000 litres diesel displaced → ~67 tCO2e/year
- At USD 12/tCO2e = ~USD 804/year carbon revenue
- Recommended methodology: Verra VM0103 (standard off-grid RE rural electrification)

4.2. **Financial Model Adapter** — `src/adapters/financial_model.py`

Input: HybridSizingOutput, DistributionDesignOutput, CarbonAssessmentOutput, DemandAssessmentOutput, SiteData
Output: FinancialModelOutput

Algorithm:
1. **CAPEX build-up:**
   - PV modules: pv_kwp × USD 470/kWp (per v2 PFS Table 9-1 implied)
   - Inverters: inverter_kwac × USD 360/kWac
   - Mounting: pv_kwp × USD 200/kWp
   - BoS: pv_kwp × USD 267/kWp
   - Battery + EMS: battery_kwh × USD 322/kWh (per v2 PFS: USD 58k for 180 kWh)
   - Distribution: from R5 BoQ total
   - Civil works: USD 15,000 (fixed for small rural mini-grid)
   - Owner's/developer costs: 12% of above
   - EPC margin: 8% of above
   - Contingency: 7.5% of all above
2. **OPEX:**
   - O&M: 3.5% of generation CAPEX/year
   - Distribution O&M: 2% of distribution CAPEX/year
   - Site security: USD 1,200/year
   - Remote monitoring: USD 650/year
   - Insurance: 0.5% of total CAPEX/year
3. **Revenue:**
   - Year 1 energy sold = annual_demand_kwh × (1 - technical_losses_pct)
   - Revenue = energy_sold × tariff (three scenarios from site data)
   - Connection growth: per demand growth scenarios
   - Carbon revenue: from R6, starting Year 3
4. **Replacement cycles:**
   - Battery: Year 10, cost = 60% of original battery CAPEX
   - Inverter: Year 12, cost = 40% of original inverter CAPEX
5. **25-year cashflow:**
   - Year 0: -CAPEX (split by grant/debt/equity per financing structure)
   - Years 1-25: revenue - OPEX - debt service + carbon revenue
   - Debt: concessional at 5% over 15 years
6. **Metrics:**
   - LCOE = NPV(costs) / NPV(energy_generated) — real, USD/kWh
   - Project IRR = IRR of total project cashflows (pre-tax)
   - Equity IRR = IRR of equity cashflows (after debt service)
   - NPV at 10% discount rate
   - DSCR = net operating income / debt service (minimum over debt period)
   - Simple payback = years until cumulative cashflow turns positive
   - Subsidy required = CAPEX × grant_pct / n_customers (USD/connection)
7. **Sensitivity analysis** — vary 6 parameters ±20%:
   - Total CAPEX, average tariff, solar yield, battery replacement cost, demand uptake, discount rate
   - Record IRR impact for tornado chart data

For Megaza, expected output:
- Total CAPEX: ~USD 220,000-250,000 (v2 PFS: ~USD 230,000)
- LCOE: USD 0.28-0.40/kWh (v2 PFS range)
- Project IRR: 6-10% (v2 PFS range)
- Subsidy required: ~40% of CAPEX → ~USD 175/connection

**Estimated effort:** 3-4 hours.

**Success criteria:**
- [ ] Carbon adapter produces tCO2e/year and revenue under 4 price scenarios
- [ ] Financial model produces internally consistent LCOE, IRR, NPV
- [ ] CAPEX within 15% of v2 PFS benchmark (~USD 230k)
- [ ] LCOE within v2 PFS range (USD 0.28-0.40/kWh)
- [ ] 25-year cashflow is exportable as CSV/JSON

---

#### Phase 5: PFS Generator — Templates and Document Assembly

**Goal:** Build the template engine that assembles all adapter outputs into a 15-section PFS document.

**Tasks:**

5.1. **PFS Generator core** — `src/generator/pfs_generator.py`

Algorithm (from build spec Section 6.2):
1. COLLECT: gather all adapter outputs for the site from the orchestrator context
2. RENDER: for each of 15 sections, load Jinja template and render with adapter outputs
   - If required adapter output is missing, render section with gap markers: `[DATA GAP: {adapter_name} did not produce output. Reason: {error}. Action required: {next_step}]`
3. PACKAGE: concatenate rendered sections into full Markdown document

5.2. **Write 16 Jinja templates** — `src/generator/templates/*.md.j2`

Each template receives the full context (site data + all adapter outputs) and renders a PFS section. Key templates:

- **01_executive_summary.md.j2**: Site name, recommendation (Go/Conditional Go/Redesign/No-Go based on IRR threshold), headline metrics (capacity, CAPEX, LCOE, IRR, subsidy, cost/connection, tCO2e/yr)
- **04_demand_assessment.md.j2**: Customer segmentation table, peak load, annual demand, 3 growth scenarios, hourly load profile description, productive-use opportunities
- **07_generation_design.md.j2**: PV capacity, battery, inverter, DC/AC ratio, monthly generation table, dispatch summary, loss breakdown table, performance ratio
- **08_distribution_design.md.j2**: Network topology description, method used, total line length, conductor sizing table, BoQ table, cost-per-connection, voltage drop, expansion stubs
- **10_financial_model.md.j2**: CAPEX breakdown table, OPEX table, revenue model, 25-year cashflow summary, LCOE/IRR/NPV/DSCR metrics, financing structure, sensitivity tornado data
- **11_carbon_assessment.md.j2**: Emission reductions, methodology recommendation, revenue by scenario, issuance timeline, validation costs
- **12_regulatory_grid_arrival.md.j2**: Regulatory framework (from site data), grid-arrival scenario analysis, recommended transition strategy, ESMAP option scores
- **13_risk_register.md.j2**: Consolidate all adapter warning flags + standard risk categories from template
- **15_recommendation.md.j2**: Go/Conditional Go/Redesign/No-Go with conditions, citing specific adapter outputs

Decision logic for recommendation:
- **Go**: IRR ≥ 8% under base case, no critical gaps, subsidy ≤ 50% of CAPEX
- **Conditional Go**: IRR ≥ 5% OR viable under blended finance, some gaps identified
- **Redesign**: IRR < 5% but demand fundamentals support a different configuration
- **No-Go**: Fatal flaw identified (e.g., no demand, protected area, imminent grid arrival with no viable transition)

5.3. **DOCX Writer** — `src/generator/docx_writer.py`

Convert the rendered Markdown to DOCX using python-docx:
- Parse Markdown sections (headings, tables, bullets, bold/italic)
- Apply consistent formatting (font: Calibri, heading styles, table borders)
- Insert cover page with site name, capacity, date, developer
- Page numbers, headers with document title
- Table of contents placeholder

Alternative approach (simpler): render Markdown, then convert via `pandoc` if available, fall back to python-docx manual formatting.

5.4. **Annexes** — `src/generator/templates/annexes.md.j2`
- Annex A: Source coverage matrix (every input → source + provenance)
- Annex B: Monthly solar resource data table
- Annex C: Hourly dispatch series summary (daily averages by month)
- Annex D: CAPEX/OPEX detailed breakdown
- Annex E: Sensitivity analysis full results
- Annex F: Network GeoJSON reference (file path)
- Annex G: Adapter version log

**Estimated effort:** 4-5 hours.

**Success criteria:**
- [ ] PFS generator produces complete Markdown document with all 15 sections
- [ ] Gap markers appear for any missing adapter output (not silent omission)
- [ ] DOCX output opens correctly in Word/LibreOffice
- [ ] Tables are properly formatted in both Markdown and DOCX
- [ ] Cover page and table of contents are present in DOCX

---

#### Phase 6: Megaza Pilot — Integration, Validation, Output

**Goal:** Run the complete pipeline for Megaza and produce the v3 PFS.

**Tasks:**

6.1. **Integration test** — Run `python run.py --site sites/megaza.json --output output/megaza_v3/`
- Verify all adapters execute in correct order
- Verify no adapter crashes
- Verify PFS document is generated

6.2. **Calibration check** — Compare platform outputs to v2 PFS benchmarks:

| Metric | v2 PFS Value | Platform Output | Acceptable Range |
|--------|-------------|-----------------|------------------|
| PV Capacity | 60 kWp | ? | 45-80 kWp |
| Battery | 120-180 kWh | ? | 80-250 kWh |
| CAPEX | ~USD 230,000 | ? | USD 180,000-300,000 |
| LCOE | USD 0.28-0.40/kWh | ? | USD 0.20-0.50/kWh |
| Project IRR | 6-10% | ? | 4-14% |
| Annual Generation | ~97 MWh | ? | 75-120 MWh |

If platform outputs are outside acceptable ranges, investigate and document the divergence in the PFS.

6.3. **Quality review of generated PFS** — Read through the complete v3 document:
- Verify no "TBC" remains
- Verify all tables have data
- Verify cross-references between sections are consistent
- Verify the executive summary accurately reflects section content
- Verify the recommendation (Go/Conditional Go/etc.) is justified by the numbers

6.4. **Add calibration commentary** — The v3 PFS should include a note in Section 1 (Executive Summary) or as an annex that explains how the platform's outputs relate to the v2 PFS screening values and where they diverge.

**Estimated effort:** 2-3 hours.

**Success criteria (from origin document):**
- [ ] Megaza v3 PFS has zero "TBC" fields
- [ ] Distribution section includes real topology with line lengths, conductor sizing, costed BoQ
- [ ] Financial model produces LCOE, IRR, NPV, subsidy-required — internally consistent
- [ ] Carbon section produces tCO2e/year and revenue under 4 price scenarios
- [ ] Grid-arrival section commits to a recommended transition strategy
- [ ] Platform architecture is extensible — adding a new site requires only a JSON file

## System-Wide Impact

### Interaction Graph

CLI invocation → Orchestrator loads site JSON → Orchestrator discovers adapters → Topological sort of dependency DAG → Execute Group 1 (R2, R3, R8 in parallel) → Execute Group 2 (R4, R5) → Execute Group 3 (R6) → Execute R7 → Execute R9 → Write Markdown + DOCX to output directory.

No callbacks, middleware, or event handlers. The system is a single-pass pipeline. Each adapter reads from the shared context dict and writes its output back. No side effects beyond file I/O.

### Error & Failure Propagation

- PVGIS API failure (R3): logged, R3 output marked as failed with fallback values, R4 runs with fallback solar data and warning flag
- OSMnx failure (R5): automatic fallback to Tier 2 (building MST) then Tier 3 (radial estimate), method recorded
- Any adapter failure: logged, context records `{adapter_name: {"status": "failed", "error": str}}`, downstream adapters check dependency status and either skip or run with degraded inputs
- PFS generator: renders gap markers for any failed adapter section, never omits a section silently
- No retry logic in v1 — fail fast, report clearly

### State Lifecycle Risks

Minimal — the system is stateless. Site data is read-only input. Adapter outputs live in an in-memory dict for the duration of the run. Output files are written at the end. No database, no persistent state, no concurrent access.

Risk: partial write of DOCX if process killed mid-generation. Mitigation: write to temp file, rename on completion.

## Acceptance Criteria

### Functional Requirements

- [ ] Platform loads any valid site JSON and runs the full adapter pipeline
- [ ] Each adapter produces typed output matching its dataclass schema
- [ ] PFS generator renders all 15 sections from adapter outputs
- [ ] Missing adapter data results in explicit gap markers, not silent omission
- [ ] Megaza v3 PFS fills all v2 "TBC" fields with computed values
- [ ] Distribution section includes network topology, BoQ, cost-per-connection
- [ ] Financial model includes 25-year cashflow, LCOE, IRR, NPV, sensitivity
- [ ] Carbon section includes tCO2e/year and 4 price scenario projections
- [ ] Grid-arrival section recommends one of 7 ESMAP options with rationale
- [ ] Output produced as both Markdown and DOCX

### Non-Functional Requirements

- [ ] Pipeline completes in under 5 minutes (dominated by API calls)
- [ ] No hardcoded Megaza-specific values in adapter code — all site-specific data comes from site JSON
- [ ] Reference data (benchmarks, conductor library, financial defaults) is in JSON files, not code
- [ ] Adding a new site requires only creating a new JSON file in `sites/`

### Quality Gates

- [ ] All adapter outputs for Megaza are within acceptable calibration ranges vs v2 PFS
- [ ] PFS document is readable and professionally structured
- [ ] No Python exceptions during normal execution with valid site data

## Dependencies & Prerequisites

- **Python 3.9+** (available on the system)
- **pip packages:** requests, jinja2, networkx, osmnx, geopandas, shapely, numpy, python-docx, scipy, geopy
- **External APIs:** PVGIS (no auth, 30 req/sec), OpenStreetMap via Overpass (no auth)
- **Reference documents:** Build spec Table 3.3 (load benchmarks) and Section 4.3 (conductor costs) — data extracted manually into JSON files in Phase 1

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OSM road data too sparse for Megaza | High | Medium | Three-tier fallback (OSM → buildings → radial estimate) |
| PVGIS API unavailable during run | Low | High | Fallback to hardcoded v2 PFS solar values with warning |
| Demand estimation diverges significantly from v2 | Medium | Medium | Benchmark library calibrated against v2 PFS and Mugulama ground truth |
| Distribution cost estimate unreliable due to sparse data | High | Medium | Tier 3 fallback uses literature benchmarks (25m/connection, USD 15/m) |
| python-docx produces poorly formatted DOCX | Medium | Low | Markdown is the primary output; DOCX is best-effort |
| osmnx/geopandas install issues on macOS | Low | Medium | Distribution adapter has Tier 3 fallback that needs no GIS libraries |

## Alternative Approaches Considered

1. **Full simulation stack (PySAM + REopt + pandapower)** — Rejected per origin document: too many heavy dependencies for screening-level fidelity. These can be integrated later as additional adapters.
2. **LLM-based PFS synthesis** — Rejected per origin document: template-based generation keeps output deterministic and auditable. Agent-written executive summary deferred to v2.
3. **Web UI instead of CLI** — Rejected per origin document: not needed for pilot. CLI is sufficient for developer use. UI deferred.

## Future Considerations

- **Additional sites:** Chululu and Mugulama PFS generation using the same platform
- **Mugulama calibration:** Compare platform output against actual built system (76 kWp, 5.9 km LV, 231 customers)
- **Full adapter integrations:** PySAM, REopt, PyPSA, pandapower as higher-fidelity alternatives
- **Demand Intelligence Agent:** LLM-based opportunity scanner (Layer 1 of build spec)
- **Carbon Methodology Selector Agent:** LLM-based methodology reader
- **Web UI / map visualization:** Display network GeoJSON, site markers, PFS sections
- **Database persistence:** PostgreSQL for multi-site portfolio management

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-05-01-minigrid-pfs-platform-requirements.md](docs/brainstorms/2026-05-01-minigrid-pfs-platform-requirements.md) — Key decisions carried forward: Python CLI with adapter registry pattern; simplified computation + real data where easy; template-based PFS generation; Megaza ground truth as validation target.

### Technical Research

- **PVGIS API:** `https://re.jrc.ec.europa.eu/api/v5_3/` — MRcalc for monthly, seriescalc for hourly. PVGIS-SARAH3 database confirmed for Mozambique. No auth required. 30 req/sec rate limit.
- **OSMnx:** `network_type="all"` with `retain_all=True` for rural areas. Must convert to undirected graph for Steiner tree. Use `weight="length"` not `weight="weight"`. Snap demand points to nearest nodes.
- **Distribution routing fallback:** Google Open Buildings V3 for building footprints when OSM roads are sparse. Delaunay triangulation + MST with 1.25x terrain multiplier for Zambezia lowlands. Literature benchmark: 25m LV line per connection.
- **Professional tools reference:** OffGridPlanner (Reiner Lemoine Institute), REM (MIT), Network Planner (Columbia) — all use building-centroid MST approach.

### External References

- ESMAP Mini-Grid Design Manual
- ESMAP Grid-Arrival Policy Framework (Investing in Mini Grids Now, Integrating Later)
- IRENA Innovation Outlook: Renewable Mini-grids
- RMI & GEAPP Partnerships for Power (May 2025)
- IPCC 2006 Guidelines Vol. 2 Ch. 2 — diesel emission factors
- Mozambique Decree 93/2021 — off-grid mini-grid framework
- Verra VM0103 methodology documentation
- Gold Standard TPDDTEC methodology documentation

### Megaza Reference Data

- `Megaza-60kWp-PFS-v2-Revised (1).docx` — v2 PFS baseline for calibration
- `AFCEN site information demo (2).docx` — raw site data for Mugulama, Chululu, Megaza
- `Mugulama_76kWp_Solar_Pre-Feasibility_Study (1).docx` — Mugulama PFS for future calibration
