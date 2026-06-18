from __future__ import annotations

import math
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    GPSPhoto, IVAVisit, Milestone, Site, PortfolioSite,
    AuditLog, utcnow, new_uuid,
)
from app.dependencies.auth import AuthContext, get_current_user, require_role

router = APIRouter()

# --- Schemas ---


class PhotoUpload(BaseModel):
    milestone_id: str
    photo_filename: str = ""
    storage_key: str = ""
    latitude: float
    longitude: float
    altitude: Optional[float] = None
    accuracy_meters: float = 0.0
    device_id: str = ""
    captured_at: str  # ISO datetime string


class PhotoReview(BaseModel):
    reviewer_notes: str = ""
    override_status: Optional[str] = None  # pass, amber, red


class IVAVisitCreate(BaseModel):
    site_id: str
    milestone_id: str
    trigger_reason: str = "auto_flag"  # auto_flag, random_sample, grievance_linked
    iva_name: str = ""
    scheduled_date: Optional[str] = None
    notes: Optional[str] = None


class IVAVisitUpdate(BaseModel):
    status: Optional[str] = None  # pending, scheduled, completed, waived
    iva_name: Optional[str] = None
    scheduled_date: Optional[str] = None
    completed_date: Optional[str] = None
    field_report_key: Optional[str] = None
    verification_result: Optional[str] = None  # confirmed, issues_found, failed
    notes: Optional[str] = None


# --- Haversine distance calculation ---


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two GPS coordinates in kilometers."""
    R = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


# --- Auto-validation logic ---


async def validate_photo(
    photo: GPSPhoto,
    db: AsyncSession,
) -> None:
    """Run auto-validation checks on a GPS photo and set check statuses."""
    now = utcnow()

    # --- Coordinate check: compare photo GPS to site coordinates ---
    # Look up the site via milestone -> portfolio_site -> site
    milestone_result = await db.execute(
        select(Milestone).where(Milestone.id == photo.milestone_id)
    )
    milestone = milestone_result.scalar_one_or_none()

    site_lat, site_lon = None, None
    if milestone and milestone.portfolio_site_id:
        ps_result = await db.execute(
            select(PortfolioSite).where(PortfolioSite.id == milestone.portfolio_site_id)
        )
        ps = ps_result.scalar_one_or_none()
        if ps and ps.site_id:
            site_result = await db.execute(
                select(Site).where(Site.id == ps.site_id)
            )
            site = site_result.scalar_one_or_none()
            if site and site.site_data:
                site_lat = site.site_data.get("latitude") or site.site_data.get("lat")
                site_lon = site.site_data.get("longitude") or site.site_data.get("lon") or site.site_data.get("lng")

    if site_lat is not None and site_lon is not None:
        try:
            distance = haversine_km(float(site_lat), float(site_lon), photo.latitude, photo.longitude)
        except (ValueError, TypeError):
            distance = 999.0
        photo.distance_from_site_km = round(distance, 2)
        if distance < 2.0:
            photo.coordinate_check = "pass"
        elif distance < 5.0:
            photo.coordinate_check = "amber"
        else:
            photo.coordinate_check = "red"
    else:
        # No site coordinates available; default to amber (cannot verify)
        photo.distance_from_site_km = 0.0
        photo.coordinate_check = "amber"

    # --- Timestamp check ---
    captured = photo.captured_at
    if captured.tzinfo is None:
        captured = captured.replace(tzinfo=timezone.utc)
    now_tz = now.replace(tzinfo=timezone.utc) if now.tzinfo is None else now

    age = now_tz - captured
    if age <= timedelta(hours=48):
        photo.timestamp_check = "pass"
    elif age <= timedelta(days=7):
        photo.timestamp_check = "amber"
    else:
        photo.timestamp_check = "red"

    # --- Duplicate check: same device_id within 100m in last hour ---
    one_hour_ago = captured - timedelta(hours=1)
    dup_result = await db.execute(
        select(GPSPhoto).where(
            GPSPhoto.device_id == photo.device_id,
            GPSPhoto.device_id != "",
            GPSPhoto.captured_at >= one_hour_ago,
            GPSPhoto.captured_at <= captured,
            GPSPhoto.id != photo.id,
        )
    )
    nearby_photos = dup_result.scalars().all()

    photo.duplicate_check = "pass"
    for other in nearby_photos:
        dist = haversine_km(photo.latitude, photo.longitude, other.latitude, other.longitude)
        if dist < 0.1:  # 100m = 0.1km
            photo.duplicate_check = "amber"
            break

    # --- Overall status ---
    checks = [photo.coordinate_check, photo.timestamp_check, photo.duplicate_check]
    if "red" in checks:
        photo.overall_status = "red"
    elif "amber" in checks:
        photo.overall_status = "amber"
    else:
        photo.overall_status = "pass"


# --- Routes ---


@router.post("/gps-verification/photos")
async def upload_gps_photo(
    body: PhotoUpload,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a GPS photo with metadata. Auto-validates coordinates, timestamp, and duplicates."""
    # Verify milestone exists
    ms_result = await db.execute(
        select(Milestone).where(Milestone.id == body.milestone_id)
    )
    milestone = ms_result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(404, "Milestone not found")

    try:
        captured_at = datetime.fromisoformat(body.captured_at)
    except ValueError:
        raise HTTPException(400, "Invalid captured_at datetime format. Use ISO format.")

    photo = GPSPhoto(
        milestone_id=body.milestone_id,
        photo_filename=body.photo_filename,
        storage_key=body.storage_key,
        latitude=body.latitude,
        longitude=body.longitude,
        altitude=body.altitude,
        accuracy_meters=body.accuracy_meters,
        device_id=body.device_id,
        captured_at=captured_at,
    )
    db.add(photo)
    await db.flush()  # get photo.id before validation

    # Run auto-validation
    await validate_photo(photo, db)

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="gps_photo_uploaded",
        entity_type="gps_photo",
        entity_id=photo.id,
        details={
            "milestone_id": body.milestone_id,
            "overall_status": photo.overall_status,
        },
    )
    db.add(audit)

    await db.commit()
    await db.refresh(photo)

    return {
        "id": photo.id,
        "milestone_id": photo.milestone_id,
        "latitude": photo.latitude,
        "longitude": photo.longitude,
        "distance_from_site_km": photo.distance_from_site_km,
        "coordinate_check": photo.coordinate_check,
        "timestamp_check": photo.timestamp_check,
        "duplicate_check": photo.duplicate_check,
        "overall_status": photo.overall_status,
        "uploaded_at": str(photo.uploaded_at),
    }


