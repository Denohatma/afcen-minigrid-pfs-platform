# Mini-Grid Pre-Feasibility Study (PFS) Platform — Build Specification

**Purpose**: Complete technical specification for building a solar+battery mini-grid PFS platform. Derived from the Mozambique implementation. Designed for replication in any country (Nigeria, Uganda, Tanzania, etc.) with country-specific parameter substitution.

**Origin**: Moz Platform — `/Users/dennisnderitu/Desktop/Moz`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [14-Step Analysis Pipeline](#2-14-step-analysis-pipeline)
3. [Engine Specifications](#3-engine-specifications)
4. [Database Schema](#4-database-schema)
5. [Data Pipeline](#5-data-pipeline)
6. [Country Configuration Files](#6-country-configuration-files)
7. [Report & Concession Templates](#7-report--concession-templates)
8. [Frontend Architecture](#8-frontend-architecture)
9. [Docker & Deployment](#9-docker--deployment)
10. [API Endpoints](#10-api-endpoints)
11. [Country Adaptation Checklist](#11-country-adaptation-checklist)

---

## 1. Architecture Overview

### Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Database | PostgreSQL 16 + PostGIS 3.4 | Geospatial settlement data, analyses, portfolios |
| Backend | Python 3.11 + FastAPI | 19 computation engines, REST API |
| Frontend | Next.js 16 + React 19 + Tailwind | Wizard UI, map, pipeline management |
| GIS | MapLibre GL | Vector tile mapping |
| Charts | Recharts | Financial visualizations |
| AI | Anthropic Claude API | Contextual chat assistant |
| Container | Docker Compose | db + api + frontend + data-pipeline |

### Service Ports

| Service | Internal | External |
|---------|----------|----------|
| PostgreSQL/PostGIS | 5432 | 5433 |
| FastAPI backend | 8000 | 8001 |
| Next.js frontend | 3000 | 3000 |

---

## 2. 14-Step Analysis Pipeline

Orchestrated by `backend/app/services/analysis_service.py`. Steps run sequentially; each receives output from prior steps.

| Step | Engine | Input | Output |
|------|--------|-------|--------|
| 1 | `gis_engine` | lat, lon | ClusterInfo + SuitabilityScreening |
| 2 | `solar_engine` | lat, lon | SolarResource (monthly GHI/DNI/temp, 8760 hourly factors) |
| 3 | `demand_engine` | cluster, tier | DemandEstimate (households, daily kWh, peak kW, 24h + 8760h profiles) |
| 4 | `sizing_engine` | demand, solar | SystemSizing (PV kWp, battery kWh, inverter kVA, dispatch metrics) |
| 5 | `distribution_engine` | households, terrain | DistributionDesign (line length, poles, BoQ, cost/connection) |
| 6 | `carbon_engine` | annual energy | CarbonAssessment (tCO2e, credit revenue, methodology) |
| 7 | `financial_engine` | sizing, distribution, carbon | FinancialResults (25-year DCF, IRR, LCOE, NPV, tariff, sensitivity) |
| 7b | `distribution_engine` (calibration) | financial target | Re-run distribution to target ~27% of CAPEX (ESMAP benchmark) |
| 8 | `grid_risk_engine` | cluster distances | GridRiskAssessment (7 ESMAP scenarios, stranded asset analysis) |
| 9 | `productive_use_engine` | cluster, province | ProductiveUseAssessment (11 sectors, anchors, equipment, jobs) |
| 10 | `ess_engine` | cluster, sizing | ESSScreening (ESIA category, biodiversity, resettlement, GESI) |
| 11 | `climate_engine` | cluster, carbon | ClimateRationale (NDC, adaptation, 5 hazards, finance eligibility) |
| 12 | `risk_engine` | all prior outputs | RiskAnalysis (8 categories, 25-point scoring, allocation matrix) |
| 13 | `confidence_engine` | all prior outputs | ConfidenceAssessment (10 dimensions, MOE, data completeness) |
| 14 | `concession_engine` | all prior outputs | ConcessionDataSheet (14 regulatory sections) |

---

## 3. Engine Specifications

### 3.1 Solar Engine (`solar_engine.py`)

**Data Source**: PVGIS API v5.3 — `https://re.jrc.ec.europa.eu/api/v5_3/MRcalc`

**Fallback Monthly GHI** (kWh/m2, Mozambique averages):
```
[194, 180, 172, 158, 136, 118, 125, 148, 168, 184, 190, 190]
```

**Fallback Monthly DNI** (kWh/m2):
```
[158, 145, 138, 130, 120, 105, 115, 135, 150, 160, 160, 155]
```

**Fallback Monthly Temperature** (C):
```
[27.9, 27.5, 26.5, 24.8, 22.5, 20.5, 20.2, 22.0, 24.5, 26.8, 27.8, 28.0]
```

**Loss Breakdown** (multiplicative):

| Loss Type | Value |
|-----------|-------|
| Temperature | 7.0% |
| Soiling | 2.5% |
| Wiring/mismatch | 2.5% |
| Inverter | 2.5% |
| Battery dispatch | 8.0% |
| Availability | 1.5% |
| Year-1 degradation | 1.75% |
| **Net Performance Ratio** | **~77%** |

**Specific Yield** = Annual GHI x PR (kWh/kWp/year)

**8,760-Hour Profile**: Sinusoidal daily shape peaking at solar noon, scaled by monthly GHI.

---

### 3.2 Demand Engine (`demand_engine.py`)

**Multi-Tier Framework (MTF)**:

| Tier | Annual kWh/HH | Type | Use Case |
|------|---------------|------|----------|
| 1 | 38.7 | Very low | Lighting only, rural remote |
| 2 | 219 | Low | Rural connected, phone charging |
| 3 | 803 | Moderate | Periurban, fans, TV, small appliances |
| 4 | 2,117 | High | Urban/commercial, refrigeration |
| 5 | 2,993 | Very high | Industrial, motors |

**Tier Assignment Logic**:
- Urban (is_urban >= 2): Tier 4
- Periurban high (economic activity): Tier 4
- Periurban: Tier 3
- Rural connected (road access / nightlight / facilities): Tier 2
- Rural remote: Tier 1

**24-Hour Load Profiles** (normalized fractions summing to 1.0):

**Rural Residential** (Tier 1-2):
```
Hour: [0-4: 0.8-1.2%, 5-6: 1.5-2.5%, 7-8: 3.0-3.5%, 9-16: 2.0-3.0%, 17-18: 5.0-8.0%, 19: 13.0%, 20-21: 10-11%, 22-23: 4-6%]
```

**Mixed Productive** (Tier 3):
```
Hour: [0-4: 1.5-2.0%, 5-7: 2.5-4.5%, 8: 5.5%, 9-16: 4.5-5.5%, 17-18: 7.0-8.5%, 19: 9.5%, 20-21: 6.5-7.5%, 22-23: 3.5-4.5%]
```

**Commercial Periurban** (Tier 4-5):
```
Hour: [0-4: 2.0-2.5%, 5-7: 3.0-4.5%, 8-17: 5.0-6.0%, 18: 6.5%, 19: 7.0%, 20-21: 5.5-6.0%, 22-23: 3.5-4.0%]
```

**Peak Load Calculation**:
```
coincidence_factor = 0.2 + 0.8 / sqrt(customers)
peak_kw = daily_kwh * max_hourly_fraction * customers * coincidence_factor
         + largest_motor_kw * LRA_multiplier(4x)
```

**Growth**: Apply (1 + 5%)^10 for 10-year horizon.

**Coverage**: Default 50% in Year 1 (adjustable).

**Data Priority**:
1. DRE Atlas connections + demand (if available)
2. Population / persons_per_hh: rural 4.5, urban 3.8

---

### 3.3 Sizing Engine (`sizing_engine.py`)

**Methodology**: HOMER-style 2-D grid optimization with 8,760-hour dispatch simulation.

**Candidate Grid**:
- PV factors: `[0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0]` x baseline
- Battery factors: `[0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]` x baseline
- Total: 84 combinations evaluated

**Baseline Calculations**:
```
PSH = annual_ghi / 365 * PR    (fallback: 4.0 hours)
PV_baseline = max(peak_kw, daily_kwh * 1.12 / (PSH * 0.78))
battery_baseline = max(evening_energy / DOD, daily_kwh * 0.4)
```
- Evening energy = sum of demand hours 18:00-05:59
- DOD = 80%

**Battery Dispatch** (hourly for 8,760 hours):

| Parameter | Value |
|-----------|-------|
| SOC minimum | 20% |
| SOC maximum | 100% |
| SOC initial | 50% |
| Max C-rate | 0.50 |
| Round-trip efficiency | 92% (sqrt per direction = 95.9%) |

**Priority**: PV direct -> battery discharge -> unmet load

**LPSP Targets**:

| Demand Tier | Max LPSP |
|-------------|----------|
| 1 | 10% |
| 2 | 7% |
| 3 | 5% |
| 4 | 3% |
| 5 | 2% |

**Inverter Sizing**:
```
inverter_kva = max(peak_kw, pv_kwp / 1.20, battery_kw + 0.3 * pv_kwp)
```

**Selection**: Lowest LCOE that meets LPSP target. Fallback: lowest LPSP if none qualify.

**NPC for LCOE** (25-year):
- CAPEX = PV + battery + inverter unit costs
- Annual OPEX = 2.5% of CAPEX
- Battery replacement: Year 10 @ 60% of original
- Salvage: 10% of CAPEX at Year 25
- Discount rate: 8% (overridable)
- LCOE = NPC x CRF / annual_energy_served

---

### 3.4 Financial Engine (`financial_engine.py`)

**25-Year Discounted Cash Flow Model**

#### CAPEX Unit Costs (USD, 2024 benchmarks)

| Component | Cost | Unit |
|-----------|------|------|
| PV modules | $580 | /kWp |
| Inverters | $420 | /kWac |
| Mounting structure | $180 | /kWp |
| BoS (cabling, controls) | $220 | /kWp |
| Battery (LFP + EMS) | $285 | /kWh |
| Civil works | $18,000 | fixed |
| Owner's cost | 10% | of equipment subtotal |
| EPC margin | 8% | of equipment subtotal |
| Contingency | 7.5% | of (equipment + owners + EPC) |

**Sources**: ESMAP 2022 Mini-Grid Benchmark, AMDA 2023 State of the Sector, IRENA Renewable Power Generation Costs 2023.

#### CAPEX Output (13 line items)

1. PV (modules + mounting + BoS)
2. Battery (LFP + EMS)
3. Inverter
4. Distribution network (from distribution_engine)
5. Meters
6. Installation (civil + owners + EPC)
7. Soft costs (contingency)
8. Individual breakdowns: mounting, bos, civil_works, owners_cost, epc_margin, contingency

#### Annual OPEX

| Category | Rate |
|----------|------|
| Generation O&M | 3.5% of gen CAPEX |
| Distribution O&M | 2.0% of dist CAPEX |
| Site security | $1,500/year |
| Remote monitoring | $800/year |
| Insurance | 0.5% of total CAPEX |

#### Financing Structure (default)

| Source | Share | Terms |
|--------|-------|-------|
| Grant | 40% | Results-based |
| Debt | 35% | 5% concessional, 15-year tenor, 2-year grace |
| Equity | 25% | Residual |

#### Replacement Cycles

| Equipment | Year | Cost |
|-----------|------|------|
| Battery | 10 | 55% of original |
| Inverter | 12 | 35% of original |

#### Revenue & Cash Flow

- **Connection ramp**: 60% Year 1, +5%/year to 100%
- **Energy degradation**: 0.5%/year PV output
- **Tariff baseline**: $0.45/kWh (adjustable)
- **Carbon revenue**: Starts Year 3+ (Gold Standard / Verra)

#### Output Metrics

| Metric | Formula |
|--------|---------|
| Project IRR | IRR of project-level cash flows (pre-financing) |
| Equity IRR | IRR of equity cash flows (post-debt) |
| LCOE | NPC / lifetime_energy ($/kWh) |
| NPV | @ 10% discount rate |
| DSCR | Annual net income / debt service |
| Payback | Year cumulative cash flow turns positive |
| Cost-reflective tariff | LCOE x 1.15 |
| Subsidy gap/connection | (Total CAPEX - affordable revenue NPV) / connections |

#### Sensitivity Analysis (6 parameters)

| Parameter | Low | Base | High |
|-----------|-----|------|------|
| CAPEX | -15% | 0 | +15% |
| Tariff | -15% | 0 | +15% |
| Solar yield | -10% | 0 | +10% |
| Battery replacement | -10% | 0 | +10% |
| Demand uptake | -20% | 0 | +20% |
| Discount rate | -2pp | 0 | +2pp |

---

### 3.5 Distribution Engine (`distribution_engine.py`)

**Radial LV Network Estimation**:
```
total_line_m = households * 10m/hh * 1.15 overhead * terrain_multiplier
```

**Conductor Split**:
- Spine (25%): AAC 50mm2 @ $1,000/km
- Feeders (45%): AAC 35mm2 @ $750/km
- Service drops (30%): ABC 16mm2 insulated @ $1,400/km

**Terrain Multipliers**:

| Terrain | Multiplier |
|---------|------------|
| Flat (slope < 5 deg) | 1.10 |
| Rolling (5-15 deg) | 1.25 |
| Hilly (15-25 deg) | 1.40 |
| Mountainous (> 25 deg) | 1.60 |

**BoQ Components**:

| Item | Quantity | Unit Cost |
|------|----------|-----------|
| Conductors | By type/length | See above |
| Poles | ceil(line_m / 40m span) | $85/pole |
| Service drops + meters | Per household | $120 + $45 |
| Protection | 5% of materials | — |
| Labour | 18% of (materials + protection) | — |
| Soft costs | 10% of (materials + protection + labour) | — |

**Voltage Drop**:
```
feeders_per_80_customers
avg_feeder_length * resistance(0.868 ohm/km for AAC 35)
V_drop% = I * R * km / 400V * 100   (capped at 15%)
```

**Technical Losses**: `4% + 2% * line_km`

**ESMAP Calibration**: Iteratively adjust household coverage so distribution cost = ~27% of total CAPEX.

---

### 3.6 Carbon Engine (`carbon_engine.py`)

**Baseline — Diesel Displacement**:

| Parameter | Value |
|-----------|-------|
| Diesel genset efficiency | 33% |
| Diesel energy density | 10.0 kWh/litre |
| Emission factor | 2.68 kg CO2/L + 0.12 kg CH4+N2O = **2.80 kg CO2e/L** |

```
diesel_litres = annual_energy_served / 0.33 / 10.0
annual_tCO2e = diesel_litres * 2.80 / 1000
```

**Carbon Pricing Scenarios**:

| Scenario | Price ($/tCO2e) |
|----------|-----------------|
| Zero | $0 |
| Conservative | $5 |
| Market | $12 |
| Premium | $20 |

**Crediting Period**: 7 years, issuance starts Year 3.

**Methodology Recommendation**:
- < 100 tCO2e/year: Gold Standard TPDDTEC (premium for SDG impact, micro-scale)
- >= 100 tCO2e/year: Verra VM0103 (standard for African mini-grid deployments)

**Verification Costs**: $15,000 validation + $5,000/year annual verification.

---

### 3.7 Grid Risk Engine (`grid_risk_engine.py`)

**Distance-Based Risk Classification**:

| Level | Condition |
|-------|-----------|
| Critical | dist_mv < 5 km |
| High | dist_mv < 15 km OR planned < 5 km |
| Medium | dist_mv < 30 km OR planned < 15 km |
| Low | dist_mv >= 30 km |

**7 ESMAP Scenarios** (each scored 1-9 on 5 weighted dimensions):

1. No Arrival (full standalone)
2. Overlap Risk (transitional, grid arrives)
3. Compensation & Exit (negotiated buyout)
4. Side-by-Side (embedded generation)
5. Distributor Conversion (local distribution licence)
6. Producer Conversion (wholesale to utility)
7. Hybrid Interconnection (grid-tied from day one)

**Scoring Dimensions** (weights):
- Timeline certainty: 30%
- Financial viability: 25%
- Regulatory alignment: 20%
- Implementation complexity: 15%
- Stakeholder acceptability: 10%

**Stranded Asset Scenarios**: Truncate cash flows at grid arrival year (5, 10); compute adjusted IRR, NPV, % investment recovered.

---

### 3.8 Productive Use Engine (`productive_use_engine.py`)

**11 Sectors** (assessed per province + cluster indicators):

1. Cereal & tuber processing
2. Oilseed & cashew processing
3. Horticulture & irrigation
4. Fisheries (cold chain)
5. Livestock & dairy
6. Cold chain (health/perishables)
7. Mining services
8. Light manufacturing (welding, carpentry, tailoring)
9. ICT & digital services
10. Tourism
11. Public services (schools, health, water, street lighting)

**Anchor Customer Identification**:

| Type | Trigger | Demand |
|------|---------|--------|
| Telecom tower | pop > 500, road < 15 km | 24 kWh/day |
| Agro-processor | ag_area > 20 ha OR pop > 800 | 15% of ag_area hourly |
| Health centre | has_health_facility | 12 kWh/day |
| School | has_education_facility | 6 kWh/day |
| Water pumping | water < 5 km, pop > 200 | 5-15 kWh/day |
| Commercial | large_buildings >= 2 | 5 kWh/building/day |

**SME Demand** (informal sector):
- Urban: 3% of pop, 5 kWh/SME/day
- Periurban: 2% of pop, 3.5 kWh/SME/day
- Rural: 1% of pop, 2 kWh/SME/day
- Wealth adjustment: RWI x +/-30%

**Equipment Catalogue** (45+ items):

| Equipment | Power (kW) | CAPEX (USD) | Sector |
|-----------|-----------|-------------|--------|
| Maize mill | 6 | $2,500-5,000 | Cereal |
| Rice huller | 3 | $1,800-3,500 | Cereal |
| Cashew sheller | 3 | $3,000-6,000 | Oilseed |
| Oil press | 2.5 | $2,000-4,000 | Oilseed |
| Solar pump | 1.5 | $1,500-3,500 | Irrigation |
| Drip kit | — | $300-800 | Irrigation |
| Ice maker | 5 | $5,000-12,000 | Cold chain |
| Vaccine fridge | 0.1 | $2,000-4,000 | Cold chain |
| Welding machine | 5 | $500-1,500 | Manufacturing |

**Complementary Investment**:
- Working capital: 20% of equipment CAPEX
- Market access: 5-15% (higher if remote > 20 km)
- Training: $2k base + $1.5k per high-relevance sector

**Job Projections**:
- Direct (O&M): 2-5 based on peak kW
- Indirect (productive use): 1.5-3 per high sector, 0.5-1.5 per medium

---

### 3.9 ESS Engine (`ess_engine.py`)

**ESIA Category Assignment** (Mozambique: Decree 54/2015):

| Category | Condition |
|----------|-----------|
| C | PV < 100 kWp |
| B | PV 100-500 kWp |
| B+ | PV > 500 kWp in sensitive zone |
| A | PV > 500 kWp in protected area buffer |

**Protected Areas** (with buffer distances):
- Gorongosa (50 km), Niassa (80 km), Bazaruto, Limpopo, Quirimbas, Marromeu, Chimanimani, Gile, Maputo Special Reserve

**Biodiversity Sensitivity**:
- High: Inside or adjacent to protected area
- Medium: Within buffer zone
- Low: No overlap

**Resettlement Risk**:
- Land requirement: 0.01 ha/kWp for PV + distribution corridor
- Physical displacement: flagged if buildings within footprint
- Economic displacement: flagged if agricultural land within footprint

**Stakeholder Groups** (Mozambique-specific):
- Regulos (traditional leaders), SDAE/SDPI (district services), DPTADER (agriculture), ARENE (regulator), EDM (utility), FUNAE (rural energy fund), NGOs, women's groups, religious leaders, youth

**GESI Focus Areas**:
- Post-harvest processing, tailoring, food preparation
- Barriers: finance access, time poverty, mobility, land tenure
- Empowerment: equipment ownership, training, leadership roles

---

### 3.10 Climate Engine (`climate_engine.py`)

**5 Hazard Types** (severity: very_high / high / moderate / low / negligible):

#### Cyclone
- Very High: Central coast (lat -20.5 to -15.0) < 100 km from coast
- High: Northern coast (lat -15 to -10.5) < 100 km
- Design: Wind rating 180-200 km/h, ballasted mounting, reinforced enclosure

#### Flood
- High: River basin (Zambezi, Limpopo, Save) + elevation < 50m
- Design: Elevate foundations 1-1.5m, sealed enclosures IP65+

#### Drought
- High: Southern provinces (Gaza, Inhambane, lat > -22)
- Design: Prioritize irrigation, dry-cooled systems

#### Sea-Level Rise
- High: < 10 km from coast (0.3-0.6m SLR by 2100 per RCP scenarios)
- Design: Marine-grade materials, cathodic protection

#### Heat Stress
- Moderate: < 200m elevation (> 35C in hot season)
- Design: Battery climate control, temperature derate +10-15%

**Climate Finance Eligibility** (4 instruments):

| Instrument | Typical Value | Eligibility |
|-----------|---------------|-------------|
| Green Climate Fund (GCF) | $300-500/beneficiary | Adaptation + mitigation |
| Adaptation Fund | $150/beneficiary | High hazard + resilience measures |
| Carbon Market (Art.6/VCM) | Per tCO2e pricing | Emission reductions |
| Bilateral (KfW, SIDA, ENREDD+) | $250/beneficiary | Population >= 100 |

---

### 3.11 Risk Engine (`risk_engine.py`)

**8 Categories** (weighted):

| Category | Weight | Key Sub-Risks |
|----------|--------|---------------|
| Technical | 15% | Equipment reliability, solar variability, distribution losses |
| Commercial | 20% | Demand forecast, WTP, customer growth, productive use uptake |
| Regulatory | 10% | Licensing, tariff regulation, concession term, grid interconnection |
| Security | 15% | Armed conflict, equipment theft (ACLED heuristics) |
| Social | 10% | Community acceptance, land access (DUAT), stakeholder conflict |
| Climate | 10% | Cyclone, flood, drought, sea-level rise, heat stress |
| Currency | 10% | FX depreciation, FX-linked debt |
| Political | 10% | Government stability, policy continuity, expropriation |

**Scoring**: Likelihood (1-5) x Impact (1-5) = Score (1-25)

| Level | Score Range |
|-------|-------------|
| Low | 1-5 |
| Medium | 6-11 |
| High | 12-15 |
| Critical | 16-25 |

**Allocation**: Each risk assigned to Concessionaire, Public Partner, Shared, or Risk Instrument.

---

### 3.12 Confidence Engine (`confidence_engine.py`)

**10 Dimensions** (each scored 0-100):

| Dimension | MOE Target |
|-----------|------------|
| Population/household count | +/-10% |
| Total energy demand Year 1 | +/-17.5% |
| Peak load Year 1 | +/-20% |
| Productive use demand share | +/-25% |
| Solar resource GHI | +/-5% |
| Generation capacity sizing | +/-15% |
| CAPEX per kW | +/-20% |
| OPEX | +/-25% |
| Cost-reflective tariff | +/-15% |
| Avoided GHG emissions | +/-20% |

**Score Boosters** (data source bonuses):
- PVGIS solar data: +40 to GHI dimension
- DRE Atlas connections: +30 to demand
- Building footprints: +15 to population
- Crop data: +20 to productive use
- RWI (Relative Wealth Index): +10 to demand tier
- 8,760 dispatch unmet < 2%: +20 to sizing

**Confidence Levels**: High >= 75, Medium 50-74, Low < 50

---

### 3.13 Concession Engine (`concession_engine.py`)

Generates ARENE-compliant 14-section concession data sheet:

1. **Identification**: Site, coords, province, district, population, recommended term (15-25 years)
2. **Baseline**: Current/projected population (2.8%/year growth), electrification, infrastructure
3. **Demand**: Y1/5/10/15/20 annual energy + peak kW, tier, breakdown (residential/commercial/productive/public)
4. **Anchor Customers**: Health, school, telecom, agro-processor, water, commercial with demand/peak/contract
5. **Productive Use**: Sector assessment, equipment, complementary investment, jobs, income, stimulation
6. **Resource & Technical**: Solar profile, generation system, distribution, reserve margin
7. **CAPEX & OPEX**: 10-component CAPEX, annual OPEX by category, cost/connection, cost/kW
8. **Financial Model**: Tariff structure (residential/commercial/productive/anchor in USD + local currency), subsidy, metrics, sensitivity
9. **ESIA & Safeguards**: Category, biodiversity, resettlement, stakeholders, grievance, GESI
10. **Climate Rationale**: Avoided tCO2e, NDC, adaptation, hazards, finance eligibility
11. **Risk Analysis**: 8 categories, top 3, mitigation investment
12. **Performance Standards**: SAIDI, SAIFI, availability, voltage, connection ramp
13. **Recommended Terms**: Concession term, exclusivity, tariff review triggers, subsidy disbursement, asset transfer, grid rights, reporting, step-in
14. **Attachments**: GIS files, financial model, BoQ, ESIA, productive use business cases

---

## 4. Database Schema

### 9 Migrations (`database/migrations/`)

#### 001_extensions.sql
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS hstore;
```

#### 003_settlement_clusters.sql (core table, 61 columns)
Key columns:
- **Identity**: cluster_id, geohash, geom (MultiPolygon), centroid (Point)
- **Admin**: adm1_name (province), adm2_name (district), village_name
- **Population**: population, num_buildings, building_density_pct, large/medium/small_buildings
- **Urban**: is_urban (0=rural, 1=periurban, 2=urban)
- **Energy**: ghi_kwh_m2_year, pv_kwh_kwp_year, max_ntl, electrified_pop
- **Infrastructure**: dist_grid_mv_km, dist_grid_planned_km, dist_road_km, main_road_access
- **Facilities**: has_education_facility, has_health_facility, num_education/health_facilities
- **Socioeconomic**: mean_rwi (Relative Wealth Index)
- **Agriculture**: crop_types, ag_area_ha, ag_value_usd
- **Security**: security_risk, fatalities_25km/50km, total_incidents_50km
- **DRE**: dre_num_connections, dre_demand_kwh_day, dre_demand_per_conn_kwh_day

#### 006_user_projects.sql
```sql
projects (id UUID, name, description, created_at, updated_at)
analyses (id UUID, project_id FK, name, latitude, longitude, cluster_id FK, overrides JSONB, result JSONB, created_at)
```

#### 008_opportunities_portfolios.sql
```sql
opportunities (id UUID, project_name, province, district, lat, lon, cluster_id FK, status CHECK(scoped/floated/submitted), program_name, connections_targeted, pue_value_chains TEXT[], pv_capacity_kwp, battery_capacity_kwh, distribution_line_length_m, total_capex_usd, cost_per_connection_usd, grant_per_connection_usd, lcoe_usd_kwh, irr_pct, payback_years, analysis_id FK, metadata JSONB)

portfolios (id UUID, name, program_name, description, status CHECK(draft/published/under_review/awarded/closed))

portfolio_opportunities (portfolio_id FK, opportunity_id FK, PRIMARY KEY)

submissions (id UUID, portfolio_id FK, bidder_name, bidder_organization, contact_email, status CHECK(pending/under_review/shortlisted/accepted/rejected), proposed_capex_usd, proposed_grant_ask_usd, proposed_tariff_usd_kwh, proposed_lcoe_usd_kwh, proposed_irr_pct, proposed_timeline_months, technical_approach TEXT, experience_summary TEXT, scoring_technical, scoring_financial, scoring_experience, scoring_total, documents JSONB, notes TEXT)
```

---

## 5. Data Pipeline

7 scripts in `data_pipeline/`:

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `00_config.py` | Load country config, paths | config.json | Settings object |
| `01_download_gis_data.py` | Fetch OSM roads/buildings, WorldPop, GEBCO elevation, GHSL nightlight | Web APIs | GeoTIFF/GeoJSON |
| `02_harmonize_rasters.py` | Resample all rasters to common 1km grid | Multiple rasters | Aligned rasters |
| `03_generate_clusters.py` | K-means clustering on settlement centroids | Building footprints | Cluster polygons |
| `04_extract_attributes.py` | Zonal statistics per cluster | Clusters + rasters | CSV with attributes |
| `05_load_postgis.py` | Insert geometries + attributes into PostGIS | CSV + GeoJSON | settlement_clusters table |
| `06_validate_data.py` | QA: null counts, bounds, geometry validity | Database | Validation report |
| `07_load_dre_atlas.py` | Merge World Bank DRE Atlas data | CSV (56K settlements) | Enriched settlement_clusters |

**Required Data Sources**:
- World Bank DRE Atlas settlements (CSV with geom, population, buildings, demand, grid distances)
- OpenStreetMap (roads, buildings, admin boundaries)
- WorldPop (population raster)
- PVGIS (solar resource API)
- ACLED (conflict data for security risk)
- Relative Wealth Index (Meta/World Bank)

---

## 6. Country Configuration Files

All stored in `countries/{country_name}/`:

### config.json
```json
{
  "country": "Mozambique",
  "currency": "MZN",
  "exchange_rate": 63.5,
  "population_growth_rate": 0.028,
  "persons_per_hh_rural": 4.5,
  "persons_per_hh_urban": 3.8,
  "national_electrification_rate": 0.40,
  "grid_tariff_usd_kwh": 0.12,
  "regulator": "ARENE",
  "utility": "EDM",
  "utility_mandate_km": 30,
  "concession_term_range": [15, 25],
  "esia_decree": "Decree 54/2015",
  "performance_standards": {
    "saidi_max_hours": 50,
    "saifi_max_events": 25,
    "availability_target": 0.97,
    "max_outage_hours": 4,
    "connection_ramp": [0.6, 0.7, 0.8, 0.85, 0.90]
  }
}
```

### financial_defaults.json
All CAPEX/OPEX/financing parameters as documented in Section 3.4.

### demand_tier_mapping.json
Urban classification -> demand tier mapping rules.

### productive_use_sectors.json
11-sector config: equipment lists, provincial relevance, seasonal patterns, job multipliers.

### climate_hazards.json
Cyclone zones, flood basins, drought corridors, NDC targets.

### ess_defaults.json
Protected areas + buffer distances, ESIA thresholds, stakeholder groups, GESI considerations.

### priority_minigrid_sites.json
Pre-scored priority sites (200 entries with score, province, district, population, connections, demand, grid distance).

---

## 7. Report & Concession Templates

### Report Formats (4 download options)

| Format | Engine | Output |
|--------|--------|--------|
| HTML Report | `report_engine.py` | Single-page summary with charts |
| Full PFS (.docx) | `pfs_engine.py` + `pfs_template.py` | 30-50 page Word document |
| 5-Page Summary (.docx) | `pfs_engine.py` + `pfs_summary_template.py` | Executive summary |
| Excel Financial Model | `excel_engine.py` | Multi-sheet workbook (inputs, cash flow, sensitivity, BoQ) |
| ARENE Concession (.json) | `concession_engine.py` | Machine-readable 14-section data |

### PFS Document Structure (`pfs_template.py`)
1. Executive Summary
2. Site Overview (location, admin, population, infrastructure)
3. Solar Resource Assessment
4. Demand Analysis (tiers, profiles, growth projections)
5. System Design (PV, battery, inverter, distribution)
6. Bill of Quantities
7. Financial Analysis (CAPEX, OPEX, cash flow, tariff, sensitivity)
8. Carbon Assessment
9. Grid Risk Analysis
10. Productive Use Assessment
11. Environmental & Social Safeguards
12. Climate Rationale
13. Risk Analysis
14. Confidence Assessment
15. Recommendations

---

## 8. Frontend Architecture

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Landing page with feature cards |
| `/analyze` | 5-step wizard: Select Site -> Review -> Design -> Optimize -> PFS Report |
| `/opportunities` | Pipeline table with 16 columns, multi-select, column filters, send-to-portfolio |
| `/portfolios` | Portfolio cards by program, detail view with projects/submissions/bidder comparison |

### Wizard Flow (`/analyze`)

**Step 1 — Select Site**: Map click OR GPS coordinates OR CSV batch upload OR priority sites list
**Step 2 — Review**: Cluster data, suitability screening, solar resource
**Step 3 — Design**: System sizing, demand estimate, distribution
**Step 4 — Optimize**: Override parameters (tariff, grant %, costs), sensitivity
**Step 5 — PFS Report**: Full results display + download buttons + **Accept** button (sends to Opportunities)

### Components
- `MozMap.tsx`: MapLibre GL vector map with click handler
- AI Chat panel: Anthropic Claude streaming chat with analysis context
- Step indicator: Visual wizard progress

### Styling
- Tailwind CSS v4
- Color scheme: `--afcen-navy: #0f1b2b`, `--afcen-gold: #d3a54a`, `--afcen-cream: #f5f1e8`
- Dark theme throughout

---

## 9. Docker & Deployment

### docker-compose.yml

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: moz
      POSTGRES_USER: moz
      POSTGRES_PASSWORD: moz_dev_2026
    ports: ["5433:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./database/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U moz"]

  api:
    build: ./backend
    ports: ["8001:8000"]
    environment:
      DATABASE_URL: postgresql://moz:moz_dev_2026@db:5432/moz
      COUNTRY_DIR: /app/countries/{country}
      CORS_ORIGINS: "http://localhost:3000"
    volumes:
      - ./backend:/app
      - ./countries:/app/countries
    depends_on:
      db: { condition: service_healthy }
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8001
    depends_on: [api]

  data-pipeline:
    build:
      context: .
      dockerfile: data_pipeline/Dockerfile
    environment:
      DATABASE_URL: postgresql://moz:moz_dev_2026@db:5432/moz
    profiles: [pipeline]
```

---

## 10. API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Service health check |
| GET | `/api/sites/lookup?lat=&lon=` | Nearest settlement cluster |
| GET | `/api/sites/screen?lat=&lon=` | Suitability screening |
| GET | `/api/sites/priority?province=&min_score=` | Priority site rankings |
| POST | `/api/analyze-site` | Run full 14-step analysis (auto-saves to DB) |
| GET | `/api/analyses` | List completed analyses |
| GET/POST | `/api/reports/{format}` | Generate PDF/Excel/PFS/concession reports |
| POST | `/api/chat` | Streaming AI assistant |
| GET/POST/PATCH/DELETE | `/api/opportunities/` | Pipeline CRUD |
| GET/POST/PATCH/DELETE | `/api/portfolios/` | Portfolio CRUD |
| POST | `/api/portfolios/{id}/opportunities` | Add opportunities to portfolio |
| GET/POST/PATCH/DELETE | `/api/portfolios/{id}/submissions/` | Bidder submission CRUD |

---

## 11. Country Adaptation Checklist

When replicating for a new country (e.g., Nigeria), change the following:

### Data Layer
- [ ] Obtain settlement data (DRE Atlas equivalent, DARES, or national electrification survey)
- [ ] Source admin boundaries (states/LGAs for Nigeria vs provinces/districts)
- [ ] Grid network data (national utility transmission/distribution lines)
- [ ] Road network (OSM)
- [ ] Protected areas database (national parks, game reserves, forest reserves)
- [ ] Conflict data (ACLED for security risk heuristics)
- [ ] Update lat/lon bounds in API validation (Mozambique: lat -27 to -10, lon 29 to 42)

### Solar Resource
- [ ] Update fallback monthly GHI/DNI/temperature for the country
- [ ] Verify PVGIS coverage (sub-Saharan Africa generally covered)

### Demand
- [ ] Adjust persons per household (rural/urban)
- [ ] Recalibrate demand tiers to local consumption patterns
- [ ] Update load profile shapes if significantly different
- [ ] Adjust growth rates

### Costs
- [ ] Update all CAPEX unit costs (PV, battery, inverter, mounting, BoS, civil works)
- [ ] Update distribution costs (conductor types, pole costs, labour rates)
- [ ] Adjust O&M rates for local conditions
- [ ] Update financing terms (grant %, debt rate, tenor)
- [ ] Set local tariff baseline

### Regulatory
- [ ] Replace ARENE with local regulator (NERC for Nigeria)
- [ ] Replace ESIA decree with local environmental law
- [ ] Update concession term ranges
- [ ] Replace EDM with national utility (DisCos for Nigeria)
- [ ] Update performance standards (SAIDI, SAIFI targets)
- [ ] Update tariff methodology (MYTO for Nigeria)

### Climate & Geography
- [ ] Remap cyclone/flood/drought/heat zones to country geography
- [ ] Update river basins for flood assessment
- [ ] Update NDC targets and energy sector contribution
- [ ] Recalibrate sea-level rise zones

### Productive Use
- [ ] Replace 11 sectors with country-relevant value chains
- [ ] Update provincial/state relevance mappings
- [ ] Adjust equipment catalogue and prices
- [ ] Update job and income multipliers

### Risk
- [ ] Recalibrate security risk heuristics (conflict zones)
- [ ] Update currency risk parameters (NGN volatility vs MZN)
- [ ] Adjust political risk scoring
- [ ] Update regulatory risk (policy stability)

### Frontend
- [ ] Update map center/zoom to new country
- [ ] Change currency display (MZN -> NGN)
- [ ] Update terminology (province -> state, district -> LGA)
- [ ] Adjust color scheme/branding if needed

---

*Document generated from the Mozambique Mini-Grid PFS Platform codebase. All formulas, constants, and thresholds are extracted directly from the implementation.*
