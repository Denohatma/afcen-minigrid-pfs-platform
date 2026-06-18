# Nigeria DisCo Feeder Data Acquisition Guide
### Data Sources, Download Instructions & DisCo Engagement Protocol
*Companion to the Nigeria PFS Platform Build Plan — Phase 1, Step 1.2*

---

## Overview

This document covers everything needed to populate the feeder layer in the Nigeria PFS platform for the three target DisCos: AEDC (Abuja), KEDCO (Kano), and Ikeja Electric (Lagos). It is structured in two parts:

**Part A — Download now**: Publicly available datasets that can be ingested immediately with no permission required.

**Part B — Request via DisCo MOU**: Operational data that only exists inside each DisCo's internal systems and must be obtained through the data-sharing agreements being established with Lazarus.

A third section covers the DARES World Bank team as an additional data source, and a fourth covers how to reconstruct an approximate feeder map for AEDC and Ikeja Electric using satellite tracing while the MOU negotiations proceed.

---

## Part A — Public Data: Download Now

### A1. KEDCO Medium Voltage Grid (Primary Source)

This is the highest-quality freely available DisCo-level feeder dataset for any Nigerian DisCo. It was produced by Columbia University's Sustainable Engineering Lab (SEL) in direct collaboration with KEDCO engineers, who physically walked and mapped nearly 10 million metres of medium voltage lines using Android devices loaded with OpenStreetMap's JOSM editor.

**What it contains:**
- MV line routes (33kV and 11kV) across Kano, Katsina, and Jigawa states
- Substation locations with geographic coordinates
- Line segment attributes (voltage, status, material where recorded)

**What it does NOT contain:**
- Feeder band classification (A–E)
- Supply hours per feeder
- ATC&C loss rates
- Customer counts per feeder

These operational attributes must come from KEDCO directly (see Part B).

**Download links:**

Primary source — energydata.info:
```
https://energydata.info/dataset/kano-electricity-distribution-plc-kedco-mv-lines-2016
```
Available formats: GeoJSON, Shapefile (.shp), KML

Mirror — Nigeria SE4ALL GeoNode:
```
https://data.nigeriase4all.gov.ng/layers/geonode:distribution_line_kedco
```

**Licence:** Creative Commons Attribution 4.0 (CC-BY 4.0)
**Attribution required:** `© Columbia University Earth Institute. Accessed from energydata.info`

**Ingestion instructions:**

Download the Shapefile ZIP. Unzip and load into PostGIS:

```bash
# Unzip
unzip kedco_mv_lines.zip -d kedco_mv

# Load into PostGIS (assuming PostGIS is running on localhost)
shp2pgsql -I -s 4326 kedco_mv/kedco_mv_lines.shp public.feeders_kedco_raw | \
  psql -U nigeria_admin -d nigeria

# Verify
psql -U nigeria_admin -d nigeria -c "SELECT COUNT(*) FROM feeders_kedco_raw;"
```

After loading, run the normalisation script to map into the platform's `feeders` table schema:

```sql
INSERT INTO feeders (feeder_id, disco_name, voltage_kv, status, geom)
SELECT
  'KEDCO-' || gid AS feeder_id,
  'KEDCO' AS disco_name,
  COALESCE(voltage::float, 33) AS voltage_kv,
  COALESCE(status, 'existing') AS status,
  ST_Transform(geom, 4326) AS geom
FROM feeders_kedco_raw;
```

Band classification, supply hours, and loss rate columns will be NULL until KEDCO provides the operational data in Part B.

---

### A2. Nigeria National Transmission Network (All DisCos)

This dataset covers the 330kV and 132kV transmission backbone — TCN infrastructure, not DisCo distribution feeders. It is useful for mapping substation injection points into each DisCo franchise area, which is the starting node for each distribution feeder.