@router.get("/gps-verification/milestone/{milestone_id}")
async def get_milestone_verification(
    milestone_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all photos and verification summary for a milestone."""
    # Verify milestone exists
    ms_result = await db.execute(
        select(Milestone).where(Milestone.id == milestone_id)
    )
    milestone = ms_result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(404, "Milestone not found")

    # Get all photos for this milestone
    photos_result = await db.execute(
        select(GPSPhoto)
        .where(GPSPhoto.milestone_id == milestone_id)
        .order_by(GPSPhoto.captured_at.desc())
    )
    photos = photos_result.scalars().all()

    # Summary counts
    total = len(photos)
    passed = sum(1 for p in photos if p.overall_status == "pass")
    amber = sum(1 for p in photos if p.overall_status == "amber")
    red = sum(1 for p in photos if p.overall_status == "red")

    # Get IVA visits for this milestone
    iva_result = await db.execute(
        select(IVAVisit)
        .where(IVAVisit.milestone_id == milestone_id)
        .order_by(IVAVisit.created_at.desc())
    )
    iva_visits = iva_result.scalars().all()

    return {
        "milestone_id": milestone_id,
        "milestone_title": milestone.title,
        "milestone_status": milestone.status,
        "summary": {
            "total_photos": total,
            "passed": passed,
            "amber": amber,
            "red": red,
        },
        "photos": [
            {
                "id": p.id,
                "photo_filename": p.photo_filename,
                "latitude": p.latitude,
                "longitude": p.longitude,
                "altitude": p.altitude,
                "accuracy_meters": p.accuracy_meters,
                "device_id": p.device_id,
                "captured_at": str(p.captured_at),
                "uploaded_at": str(p.uploaded_at),
                "distance_from_site_km": p.distance_from_site_km,
                "coordinate_check": p.coordinate_check,
                "timestamp_check": p.timestamp_check,
                "duplicate_check": p.duplicate_check,
                "overall_status": p.overall_status,
                "reviewer_notes": p.reviewer_notes,
            }
            for p in photos
        ],
        "iva_visits": [
            {
                "id": v.id,
                "trigger_reason": v.trigger_reason,
                "iva_name": v.iva_name,
                "status": v.status,
                "verification_result": v.verification_result,
                "created_at": str(v.created_at),
            }
            for v in iva_visits
        ],
    }


@router.put("/gps-verification/photos/{photo_id}/review")
async def review_photo(
    photo_id: str,
    body: PhotoReview,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """PM reviews a GPS photo: add notes and optionally override status."""
    result = await db.execute(
        select(GPSPhoto).where(GPSPhoto.id == photo_id)
    )
    photo = result.scalar_one_or_none()
    if not photo:
        raise HTTPException(404, "GPS photo not found")

    photo.reviewer_notes = body.reviewer_notes

    if body.override_status:
        valid_statuses = ("pass", "amber", "red")
        if body.override_status not in valid_statuses:
            raise HTTPException(400, f"override_status must be one of: {', '.join(valid_statuses)}")
        photo.overall_status = body.override_status

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="gps_photo_reviewed",
        entity_type="gps_photo",
        entity_id=photo.id,
        details={"override_status": body.override_status},
    )
    db.add(audit)

    await db.commit()

    return {
        "id": photo.id,
        "overall_status": photo.overall_status,
        "reviewer_notes": photo.reviewer_notes,
    }


@router.post("/gps-verification/milestone/{milestone_id}/approve")
async def approve_milestone_verification(
    milestone_id: str,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Approve GPS verification for a milestone."""
    ms_result = await db.execute(
        select(Milestone).where(Milestone.id == milestone_id)
    )
    milestone = ms_result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(404, "Milestone not found")

    # Check that there are photos and none are red
    photos_result = await db.execute(
        select(GPSPhoto).where(GPSPhoto.milestone_id == milestone_id)
    )
    photos = photos_result.scalars().all()
    if not photos:
        raise HTTPException(400, "No GPS photos uploaded for this milestone")

    red_count = sum(1 for p in photos if p.overall_status == "red")
    if red_count > 0:
        raise HTTPException(
            400,
            f"{red_count} photo(s) have 'red' status. Review or override before approving.",
        )

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="gps_verification_approved",
        entity_type="milestone",
        entity_id=milestone_id,
        details={"total_photos": len(photos)},
    )
    db.add(audit)

    await db.commit()

    return {
        "milestone_id": milestone_id,
        "verified": True,
        "total_photos": len(photos),
        "message": "GPS verification approved for milestone",
    }


