# Nigeria Mini-Grid PFS Platform — Build Plan
### Adapted from the Mozambique Implementation · DARES-Aligned · Three-DisCo Pilot

---

## Executive Summary

This plan covers the full adaptation and build of the Mini-Grid Pre-Feasibility Study (PFS) Platform for Nigeria, specifically configured for the AEDC (Abuja), KEDCO (Kano), and Ikeja Electric (Lagos) DisCo franchise areas. The platform is derived from the proven Mozambique implementation and requires a structured Nigeria adaptation across data, computation engines, regulatory logic, and frontend configuration.

The build is organized into **5 phases over 18 weeks**, producing a platform that:
- Screens and ranks candidate interconnected minigrid sites across three DisCo franchise areas
- Runs the full 14-step analysis pipeline on each site, generating a DARES-compliant PFS
- Produces grant-ready financial models calibrated to NERC tariff methodology and DARES PBG structures
- Outputs tripartite agreement data sheets and concession packages for the MST process
- Embeds a digital twin foundation for live telemetry once sites are commissioned

Total estimated build effort: **~2,100 developer-hours** across backend, data engineering, and frontend.

---

## Phase Overview

| Phase | Name | Weeks | Key Output |
|-------|------|-------|------------|
| 1 | Foundation & Nigeria data layer | 1–3 | PostGIS database seeded with Nigerian settlement clusters |
| 2 | Engine adaptation | 4–8 | All 14 pipeline engines calibrated to Nigerian parameters |
| 3 | Regulatory & financial configuration | 9–11 | NERC/DARES-compliant financial model and concession engine |
| 4 | Frontend & portfolio management | 12–15 | Full wizard UI with three-DisCo map and pipeline management |
| 5 | Integration, testing & deployment | 16–18 | Live Docker deployment, validated against known sites |

---

## Phase 1 — Foundation & Nigeria Data Layer (Weeks 1–3)

### 1.1 Repository & Infrastructure Setup

Fork the Mozambique codebase and rename all references:
- Database: `moz` → `nigeria`
- Credentials: update `docker-compose.yml` for Nigeria environment
- Country directory: create `countries/nigeria/` mirroring `countries/mozambique/`
- Coordinate bounds: update API validation (`lat 4 to 14, lon 3 to 15` for Nigeria)
- Map center: FCT (`lat 9.07, lon 7.40`), zoom level 6

### 1.2 Nigeria Settlement Data (Data Pipeline Scripts 01–07)

**Primary source — World Bank DRE Atlas (Nigeria)**
The DRE Atlas CSV covers ~56,000 settlements with geometry, population, buildings, demand, and grid distances. This is the same source used in the Mozambique implementation and directly feeds `07_load_dre_atlas.py`.

Supplementary sources to ingest:
- **OpenStreetMap**: Nigerian roads, buildings, admin boundaries (states + LGAs)
- **WorldPop Nigeria**: Population raster at 100m resolution
- **PVGIS**: Solar resource via API (Nigeria is fully covered; no fallback needed in most areas)
- **ACLED Nigeria**: Conflict data for security risk heuristics — critical for North/Northeast regions within KEDCO franchise
- **Meta/World Bank RWI**: Relative Wealth Index for demand tier calibration
- **NERC Band classification data**: Feeder-level band (A–E) assignments for the three DisCos — obtain from DisCo data-sharing agreements

**Admin boundary remapping** (replace Mozambique province/district schema):
```
adm1_name → state (36 states + FCT)
adm2_name → LGA (774 LGAs)
```
Update all DB column references, API filters, and frontend labels accordingly.

**DisCo franchise boundary layers**: Load as a separate PostGIS layer with `disco_name`, `franchise_geom`, enabling site filtering by DisCo. Three polygons required:
- AEDC: FCT, Niger, Kogi, Nasarawa states
- KEDCO: Kano, Katsina, Jigawa states  
- Ikeja Electric: Northern Lagos (Abule Egba, Akowonjo, Ikeja, Ikorodu, Oshodi, Shomolu BUs)