**Sources compiled from:**
- ECREEE West Africa transmission network (ECOWREX)
- ESMAP/World Bank Nigeria Electricity Access Project (NEAP)
- World Bank project documents (digitised PDF maps)

**Download links:**

energydata.info:
```
https://energydata.info/dataset/nigeria-electricity-transmission-network-2015
```

World Bank Data Catalog:
```
https://datacatalog.worldbank.org/search/dataset/0042323
```

Available formats: GeoJSON, Shapefile ZIP

**Licence:** Creative Commons Attribution 4.0

**What to extract for the platform:**
Load the 132kV lines and substations. Cross-reference with the DisCo franchise boundary polygons to identify injection substations for each DisCo. These become the `substation_injection_point` anchor for each feeder route.

---

### A3. Nigeria SE4ALL Settlement Clusters (All States)

This is the most important dataset for site screening — it identifies building clusters from satellite imagery across all 36 states and FCT, with attributes indicating population, building count, and electrification status.

**Download portal:**
```
https://data.nigeriase4all.gov.ng/layers/geonode_data:geonode:cluster_all
```

Individual state layers are also available. Download the following states to cover the three target DisCos:

| DisCo | States to download |
|-------|-------------------|
| AEDC | FCT, Niger, Kogi, Nasarawa |
| KEDCO | Kano, Katsina, Jigawa |
| Ikeja Electric | Lagos |

**Licence:** Check per-layer licence on the GeoNode portal — most are CC-BY 4.0.

**Note:** The Nigeria SE4ALL platform is operated by GIZ and is one of the DARES ecosystem partners. Given SEforALL's role as platform host on your project, it is worth contacting the SE4ALL Nigeria team directly (contact via nigeriase4all.gov.ng) to discuss a formal data-sharing arrangement that may give access to more recent or higher-resolution cluster data not yet publicly published.

---

### A4. Nigeria SE4ALL Power Sector Webmap Layers

The SE4ALL platform has a dedicated power sector webmap with additional grid layers beyond the raw GeoNode data.

**Webmap URL:**
```
https://apps.nigeriase4all.gov.ng/power-sector
```

Layers available on this webmap include:
- TCN transmission network (updated periodically)
- DisCo franchise boundaries
- Existing minigrid locations (from the NEP programme)
- Grid buffer zones (distance to nearest MV line)

Most layers can be downloaded from the GeoNode data portal. For layers that are view-only on the webmap, contact the SE4ALL Nigeria team to request the underlying data file.

---

### A5. OpenStreetMap Power Infrastructure

OSM is the best supplementary source for AEDC and Ikeja Electric feeder routes given the absence of a dedicated public dataset for those DisCos. OSM coverage is patchy in rural areas but reasonable in urban Lagos and parts of FCT.

**Extract via Overpass API:**

All power lines in Nigeria:
```
[out:json][timeout:120];
area["name"="Nigeria"]["admin_level"="2"]->.searchArea;
(
  way["power"="line"](area.searchArea);
  node["power"="substation"](area.searchArea);
  node["power"="transformer"](area.searchArea);
);
out body;
>;
out skel qt;
```

Lagos-specific (Ikeja Electric franchise area):
```
[out:json][timeout:60];
area["name"="Lagos"]["admin_level"="4"]->.searchArea;
(
  way["power"="line"](area.searchArea);
  node["power"="substation"](area.searchArea);
);
out body;
>;
out skel qt;
```

FCT-specific (AEDC):
```
[out:json][timeout:60];
area["name"="Federal Capital Territory"]["admin_level"="4"]->.searchArea;
(
  way["power"="line"](area.searchArea);
  node["power"="substation"](area.searchArea);
);
out body;
>;
out skel qt;
```

Run queries at: `https://overpass-turbo.eu`

