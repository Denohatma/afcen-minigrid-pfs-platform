# InvestIQ:Minigrids — Nigeria PFS Platform

Web platform for generating Pre-Feasibility Studies for mini-grid projects in Nigeria. Wraps 7 computational adapters (demand, solar, grid risk, hybrid sizing, distribution routing, carbon, financial) into a production web application with multi-tenant access control.

Supports **isolated**, **undergrid**, and **interconnected minigrids (IMGs)** across all 11 Nigerian DisCo territories, with financial parameters calibrated from real IMG pilot data (Toto, Zawaciki, Robinyan, Wuse) and aligned with the DARES program.

## Architecture

```
Browser → Next.js (Vercel) → BFF Proxy → FastAPI (Docker) → Pipeline Adapters
                                              ↓
                                    PostgreSQL + Local/R2 Storage
```

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS, shadcn/ui
- **Backend**: FastAPI, SQLAlchemy 2.0 (async), Python 3.11
- **Auth**: Clerk (JWT, organizations, roles)
- **Database**: PostgreSQL (Docker) / Neon (cloud)
- **Storage**: Local filesystem (dev) / Cloudflare R2 (prod)
- **Real-time**: Server-Sent Events for pipeline progress
- **Deployment**: Docker Compose (backend + PostgreSQL + nginx)

## Nigeria Context

- **Regulatory**: NERC Mini-Grid Regulation 2023, Electricity Act 2023, DARES (US$750M World Bank program)
- **DisCos**: AEDC, BEDC, EKEDC, EEDC, IBEDC, IE, JED, KE, KEDCO, PHEDC, YEDC
- **Tariff benchmarks**: NERC MYTO Band A NGN 225/kWh, IMG pilot tariffs NGN 150-450/kWh
- **CAPEX benchmarks**: Generation US$1,425/kWp median, total US$2,547/kWp, US$1,323/connection (from RMI/GEAPP IMG pilots)
- **Carbon**: Displaces both diesel and PMS (petrol) generators; aligned with Nigeria NDC (47% reduction by 2030)

## Quick Start — Docker Compose

```bash
cp .env.example .env  # edit as needed
docker compose up --build
```

Services:
- **Backend API**: http://localhost:8000 (Swagger: http://localhost:8000/docs)
- **nginx proxy**: http://localhost (routes /api/ and /health)
- **PostgreSQL**: localhost:5432

## Local Development (without Docker)

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in Clerk keys (optional for dev)
uvicorn app.main:app --reload --port 8000
```

The backend runs without Clerk keys in dev mode — a dev user/org is auto-created.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local  # fill in Clerk keys + BACKEND_URL
npm run dev
```

Open http://localhost:3000.

## Cloud Deployment

### Database — Neon (or any PostgreSQL)

```
postgresql+asyncpg://user:pass@ep-xxx.region.aws.neon.tech/minigrid?sslmode=require
```

### Document Storage — Cloudflare R2

Create an R2 bucket named `minigrid-documents`. Create an API token with read/write access.

### Authentication — Clerk

Create a Clerk application. Enable Organizations. Create custom roles: `org:admin`, `org:analyst`, `org:viewer`.

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL async connection string |
| `ENVIRONMENT` | `development` or `production` |
| `CLERK_SECRET_KEY` | From Clerk dashboard |
| `CLERK_ISSUER` | Clerk issuer URL |
| `R2_ENDPOINT_URL` | Cloudflare R2 endpoint |
| `R2_ACCESS_KEY_ID` | R2 API token key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET_NAME` | `minigrid-documents` |
| `CORS_ORIGINS` | JSON array of allowed origins |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/v1/sites` | Create site |
| `GET` | `/api/v1/sites` | List org sites |
| `POST` | `/api/v1/sites/{id}/runs/stream` | Run pipeline (SSE) |
| `POST` | `/api/v1/sites/{id}/clone` | Duplicate site |
| `POST` | `/api/v1/sites/{id}/runs/{rid}/documents` | Generate PFS docs |
| `GET` | `/api/v1/sites/{id}/runs/{rid}/documents/{did}/download` | Download document |

## User Guide

1. **Create a site** via the 7-step wizard — select DisCo, minigrid type (isolated/undergrid/interconnected), enter site location in Nigerian states/LGAs
2. **Run the pipeline** — watch 7 adapters execute in real-time via SSE
3. **Generate PFS** — produces both Markdown and DOCX documents
4. **Download** the pre-feasibility study
5. **Compare runs** — select two completed runs to see metric deltas
6. **Clone sites** to test variant scenarios (different tariffs, financing, DisCo supply hours)

## Roles

| Role | Permissions |
|---|---|
| Admin | Full access + organization management |
| Analyst | Create, edit, run, download |
| Viewer | Browse sites, view results, download documents |

## Reference Documents

- DARES Nigeria PAD (World Bank, Nov 2023) — US$750M for distributed access
- RMI/GEAPP: Partnerships for Power — Interconnected Minigrids in Nigeria (May 2025)
- RMI: Scaling Utility-Enabled DERs in Nigeria (June 2024)
- Nigeria National Energy Compact — Mission 300 Africa Energy Summit