**Feeder-level layer** (new, not in Mozambique implementation): Add a `feeders` PostGIS table with columns for `feeder_id`, `disco_name`, `band`, `supply_hours_day`, `atc_c_loss_pct`, `geom`. This enables the platform to identify which specific feeders are Band C/D/E candidates for interconnected minigrid deployment — the core DARES targeting criterion.

### 1.3 Country Config File

Create `countries/nigeria/config.json`:
```json
{
  "country": "Nigeria",
  "currency": "NGN",
  "exchange_rate": 1600,
  "population_growth_rate": 0.026,
  "persons_per_hh_rural": 5.0,
  "persons_per_hh_urban": 4.2,
  "national_electrification_rate": 0.60,
  "grid_tariff_usd_kwh": 0.12,
  "regulator": "NERC",
  "utility": "DisCos",
  "utility_mandate_km": 25,
  "concession_term_range": [15, 25],
  "esia_decree": "EIA Act Cap E12 LFN 2004 / NESREA Act 2007",
  "performance_standards": {
    "saidi_max_hours": 45,
    "saifi_max_events": 20,
    "availability_target": 0.95,
    "max_outage_hours": 4,
    "connection_ramp": [0.6, 0.7, 0.8, 0.85, 0.90]
  }
}
```

### 1.4 Solar Resource Fallback Values (Nigeria)

Update `solar_engine.py` fallback constants for Nigeria (used when PVGIS API unavailable):

**Monthly GHI (kWh/m², national average)**:
```python
# North (KEDCO) biased — higher irradiance
[210, 200, 205, 195, 185, 165, 145, 155, 185, 205, 215, 210]
# South (Ikeja) biased — lower, more cloud cover in rainy season
[175, 180, 175, 160, 140, 110, 95, 105, 145, 175, 180, 175]
```
Configure as region-aware lookup keyed to latitude bands.

**Monthly Temperature (°C)**:
```python
# North: [26, 28, 32, 35, 35, 30, 27, 27, 29, 31, 30, 27]
# South: [28, 29, 29, 28, 27, 25, 24, 24, 26, 27, 28, 28]
```

---

## Phase 2 — Engine Adaptation (Weeks 4–8)

### 2.1 Demand Engine

**Household size update**:
```python
PERSONS_PER_HH = {"rural": 5.0, "periurban": 4.5, "urban": 4.2}
```

**Tier assignment remapping for Nigeria**:
The Mozambique tier logic maps directly but needs recalibration for Nigeria's Band system. Add a parallel mapping:

| Nigeria Band | Supply Hours | MTF Tier Equivalent | Demand Category |
|--------------|-------------|---------------------|-----------------|
| Band A | 20h+ | Tier 4–5 | High — NOT a target (already served) |
| Band B | 16h+ | Tier 4 | High — edge case target |
| Band C | 12h | Tier 3 | Moderate — **primary DARES target** |
| Band D | 8h | Tier 2–3 | Low-moderate — **primary DARES target** |
| Band E | 4h | Tier 1–2 | Low — **primary DARES target** |
| Unserved | 0h | Tier 1 | Very low |

The tier input to the demand engine should be derivable from the feeder's Band classification, not just the settlement's urban/rural status.

**Nigeria-specific productive use anchors to add**:
- Petrol station forecourts (large commercial load, very common): 25 kWh/day
- Suya/food market cluster: 8 kWh/day
- POS/mobile money agent hub: 3 kWh/day
- Mosque (Kano/Abuja): 4 kWh/day prayer + AC load
- Nollywood film/video production facility (Lagos clusters): 15 kWh/day

**Growth rate**: Keep 5%/year as default but add a Nigeria override of 6%/year for urban clusters (consistent with DARES assumptions).

### 2.2 Financial Engine

This is the most significant adaptation. The Mozambique model uses ARENE/EDM structures; Nigeria requires NERC/DARES/IFC alignment.

**CAPEX unit cost updates (Nigeria 2024/2025)**:

| Component | Mozambique | Nigeria | Note |
|-----------|-----------|---------|------|
| PV modules | $580/kWp | $600/kWp | Import duty premium |
| Battery (LFP) | $285/kWh | $310/kWh | Supply chain |
| Inverter | $420/kWac | $440/kWac | |
| Mounting | $180/kWp | $195/kWp | |
| BoS | $220/kWp | $230/kWp | |
| Civil works | $18,000 fixed | $22,000 fixed | Labour + concrete costs |
| Meters (per HH) | $45 | $55 | Smart meter premium |