**Convert to GeoJSON and load:**
```bash
# Install osmtogeojson if not already installed
npm install -g osmtogeojson

# Convert
osmtogeojson nigeria_power.json > nigeria_power_geojson.json

# Load into PostGIS using ogr2ogr
ogr2ogr -f "PostgreSQL" PG:"dbname=nigeria user=nigeria_admin" \
  nigeria_power_geojson.json \
  -nln feeders_osm_raw \
  -nlt MULTILINESTRING \
  -t_srs EPSG:4326
```

**Caveat on OSM data quality:** Tag `voltage` is missing on many Nigerian lines. Where voltage is untagged, infer from context: lines connecting 132kV substations to distribution transformers are typically 33kV; lines from distribution transformers to LV poles are 11kV. Use a proximity query to the national transmission dataset to validate voltage assignments.

---

### A6. World Bank DRE Atlas (Settlement-Level Grid Distance)

The DRE Atlas provides per-settlement attributes including estimated distance to the nearest MV line — a critical input for the siting engine's grid risk module.

**Access:** The DRE Atlas is not a simple download link — it is accessed through the Global Electrification Platform (GEP) and the ESMAP portal. Two routes:

Route 1 — GEP Explorer (browser-based):
```
https://electrification.energydata.info
```
Filter to Nigeria. Download the settlement layer including grid distance attributes.

Route 2 — Direct ESMAP data request:
Email `esmap@worldbank.org` referencing the Nigeria Electricity Access Project (NEAP, P-ID P161885) and request the Nigeria settlement layer with grid distance attributes used for the least-cost electrification planning model.

**What this adds to the platform:**
- `dist_mv_km` — distance in km from each settlement centroid to the nearest MV line
- `pop` — population estimate
- `hh_count` — household count
- `electrification_status` — grid connected / off-grid / partially electrified

Cross-reference with the Nigeria SE4ALL cluster layer using a spatial join on settlement centroid coordinates.

---

### A7. MapYourGrid Nigeria Datasets

MapYourGrid aggregates open-access grid datasets. For Nigeria specifically:

```
https://mapyourgrid.org/global-grid-data/
```

Available Nigerian datasets on this platform:
- Nigerian 50-Bus 330kV power grid (2017, CC-BY 4.0)
- Nigeria substations dataset (2025, CC-BY 4.0) — most recently updated
- TCN official grid map

The 2025 substations dataset is worth downloading specifically — it will be more current than the 2015 energydata.info transmission dataset and will help identify injection points added in the last decade.

---

## Part B — DisCo Direct Request: Operational Data

The following data only exists inside each DisCo's internal systems. It cannot be obtained from any public source. Obtaining it requires a data-sharing agreement — ideally embedded within or accompanying the MOU that each DisCo signs with REA as the first step of the DARES MST process.

### What to request from each DisCo

**Core data request (all three DisCos):**

| Data item | Format | Priority | Use in platform |
|-----------|--------|----------|-----------------|
| Feeder route map (33kV and 11kV) | Shapefile, DWG, or PDF + scan | Critical | Feeder layer geometry |
| Feeder name and ID register | Excel or CSV | Critical | Feeder identification |
| NERC band classification per feeder | Excel or CSV | Critical | DARES targeting filter |
| Supply hours per day per feeder (12-month average) | Excel or CSV | Critical | Demand engine input |
| ATC&C loss rate per feeder (%) | Excel or CSV | High | Financial engine input |
| Number of customers per feeder | Excel or CSV | High | Demand sizing |
| Customer category split (residential / commercial / industrial) per feeder | Excel or CSV | High | Load profile engine |
| Substation locations with capacity (MVA) | Excel, CSV, or Shapefile | High | Network model |
| Planned feeder extensions (next 3 years) | Any format | Medium | Grid risk engine |
| Feeder-level monthly energy delivered (MWh, last 12 months) | Excel or CSV | Medium | Demand calibration |
| Any existing metered data from smart meters | CSV or API | Medium | Twin foundation |