@router.post("/gps-verification/milestone/{milestone_id}/flag-iva")
async def flag_for_iva(
    milestone_id: str,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Flag a milestone for IVA (Independent Verification Agent) visit."""
    ms_result = await db.execute(
        select(Milestone).where(Milestone.id == milestone_id)
    )
    milestone = ms_result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(404, "Milestone not found")

    # Determine site_id from milestone's portfolio_site
    site_id = ""
    if milestone.portfolio_site_id:
        ps_result = await db.execute(
            select(PortfolioSite).where(PortfolioSite.id == milestone.portfolio_site_id)
        )
        ps = ps_result.scalar_one_or_none()
        if ps and ps.site_id:
            site_id = ps.site_id

    if not site_id:
        raise HTTPException(400, "Cannot determine site for this milestone")

    visit = IVAVisit(
        site_id=site_id,
        milestone_id=milestone_id,
        trigger_reason="auto_flag",
        status="pending",
    )
    db.add(visit)

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="iva_visit_flagged",
        entity_type="iva_visit",
        entity_id=visit.id,
        details={"milestone_id": milestone_id},
    )
    db.add(audit)

    await db.commit()
    await db.refresh(visit)

    return {
        "id": visit.id,
        "site_id": visit.site_id,
        "milestone_id": visit.milestone_id,
        "trigger_reason": visit.trigger_reason,
        "status": visit.status,
        "created_at": str(visit.created_at),
    }


@router.post("/gps-verification/iva-visits")
async def create_iva_visit(
    body: IVAVisitCreate,
    auth: AuthContext = Depends(require_role("afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Create an IVA visit."""
    valid_reasons = ("auto_flag", "random_sample", "grievance_linked")
    if body.trigger_reason not in valid_reasons:
        raise HTTPException(400, f"trigger_reason must be one of: {', '.join(valid_reasons)}")

    scheduled = None
    if body.scheduled_date:
        try:
            scheduled = datetime.fromisoformat(body.scheduled_date)
        except ValueError:
            raise HTTPException(400, "Invalid scheduled_date format")

    visit = IVAVisit(
        site_id=body.site_id,
        milestone_id=body.milestone_id,
        trigger_reason=body.trigger_reason,
        iva_name=body.iva_name,
        scheduled_date=scheduled,
        status="scheduled" if scheduled else "pending",
        notes=body.notes,
    )
    db.add(visit)

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="iva_visit_created",
        entity_type="iva_visit",
        entity_id=visit.id,
        details={"site_id": body.site_id, "milestone_id": body.milestone_id},
    )
    db.add(audit)

    await db.commit()
    await db.refresh(visit)

    return {
        "id": visit.id,
        "site_id": visit.site_id,
        "milestone_id": visit.milestone_id,
        "trigger_reason": visit.trigger_reason,
        "iva_name": visit.iva_name,
        "status": visit.status,
        "scheduled_date": str(visit.scheduled_date) if visit.scheduled_date else None,
        "created_at": str(visit.created_at),
    }