**Financing structure — DARES PBG model**:

Replace the Mozambique generic grant/debt/equity split with the DARES-specific structure:

```python
FINANCING_NIGERIA_DARES = {
    "grant_pct": 0.25,          # DARES PBG: ~25% of CAPEX (base case per PAD sensitivity)
    "grant_type": "results_based_capex_pct",
    "grant_currency": "USD",    # Critical: DARES pays in USD, not NGN
    "debt_pct": 0.40,
    "debt_rate": 0.085,         # IFC concessional revolver
    "debt_tenor_years": 15,
    "debt_grace_years": 2,
    "equity_pct": 0.35,
    "equity_hurdle_rate": 0.18  # Nigeria market minimum
}
```

Add a second financing scenario for the IFC revolver structure:
```python
FINANCING_IFC_REVOLVER = {
    "grant_pct": 0.25,
    "ifc_loan_pct_of_pbg": 0.80,  # IFC lends up to 80% of PBG amount
    "ifc_tenor_months": 24,        # Per tranche
    "ifc_facility_usd": 100_000_000
}
```

**Tariff methodology — MYTO alignment**:
Replace the simple `$0.45/kWh` baseline with NERC MYTO-derived tariff bands:
```python
TARIFF_NIGERIA = {
    "band_c_usd_kwh": 0.36,    # Approximate Band C residential
    "band_d_usd_kwh": 0.28,
    "band_e_usd_kwh": 0.22,
    "commercial_premium": 1.25,
    "productive_premium": 1.40,
    "anchor_negotiated": True   # Anchor customers negotiate directly
}
```

**Grant disbursement milestone model** (new — not in Mozambique):
```python
GRANT_MILESTONES = {
    "milestone_1": {"trigger": "construction_complete", "pct_of_grant": 0.50},
    "milestone_2": {"trigger": "customer_connections_verified", "pct_of_grant": 0.30},
    "milestone_3": {"trigger": "utilisation_threshold_year1", "pct_of_grant": 0.20},
    "max_months_to_milestone_1": 12  # Delist if exceeded
}
```

**Output metrics** — add Nigeria-specific outputs:
- Grant per connection (USD) — key DARES reporting metric
- ATC&C loss reduction (%) — key DisCo metric
- Generator sets displaced (number) — key DARES PDO indicator
- Cost-reflective tariff vs Band tariff gap (USD/kWh) — viability gap indicator

### 2.3 Grid Risk Engine

**Distance thresholds**: Keep ESMAP thresholds but add a fourth classification for Nigeria urban contexts:

| Level | Condition |
|-------|-----------|
| Interconnected | Already connected to DisCo — **target state** |
| Critical | dist_mv < 2 km |
| High | dist_mv 2–10 km OR planned < 5 km |
| Medium | dist_mv 10–25 km |
| Low | dist_mv >= 25 km |

**Replace ARENE scenarios with NERC equivalents**:

| Mozambique Scenario | Nigeria Equivalent | Regulatory Basis |
|--------------------|--------------------|-----------------|
| No Arrival | Isolated minigrid | NERC Mini-Grid Reg 2016 |
| Overlap Risk | Grid arrival — 12-month notice | DARES PBC 3.2 |
| Compensation & Exit | Negotiated asset transfer | NERC Reg + DisCo PPA |
| Side-by-Side | Embedded generation (< 1MW) | NERC Embedded Gen Regs |
| Distributor Conversion | Sub-franchise licence | NERC Franchising Guidelines |
| Producer Conversion | Wholesale to DisCo PPA | NERC Embedded Gen |
| **Hybrid Interconnection** | **Interconnected IMG** | **DARES primary model** |

**Weight the Hybrid Interconnection scenario highest** for Band C/D/E feeder sites — this is the DARES target model, not an edge case.

### 2.4 ESS Engine (Environmental & Social)

