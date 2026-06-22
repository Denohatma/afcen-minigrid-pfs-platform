# InvestIQ Nigeria — Product Requirements Document & Standard Operating Procedure

**Platform:** DARES Interconnected Mini-Grids (IMG) Programme Operating System
**Version:** 2.0.0
**Date:** June 2026
**Project:** World Bank P179687 — DARES Sub-Component 1.1
**Prepared for:** AfCEN / REA / World Bank DARES PMU

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Programme Context](#2-programme-context)
3. [Platform Architecture](#3-platform-architecture)
4. [Infrastructure & Deployment (SOP)](#4-infrastructure--deployment-sop)
5. [Backend Specification](#5-backend-specification)
6. [Frontend Specification](#6-frontend-specification)
7. [Module Reference](#7-module-reference)
8. [Data Model](#8-data-model)
9. [API Endpoint Inventory](#9-api-endpoint-inventory)
10. [Role-Based Access Control](#10-role-based-access-control)
11. [State Machines](#11-state-machines)
12. [Static Data & GIS](#12-static-data--gis)
13. [Alfred AI Assistant](#13-alfred-ai-assistant)
14. [Embedded Programme Knowledge](#14-embedded-programme-knowledge)
15. [Recreation Checklist (SOP)](#15-recreation-checklist-sop)
16. [Testing Protocol](#16-testing-protocol)

---

## 1. Executive Summary

InvestIQ Nigeria is a full-stack web platform that manages the end-to-end lifecycle of Nigeria's interconnected mini-grid (IMG) programme under DARES (Distributed Access through Renewable Energy Scale). The platform spans 12 functional modules covering 23,806 candidate settlement sites across 3 DisCo franchise areas (AEDC, KEDCO, IE).

### Platform Statistics (Verified June 2026)

| Metric | Value |
|---|---|
| Total API routes | 183 handlers across 150 paths |
| Frontend pages | 16 pages (App Router) |
| Database models | 30+ SQLAlchemy ORM models |
| Settlement records | 23,806 |
| DisCo franchise areas | 3 (AEDC, KEDCO, IE) |
| User roles | 6 frontend / 12 backend |
| Docker services | 4 (PostgreSQL, FastAPI, Next.js, nginx) |

### Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Backend | Python + FastAPI + SQLAlchemy (async) | Python 3.11, FastAPI >=0.115 |
| Frontend | Next.js + React + TypeScript | Next.js 16.2.4, React 19 |
| Database | PostgreSQL | 16 (Alpine) |
| State management | TanStack React Query | v5 |
| UI framework | shadcn/ui + Tailwind CSS | v4 |
| Maps | Leaflet + react-leaflet | 1.9.4 / 5.0.0 |
| Charts | Recharts | 3.8.1 |
| Reverse proxy | nginx | Alpine |
| Container runtime | Docker Compose | v2 |

---

## 2. Programme Context

### DARES Overview

| Attribute | Value |
|---|---|
| Programme | DARES Sub-Component 1.1 — Interconnected Mini-Grids |
| World Bank project | P179687 |
| Total financing | $1,818M (IDA: $750M — $150M credit + $600M Scale-Up Window) |
| Component 1 (minigrids) | $1,023M |
| MST envelope | $215M |
| PBG envelope | $195M |
| Closing date | 31 December 2028 |

### Tender Mechanism
- **MST** — Minimum Subsidy Tender (non-discretionary, reverse auction on grant per connection)
- **PBG** — Performance-Based Grant (CAPEX subsidy disbursed against verified milestones)
- **Grant per connection range:** $350–$600

### Disbursement Milestones
| Gate | Tranche | Trigger |
|---|---|---|
| M1 | 40% | Commissioning + site prep |
| M2 | 40% | Verified connections |
| M3 | 20% | 12-month sustained operation |

### LCOE Pathway
First-wave: $0.57/kWh → Second-wave target: $0.18/kWh (68% reduction).

### First-Wave Pilot IMGs

| Site | DisCo | State | Developer | PV kW | Battery kWh | Connections | CAPEX |
|---|---|---|---|---|---|---|---|
| Toto | AEDC | Nasarawa | PowerGen | 352 | 972 | 1,756 | $3.0M |
| Zawaciki | KEDCO | Kano | Bagaja | 1,000 | N/A | 1,039 | $2.5M |
| Robinyan | IE | Ogun | Darway Coast | 500 | 625 | 1,400 | $1.3M |
| Wuse | AEDC | FCT | GVE | 1,000 | 1,200 | 2,166 | $2.4M |

### DisCo Franchise Areas

| DisCo | States Covered |
|---|---|
| AEDC | FCT/Abuja, Nasarawa, Niger, Kogi |
| KEDCO | Kano, Katsina, Jigawa |
| IE (Ikeja Electric) | Lagos Mainland/North |

---

## 3. Platform Architecture

```
                    ┌──────────────────────────────────┐
                    │         Browser (port 80)         │
                    └───────────────┬──────────────────┘
                                    │
                    ┌───────────────▼──────────────────┐
                    │         nginx (reverse proxy)     │
                    │   /api/v1/* → backend:8000        │
                    │   /health  → backend:8000         │
                    │   /*       → frontend:3000        │
                    └────────┬──────────┬──────────────┘
                             │          │
               ┌─────────────▼──┐   ┌──▼───────────────┐
               │  FastAPI Backend│   │ Next.js Frontend  │
               │  (port 8000)   │   │ (port 3000)       │
               │  SQLAlchemy    │   │ App Router         │
               │  async + Pydantic│ │ TanStack Query     │
               └────────┬───────┘  │ shadcn/ui          │
                        │          │ Leaflet maps        │
               ┌────────▼───────┐  └────────────────────┘
               │ PostgreSQL 16  │
               │ (port 5432)    │
               │ DB: minigrid   │
               └────────────────┘
```

### Request Flow

1. Browser → nginx (port 80)
2. nginx routes `/api/v1/*` → backend container (port 8000)
3. nginx routes `/*` → frontend container (port 3000)
4. Frontend API client sends requests to `/api/proxy/[...path]` route handler
5. Proxy route handler forwards to `BACKEND_URL/api/v1/{path}` with `X-User-Role` header
6. Backend reads `X-User-Role` header for RBAC, defaults to `rea_pmu_officer`

### Key Design Decisions

- **No authentication required** — all users auto-authenticated via `X-User-Role` header (auth to be added post-testing)
- **No Alembic migrations** — tables created via `Base.metadata.create_all` on startup; schema changes require `docker volume rm nigeria_pgdata`
- **Frontend Docker build** requires `docker build --network=host` (not `docker compose build --network=host`)
- **Unit mismatch**: `demand_kwh` field in `ranked_settlements.json` is actually MWh — multiply by 1000 for kWh

---

## 4. Infrastructure & Deployment (SOP)

### 4.1 Prerequisites

| Requirement | Version |
|---|---|
| Docker Desktop | Latest |
| Docker Compose | v2+ |
| Node.js (for local dev) | 20+ |
| Python (for local dev) | 3.11+ |
| Git | Latest |

### 4.2 Directory Structure

```
Nigeria/
├── backend/
│   ├── app/
│   │   ├── main.py                        # FastAPI entry point
│   │   ├── api/routes/                    # 13 route modules
│   │   │   ├── settlements.py
│   │   │   ├── lots.py
│   │   │   ├── procurement.py
│   │   │   ├── eval_stages.py
│   │   │   ├── agreements.py
│   │   │   ├── cp_tracker.py
│   │   │   ├── disbursements.py
│   │   │   ├── gis.py
│   │   │   ├── esg.py
│   │   │   ├── tickets.py
│   │   │   ├── settlement_invoices.py
│   │   │   ├── mel.py
│   │   │   └── alfred.py
│   │   ├── db/
│   │   │   ├── models.py                  # All ORM models
│   │   │   └── session.py                 # DB session factory
│   │   ├── dependencies/
│   │   │   └── auth.py                    # RBAC layer
│   │   └── core/
│   │       └── config.py                  # Settings
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/                           # Next.js App Router pages
│   │   │   ├── page.tsx                   # Landing page
│   │   │   ├── layout.tsx                 # Root layout
│   │   │   ├── providers.tsx              # QueryClient + Role providers
│   │   │   ├── globals.css                # Tailwind + theme
│   │   │   ├── api/proxy/[...path]/route.ts  # API proxy
│   │   │   └── (dashboard)/              # All dashboard pages
│   │   ├── lib/
│   │   │   ├── api.ts                     # API client (all endpoints)
│   │   │   ├── types.ts                   # TypeScript interfaces
│   │   │   ├── role-context.tsx           # Role system
│   │   │   └── utils.ts                  # Utilities
│   │   └── components/
│   │       ├── navbar.tsx                 # Navigation + role switcher
│   │       ├── alfred-chat.tsx            # AI assistant widget
│   │       ├── settlement-map.tsx         # Leaflet map
│   │       └── ui/                        # shadcn components
│   ├── public/
│   │   ├── distribution-lines.geojson     # 33/11kV lines
│   │   ├── substations.geojson            # 44 substations
│   │   ├── hero-site-{1,2,3}.jpeg         # Landing page images
│   │   ├── nigeria-flag.svg
│   │   ├── rea-logo.jpeg
│   │   ├── wb-logo.jpg
│   │   ├── seforall-logo.png
│   │   └── logo-icon.svg                  # AfCEN logo
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.ts
│   └── tsconfig.json
├── nginx/
│   ├── nginx.conf
│   └── Dockerfile
├── src/data/
│   ├── ranked_settlements.json            # 23,806 settlements
│   ├── nigeria_config.json                # Programme config
│   └── financial_defaults.json            # CAPEX/financing defaults
├── docker-compose.yml
└── pics/                                  # Source photographs
```

### 4.3 Step-by-Step Deployment

```bash
# 1. Clone the repository
git clone <repo-url> Nigeria
cd Nigeria

# 2. Build backend (from project root — context needs src/data/)
docker build -f backend/Dockerfile -t nigeria-backend .

# 3. Build frontend (MUST use --network=host for npm install)
docker build --network=host -t nigeria-frontend -f frontend/Dockerfile frontend

# 4. Build nginx
docker build -t nigeria-nginx -f nginx/Dockerfile nginx

# 5. Start all services
docker compose up -d

# 6. Verify health
curl http://localhost/health
# Expected: {"status":"ok","version":"2.0.0","environment":"development"}

# 7. Verify settlement data loads
curl -s "http://localhost/api/v1/settlements?limit=1" | python3 -m json.tool
# Expected: 23,806 total settlements

# 8. Open browser
open http://localhost
```

### 4.4 Database Reset (Schema Changes)

When models change, the database volume must be recreated:

```bash
docker compose down
docker volume rm nigeria_pgdata
docker compose up -d
```

### 4.5 Frontend Rebuild (After Code Changes)

```bash
# Rebuild with --no-cache to ensure changes are picked up
docker build --network=host --no-cache -t nigeria-frontend -f frontend/Dockerfile frontend
docker compose up -d frontend
```

### 4.6 Environment Variables

| Variable | Service | Default | Description |
|---|---|---|---|
| `POSTGRES_PASSWORD` | db | `minigrid_dev` | PostgreSQL password |
| `DATABASE_URL` | backend | `postgresql+asyncpg://minigrid:minigrid_dev@db:5432/minigrid` | Async DB connection |
| `BACKEND_URL` | frontend | `http://backend:8000` | Backend URL for API proxy |
| `ENVIRONMENT` | backend | `development` | Environment flag |
| `CORS_ORIGINS` | backend | `["*"]` | Allowed CORS origins |
| `CLERK_SECRET_KEY` | backend | (empty) | Auth — not yet enabled |
| `R2_ENDPOINT_URL` | backend | (empty) | Cloudflare R2 for document storage |
| `R2_ACCESS_KEY_ID` | backend | (empty) | R2 credentials |
| `R2_SECRET_ACCESS_KEY` | backend | (empty) | R2 credentials |
| `R2_BUCKET_NAME` | backend | `minigrid-documents` | R2 bucket name |

### 4.7 Docker Compose Services

| Service | Image | Port | Health Check |
|---|---|---|---|
| `db` | postgres:16-alpine | 5432 (internal) | `pg_isready -U minigrid` |
| `backend` | nigeria-backend | 8000 (internal) | `GET /health` |
| `frontend` | nigeria-frontend | 3000 (internal) | — |
| `nginx` | nigeria-nginx | **80 (exposed)** | — |

---

## 5. Backend Specification

### 5.1 Entry Point (`app/main.py`)

- Creates `FastAPI` app with title "Nigeria InvestIQ API", version "2.0.0"
- Adds `CORSMiddleware` with configurable origins
- On startup: `init_db()` creates all tables via `Base.metadata.create_all`
- Includes 13 route modules with prefix `/api/v1`
- `GET /health` — returns status, version, environment

### 5.2 Database Session (`app/db/session.py`)

- `DATABASE_URL` from environment, fallback: `sqlite+aiosqlite:///./nigeria.db`
- Auto-converts `postgresql://` to `postgresql+asyncpg://`
- `AsyncSessionLocal` with `expire_on_commit=False`
- `get_db()` dependency yields async sessions
- `init_db()` runs `create_all` for all models

### 5.3 Configuration (`app/core/config.py`)

Uses `pydantic_settings.BaseSettings`:

| Field | Default |
|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./nigeria.db` |
| `SECRET_KEY` | `dev-secret-key-change-in-production` |
| `ALGORITHM` | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 60 |
| `CORS_ORIGINS` | `["*"]` |
| `ENVIRONMENT` | `development` |

### 5.4 Backend Dockerfile

```dockerfile
FROM python:3.11-slim
# Install gcc, libpq-dev
# Copy requirements.txt → pip install
# Copy src/ → /app/src/
# Copy backend/app/ → /app/app/
# PYTHONPATH=/app
# EXPOSE 8000
# Healthcheck: GET http://localhost:8000/health
# CMD: uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 5.5 Dependencies (requirements.txt)

fastapi, uvicorn, pydantic, pydantic-settings, sqlalchemy[asyncio], aiosqlite, asyncpg, psycopg2-binary, alembic, boto3, pyjwt[crypto], httpx, requests, jinja2, networkx, python-docx, geopy, shapely, matplotlib, staticmap, numpy, python-multipart

---

## 6. Frontend Specification

### 6.1 Package Configuration

**Runtime:** Next.js 16.2.4, React 19, TanStack React Query v5, Leaflet 1.9.4, react-leaflet 5.0.0, recharts 3.8.1, sonner 2.0.7, zod 4.4.2, react-hook-form 7.56.4, shadcn 4.6.0, lucide-react

**Build:** TypeScript 5, Tailwind CSS v4, `@tailwindcss/postcss`

### 6.2 Next.js Configuration

```ts
output: "standalone"      // Self-contained bundle for Docker
turbopack: { root: "." }  // Dev server bundler
```

### 6.3 Frontend Dockerfile (3-stage)

```
Stage 1 (deps): node:20-alpine → npm ci
Stage 2 (builder): Copy node_modules + source → npm run build
Stage 3 (runner): Copy .next/standalone + .next/static + public → node server.js
```

### 6.4 Theme & Design System

- **Font primary:** IBM Plex Sans (300–700)
- **Font headings:** Space Grotesk (400–700)
- **Font mono:** Geist Mono
- **Primary color:** `#1a4d2e` (AfCEN dark green)
- **Background:** `#f5f1e8` (warm off-white)
- **Navy:** `#0f1b2b` (sidebar, hero)
- **Gold:** `#d3a54a` (AfCEN accent)
- **No dark mode defined** — light mode only

### 6.5 Providers

```
<Providers>
  <QueryClientProvider>    // staleTime: 30s, retry: 1
    <RoleProvider>         // localStorage["dares-role"] → X-User-Role header
      {children}
    </RoleProvider>
  </QueryClientProvider>
</Providers>
<Toaster position="bottom-right" richColors closeButton />
```

### 6.6 API Proxy (`/api/proxy/[...path]/route.ts`)

- Reconstructs: `${BACKEND_URL}/api/v1/${path}${query}`
- Forwards `X-User-Role` header
- Strips `transfer-encoding` and `connection` headers
- SSE streaming support for `text/event-stream`
- Exports: GET, POST, PUT, DELETE, PATCH

---

## 7. Module Reference

### Module 1 — Site Registry (`/sites`)

**Purpose:** Browse, filter, and select 23,806 candidate settlement sites. Create lots (groupings of sites by DisCo) for the tender pipeline.

**Key features:**
- Side-by-side layout: interactive Leaflet map (left) + filterable data table (right)
- Filters: DisCo, MG type, search text, min population, max grid distance
- Score colour thresholds: >=70 green, >=50 amber, <50 red
- Score weights: Population 25%, Wealth 20%, Demand 25%, Security 15%, Grid Dist 15%
- Lot creation flow: Select sites → Review (enforces single-DisCo constraint) → Create lot
- Alfred AI chat widget embedded on page
- **Signal badges** — each settlement gets a priority signal derived from composite score:
  - HIGH_PRIORITY (green, score ≥70): 386 sites — ready for immediate investment
  - CONDITIONAL (amber, 50–70): 4,360 sites — viable with conditions
  - LOW_PRIORITY (red, 30–50): 13,930 sites — lower viability
  - REVIEW (purple, <30): 5,130 sites — needs further assessment
- **Pipeline filter pills** — 5 filters above the table: All, High Priority, Conditional, Low Priority, In Lot
  - Server-side filtering via `min_score`/`max_score` query params for score-based filters
  - Client-side "In Lot" filter shows only settlements assigned to existing lots
- **"In Lot" column** — shows which settlements are already assigned to lots
- Default sort: signal priority (high→low), then score descending within each signal tier
- **kWh display** — demand_kwh field in data is MWh, displayed as kWh (×1000)

**Map layers (toggleable):**
- DisCo boundaries (GeoJSON polygons, colored by DisCo)
- 330kV/132kV transmission lines (hardcoded TCN data)
- 33kV distribution lines (from `/distribution-lines.geojson`)
- 11kV distribution lines (hidden by default)
- 44 substations (from `/substations.geojson`)
- Settlement markers (CircleMarker, radius scaled by score, max 300 visible)

### Module 2 — System Sizing (`/system-sizing`)

**Purpose:** Client-side PFS engine computing preliminary system sizing and financial metrics for all sites in a lot.

**Sizing constants:**
```
PV: $600/kWp, Battery: $310/kWh, Inverter: $440/kVA
Civil: $22,000 fixed, Metering: $55/conn, Distribution: $280/conn
Solar hours: KEDCO 5.2, AEDC 4.8, IE 4.2
Battery DOD: 80%, Autonomy: 1 day, System efficiency: 85%
```

**Two scenarios:** S1 = 50% connections (MST base case), S2 = 100% connections.

**PFS Report modal:** 6 sections — Executive Summary, Site Assessment, Demand Analysis, System Design, Financial Analysis, Risk Assessment.

### Module 3 — DisCo Readiness (`/disco-readiness`)

**Purpose:** DisCo officers load feeder/POI/metering data and approve lots for tender preparation.

**Data fields (14):** feeder_name, feeder_capacity_mva, feeder_loading_pct, poi_voltage_kv, poi_coordinates, protection_scheme, bulk_meter_type, bulk_meter_comms, existing_customers, avg_monthly_consumption_kwh, tariff_class, billing_cycle, settlement_terms, notes.

**Role views:** DisCo sees "Load Data" + "Approve/Reject"; PMU sees read-only + "Proceed to Tender".

### Module 4–5 — Lots & Tenders (`/lots`, `/lots/[id]`)

**Purpose:** Full tender lifecycle management from lot formation through tender issuance.

**PMU View:** Tender Pipeline table with KPIs (DisCo-Approved Lots, Ready for Tender, Tenders Issued, Total Connections).

**Bidder View:** Shows issued lots, EOI registration, download bid documents, submit bids.

**Lot Detail (PMU):** 7-step tender wizard — Tender Details, Data Room, Technical Requirements, DisCo Interface, Commercial Framework, Grant & CAPEX, Payment Milestones.

**Lot Detail (Bidder):** 3 tabs — Bid Documents (8 folders), Q&A (real-time with 10s refresh), Submit Bid.

**8-folder data room structure:** Procurement Docs, Lot Summary, GIS & Site Maps, Technical Baseline, Commercial Baseline, E&S Baseline, Permitting & CPs, Contract & Grant Annexes.

### Module 6 — Bid Evaluation (`/evaluations`)

**Purpose:** 4-stage blind evaluation pipeline with two-envelope bid structure.

**Stage 1 — Admin Check:** Automated pass/fail against submitted envelopes.

**Stage 2 — Technical Scoring (60% weight):**
- 9 criteria (T1–T9): Company Experience, Technical Approach, System Design, O&M Plan, Personnel Qualifications, Environmental Compliance, Local Content, Implementation Timeline, Risk Mitigation
- Score per criterion with >=80 character justification required
- 70% pass threshold

**Stage 3 — Financial Scoring (40% weight):**
- 4 criteria (F1–F4): Grant per Connection, Proposed Tariff, Financial Sustainability, Cost Competitiveness
- Only bids passing Stage 2 proceed

**Stage 4 — Combined Score:**
- Combined = Technical × 60% + Financial × 40%
- Ranking table with "Recommend for Award" button

**Blind scoring:** Evaluators see bidders as "Bidder A/B/C", cannot see each other's scores.

### Module 7–8 — Grant Agreements & CPs (`/agreements`)

**Purpose:** Manage grant agreements and track 8 categories of conditions precedent.

**KPIs:** Total Agreements, Agreements with CPs, Total Program Value, Total Grant Value.

**CP categories (8):** Corporate, Financing, NERC, NEMSA, DisCo, E&S, Land, Procurement.

**CP workflow:** pending → submitted → verified | waived | overdue.

### Module 9 — Disbursements (`/disbursements`, `/milestones/[agreementId]`)

**Purpose:** 4-gate milestone portfolio tracker with 4-role approval chain.

**Gates:** M0 (Financial Close, 0%), M1 (Commissioning, 40%), M2 (Verified Connections, 40%), M3 (One-Year Utilisation, 20%).

**Approval chain:** Developer submits → IVA verifies → REA PMU approves → Grant Admin authorises payment.

**Required evidence per gate:**
- M1: 7 items (commissioning cert, NEMSA report, as-built, GPS photos, serial numbers, grid-tie test, insurance)
- M2: 5 items (connection register, GPS meter photos, billing screenshot, community sign-off, supply quality report)
- M3: 5 items (12-month meter data, revenue report, CUF calculation, maintenance log, customer survey)

### Module 10 — Tickets & Grievances (`/tickets`, `/tickets/[id]`, `/grievances`)

**Purpose:** SLA-tracked ticket system with GRM integration.

**SLA matrix:**
| Priority | SLA |
|---|---|
| Critical | 24h |
| High | 72h |
| Medium | 7 days |
| Low | 14 days |

**Ticket flow:** open → in_progress → in_review → resolved → closed.

**Features:** Auto-generated TKT-NNNN refs, SLA progress bars, escalation, activity timeline, inline commenting.

**Grievance categories:** land_resettlement, environmental, worker_safety, service_quality, sea_sh, labour, compensation, noise_dust, other.

### Module 11 — Settlement Ledger (`/settlement-ledger`)

**Purpose:** DisCo-Developer billing and payment reconciliation.

**Invoice types:** grid_import (Dev→DisCo), power_export (DisCo→Dev), grid_lease (Dev→DisCo), duos (Dev→DisCo).

**3 views:** All Invoices, By Site (grouped with net position), Disputes.

**Auto-ticket creation:** Disputing or escalating an invoice automatically creates a high-priority ticket.

### Module 12 — M&E / Performance (`/performance`)

**Purpose:** DARES Results Framework tracking, MEL submissions, PDO progress monitoring.

**KPIs:** HH Connected, MSMEs, Female HH %, CO2 Avoided, Generators Displaced, Employment, Avg Availability %, Collection Rate %.

**5 tabs:** Results Framework (PAD Section VII tables), PDO Progress, Submissions, Learning Log, Targets.

**Learning tags (12):** productive_use, reliability, gesi, generator_displacement, tariff, community, technical, commercial, financing, esia_es, interconnection, replication.

**GESI target:** >= 30% female-headed household connections.

---

## 8. Data Model

### 8.1 Core Models (30+ tables)

| Table | Primary Purpose | Key Fields |
|---|---|---|
| `users` | User accounts | email, role, organisation, disco_scope |
| `settlements` | 23,806 candidate sites | rank, village, disco, lat/lon, score, demand_kwh |
| `site_readiness_checks` | Field readiness assessment | status (pending/pass/fail/conditional), 6 boolean checks |
| `disco_readiness_checks` | DisCo validation data | feeder_id, poi_voltage_kv, protection_study, customer data |
| `financial_models` | PFS financial scenarios | CAPEX components, LCOE, NPV, IRR, payback |
| `lots` | Site groupings for tender | lot_ref, disco, status, settlement_ids, deadline |
| `bids` | Developer bid submissions | bid_ref, developer, scores, grant/tariff proposed |
| `bid_documents` | Bid attachments | document_type, filename, s3_key |
| `eval_stages` | Evaluation stage records | stage, status, score, ai_flags, checklist |
| `no_objection_packs` | WB no-objection tracking | pack_type, status, wb_reference |
| `grant_agreements` | Post-award agreements | agreement_ref, status, grant amount, milestones |
| `milestones` | 3-milestone disbursement | milestone_code (M1/M2/M3), grant_pct, verification |
| `conditions_precedent` | CP tracking (8 categories) | cp_ref, category, status, due_date |
| `disbursements` | 6-stage payment approval | disbursement_ref, amount, 4-role approval chain |
| `esg_reports` | E&S compliance reporting | report_type, grievances, ESIA status |
| `tickets` | GRM ticketing | ticket_ref, category, priority, SLA tracking |
| `ticket_comments` | Ticket activity | comment, is_internal |
| `settlement_invoices` | DisCo-Dev billing | invoice_ref, kwh metrics, dispute workflow |
| `iva_site_visits` | IVA verification visits | visit_ref, GPS, deficiency tracking |
| `gps_photos` | Geo-tagged evidence photos | lat/lon, category, s3_key |
| `mel_submissions` | M&E data submissions | 50+ indicator fields, data_completeness_pct |
| `mel_targets` | PDO indicator targets | indicator_key, target_value, target_year |
| `mel_learning_logs` | Knowledge management | tag (12 valid), title, body |
| `audit_logs` | Immutable audit trail | actor, action, entity, before/after JSON |
| `evaluation_stages` | 4-stage pipeline stages | stage_number, status, threshold, weight |
| `evaluation_criteria` | Scoring criteria (T1-T9, F1-F4) | criterion_code, max_score, weight_pct |
| `evaluation_scores_v2` | Individual evaluator scores | score, justification (80-char min) |
| `evaluation_bid_results` | Per-bid stage results | stage scores, combined score, rank |
| `bid_envelopes` | Two-envelope submission | envelope_type, form_data, encryption |
| `bid_opening_records` | Bid opening ceremony | committee_members, bid_summary |
| `standstill_notifications` | NOIA tracking | complaint handling, award clearance |

### 8.2 Auto-Generated References

All `_ref` fields use zero-padded sequential counters:

| Entity | Pattern | Example |
|---|---|---|
| Lot | LOT-NNN | LOT-001 |
| Bid | BID-NNNN | BID-0001 |
| Grant Agreement | GA-NNNN | GA-0001 |
| CP | CP-NNNN | CP-0001 |
| Disbursement | DISB-NNNN | DISB-0001 |
| Ticket | TKT-NNNN | TKT-0001 |
| Invoice | INV-NNNN | INV-0001 |
| ESG Report | ESG-NNNN | ESG-0001 |
| IVA Visit | VISIT-NNNN | VISIT-0001 |

### 8.3 Computed Fields (Server-Side)

| Field | Model | Formula |
|---|---|---|
| `total_capex_usd` | FinancialModel | Sum of all CAPEX components |
| `lcoe_usd_per_kwh` | FinancialModel | (CAPEX + NPV_opex) / NPV_energy |
| `female_hh_pct` | MELSubmission | female_hh / hh_connected × 100 |
| `renewable_energy_fraction` | MELSubmission | kwh_generated / (kwh_generated + kwh_from_grid) × 100 |
| `data_completeness_pct` | MELSubmission | Count non-null across 8 required fields / 8 × 100 |
| `sla_due_at` | Ticket | created_at + SLA hours by priority |

---

## 9. API Endpoint Inventory

**Total: 183 route handlers across 150 paths.**

### Health & Config
```
GET  /health
GET  /api/v1/settlements/stats
```

### Settlements (Module 1)
```
GET  /api/v1/settlements                    # List with filters (disco, state, min_score, max_score, limit, offset)
GET  /api/v1/settlements/{rank}             # Get by rank
GET  /api/v1/settlements/stats              # Aggregate stats by DisCo
```

### Site Registry (Module 1)
```
GET  /api/v1/site-registry/sites            # List registered sites
POST /api/v1/site-registry/sites            # Register new site
GET  /api/v1/site-registry/sites/{id}       # Get site detail
PUT  /api/v1/site-registry/sites/{id}       # Update site
GET  /api/v1/site-registry/sites/stats      # Registry stats
GET  /api/v1/site-registry/programs         # List programmes
POST /api/v1/site-registry/programs         # Create programme
```

### DisCo Readiness (Module 3)
```
GET  /api/v1/disco-readiness                # List records
POST /api/v1/disco-readiness                # Create/upsert record
GET  /api/v1/disco-readiness/{site_id}      # Get for site
PUT  /api/v1/disco-readiness/{id}/validate  # Validate record
GET  /api/v1/disco-readiness/dashboard      # Dashboard stats
POST /api/v1/interconnection                # Create interconnection requirement
GET  /api/v1/interconnection/{site_id}      # Get interconnection
PUT  /api/v1/interconnection/{id}           # Update interconnection
```

### Lots & Tenders (Modules 4-5)
```
GET  /api/v1/lots                           # List lots with filters
POST /api/v1/lots                           # Create lot
GET  /api/v1/lots/{id}                      # Get lot detail
PUT  /api/v1/lots/{id}                      # Update lot
GET  /api/v1/lots/site-assignments          # Site-to-lot mapping
POST /api/v1/lots/{id}/sites                # Add sites to lot
POST /api/v1/lots/{id}/sites-by-rank        # Add sites by rank numbers
DELETE /api/v1/lots/{id}/sites/{site_id}    # Remove site from lot
PUT  /api/v1/lots/{id}/approve              # DisCo approve
PUT  /api/v1/lots/{id}/reject               # DisCo reject
PUT  /api/v1/lots/{id}/disco-notes          # Update DisCo notes
GET  /api/v1/lots/{id}/data-room            # Data room documents
POST /api/v1/lots/{id}/data-room/documents  # Add document
GET  /api/v1/lots/{id}/data-room/completeness # Completeness score
POST /api/v1/lots/{id}/tender               # Create tender for lot
GET  /api/v1/tenders/{id}                   # Get tender
PUT  /api/v1/tenders/{id}                   # Update tender
PUT  /api/v1/tenders/{id}/issue             # Issue tender
PUT  /api/v1/tenders/{id}/close             # Close tender
GET  /api/v1/tenders/{id}/questions         # List Q&A
POST /api/v1/tenders/{id}/questions         # Ask question
PUT  /api/v1/tender-questions/{id}/answer   # Answer question
GET  /api/v1/tenders/{id}/bids              # List bids
POST /api/v1/tenders/{id}/bids              # Submit bid
GET  /api/v1/bids/{id}                      # Get bid detail
```

### Bidders
```
GET  /api/v1/bidders                        # List bidders
POST /api/v1/bidders                        # Register bidder
GET  /api/v1/bidders/{id}                   # Get bidder
PUT  /api/v1/bidders/{id}                   # Update bidder
POST /api/v1/bidders/{id}/nda/{lot_id}      # Accept NDA
```

### Evaluation (Module 6)
```
GET  /api/v1/evaluations/tender/{id}        # List evaluations for tender
POST /api/v1/evaluations/tender/{id}/create # Create evaluations
GET  /api/v1/evaluations/{id}               # Get evaluation
PUT  /api/v1/evaluations/{id}/admin-check   # Admin check
PUT  /api/v1/evaluations/{id}/technical-score # Technical score
PUT  /api/v1/evaluations/{id}/financial-score # Financial score
PUT  /api/v1/evaluations/{id}/recommend     # Recommend
GET  /api/v1/evaluations/{id}/ai-flags      # List AI flags
POST /api/v1/evaluations/{id}/ai-flags      # Create AI flag
PUT  /api/v1/ai-flags/{id}/action           # Action AI flag
```

### Evaluation Stages (Module 6 — 4-stage pipeline)
```
POST /api/v1/eval/lots/{id}/stages/setup            # Setup 4 stages + criteria
GET  /api/v1/eval/lots/{id}/stages                   # List stages
POST /api/v1/eval/lots/{id}/stages/1/run             # Run admin check
POST /api/v1/eval/lots/{id}/stages/{n}/score         # Score criterion
GET  /api/v1/eval/lots/{id}/stages/{n}/progress      # Scoring progress
POST /api/v1/eval/lots/{id}/stages/2/lock            # Lock technical
POST /api/v1/eval/lots/{id}/stages/3/lock            # Lock financial
POST /api/v1/eval/lots/{id}/stages/4/calculate       # Calculate combined
POST /api/v1/eval/lots/{id}/stages/4/recommend       # Recommend winner
GET  /api/v1/eval/lots/{id}/results                  # All results
POST /api/v1/eval/lots/{id}/bid-opening              # Bid opening record
GET  /api/v1/eval/lots/{id}/envelopes                # List envelopes
POST /api/v1/eval/lots/{id}/envelopes                # Create envelope
PUT  /api/v1/eval/lots/{id}/envelopes/{id}/submit    # Submit envelope
PUT  /api/v1/eval/lots/{id}/envelopes/{id}/save      # Save draft
```

### No-Objection
```
POST /api/v1/no-objection                   # Create pack
GET  /api/v1/no-objection/lot/{lot_id}      # Get for lot
PUT  /api/v1/no-objection/{id}/submit       # Submit pack
PUT  /api/v1/no-objection/{id}/approve      # Approve pack
```

### Agreements & CPs (Modules 7-8)
```
GET  /api/v1/agreements                     # List agreements
POST /api/v1/agreements                     # Create agreement
GET  /api/v1/agreements/{id}                # Get agreement
PUT  /api/v1/agreements/{id}                # Update
PUT  /api/v1/agreements/{id}/activate       # Activate
GET  /api/v1/agreements/dashboard           # Dashboard stats
GET  /api/v1/agreements/{id}/capex          # List CAPEX items
POST /api/v1/agreements/{id}/capex          # Add CAPEX item
PUT  /api/v1/capex/{id}                     # Update CAPEX
PUT  /api/v1/capex/{id}/verify              # Verify CAPEX
GET  /api/v1/agreements/{id}/cps            # List CPs
POST /api/v1/agreements/{id}/cps            # Create CP
GET  /api/v1/cps/{id}                       # Get CP
PUT  /api/v1/cps/{id}                       # Update CP
PUT  /api/v1/cps/{id}/submit               # Submit CP
PUT  /api/v1/cps/{id}/verify               # Verify CP
PUT  /api/v1/cps/{id}/return               # Return CP
PUT  /api/v1/cps/{id}/waive                # Waive CP
GET  /api/v1/cps/dashboard                  # CP dashboard
```

### Milestones & Disbursements (Module 9)
```
GET  /api/v1/milestones                     # List milestones
POST /api/v1/milestones                     # Create milestone
GET  /api/v1/milestones/{id}                # Get milestone
PUT  /api/v1/milestones/{id}                # Update
PUT  /api/v1/milestones/{id}/submit         # Submit for review
PUT  /api/v1/milestones/{id}/iva-verify     # IVA verify
PUT  /api/v1/milestones/{id}/rea-approve    # REA approve
GET  /api/v1/milestones/dashboard           # Dashboard
POST /api/v1/milestones/{id}/disburse       # Create disbursement
GET  /api/v1/milestones/{id}/gps-photos     # GPS photos for milestone
GET  /api/v1/disbursements                  # List disbursements
GET  /api/v1/disbursements/{id}             # Get disbursement
PUT  /api/v1/disbursements/{id}/iva-verify  # IVA verify
PUT  /api/v1/disbursements/{id}/rea-approve # REA approve
PUT  /api/v1/disbursements/{id}/grant-admin-approve # Grant admin approve
PUT  /api/v1/disbursements/{id}/confirm-payment # Confirm payment
GET  /api/v1/disbursements/dashboard        # Dashboard
```

### GPS Photos & IVA Visits
```
POST /api/v1/gps-photos                     # Upload photo
PUT  /api/v1/gps-photos/{id}/review         # Review photo
GET  /api/v1/iva-visits                     # List visits
POST /api/v1/iva-visits                     # Create visit
PUT  /api/v1/iva-visits/{id}                # Update visit
```

### Grievances (Module 10)
```
GET  /api/v1/grievances                     # List
POST /api/v1/grievances                     # Submit
GET  /api/v1/grievances/{id}                # Get
PUT  /api/v1/grievances/{id}                # Update
PUT  /api/v1/grievances/{id}/acknowledge    # Acknowledge
PUT  /api/v1/grievances/{id}/assign         # Assign
PUT  /api/v1/grievances/{id}/resolve        # Resolve
PUT  /api/v1/grievances/{id}/escalate       # Escalate
POST /api/v1/grievances/{id}/comments       # Add comment
GET  /api/v1/grievances/report              # Report
GET  /api/v1/grievances/dashboard           # Dashboard
```

### Tickets (Module 10)
```
GET  /api/v1/tickets                        # List with filters
POST /api/v1/tickets                        # Create (auto SLA)
GET  /api/v1/tickets/{id}                   # Get with comments
PUT  /api/v1/tickets/{id}                   # Update
PUT  /api/v1/tickets/{id}/assign            # Assign
PUT  /api/v1/tickets/{id}/escalate          # Escalate
PUT  /api/v1/tickets/{id}/resolve           # Resolve
PUT  /api/v1/tickets/{id}/close             # Close
GET  /api/v1/tickets/{id}/comments          # List comments
POST /api/v1/tickets/{id}/comments          # Add comment
GET  /api/v1/tickets/{id}/history           # Activity history
GET  /api/v1/tickets/dashboard              # Dashboard
GET  /api/v1/tickets/sla-rules              # SLA rules
```

### Settlement Ledger (Module 11)
```
GET  /api/v1/settlement/dashboard           # Dashboard
GET  /api/v1/settlement/invoices            # List invoices
POST /api/v1/settlement/invoices            # Create invoice
GET  /api/v1/settlement/invoices/{id}       # Get invoice
PATCH /api/v1/settlement/invoices/{id}      # Update invoice
POST /api/v1/settlement/invoices/{id}/pay   # Record payment
POST /api/v1/settlement/invoices/{id}/dispute # Raise dispute
POST /api/v1/settlement/invoices/{id}/resolve-dispute # Resolve
POST /api/v1/settlement/invoices/{id}/escalate # Escalate
GET  /api/v1/settlement/invoices/{id}/history # History
GET  /api/v1/settlement/net-positions       # Net positions
POST /api/v1/settlement/net-positions/recompute # Recompute
GET  /api/v1/settlement/export              # Export
```

### MEL / Performance (Module 12)
```
GET  /api/v1/mel/dashboard                  # Dashboard (vs targets)
GET  /api/v1/mel/submissions                # List submissions
POST /api/v1/mel/submissions                # Create submission
GET  /api/v1/mel/submissions/{id}           # Get submission
PUT  /api/v1/mel/submissions/{id}/verify    # Verify
PUT  /api/v1/mel/submissions/{id}/reject    # Reject
GET  /api/v1/mel/learning-log               # List learning entries
POST /api/v1/mel/learning-log               # Create entry
GET  /api/v1/mel/targets                    # List targets
POST /api/v1/mel/targets                    # Create target
GET  /api/v1/performance                    # Performance records
POST /api/v1/performance                    # Submit record
GET  /api/v1/performance/site/{id}          # Site history
GET  /api/v1/performance/dashboard          # Dashboard
POST /api/v1/gesi                           # Submit GESI data
GET  /api/v1/gesi/{site_id}                 # Get GESI
POST /api/v1/carbon                         # Submit carbon data
GET  /api/v1/carbon/{site_id}               # Get carbon
GET  /api/v1/esg-reports                    # List ESG reports
POST /api/v1/esg-reports                    # Create report
GET  /api/v1/esg-reports/{id}               # Get report
PUT  /api/v1/esg-reports/{id}/lock          # Lock report
```

### GIS
```
GET  /api/v1/discos/boundaries              # DisCo boundary polygons
GET  /api/v1/mv-lines/{disco}               # MV distribution lines
```

### Alfred AI
```
POST /api/v1/alfred/chat                    # Natural language Q&A
```

---

## 10. Role-Based Access Control

### 10.1 Frontend Roles (6)

| Key | Label | Backend Role | DisCo | Nav Steps | Home |
|---|---|---|---|---|---|
| `pmu` | PMU Program Manager | `rea_pmu_officer` | — | 1–10 (all) | `/sites` |
| `disco_aedc` | DisCo Manager (AEDC) | `disco_officer` | AEDC | 1,2,3,9 | `/disco-readiness` |
| `disco_kedco` | DisCo Manager (KEDCO) | `disco_officer` | KEDCO | 1,2,3,9 | `/disco-readiness` |
| `disco_ie` | DisCo Manager (IE) | `disco_officer` | IE | 1,2,3,9 | `/disco-readiness` |
| `bidder` | Bidder | `developer` | — | 4,6,7,8 | `/lots` |
| `evaluator` | Bid Evaluator | `afcen_analyst` | — | 1,2,4,5,10 | `/evaluations` |

### 10.2 Backend Roles (12)

```
rea_pmu_officer, rea_grant_admin, afcen_admin, afcen_analyst,
disco_officer, developer, nerc_officer, nemsa_inspector,
iva, wb_observer, lender, community_rep
```

**Superuser roles** (bypass all module checks): `rea_pmu_officer`, `afcen_admin`

### 10.3 Module Access Matrix

| Module | Full (write) | Read-only |
|---|---|---|
| site_registry | rea_pmu_officer, afcen_admin, afcen_analyst | disco_officer, developer, wb_observer, nerc_officer |
| site_readiness | rea_pmu_officer, afcen_admin, afcen_analyst | disco_officer, developer, wb_observer |
| disco_readiness | disco_officer, afcen_admin | rea_pmu_officer, afcen_analyst, developer, nerc_officer |
| financial_model | afcen_admin, afcen_analyst | rea_pmu_officer, developer, wb_observer |
| tender | rea_pmu_officer, afcen_admin | afcen_analyst, developer, disco_officer, wb_observer, nerc_officer |
| evaluation | afcen_admin, afcen_analyst | rea_pmu_officer, wb_observer |
| agreements | rea_pmu_officer, rea_grant_admin, afcen_admin | developer, wb_observer, lender |
| cp_tracker | rea_pmu_officer, afcen_admin | developer, wb_observer, lender |
| disbursement | rea_grant_admin, rea_pmu_officer | afcen_admin, developer, iva, wb_observer, lender |
| es_grm | rea_pmu_officer, afcen_admin, community_rep | developer, wb_observer |
| settlement | disco_officer, afcen_admin | rea_pmu_officer, developer, nerc_officer |
| performance | rea_pmu_officer, afcen_admin, afcen_analyst | developer, disco_officer, wb_observer, nerc_officer |

---

## 11. State Machines

### Lot Lifecycle
```
draft → open → evaluation → awarded | cancelled
```

### Bid Lifecycle
```
draft → submitted → under_review → qualified | disqualified → awarded | unsuccessful
```

### Evaluation Stage
```
pending → active → consensus → locked | skipped
```

### Grant Agreement
```
draft → active → suspended | terminated | closed
```

### Disbursement (6-stage approval)
```
pending → developer_approved → iva_verified → rea_pmu_approved → grant_admin_approved → paid | rejected
```

### Conditions Precedent
```
pending → submitted → verified | waived | overdue
```

### Milestone
```
pending → submitted → under_review → verified → paid | rejected
```

### Ticket
```
open → in_progress → in_review → resolved → closed
(any → escalated at any point)
```

### MEL Submission
```
submitted → under_review → verified | rejected | superseded
```

### Settlement Invoice
```
draft → issued → paid | overdue | disputed | cancelled
(disputed → resolved via ticket)
```

---

## 12. Static Data & GIS

### 12.1 Settlement Data (`src/data/ranked_settlements.json`)

23,806 settlement objects with fields: rank, village, lga, state, disco, latitude, longitude, population, connections, demand_kwh, grid_dist_km, score, security_risk, recommended_mg_type.

**Distribution:** AEDC: 8,331 | KEDCO: 15,240 | IE: 235

### 12.2 Programme Config (`src/data/nigeria_config.json`)

Exchange rate (NGN/USD), DisCo definitions with states, programme parameters.

### 12.3 Financial Defaults (`src/data/financial_defaults.json`)

CAPEX unit costs, financing structure (grant/debt/equity splits), project lifetime, discount rate, tariff benchmarks (NERC Band A, self-generation low/high).

### 12.4 GeoJSON Assets (public/)

| File | Contents | Features |
|---|---|---|
| `distribution-lines.geojson` | 33kV + 11kV distribution lines | ~4,891 LineStrings |
| `substations.geojson` | Electricity substations | 44 Points |

### 12.5 Hardcoded GIS Data (backend)

- **330kV/132kV transmission lines:** Hardcoded from TCN data in `gis.py`
- **DisCo boundaries:** Approximate GeoJSON polygons in `gis.py`
- **DisCo centers:** AEDC [9.12, 6.43], KEDCO [12.14, 8.57], IE [6.59, 3.43]
- **DisCo colors:** AEDC #1565C0, KEDCO #7B1FA2, IE #E65100

### 12.6 Image Assets

| File | Purpose |
|---|---|
| `hero-site-{1,2,3}.jpeg` | Landing page hero photos |
| `nigeria-flag.svg` | Partner logo |
| `rea-logo.jpeg` | Partner logo |
| `wb-logo.jpg` | Partner logo |
| `seforall-logo.png` | Partner logo |
| `logo-icon.svg` | AfCEN icon |

---

## 13. Alfred AI Assistant

Alfred is a rule-based NLP assistant (keyword matching, NOT an external LLM). It operates on three data tiers:

### Tier 1 — Static JSON (cached at module load)
- Settlement statistics (count, population, demand by DisCo/state)
- Programme config (DisCos, exchange rate)
- Financial defaults (CAPEX costs, tariff benchmarks)

### Tier 2 — Live Database Queries
- Ticket summary (total, open, SLA breached, recent 5)
- Settlement invoice summary (invoiced, paid, overdue, disputed)
- MEL summary (submissions, verified, all PDO indicators vs targets)

### Tier 3 — Hardcoded Programme Knowledge
Comprehensive knowledge base covering: LCOE pathways, DARES programme components/budget, NEP lessons, PBG milestones, system sizing (AfCEN PUE-First), pilot IMGs (Toto/Zawaciki/Robinyan/Wuse), Nigerian regulations (Mini-Grid Reg 2023, Electricity Act 2023, MYTO, NEMSA, Embedded Gen), Mission 300 compact, DER scaling roadmap, procurement (21-gate process, data room, bid evaluation), CP categories, interconnection/technical, all 11 DisCos, institutional authority map.

---

## 14. Embedded Programme Knowledge

### 21-Gate Procurement State Machine

All 21 gates with authority assignment per gate are fully embedded in Alfred. These cover the complete tender lifecycle from programme initiation to contract signing.

### 8-Folder Data Room Structure

| Folder | Contents |
|---|---|
| GIS & Site Maps | Settlement maps, feeder topology, POI coordinates |
| Feeder Baselines | Load profiles, fault levels, network capacity |
| E&S Baseline | ESIA, RAP, community consent records |
| Permitting & CPs | Land tenure, NERC license, NEMSA certification |
| Contract Templates | PPA, connection agreement, grant agreement |
| Technical Specifications | System design parameters, equipment specs |
| Financial Parameters | Tariff model, CAPEX/OPEX assumptions |
| Community & PUE Data | PUE assessment, demand surveys, willingness-to-pay |

### 8 CP Categories with Items

Corporate, Financing, NERC, NEMSA, DisCo, E&S, Land, Procurement — each with specific condition items defined.

### Nigerian Regulatory Framework

- Mini-Grid Regulation 2023
- Electricity Act 2023
- MYTO methodology
- NEMSA certification requirements
- Embedded Generation regulation

### All 11 DisCo Franchise Areas

Full coverage of all 11 Nigerian DisCos with state-level franchise mapping.

---

## 15. Recreation Checklist (SOP)

### Phase 1: Infrastructure Setup

- [ ] Install Docker Desktop and Docker Compose v2+
- [ ] Create project directory structure (see Section 4.2)
- [ ] Create `docker-compose.yml` with 4 services (db, backend, frontend, nginx)
- [ ] Create `nginx/nginx.conf` routing `/api/v1/*` to backend, `/*` to frontend
- [ ] Create `nginx/Dockerfile` (from nginx:alpine, COPY nginx.conf)

### Phase 2: Backend Implementation

- [ ] Create Python 3.11 backend with FastAPI
- [ ] Create `requirements.txt` with all 22 dependencies
- [ ] Create `app/core/config.py` (pydantic-settings)
- [ ] Create `app/db/session.py` (async engine, session factory, init_db)
- [ ] Create `app/db/models.py` with all 30+ ORM models
- [ ] Create `app/dependencies/auth.py` (12 roles, 12 modules, RBAC matrix)
- [ ] Create `app/main.py` (CORS, startup, 13 route includes)
- [ ] Implement all 13 route modules (see Section 9 for endpoints)
- [ ] Create `backend/Dockerfile`
- [ ] Copy `src/data/` directory with 3 JSON files

### Phase 3: Frontend Implementation

- [ ] Initialize Next.js 16+ project with TypeScript, Tailwind v4
- [ ] Install all dependencies (see Section 6.1)
- [ ] Configure `next.config.ts` with `output: "standalone"`
- [ ] Create `globals.css` with theme variables (see Section 6.4)
- [ ] Create `layout.tsx` with fonts (IBM Plex Sans, Space Grotesk, Geist Mono)
- [ ] Create `providers.tsx` (QueryClient + RoleProvider)
- [ ] Create `src/lib/types.ts` — all TypeScript interfaces
- [ ] Create `src/lib/api.ts` — full API client
- [ ] Create `src/lib/role-context.tsx` — 6 roles, write access, nav steps
- [ ] Create `src/app/api/proxy/[...path]/route.ts` — API proxy
- [ ] Install shadcn/ui components (see Section 6.3 of frontend audit)
- [ ] Create `src/components/navbar.tsx` — stepper nav + role switcher
- [ ] Create `src/components/settlement-map.tsx` — Leaflet map with all layers
- [ ] Create `src/components/alfred-chat.tsx` — AI chat widget
- [ ] Create all 16 page components (see Section 7)
- [ ] Copy GeoJSON files to `public/`
- [ ] Copy hero images and partner logos to `public/`
- [ ] Create `frontend/Dockerfile` (3-stage multi-stage)

### Phase 4: Data & GIS

- [ ] Prepare `ranked_settlements.json` (23,806 records)
- [ ] Prepare `nigeria_config.json` (DisCo definitions, exchange rate)
- [ ] Prepare `financial_defaults.json` (CAPEX costs, financing structure)
- [ ] Prepare `distribution-lines.geojson` (33/11kV lines)
- [ ] Prepare `substations.geojson` (44 substations)
- [ ] Hardcode transmission lines and DisCo boundaries in backend

### Phase 5: Build & Deploy

- [ ] Build backend: `docker build -f backend/Dockerfile -t nigeria-backend .`
- [ ] Build frontend: `docker build --network=host -t nigeria-frontend -f frontend/Dockerfile frontend`
- [ ] Build nginx: `docker build -t nigeria-nginx -f nginx/Dockerfile nginx`
- [ ] Start: `docker compose up -d`
- [ ] Verify health: `curl http://localhost/health`
- [ ] Verify settlement data: `curl http://localhost/api/v1/settlements/stats`
- [ ] Open browser: `http://localhost`

### Phase 6: Verification

- [ ] Landing page loads with partner logos and stats bar
- [ ] Sites page shows 23,806 settlements with interactive map
- [ ] Sites page signal badges: HIGH_PRIORITY (386), CONDITIONAL (4,360), LOW_PRIORITY+REVIEW (19,060)
- [ ] Pipeline filter pills (All, High Priority, Conditional, Low Priority, In Lot) filter correctly
- [ ] "In Lot" column shows settlements assigned to lots
- [ ] System Sizing computes PFS for lots
- [ ] DisCo Readiness shows submitted lots with seeded feeder/POI data
- [ ] Tenders page shows lot pipeline
- [ ] Evaluation shows 4-stage pipeline
- [ ] Agreements page shows dashboard
- [ ] Disbursements shows milestone tracker
- [ ] Tickets shows SLA-tracked tickets
- [ ] Settlement Ledger shows invoicing
- [ ] Performance shows Results Framework and MEL data
- [ ] Role switcher changes views across all pages
- [ ] Alfred responds to programme queries

---

## 16. Testing Protocol

### 16.1 API Health Check

```bash
curl http://localhost/health
# Expected: {"status":"ok","version":"2.0.0","environment":"development"}
```

### 16.2 Settlement Data

```bash
curl -s "http://localhost/api/v1/settlements?limit=1" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'Total: {d[\"total\"]}')  # Expected: 23806
"
```

### 16.3 All Dashboard Endpoints

```bash
# Tickets (should return counts)
curl -s http://localhost/api/v1/tickets/dashboard

# MEL (should return indicator data)
curl -s http://localhost/api/v1/mel/dashboard

# Settlement Ledger
curl -s http://localhost/api/v1/settlement/dashboard

# Agreements
curl -s http://localhost/api/v1/agreements/dashboard

# Disbursements
curl -s http://localhost/api/v1/disbursements/dashboard

# CPs
curl -s http://localhost/api/v1/cps/dashboard

# Milestones
curl -s http://localhost/api/v1/milestones/dashboard

# Grievances
curl -s http://localhost/api/v1/grievances/dashboard

# DisCo Readiness
curl -s http://localhost/api/v1/disco-readiness/dashboard
```

### 16.4 Alfred AI

```bash
curl -s -X POST http://localhost/api/v1/alfred/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"how many settlements?"}' | python3 -m json.tool
```

### 16.5 Frontend Pages (all should load without errors)

| URL | Expected Content |
|---|---|
| `http://localhost/` | Landing page with partner logos, stats, module grid |
| `http://localhost/sites` | Map + settlement table (23,806 records) |
| `http://localhost/system-sizing` | System sizing with lot selector |
| `http://localhost/disco-readiness` | DisCo readiness dashboard |
| `http://localhost/lots` | Lot & Tender Management |
| `http://localhost/evaluations` | Bid Evaluation with lot cards |
| `http://localhost/agreements` | Grant Agreements dashboard |
| `http://localhost/disbursements` | Milestone Portfolio Tracker |
| `http://localhost/tickets` | Tickets & Grievances with SLA bars |
| `http://localhost/settlement-ledger` | Settlement Ledger with invoices |
| `http://localhost/performance` | M&E dashboard with Results Framework |

---

## Appendix A: Audit Trail Actions

All state-changing operations write to the `audit_logs` table. Action strings include:

```
BID_SUBMITTED, BID_RECOMMENDED, AI_FLAG_ACKNOWLEDGED,
MILESTONE_SUBMITTED, MILESTONE_VERIFIED,
DISBURSEMENT_APPROVED, DISBURSEMENT_PAID,
INVOICE_CREATED, INVOICE_PAYMENT_RECORDED,
MEL_SUBMISSION_CREATED, MEL_SUBMISSION_VERIFIED,
CP_SUBMITTED, CP_VERIFIED, CP_WAIVED,
TICKET_CREATED, TICKET_ESCALATED, TICKET_RESOLVED,
GRIEVANCE_SUBMITTED, GRIEVANCE_RESOLVED
```

---

## Appendix B: Data Path Resolution Pattern

Backend routes resolve data files using a dual-path pattern:

```python
_DOCKER_DATA = Path("/app/src/data")
_DATA = Path(__file__).resolve().parent.parent.parent.parent.parent / "src" / "data"

def _data_path(name):
    return _DOCKER_DATA / name if (_DOCKER_DATA / name).exists() else _DATA / name
```

Docker containers use `/app/src/data/`; local development uses relative path from route file.

---

*Document generated from live platform audit. All endpoints verified against running Docker stack.*
*Platform version 2.0.0 — 183 API routes, 16 frontend pages, 23,806 settlements.*
