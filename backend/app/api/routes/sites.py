from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import Site
from app.dependencies.auth import AuthContext, get_current_user, require_role
from app.schemas.site import (
    SiteCreateRequest,
    SiteUpdateRequest,
    SiteResponse,
    SiteListResponse,
)

router = APIRouter()


def _site_to_response(site: Site) -> SiteResponse:
    return SiteResponse(
        id=site.id,
        org_id=site.org_id,
        site_name=site.site_name,
        district=site.district,
        country=site.country,
        status=site.status,
        site_data=site.site_data,
        created_at=site.created_at.isoformat() if site.created_at else "",
        updated_at=site.updated_at.isoformat() if site.updated_at else "",
    )


@router.post("/sites", response_model=SiteResponse, status_code=201)
async def create_site(
    body: SiteCreateRequest,
    auth: AuthContext = Depends(require_role("admin", "analyst")),
    db: AsyncSession = Depends(get_db),
):
    site = Site(
        org_id=auth.org_id,
        created_by=auth.user_id,
        site_name=body.site_data.site_name,
        district=body.site_data.district,
        province=body.site_data.province,
        country=body.site_data.country,
        site_data=body.site_data.model_dump(),
        status="draft",
    )
    db.add(site)
    await db.commit()
    await db.refresh(site)
    return _site_to_response(site)


@router.get("/sites", response_model=SiteListResponse)
async def list_sites(
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Site).where(Site.org_id == auth.org_id).order_by(Site.created_at.desc())
    )
    sites = result.scalars().all()

    count_result = await db.execute(
        select(func.count()).select_from(Site).where(Site.org_id == auth.org_id)
    )
    total = count_result.scalar() or 0

    return SiteListResponse(
        sites=[_site_to_response(s) for s in sites],
        total=total,
    )


@router.get("/sites/{site_id}", response_model=SiteResponse)
async def get_site(
    site_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    site = await _get_org_site(db, site_id, auth.org_id)
    return _site_to_response(site)


@router.put("/sites/{site_id}", response_model=SiteResponse)
async def update_site(
    site_id: str,
    body: SiteUpdateRequest,
    auth: AuthContext = Depends(require_role("admin", "analyst")),
    db: AsyncSession = Depends(get_db),
):
    site = await _get_org_site(db, site_id, auth.org_id)
    site.site_name = body.site_data.site_name
    site.district = body.site_data.district
    site.province = body.site_data.province
    site.country = body.site_data.country
    site.site_data = body.site_data.model_dump()
    await db.commit()
    await db.refresh(site)
    return _site_to_response(site)


@router.post("/sites/{site_id}/clone", response_model=SiteResponse, status_code=201)
async def clone_site(
    site_id: str,
    auth: AuthContext = Depends(require_role("admin", "analyst")),
    db: AsyncSession = Depends(get_db),
):
    source = await _get_org_site(db, site_id, auth.org_id)
    clone = Site(
        org_id=auth.org_id,
        created_by=auth.user_id,
        site_name=f"{source.site_name} (Copy)",
        district=source.district,
        province=source.province,
        country=source.country,
        site_data={**source.site_data, "site_name": f"{source.site_name} (Copy)"},
        status="draft",
    )
    db.add(clone)
    await db.commit()
    await db.refresh(clone)
    return _site_to_response(clone)


@router.delete("/sites/{site_id}", status_code=204)
async def delete_site(
    site_id: str,
    auth: AuthContext = Depends(require_role("admin", "analyst")),
    db: AsyncSession = Depends(get_db),
):
    site = await _get_org_site(db, site_id, auth.org_id)
    await db.delete(site)
    await db.commit()


async def _get_org_site(db: AsyncSession, site_id: str, org_id: str) -> Site:
    result = await db.execute(
        select(Site).where(Site.id == site_id, Site.org_id == org_id)
    )
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return site