**Replace Mozambique regulatory framework**:
- ESIA decree: EIA Act Cap E12 LFN 2004, administered by NESREA
- ESIA category thresholds: align to NESREA project classification
- Protected areas: replace Mozambique national parks with Nigerian protected areas (Cross River National Park, Yankari Game Reserve, Borno State forest reserves, etc.)

**Replace stakeholder groups**:
- Remove: Regulos, SDAE, DPTADER, ARENE, EDM, FUNAE
- Add: Traditional rulers (Emir/Oba/Chief), LGA chairman, State Ministry of Energy, NERC, DisCo franchise manager, REA state coordinator, community women's groups (especially in KEDCO area), market association leaders, mosque/church leadership, NESREA state office

**GESI focus areas for Nigeria**:
- Female market traders (dominant in Kano and Lagos)
- Female-headed households (target for DARES demand-side subsidy via Social Registry)
- Women in agro-processing (groundnut oil, yam, cassava processing)
- Youth unemployment — ICT hubs and digital services anchors

### 2.5 Productive Use Engine

**Replace Mozambique's 11 sectors with Nigeria-relevant value chains**:

| # | Sector | Priority DisCo Area | Key Equipment |
|---|--------|--------------------|--------------| 
| 1 | Grain & cereal processing | KEDCO (Kano) | Maize mill, rice huller |
| 2 | Groundnut & oilseed | KEDCO | Oil press, groundnut decorticator |
| 3 | Cassava & yam processing | AEDC (Niger state) | Cassava grater, yam pounder |
| 4 | Cold chain — food & fish | Ikeja, KEDCO | Ice maker, cold room, vaccine fridge |
| 5 | Irrigation & water pumping | AEDC, KEDCO | Solar pump, drip irrigation |
| 6 | Light manufacturing | All | Welding, carpentry, tailoring |
| 7 | ICT & digital services | Ikeja, AEDC | POS clusters, internet café, printing |
| 8 | Healthcare | All | Vaccine fridge, diagnostic equipment |
| 9 | Education | All | Computers, projectors, lighting |
| 10 | Market electrification | All | Market lighting, refrigerated display |
| 11 | Public services | All | Street lighting, water pumping |

**Update equipment catalogue** with Nigerian supplier prices (Kutus Solar, Rensource, PowerGen, local EPC market rates).

**Job multipliers** — update to Nigerian Labour Force Survey norms:
- Direct O&M: 3–6 jobs per site (higher than Mozambique — labour-intensive market)
- Indirect PUE: 2–4 per high-relevance sector

### 2.6 Risk Engine

**Replace currency risk parameters**:
- Mozambique: MZN volatility (~15%/year)
- Nigeria: NGN volatility — much higher (~35–50%/year recent history)
- Add specific sub-risk: USD/NGN misalignment for grant disbursement (DARES pays in USD; developer revenues in NGN)

**Security risk** — significantly recalibrate for Nigeria:
- KEDCO franchise area (Kano, Katsina, Jigawa): elevated banditry risk, especially rural LGAs bordering Zamfara
- AEDC franchise area (Kogi, Niger, Nasarawa): moderate conflict risk in specific LGAs
- Ikeja franchise area: low security risk — urban Lagos
- Source: ACLED Nigeria dataset, updated quarterly

**Add regulatory risk sub-category** specific to Nigeria:
- Grid arrival notice compliance (DisCo honouring 12-month notice) — currently untested in practice
- NERC permit processing speed (portfolio batch processing — PBC 3.1 dependent)
- FX repatriation for developer profit extraction

---

## Phase 3 — Regulatory & Financial Configuration (Weeks 9–11)

### 3.1 Concession Engine — NERC Adaptation

Replace the 14-section ARENE concession data sheet with a NERC/DARES-compliant equivalent:

