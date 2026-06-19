from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.config import settings
from app.db.session import engine, Base
from app.api.routes import (
    settlements,
    site_registry,
    disco_readiness,
    lots,
    evaluations,
    agreements,
    disbursements,
    grievances,
    settlement_ledger,
    performance,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s"
    if settings.environment == "development"
    else '{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)
logger = logging.getLogger("minigrid")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Application started (env=%s)", settings.environment)
    yield
    await engine.dispose()


app = FastAPI(
    title="AfCEN DARES IMG Platform",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(settlements.router, prefix="/api/v1", tags=["settlements"])
app.include_router(site_registry.router, prefix="/api/v1", tags=["site-registry"])
app.include_router(disco_readiness.router, prefix="/api/v1", tags=["disco-readiness"])
app.include_router(lots.router, prefix="/api/v1", tags=["lots-tenders"])
app.include_router(evaluations.router, prefix="/api/v1", tags=["evaluations"])
app.include_router(agreements.router, prefix="/api/v1", tags=["agreements"])
app.include_router(disbursements.router, prefix="/api/v1", tags=["disbursements"])
app.include_router(grievances.router, prefix="/api/v1", tags=["grievances"])
app.include_router(settlement_ledger.router, prefix="/api/v1", tags=["settlement-ledger"])
app.include_router(performance.router, prefix="/api/v1", tags=["performance"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0", "environment": settings.environment}
