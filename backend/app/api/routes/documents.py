from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.db.models import Site, PipelineRun, AdapterResult, Document
from app.dependencies.auth import AuthContext, get_current_user
from app.schemas.run import DocumentResponse, DocumentDownloadResponse
from app.services.document_service import (
    generate_documents,
    upload_to_r2,
    generate_presigned_url,
    save_local,
)

router = APIRouter()


@router.post(
    "/sites/{site_id}/runs/{run_id}/documents",
    response_model=list[DocumentResponse],
    status_code=201,
)
async def generate_run_documents(
    site_id: str,
    run_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    site = await _get_org_site(db, site_id, auth.org_id)
    run = await _get_site_run(db, run_id, site_id)

    if run.status != "completed":
        raise HTTPException(status_code=400, detail="Run must be completed before generating documents")

    adapter_results = await db.execute(
        select(AdapterResult).where(
            AdapterResult.run_id == run_id,
            AdapterResult.status == "completed",
        )
    )
    adapter_outputs = {}
    for ar in adapter_results.scalars().all():
        adapter_outputs[ar.adapter_name] = ar.output

    with tempfile.TemporaryDirectory() as tmpdir:
        docs = await asyncio.to_thread(
            generate_documents,
            dict(site.site_data),
            adapter_outputs,
            site.site_name.lower().replace(" ", "_"),
            tmpdir,
        )

        created_docs = []
        for fmt, local_path in docs.items():
            local_path = Path(local_path)
            storage_key = f"orgs/{auth.org_id}/sites/{site_id}/runs/{run_id}/{local_path.name}"

            if settings.r2_endpoint_url:
                upload_to_r2(local_path, storage_key)
            else:
                save_local(local_path, storage_key)

            doc = Document(
                run_id=run_id,
                format=fmt,
                storage_key=storage_key,
                filename=local_path.name,
                size_bytes=local_path.stat().st_size,
            )
            db.add(doc)
            created_docs.append(doc)

    await db.commit()
    for doc in created_docs:
        await db.refresh(doc)

    return [
        DocumentResponse(
            id=doc.id,
            run_id=doc.run_id,
            format=doc.format,
            filename=doc.filename,
            size_bytes=doc.size_bytes,
            created_at=doc.created_at.isoformat() if doc.created_at else "",
        )
        for doc in created_docs
    ]


@router.get("/sites/{site_id}/runs/{run_id}/documents", response_model=list[DocumentResponse])
async def list_documents(
    site_id: str,
    run_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_org_site(db, site_id, auth.org_id)
    await _get_site_run(db, run_id, site_id)

    result = await db.execute(
        select(Document).where(Document.run_id == run_id)
    )
    docs = result.scalars().all()

    return [
        DocumentResponse(
            id=doc.id,
            run_id=doc.run_id,
            format=doc.format,
            filename=doc.filename,
            size_bytes=doc.size_bytes,
            created_at=doc.created_at.isoformat() if doc.created_at else "",
        )
        for doc in docs
    ]


@router.get("/sites/{site_id}/runs/{run_id}/documents/{doc_id}/download")
async def download_document(
    site_id: str,
    run_id: str,
    doc_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_org_site(db, site_id, auth.org_id)
    await _get_site_run(db, run_id, site_id)

    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.run_id == run_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if settings.r2_endpoint_url:
        url = generate_presigned_url(doc.storage_key)
        if not url:
            raise HTTPException(status_code=500, detail="Failed to generate download URL")
        return DocumentDownloadResponse(
            download_url=url,
            filename=doc.filename,
        )

    local_path = Path("document_storage") / doc.storage_key
    if not local_path.exists():
        raise HTTPException(status_code=404, detail="Document file not found on disk")
    return FileResponse(
        path=str(local_path),
        filename=doc.filename,
        media_type="application/octet-stream",
    )


async def _get_org_site(db: AsyncSession, site_id: str, org_id: str) -> Site:
    result = await db.execute(
        select(Site).where(Site.id == site_id, Site.org_id == org_id)
    )
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return site


async def _get_site_run(db: AsyncSession, run_id: str, site_id: str) -> PipelineRun:
    result = await db.execute(
        select(PipelineRun).where(PipelineRun.id == run_id, PipelineRun.site_id == site_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run