| Section | Mozambique (ARENE) | Nigeria (NERC/DARES) |
|---------|--------------------|----------------------|
| 1 | Site identification | Site + DisCo franchise identification |
| 2 | Baseline population | Feeder band + supply hours baseline |
| 3 | Demand projections | Demand projections (per DARES MTF tiers) |
| 4 | Anchor customers | Anchor customers + productive use anchors |
| 5 | Productive use | Productive use (PUE — key DARES metric) |
| 6 | Resource & technical | Solar resource + system design |
| 7 | CAPEX & OPEX | CAPEX (13 items) + DARES PBG calculation |
| 8 | Financial model | MYTO-aligned tariff + DARES financing |
| 9 | ESIA & safeguards | NESREA ESIA + DARES E&S requirements |
| 10 | Climate rationale | Nigeria NDC + 5 hazard types |
| 11 | Risk analysis | 8 categories + Nigeria-specific weights |
| 12 | Performance standards | NERC SAIDI/SAIFI + DARES connection ramp |
| 13 | Recommended terms | Tripartite agreement heads of terms |
| 14 | Attachments | GIS, financial model, BoQ, ESIA, PUE cases |

**Section 13 — Tripartite agreement heads of terms** (new, specific to interconnected minigrids):
Generate a structured data sheet covering:
- DisCo supply hours commitment (e.g. 9am–3pm from grid, 3pm–9am from DER)
- Distribution usage fee payable to DisCo by DER developer
- Customer billing responsibility allocation
- Grid fault notification protocol
- Asset ownership and step-in rights
- Exclusivity zone and radius
- Exit provisions (12-month notice if grid expands)
- Community rights and obligations (per DARES PBC 3.3)

### 3.2 Report Templates

**Full PFS document** — adapt `pfs_template.py` sections:
- Section 7 (Financial Analysis): Replace ARENE subsidy language with DARES PBG terminology; add grant per connection metric; add IFC revolver eligibility flag
- Section 9 (ESS): Replace DPTADER/ARENE with NESREA/NERC
- Section 14 (Concession Data): Output NERC-formatted tripartite agreement heads of terms

**Add a new report format**: DARES Submission Package
- One-page site summary (connections targeted, PV capacity, grant ask, IRR)
- Financial model (Excel)
- Tripartite agreement heads of terms
- ESIA category screening
- PUE business case
- GIS site map
This package maps directly to what REA PMU needs to evaluate a developer PBG application.

### 3.3 PBG Calculator Module

Add a standalone module `pbg_calculator.py` that computes:
```python
def calculate_pbg(total_capex_usd, grant_pct, connections, pv_kwp):
    grant_total = total_capex_usd * grant_pct
    grant_per_connection = grant_total / connections
    grant_per_kwp = grant_total / pv_kwp
    ifc_revolver_eligible = grant_total * 0.80  # 80% of PBG
    milestone_1_usd = grant_total * 0.50
    milestone_2_usd = grant_total * 0.30
    milestone_3_usd = grant_total * 0.20
    return {...}
```
This surfaces in both the financial analysis output and the concession data sheet, giving developers a clear view of their expected grant receipt schedule.

---

## Phase 4 — Frontend & Portfolio Management (Weeks 12–15)

### 4.1 Map Configuration

Update `MozMap.tsx` → `NigeriaMap.tsx`:
- Center: FCT `[9.07, 7.40]`, zoom 6
- Add DisCo franchise boundary overlays (AEDC/KEDCO/Ikeja as distinct polygon layers with toggles)
- Add feeder-level band visualisation: Band A = green, B = yellow, C = orange, D/E = red — the red feeders are the target sites
- Settlement cluster dots sized by population, colored by suitability score
- On-click popup showing: settlement name, LGA, state, DisCo, feeder band, population, suitability score, distance to grid

### 4.2 Wizard Flow Updates

**Step 1 — Select Site**: Add a fourth selection mode: "Select by feeder" — click a Band C/D/E feeder on the map to automatically pull all settlement clusters along that feeder as candidate sites for batch analysis.

**Step 2 — Review**: Add Nigeria-specific display fields:
- DisCo franchise: AEDC / KEDCO / Ikeja Electric
- Feeder name and Band classification
- Current supply hours/day
- ATC&C losses on feeder (%)
- Gensets estimated in cluster (derived from population + nightlight + no-grid flag)

**Step 4 — Optimize**: Add Nigeria-specific overrides:
- Grant percentage (DARES range: 20–40% of CAPEX)
- IFC revolver toggle (yes/no — changes financing structure)
- USD/NGN rate assumption (for local cost sensitivity)
- Tripartite supply split (% hours from grid vs DER — affects revenue model)