**AEDC-specific additions:**
- Distribution transformer register with GPS coordinates (AEDC has a transformer metering programme — this data likely exists)
- List of feeders in Niger, Kogi, and Nasarawa states separately from FCT feeders (different access challenges)

**KEDCO-specific note:**
The public MV line data already provides feeder geometry. The KEDCO request should focus on the operational attributes (band, supply hours, losses) layered onto the existing lines, plus any new feeders added since 2016 that are not in the public dataset.

**Ikeja Electric-specific additions:**
- Business unit boundary shapefiles (Abule Egba, Ikeja, Shomolu, Ikorodu, Oshodi, Akowonjo)
- Feeder data disaggregated by business unit
- Any existing DER/rooftop solar connections already on the network (relevant for the DARES solar DPV component in Lagos)

---

### How to frame the data request

The data request should be positioned within the MOU context, not as a standalone ask. The framing that works with DisCo technical and planning teams:

> "As part of the REA-DisCo MOU for interconnected minigrid development, we are building a site siting and pre-feasibility platform that will be used to identify Band C, D, and E feeder clusters suitable for DARES interconnected minigrid deployment. The feeder data you provide will be used exclusively within this platform for site prioritisation and will not be shared with third parties or other DisCos. The platform will in turn provide the DisCo with a ranked list of candidate sites along its feeders, together with demand projections, financial models, and heads of terms for tripartite agreements — reducing the DisCo's own planning burden significantly."

Key points to emphasise:
- Data will be ring-fenced by DisCo — AEDC cannot see KEDCO data and vice versa
- The DisCo retains ownership of its data; the platform is a processing layer, not a data repository
- The output (candidate site rankings, financial models) belongs to the DisCo and REA jointly
- Access is governed by the same MOU that the DisCo is already signing with REA for DARES participation

---

### Data-sharing agreement provisions to include

Ensure the MOU or a separate data-sharing schedule includes the following provisions:

1. **Scope of use**: Data may only be used for the purpose of identifying interconnected minigrid sites within the DisCo's franchise area under the DARES programme.

2. **No onward disclosure**: The platform operator (SEforALL / the platform host) may not share DisCo data with any third party, including other DisCos, developers, or financiers, without the DisCo's written consent.

3. **Data accuracy disclaimer**: The DisCo is not liable for errors in the data provided. The platform operator accepts the data as-is and validates independently where possible.

4. **Update cadence**: The DisCo agrees to provide updated operational data (supply hours, losses) on an agreed schedule — at minimum annually, ideally quarterly.

5. **Confidentiality of derived outputs**: Site-level analysis outputs that can be reverse-engineered to reveal DisCo operational data (e.g. detailed feeder loss rates) are treated as confidential and only shared with the specific DisCo, REA, and NERC.

6. **Termination**: If the DisCo withdraws from the DARES programme, the platform operator will delete or anonymise all DisCo-specific data within 30 days.

---

## Part C — World Bank DARES Team Data

The DARES project team in Abuja has been engaged in pipeline development with GIZ, GEAPP, and RMI for interconnected minigrid sites across multiple DisCos. Some of this work has produced feeder-level data that has not been publicly published.

**Who to contact:**

Task Team Leader: Arsh Sharma (TTL, based in Abuja per the PAD)
Organisation: World Bank Nigeria, Energy and Extractives Global Practice
Reference: Nigeria DARES Project (P179687)

**What to request:**

1. Any feeder-level GIS data collected during the DARES interconnected minigrid pipeline development work with GIZ, GEAPP, and RMI
2. The pre-feasibility studies and energy audit reports for the five pilot interconnected minigrid projects referenced in the PAD
3. The Odyssey platform export of the NEP mini-grid site data — this includes location data for over 103 commissioned and 200+ pipeline mini-grid sites, some of which may be on or near AEDC, KEDCO, or Ikeja feeders
4. The geospatial index used for NEP grant targeting — which may include feeder-band overlays produced internally by REA/the World Bank team