@router.get("/gps-verification/iva-visits")
async def list_iva_visits(
    site_id: Optional[str] = None,
    status: Optional[str] = None,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List IVA visits with optional filters."""
    query = select(IVAVisit).order_by(IVAVisit.created_at.desc())

    if site_id:
        query = query.where(IVAVisit.site_id == site_id)
    if status:
        query = query.where(IVAVisit.status == status)

    result = await db.execute(query)
    visits = result.scalars().all()

    return {
        "iva_visits": [
            {
                "id": v.id,
                "site_id": v.site_id,
                "milestone_id": v.milestone_id,
                "trigger_reason": v.trigger_reason,
                "iva_name": v.iva_name,
                "scheduled_date": str(v.scheduled_date) if v.scheduled_date else None,
                "completed_date": str(v.completed_date) if v.completed_date else None,
                "status": v.status,
                "field_report_key": v.field_report_key,
                "verification_result": v.verification_result,
                "notes": v.notes,
                "created_at": str(v.created_at),
            }
            for v in visits
        ],
        "total": len(visits),
    }


@router.put("/gps-verification/iva-visits/{visit_id}")
async def update_iva_visit(
    visit_id: str,
    body: IVAVisitUpdate,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an IVA visit: complete it, upload report, change status."""
    result = await db.execute(
        select(IVAVisit).where(IVAVisit.id == visit_id)
    )
    visit = result.scalar_one_or_none()
    if not visit:
        raise HTTPException(404, "IVA visit not found")

    if body.status:
        valid_statuses = ("pending", "scheduled", "completed", "waived")
        if body.status not in valid_statuses:
            raise HTTPException(400, f"status must be one of: {', '.join(valid_statuses)}")
        visit.status = body.status

    if body.iva_name is not None:
        visit.iva_name = body.iva_name
    if body.scheduled_date is not None:
        try:
            visit.scheduled_date = datetime.fromisoformat(body.scheduled_date)
        except ValueError:
            raise HTTPException(400, "Invalid scheduled_date format")
    if body.completed_date is not None:
        try:
            visit.completed_date = datetime.fromisoformat(body.completed_date)
        except ValueError:
            raise HTTPException(400, "Invalid completed_date format")
    if body.field_report_key is not None:
        visit.field_report_key = body.field_report_key
    if body.verification_result is not None:
        valid_results = ("confirmed", "issues_found", "failed")
        if body.verification_result not in valid_results:
            raise HTTPException(400, f"verification_result must be one of: {', '.join(valid_results)}")
        visit.verification_result = body.verification_result
    if body.notes is not None:
        visit.notes = body.notes

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="iva_visit_updated",
        entity_type="iva_visit",
        entity_id=visit.id,
        details={"status": visit.status, "verification_result": visit.verification_result},
    )
    db.add(audit)

    await db.commit()

    return {
        "id": visit.id,
        "site_id": visit.site_id,
        "milestone_id": visit.milestone_id,
        "status": visit.status,
        "iva_name": visit.iva_name,
        "scheduled_date": str(visit.scheduled_date) if visit.scheduled_date else None,
        "completed_date": str(visit.completed_date) if visit.completed_date else None,
        "field_report_key": visit.field_report_key,
        "verification_result": visit.verification_result,
        "notes": visit.notes,
    }