**Step 5 — PFS Report**: Add two new download buttons alongside existing formats:
- "DARES Submission Package" (.zip containing all required documents)
- "Tripartite Heads of Terms" (.docx)
- Rename "ARENE Concession (.json)" → "NERC Concession Data (.json)"

### 4.3 Opportunities Pipeline Page Updates

Add Nigeria-specific columns to the 16-column pipeline table:
- `disco_name` (AEDC / KEDCO / Ikeja)
- `feeder_band` (A–E)
- `supply_hours_current` 
- `grant_ask_pct` (% of CAPEX)
- `grant_per_connection_usd`
- `ifc_eligible` (boolean)
- `gensets_displaced` (estimated count)

Update status workflow to match DARES process:
```
scoped → energy_audit → floated (RFP issued) → submitted (bids received) → 
awarded → tripartite_signed → financial_close → under_construction → commissioned
```

### 4.4 Portfolio Page Updates

The portfolio page maps to the DARES MST pipeline. Each portfolio = one MST lot (a bundle of sites tendered together). Update:
- Portfolio status: `draft → under_review → tendered → awarded → closed`
- Add portfolio-level aggregated metrics: total connections targeted, total PV (MWp), total grant ask (USD), blended grant per connection
- Add "Lot Summary" view: one-page downloadable brief per portfolio for REA PMU / DARES steering committee
- Submissions tab: maps to developer bid comparisons in the MST process — compare proposed grant %, IRR, tariff, timeline across bidders

### 4.5 Branding

Update the colour scheme from Mozambique (navy/gold/cream) to a Nigeria-appropriate palette:
```css
--primary-dark: #0a1628;   /* Deep Abuja night */
--primary-gold: #c8922a;   /* Harmattan dust gold */
--accent-green: #2d6a4f;   /* Solar-ready green */
--accent-red: #c1440e;     /* Generator-red — what we're replacing */
--surface: #f4f0e8;        /* Cream */
```

Update all terminology:
- Province → State
- District → LGA  
- ARENE → NERC
- EDM → DisCo
- FUNAE → REA
- Concession → PBG Agreement / Tripartite Agreement

---

## Phase 5 — Integration, Testing & Deployment (Weeks 16–18)

### 5.1 End-to-End Pipeline Validation

Run the full 14-step analysis on three known reference sites — one per DisCo — and validate outputs against published benchmarks:

| Reference Site | DisCo | Benchmark | Source |
|---------------|-------|-----------|--------|
| Zawaciki, Kano | KEDCO | 1 MW solar, ~2,000 connections | RMI/GEAPP 2024 |
| Robinyan, Ijoko | Ikeja | 500 kWp, 630 kWh storage | Darway Coast/Ikeja Electric |
| Karshi, FCT | AEDC | Proposed site — internal validation | DARES pipeline |

For each site, verify:
- PV sizing within 15% of actual/proposed
- Financial IRR within 2pp of published figures
- Grant per connection within DARES PBG range ($300–$800/connection)
- LCOE within ESMAP benchmark range ($0.30–$0.65/kWh for West Africa interconnected IMG)

### 5.2 Docker Configuration Updates

Update `docker-compose.yml`:
```yaml
environment:
  POSTGRES_DB: nigeria
  POSTGRES_USER: nigeria_admin
  COUNTRY_DIR: /app/countries/nigeria
  CORS_ORIGINS: "http://localhost:3000,https://[production-domain]"
```

### 5.3 API Updates

Update coordinate validation bounds:
```python
lat: float = Field(ge=4.0, le=14.0)   # Nigeria latitude range
lon: float = Field(ge=3.0, le=15.0)   # Nigeria longitude range
```

Add new Nigeria-specific endpoints:
```
GET  /api/discos                          → List DisCo names + franchise bounds
GET  /api/feeders?disco=&band=            → Filter feeders by DisCo and band
GET  /api/sites/by-feeder?feeder_id=      → Settlements along a feeder
POST /api/analyze-site/batch              → Batch analysis for feeder-level screening
GET  /api/pbg-calculator?analysis_id=    → Standalone PBG calculation
POST /api/reports/dares-submission        → Generate DARES submission package (.zip)
```