**Framing:** Given that SEforALL is a formal DARES ecosystem partner (the PAD explicitly names SEforALL as a collaborator), this request should go through the SEforALL Nigeria country representative, not as a cold outreach. Frame it as a request for data sharing to support the geospatial planning platform component of Sub-component 3.2 (DARES Ecosystem and Implementation).

---

## Part D — Reconstructing AEDC and Ikeja Feeder Maps from Satellite

While Part B negotiations are underway, it is possible to produce a working-quality feeder layer for AEDC (FCT only) and Ikeja Electric using satellite tracing. This is a manual GIS process but is feasible in 2–3 weeks with one GIS analyst.

### Method

**Step 1 — Base layer from OSM**

Download OSM power lines for Lagos and FCT using the Overpass queries in Part A5. This gives you the existing mapped lines as a starting skeleton.

**Step 2 — Satellite tracing in QGIS**

Open QGIS and add the following base map layers:
- Google Satellite (via XYZ Tiles: `https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}`)
- Mapbox Satellite (if a Mapbox token is available)
- Bing Aerial (via QGIS plugin)

Enable the OSM power line layer as a reference. Where OSM lines exist, validate against satellite imagery. Where lines are missing (identifiable as thin silver/grey lines on pylons visible in high-resolution imagery), trace new segments using QGIS digitising tools.

**Step 3 — Attribute assignment**

For each traced line, assign:
- `voltage_kv`: infer from pylon type and substation connectivity (33kV lines use larger pylons; 11kV uses smaller poles)
- `disco_name`: AEDC or Ikeja Electric based on franchise boundary
- `source`: `satellite_traced` — tag all manually traced lines clearly for later validation
- `confidence`: `low` — these lines need DisCo validation before use in financial analysis

**Step 4 — Substation identification**

Substations are visible in satellite imagery as rectangular fenced compounds with transformer equipment. For Lagos, most 33kV substations are identifiable. Add as point features with attributes:
- `name`: infer from nearby street name or community name
- `voltage_primary_kv`: 33
- `voltage_secondary_kv`: 11

**Step 5 — Load into the feeders table**

Follow the same PostGIS loading process as the KEDCO data in Part A1, but set `band` and `supply_hours` to NULL, and add a `data_quality` field set to `'reconstructed'` to distinguish these from DisCo-provided data.

```sql
INSERT INTO feeders (feeder_id, disco_name, voltage_kv, status, data_quality, geom)
SELECT
  'AEDC-TRACED-' || gid AS feeder_id,
  'AEDC' AS disco_name,
  voltage_kv,
  'existing' AS status,
  'reconstructed' AS data_quality,
  geom
FROM feeders_aedc_traced;
```

**Limitations of this approach:**

Satellite-traced feeder maps should be treated as planning-grade only — good enough to identify candidate site clusters along feeder corridors, not good enough to produce network topology models or fault analysis. Replace with DisCo-provided data as soon as it is available.

---

## Data Ingestion Checklist

Track progress against each data item using this checklist. Update as items are completed.

### Public downloads

- [ ] KEDCO MV lines — downloaded from energydata.info
- [ ] KEDCO MV lines — loaded into PostGIS as `feeders_kedco_raw`
- [ ] KEDCO MV lines — normalised into `feeders` table
- [ ] National transmission network — downloaded (GeoJSON)
- [ ] National transmission network — loaded into PostGIS as `transmission_national`
- [ ] Nigeria SE4ALL clusters — FCT downloaded
- [ ] Nigeria SE4ALL clusters — Kano, Katsina, Jigawa downloaded
- [ ] Nigeria SE4ALL clusters — Lagos downloaded
- [ ] Nigeria SE4ALL clusters — all states loaded into PostGIS as `settlement_clusters`
- [ ] OSM power infrastructure — Lagos extract downloaded
- [ ] OSM power infrastructure — FCT extract downloaded
- [ ] OSM power infrastructure — Kano/Katsina/Jigawa extract downloaded
- [ ] OSM data — loaded into PostGIS as `feeders_osm_raw`
- [ ] DRE Atlas Nigeria — requested from ESMAP
- [ ] DRE Atlas Nigeria — loaded and joined to settlement clusters
- [ ] MapYourGrid substations dataset (2025) — downloaded and loaded

