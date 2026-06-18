from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, update

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.config import settings
from app.db.session import engine, Base, async_session
from app.db.models import PipelineRun
from app.api.routes import sites, runs, documents, settlements, portfolios
from app.api.routes import developers, evaluations, disbursements, monitoring, banking
from app.api.routes import grievances, gps_verification, reports

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s"
    if settings.environment == "development"
    else '{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)
logger = logging.getLogger("minigrid")


async def _cleanup_stale_runs():
    cutoff = datetime.utcnow() - timedelta(minutes=10)
    async with async_session() as db:
        result = await db.execute(
            update(PipelineRun)
            .where(PipelineRun.status == "running", PipelineRun.started_at < cutoff)
            .values(status="failed", completed_at=datetime.utcnow())
        )
        if result.rowcount:
            logger.info("Cleaned up %d stale pipeline runs", result.rowcount)
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _cleanup_stale_runs()
    logger.info("Application started (env=%s)", settings.environment)
    yield
    await engine.dispose()


app = FastAPI(
    title="AfCEN Minigrid PFS Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_rate_limit_store: dict[str, list[float]] = {}
RATE_LIMIT_MAX = 10
RATE_LIMIT_WINDOW = 3600


@app.middleware("http")
async def rate_limit_pipeline(request: Request, call_next):
    if request.url.path.endswith("/runs") and request.method == "POST":
        import time
        org_id = request.headers.get("x-org-id", request.client.host if request.client else "unknown")
        now = time.time()
        window = _rate_limit_store.get(org_id, [])
        window = [t for t in window if now - t < RATE_LIMIT_WINDOW]
        if len(window) >= RATE_LIMIT_MAX:
            return Response(
                content='{"detail":"Rate limit exceeded: max 10 pipeline runs per hour"}',
                status_code=429,
                media_type="application/json",
            )
        window.append(now)
        _rate_limit_store[org_id] = window
    return await call_next(request)


app.include_router(sites.router, prefix="/api/v1", tags=["sites"])
app.include_router(runs.router, prefix="/api/v1", tags=["runs"])
app.include_router(documents.router, prefix="/api/v1", tags=["documents"])
app.include_router(settlements.router, prefix="/api/v1", tags=["settlements"])
app.include_router(portfolios.router, prefix="/api/v1", tags=["portfolios"])
app.include_router(developers.router, prefix="/api/v1", tags=["developers"])
app.include_router(evaluations.router, prefix="/api/v1", tags=["evaluations"])
app.include_router(disbursements.router, prefix="/api/v1", tags=["disbursements"])
app.include_router(monitoring.router, prefix="/api/v1", tags=["monitoring"])
app.include_router(banking.router, prefix="/api/v1", tags=["banking"])
app.include_router(grievances.router, prefix="/api/v1", tags=["grievances"])
app.include_router(gps_verification.router, prefix="/api/v1", tags=["gps-verification"])
app.include_router(reports.router, prefix="/api/v1", tags=["reports"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0", "environment": settings.environment}