### 5.4 Quality Assurance Checklist

Before handover, verify all items from the spec's Country Adaptation Checklist are complete:

**Data Layer** ☐ DRE Atlas loaded ☐ State/LGA boundaries ☐ DisCo franchise polygons ☐ Feeder-level data ☐ Grid network (TCN + DisCo 33kV) ☐ OSM roads ☐ Protected areas (NESREA) ☐ ACLED conflict data

**Solar** ☐ Nigeria fallback GHI/DNI/temp values updated ☐ PVGIS coverage verified ☐ Lat/lon bounds updated

**Demand** ☐ Persons/HH (rural 5.0, urban 4.2) ☐ Band-to-tier mapping implemented ☐ Nigeria PUE anchors added ☐ Growth rate 6% urban

**Costs** ☐ All CAPEX unit costs updated ☐ Distribution costs recalibrated ☐ DARES PBG financing structure ☐ MYTO tariff baseline

**Regulatory** ☐ ARENE → NERC ☐ ESIA → NESREA ☐ EDM → DisCos ☐ Concession → Tripartite ☐ DARES PBG milestones ☐ Tripartite heads of terms template

**Climate** ☐ Cyclone zones (South/coastal) ☐ Flood basins (Niger Delta, Benue) ☐ Drought zones (North) ☐ Nigeria NDC targets

**Productive Use** ☐ Mozambique sectors replaced ☐ Nigeria equipment catalogue ☐ State relevance mappings

**Risk** ☐ Security recalibrated (ACLED Nigeria) ☐ NGN currency volatility ☐ Regulatory risk (NERC permit speed)

**Frontend** ☐ Map centered on FCT ☐ NGN currency display ☐ State/LGA terminology ☐ DisCo franchise overlays ☐ Band coloring on feeders ☐ DARES submission download

---

## Resource Plan

| Role | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Total (hrs) |
|------|---------|---------|---------|---------|---------|-------------|
| Data engineer | 160 | 80 | 20 | 0 | 40 | **300** |
| Backend engineer | 80 | 320 | 160 | 40 | 80 | **680** |
| Frontend engineer | 40 | 40 | 40 | 320 | 80 | **520** |
| GIS specialist | 120 | 40 | 0 | 80 | 40 | **280** |
| Energy analyst | 40 | 120 | 80 | 20 | 60 | **320** |
| **Total** | **440** | **600** | **300** | **460** | **300** | **2,100** |

---

## Key Dependencies & Risks

| Dependency | Owner | Risk if delayed |
|-----------|-------|----------------|
| DRE Atlas Nigeria CSV from World Bank | Data engineer / REA | Settlements database empty — no sites to analyse |
| Feeder-level band data from 3 DisCos | DisCo engagement (Lazarus) | No DARES targeting capability |
| NERC concession term template | Regulatory counsel | Section 13 of concession engine incomplete |
| PVGIS API access (free, no key needed) | Backend | Use Nigeria fallback values — minor accuracy impact |
| ACLED Nigeria data access | Data engineer | Security risk engine reverts to manual scoring |
| IFC revolver term sheet | Finance team | IFC financing scenario uses estimated terms only |

---

## Deliverables

1. **Nigeria PFS Platform** — fully deployed Docker application, Nigeria-configured
2. **Three-DisCo siting map** — interactive map showing all candidate sites across AEDC, KEDCO, Ikeja franchise areas with band-level filtering
3. **Validated PFS reports** — full 30-50 page PFS documents for the three reference sites
4. **DARES submission packages** — MST-ready site packages for the first batch of candidate sites
5. **Tripartite heads of terms template** — NERC-compliant tripartite agreement data sheet
6. **Country configuration documentation** — all Nigeria parameters documented and version-controlled
7. **Digital twin foundation** — the platform's database schema and API layer are designed to accept live telemetry from commissioned sites, forming the foundation for the full digital twin described in the broader proposal

---

*Plan derived from MINIGRID_PFS_BUILD_SPECIFICATION.md (Mozambique implementation) and the World Bank Nigeria DARES Project Appraisal Document (P179687, November 2023).*