### DisCo direct requests

- [ ] AEDC data-sharing agreement — drafted and sent
- [ ] AEDC data-sharing agreement — signed
- [ ] AEDC feeder GIS/CAD file — received
- [ ] AEDC band classifications — received
- [ ] AEDC supply hours per feeder — received
- [ ] AEDC ATC&C losses — received
- [ ] AEDC data — loaded into PostGIS
- [ ] KEDCO band classifications — requested
- [ ] KEDCO band classifications — received and joined to existing feeder layer
- [ ] KEDCO supply hours per feeder — received
- [ ] KEDCO ATC&C losses — received
- [ ] Ikeja Electric data-sharing agreement — drafted and sent
- [ ] Ikeja Electric data-sharing agreement — signed
- [ ] Ikeja Electric feeder GIS/CAD file — received
- [ ] Ikeja Electric band classifications — received
- [ ] Ikeja Electric supply hours per feeder — received
- [ ] Ikeja Electric ATC&C losses — received
- [ ] Ikeja Electric data — loaded into PostGIS

### World Bank DARES team

- [ ] Initial contact made with DARES TTL (Arsh Sharma)
- [ ] DARES feeder/site data request submitted
- [ ] Odyssey NEP mini-grid site export requested
- [ ] Geospatial index data received

### Satellite reconstruction (AEDC and Ikeja — interim layer)

- [ ] AEDC FCT feeder tracing — started in QGIS
- [ ] AEDC FCT feeder tracing — completed and loaded as `feeders_aedc_traced`
- [ ] Ikeja Electric feeder tracing — started in QGIS
- [ ] Ikeja Electric feeder tracing — completed and loaded as `feeders_ikeja_traced`
- [ ] Both traced layers flagged `data_quality = 'reconstructed'` in database

---

## Summary: Data Availability by DisCo

| Data item | KEDCO | AEDC | Ikeja Electric |
|-----------|-------|------|----------------|
| MV feeder routes | ✅ Public (energydata.info) | ⚠️ OSM + satellite only | ⚠️ OSM + satellite only |
| Substation locations | ✅ Public (energydata.info) | ⚠️ Partial (OSM) | ⚠️ Partial (OSM) |
| Band classification (A–E) | ❌ DisCo request | ❌ DisCo request | ❌ DisCo request |
| Supply hours per feeder | ❌ DisCo request | ❌ DisCo request | ❌ DisCo request |
| ATC&C losses per feeder | ❌ DisCo request | ❌ DisCo request | ❌ DisCo request |
| Customer counts per feeder | ❌ DisCo request | ❌ DisCo request | ❌ DisCo request |
| Settlement clusters | ✅ SE4ALL GeoNode | ✅ SE4ALL GeoNode | ✅ SE4ALL GeoNode |
| Grid distance (per settlement) | ✅ DRE Atlas (request ESMAP) | ✅ DRE Atlas (request ESMAP) | ✅ DRE Atlas (request ESMAP) |
| Transmission backbone | ✅ energydata.info | ✅ energydata.info | ✅ energydata.info |

**Legend:** ✅ Available now · ⚠️ Approximate only · ❌ DisCo direct request required

The platform can be built and the analysis engines can be tested using the publicly available data. However, the Band C/D/E feeder targeting that is the core DARES siting criterion cannot function without the DisCo operational data. The DisCo data-sharing agreements should be treated as a critical path dependency alongside the technical build.

---

*Document version 1.0 — prepared June 2026*
*Part of the Nigeria Minigrid PFS Platform build documentation series*
