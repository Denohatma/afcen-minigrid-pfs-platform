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

This dataset covers the 330kV and 132kV transmission backbone — TCN infrastructure, not DisCo distribution feeders. It is useful for mapping substation injection points into each DisCo franchise area.

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

---

### A3. Nigeria SE4ALL Settlement Clusters (All States)

**Download portal:**
```
https://data.nigeriase4all.gov.ng/layers/geonode_data:geonode:cluster_all
```

| DisCo | States to download |
|-------|-------------------|
| AEDC | FCT, Niger, Kogi, Nasarawa |
| KEDCO | Kano, Katsina, Jigawa |
| Ikeja Electric | Lagos |

---

### A4. Nigeria SE4ALL Power Sector Webmap Layers

**Webmap URL:**
```
https://apps.nigeriase4all.gov.ng/power-sector
```

---

### A5. OpenStreetMap Power Infrastructure

**Overpass queries:**

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

Run queries at: `https://overpass-turbo.eu`

---

### A6. World Bank DRE Atlas (Settlement-Level Grid Distance)

Route 1 — GEP Explorer: `https://electrification.energydata.info`

Route 2 — Email `esmap@worldbank.org` referencing Nigeria NEAP (P161885)

---

### A7. MapYourGrid Nigeria Datasets

```
https://mapyourgrid.org/global-grid-data/
```

2025 substations dataset is most current.

---

## Part B — DisCo Direct Request: Operational Data

### Core data request (all three DisCos):

| Data item | Format | Priority | Use in platform |
|-----------|--------|----------|-----------------|
| Feeder route map (33kV and 11kV) | Shapefile, DWG, or PDF | Critical | Feeder layer geometry |
| Feeder name and ID register | Excel or CSV | Critical | Feeder identification |
| NERC band classification per feeder | Excel or CSV | Critical | DARES targeting filter |
| Supply hours per day per feeder | Excel or CSV | Critical | Demand engine input |
| ATC&C loss rate per feeder (%) | Excel or CSV | High | Financial engine input |
| Number of customers per feeder | Excel or CSV | High | Demand sizing |
| Customer category split per feeder | Excel or CSV | High | Load profile engine |
| Substation locations with capacity (MVA) | Excel/CSV/Shapefile | High | Network model |
| Planned feeder extensions (next 3 years) | Any format | Medium | Grid risk engine |
| Feeder-level monthly energy delivered (MWh) | Excel or CSV | Medium | Demand calibration |

---

## Part C — World Bank DARES Team Data

**Contact:** Task Team Leader Arsh Sharma (Abuja), World Bank Nigeria Energy and Extractives Global Practice. Reference: Nigeria DARES Project (P179687).

---

## Part D — Reconstructing AEDC and Ikeja Feeder Maps from Satellite

Method: OSM base layer + QGIS satellite tracing + PostGIS loading. Tag all traced lines as `data_quality = 'reconstructed'`.

---

## Summary: Data Availability by DisCo

| Data item | KEDCO | AEDC | Ikeja Electric |
|-----------|-------|------|----------------|
| MV feeder routes | Available (energydata.info) | OSM + satellite only | OSM + satellite only |
| Substation locations | Available (energydata.info) | Partial (OSM) | Partial (OSM) |
| Band classification (A–E) | DisCo request | DisCo request | DisCo request |
| Supply hours per feeder | DisCo request | DisCo request | DisCo request |
| ATC&C losses per feeder | DisCo request | DisCo request | DisCo request |
| Settlement clusters | SE4ALL GeoNode | SE4ALL GeoNode | SE4ALL GeoNode |
| Grid distance (per settlement) | DRE Atlas | DRE Atlas | DRE Atlas |
| Transmission backbone | energydata.info | energydata.info | energydata.info |

---

*Document version 1.0 — June 2026*
