from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.db.models import Site, PipelineRun, AdapterResult
from app.dependencies.auth import AuthContext, get_current_user, require_role
from app.schemas.run import (
    RunResponse,
    RunListResponse,
    RunDetailResponse,
    AdapterResultResponse,
)
from app.services.pipeline_service import execute_pipeline, stream_pipeline_progress

router = APIRouter()


@router.post("/sites/{site_id}/runs", response_model=RunResponse, status_code=201)
async def trigger_run(
    site_id: str,
    auth: AuthContext = Depends(require_role("admin", "analyst")),
    db: AsyncSession = Depends(get_db),
):
    site = await _get_org_site(db, site_id, auth.org_id)
    await _check_no_running(db, site_id)

    run = PipelineRun(
        site_id=site.id,
        triggered_by=auth.user_id,
        status="running",
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    run = await execute_pipeline(db, run, site)

    return _run_to_response(run)


@router.post("/sites/{site_id}/runs/stream")
async def trigger_run_stream(
    site_id: str,
    auth: AuthContext = Depends(require_role("admin", "analyst")),
    db: AsyncSession = Depends(get_db),
):
    site = await _get_org_site(db, site_id, auth.org_id)
    await _check_no_running(db, site_id)

    run = PipelineRun(
        site_id=site.id,
        triggered_by=auth.user_id,
        status="running",
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    return StreamingResponse(
        stream_pipeline_progress(db, run, site),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/sites/{site_id}/runs", response_model=RunListResponse)
async def list_runs(
    site_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_org_site(db, site_id, auth.org_id)

    result = await db.execute(
        select(PipelineRun)
        .where(PipelineRun.site_id == site_id)
        .order_by(PipelineRun.started_at.desc())
    )
    runs = result.scalars().all()

    return RunListResponse(
        runs=[_run_to_response(r) for r in runs],
        total=len(runs),
    )


@router.get("/sites/{site_id}/runs/{run_id}", response_model=RunDetailResponse)
async def get_run(
    site_id: str,
    run_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_org_site(db, site_id, auth.org_id)

    result = await db.execute(
        select(PipelineRun)
        .options(selectinload(PipelineRun.adapter_results))
        .where(PipelineRun.id == run_id, PipelineRun.site_id == site_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    return RunDetailResponse(
        id=run.id,
        site_id=run.site_id,
        status=run.status,
        adapter_timings=run.adapter_timings,
        adapter_errors=run.adapter_errors,
        summary_metrics=run.summary_metrics,
        started_at=run.started_at.isoformat() if run.started_at else None,
        completed_at=run.completed_at.isoformat() if run.completed_at else None,
        adapter_results=[
            AdapterResultResponse(
                adapter_name=ar.adapter_name,
                status=ar.status,
                duration_seconds=ar.duration_seconds,
            )
            for ar in run.adapter_results
        ],
    )


def _run_to_response(run: PipelineRun) -> RunResponse:
    return RunResponse(
        id=run.id,
        site_id=run.site_id,
        status=run.status,
        adapter_timings=run.adapter_timings,
        adapter_errors=run.adapter_errors,
        summary_metrics=run.summary_metrics,
        started_at=run.started_at.isoformat() if run.started_at else None,
        completed_at=run.completed_at.isoformat() if run.completed_at else None,
    )


async def _check_no_running(db: AsyncSession, site_id: str):
    result = await db.execute(
        select(PipelineRun).where(
            PipelineRun.site_id == site_id,
            PipelineRun.status == "running",
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="A pipeline run is already in progress for this site",
        )


async def _get_org_site(db: AsyncSession, site_id: str, org_id: str) -> Site:
    result = await db.execute(
        select(Site).where(Site.id == site_id, Site.org_id == org_id)
    )
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return site
