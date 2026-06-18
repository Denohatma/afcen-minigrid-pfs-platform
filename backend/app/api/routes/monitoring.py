from __future__ import annotations

import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    MeteringData, PerformanceAlert, Milestone, AuditLog,
    utcnow, new_uuid,
)
from app.dependencies.auth import AuthContext, get_current_user, require_role

router = APIRouter()

# --- Performance thresholds for alert generation ---

PERFORMANCE_THRESHOLDS = {
    "system_availability": {"min": 95.0, "severity": "critical", "title": "Low System Availability"},
    "collection_rate": {"min": 70.0, "severity": "warning", "title": "Low Collection Rate"},
    "renewable_fraction": {"min": 80.0, "severity": "warning", "title": "Low Renewable Fraction"},
    "avg_hours_supply": {"min": 18.0, "severity": "critical", "title": "Insufficient Supply Hours"},
    "battery_soh": {"min": 70.0, "severity": "critical", "title": "Battery Health Degradation"},
}

# --- Schemas ---


class AcknowledgeBody(BaseModel):
    notes: str = ""


# --- CSV Parsing ---

CSV_FIELD_MAP = {
    "site_id": "site_id",
    "site_name": "site_name",
    "developer_id": "developer_id",
    "period_start": "period_start",
    "period_end": "period_end",
    "total_generation_kwh": "total_generation_kwh",
    "total_consumption_kwh": "total_consumption_kwh",
    "pue_consumption_kwh": "pue_consumption_kwh",
    "residential_consumption_kwh": "residential_consumption_kwh",
    "commercial_consumption_kwh": "commercial_consumption_kwh",
    "active_connections": "active_connections",
    "new_connections": "new_connections",
    "pue_connections": "pue_connections",
    "total_revenue_usd": "total_revenue_usd",
    "collection_rate_pct": "collection_rate_pct",
    "system_availability_pct": "system_availability_pct",
    "avg_hours_supply": "avg_hours_supply",
    "outage_events": "outage_events",
    "outage_hours": "outage_hours",
    "battery_soh_pct": "battery_soh_pct",
    "diesel_litres": "diesel_litres",
    "renewable_fraction_pct": "renewable_fraction_pct",
}


def _check_alerts(record: MeteringData) -> list[dict]:
    """Check if any metering data breaches performance thresholds."""
    alerts = []

    checks = [
        ("system_availability", record.system_availability_pct),
        ("collection_rate", record.collection_rate_pct),
        ("renewable_fraction", record.renewable_fraction_pct),
        ("avg_hours_supply", record.avg_hours_supply),
        ("battery_soh", record.battery_soh_pct),
    ]

    for metric_name, metric_value in checks:
        threshold = PERFORMANCE_THRESHOLDS[metric_name]
        if metric_value < threshold["min"]:
            alerts.append({
                "site_id": record.site_id,
                "site_name": record.site_name,
                "alert_type": f"low_{metric_name}",
                "severity": threshold["severity"],
                "title": threshold["title"],
                "description": (
                    f"{threshold['title']}: {metric_value:.1f}% "
                    f"(threshold: {threshold['min']}%) for site {record.site_name}"
                ),
                "metric_name": metric_name,
                "metric_value": metric_value,
                "threshold_value": threshold["min"],
            })

    return alerts


# --- Routes ---


@router.post("/monitoring/upload")
async def upload_metering_data(
    file: UploadFile = File(...),
    auth: AuthContext = Depends(require_role("developer", "afcen_admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Upload metering CSV data. Creates records and triggers alert checks."""
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(400, "File must be a CSV")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    records_created = 0
    alerts_created = 0

    from datetime import datetime

    for row in reader:
        # Parse dates
        try:
            period_start = datetime.fromisoformat(row.get("period_start", "").strip())
            period_end = datetime.fromisoformat(row.get("period_end", "").strip())
        except (ValueError, AttributeError):
            continue  # skip rows with invalid dates

        record = MeteringData(
            site_id=row.get("site_id", "").strip(),
            site_name=row.get("site_name", "").strip(),
            developer_id=row.get("developer_id", "").strip() or None,
            period_start=period_start,
            period_end=period_end,
            total_generation_kwh=float(row.get("total_generation_kwh", 0) or 0),
            total_consumption_kwh=float(row.get("total_consumption_kwh", 0) or 0),
            pue_consumption_kwh=float(row.get("pue_consumption_kwh", 0) or 0),
            residential_consumption_kwh=float(row.get("residential_consumption_kwh", 0) or 0),
            commercial_consumption_kwh=float(row.get("commercial_consumption_kwh", 0) or 0),
            active_connections=int(row.get("active_connections", 0) or 0),
            new_connections=int(row.get("new_connections", 0) or 0),
            pue_connections=int(row.get("pue_connections", 0) or 0),
            total_revenue_usd=float(row.get("total_revenue_usd", 0) or 0),
            collection_rate_pct=float(row.get("collection_rate_pct", 0) or 0),
            system_availability_pct=float(row.get("system_availability_pct", 100) or 100),
            avg_hours_supply=float(row.get("avg_hours_supply", 0) or 0),
            outage_events=int(row.get("outage_events", 0) or 0),
            outage_hours=float(row.get("outage_hours", 0) or 0),
            battery_soh_pct=float(row.get("battery_soh_pct", 100) or 100),
            diesel_litres=float(row.get("diesel_litres", 0) or 0),
            renewable_fraction_pct=float(row.get("renewable_fraction_pct", 100) or 100),
            raw_data=dict(row),
        )
        db.add(record)
        records_created += 1

        # Check for performance alerts
        new_alerts = _check_alerts(record)
        for alert_data in new_alerts:
            alert = PerformanceAlert(**alert_data)
            db.add(alert)
            alerts_created += 1

    audit = AuditLog(
        user_id=auth.user_id,
        user_name=auth.name,
        user_role=auth.role,
        action="metering_data_uploaded",
        entity_type="metering_data",
        entity_id=file.filename,
        details={"records_created": records_created, "alerts_created": alerts_created},
    )
    db.add(audit)

    await db.commit()

    return {
        "filename": file.filename,
        "records_created": records_created,
        "alerts_created": alerts_created,
    }


@router.get("/monitoring/sites")
async def list_monitored_sites(
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all sites with metering data, showing latest stats."""
    # Get distinct site IDs
    site_ids_result = await db.execute(
        select(
            MeteringData.site_id,
            MeteringData.site_name,
            func.max(MeteringData.period_end).label("latest_period"),
            func.count(MeteringData.id).label("record_count"),
        )
        .group_by(MeteringData.site_id, MeteringData.site_name)
        .order_by(MeteringData.site_name)
    )
    sites = site_ids_result.all()

    site_list = []
    for row in sites:
        # Get latest record for this site
        latest_result = await db.execute(
            select(MeteringData)
            .where(
                MeteringData.site_id == row.site_id,
                MeteringData.period_end == row.latest_period,
            )
            .limit(1)
        )
        latest = latest_result.scalar_one_or_none()

        # Count active alerts for this site
        alerts_result = await db.execute(
            select(func.count(PerformanceAlert.id))
            .where(
                PerformanceAlert.site_id == row.site_id,
                PerformanceAlert.acknowledged == False,
            )
        )
        active_alerts = alerts_result.scalar() or 0

        site_list.append({
            "site_id": row.site_id,
            "site_name": row.site_name,
            "latest_period_end": str(row.latest_period) if row.latest_period else None,
            "record_count": row.record_count,
            "active_alerts": active_alerts,
            "latest_data": {
                "active_connections": latest.active_connections if latest else 0,
                "total_generation_kwh": latest.total_generation_kwh if latest else 0,
                "system_availability_pct": latest.system_availability_pct if latest else 0,
                "collection_rate_pct": latest.collection_rate_pct if latest else 0,
                "renewable_fraction_pct": latest.renewable_fraction_pct if latest else 0,
            } if latest else None,
        })

    return {"sites": site_list, "total": len(site_list)}


@router.get("/monitoring/sites/{site_id}")
async def get_site_performance(
    site_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all performance data for a specific site."""
    result = await db.execute(
        select(MeteringData)
        .where(MeteringData.site_id == site_id)
        .order_by(MeteringData.period_start.desc())
    )
    records = result.scalars().all()

    if not records:
        raise HTTPException(404, "No metering data found for this site")

    # Get alerts for this site
    alerts_result = await db.execute(
        select(PerformanceAlert)
        .where(PerformanceAlert.site_id == site_id)
        .order_by(PerformanceAlert.created_at.desc())
    )
    alerts = alerts_result.scalars().all()

    return {
        "site_id": site_id,
        "site_name": records[0].site_name if records else "",
        "records": [
            {
                "id": r.id,
                "period_start": str(r.period_start),
                "period_end": str(r.period_end),
                "total_generation_kwh": r.total_generation_kwh,
                "total_consumption_kwh": r.total_consumption_kwh,
                "pue_consumption_kwh": r.pue_consumption_kwh,
                "residential_consumption_kwh": r.residential_consumption_kwh,
                "commercial_consumption_kwh": r.commercial_consumption_kwh,
                "active_connections": r.active_connections,
                "new_connections": r.new_connections,
                "pue_connections": r.pue_connections,
                "total_revenue_usd": r.total_revenue_usd,
                "collection_rate_pct": r.collection_rate_pct,
                "system_availability_pct": r.system_availability_pct,
                "avg_hours_supply": r.avg_hours_supply,
                "outage_events": r.outage_events,
                "outage_hours": r.outage_hours,
                "battery_soh_pct": r.battery_soh_pct,
                "diesel_litres": r.diesel_litres,
                "renewable_fraction_pct": r.renewable_fraction_pct,
                "uploaded_at": str(r.uploaded_at),
            }
            for r in records
        ],
        "alerts": [
            {
                "id": a.id,
                "alert_type": a.alert_type,
                "severity": a.severity,
                "title": a.title,
                "description": a.description,
                "acknowledged": a.acknowledged,
                "created_at": str(a.created_at),
            }
            for a in alerts
        ],
        "total_records": len(records),
        "total_alerts": len(alerts),
    }


@router.get("/monitoring/sites/{site_id}/kpis")
async def calculate_site_kpis(
    site_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Calculate KPIs from metering data for a site."""
    result = await db.execute(
        select(MeteringData)
        .where(MeteringData.site_id == site_id)
        .order_by(MeteringData.period_start)
    )
    records = result.scalars().all()

    if not records:
        raise HTTPException(404, "No metering data found for this site")

    # Aggregate KPIs
    total_generation = sum(r.total_generation_kwh for r in records)
    total_consumption = sum(r.total_consumption_kwh for r in records)
    total_pue = sum(r.pue_consumption_kwh for r in records)
    total_revenue = sum(r.total_revenue_usd for r in records)
    total_diesel = sum(r.diesel_litres for r in records)
    total_outage_hours = sum(r.outage_hours for r in records)
    total_outage_events = sum(r.outage_events for r in records)

    latest = records[-1]  # most recent
    earliest = records[0]

    # Connection growth
    first_connections = records[0].active_connections
    latest_connections = latest.active_connections
    connection_growth = latest_connections - first_connections

    # Averages
    avg_availability = sum(r.system_availability_pct for r in records) / len(records)
    avg_collection = sum(r.collection_rate_pct for r in records) / len(records)
    avg_renewable = sum(r.renewable_fraction_pct for r in records) / len(records)
    avg_supply_hours = sum(r.avg_hours_supply for r in records) / len(records)
    avg_battery_soh = sum(r.battery_soh_pct for r in records) / len(records)

    # PUE percentage
    pue_pct = (total_pue / total_consumption * 100) if total_consumption > 0 else 0

    # Revenue per connection
    revenue_per_connection = (total_revenue / latest_connections) if latest_connections > 0 else 0

    # Capacity utilization
    capacity_utilization = (total_consumption / total_generation * 100) if total_generation > 0 else 0

    return {
        "site_id": site_id,
        "site_name": latest.site_name,
        "reporting_periods": len(records),
        "period_range": {
            "start": str(earliest.period_start),
            "end": str(latest.period_end),
        },
        "energy_kpis": {
            "total_generation_kwh": round(total_generation, 2),
            "total_consumption_kwh": round(total_consumption, 2),
            "total_generation_mwh": round(total_generation / 1000, 2),
            "capacity_utilization_pct": round(capacity_utilization, 1),
            "avg_system_availability_pct": round(avg_availability, 1),
            "avg_supply_hours_per_day": round(avg_supply_hours, 1),
            "total_outage_events": total_outage_events,
            "total_outage_hours": round(total_outage_hours, 1),
        },
        "connection_kpis": {
            "current_connections": latest_connections,
            "pue_connections": latest.pue_connections,
            "connection_growth": connection_growth,
            "pue_consumption_pct": round(pue_pct, 1),
        },
        "financial_kpis": {
            "total_revenue_usd": round(total_revenue, 2),
            "avg_collection_rate_pct": round(avg_collection, 1),
            "revenue_per_connection_usd": round(revenue_per_connection, 2),
        },
        "sustainability_kpis": {
            "avg_renewable_fraction_pct": round(avg_renewable, 1),
            "total_diesel_litres": round(total_diesel, 1),
            "avg_battery_soh_pct": round(avg_battery_soh, 1),
        },
    }


@router.get("/monitoring/alerts")
async def list_alerts(
    severity: Optional[str] = None,
    site_id: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List performance alerts with optional filters."""
    query = select(PerformanceAlert).order_by(PerformanceAlert.created_at.desc())

    if severity:
        query = query.where(PerformanceAlert.severity == severity)
    if site_id:
        query = query.where(PerformanceAlert.site_id == site_id)
    if acknowledged is not None:
        query = query.where(PerformanceAlert.acknowledged == acknowledged)

    result = await db.execute(query)
    alerts = result.scalars().all()

    return {
        "alerts": [
            {
                "id": a.id,
                "site_id": a.site_id,
                "site_name": a.site_name,
                "alert_type": a.alert_type,
                "severity": a.severity,
                "title": a.title,
                "description": a.description,
                "metric_name": a.metric_name,
                "metric_value": a.metric_value,
                "threshold_value": a.threshold_value,
                "acknowledged": a.acknowledged,
                "acknowledged_by": a.acknowledged_by,
                "acknowledged_at": str(a.acknowledged_at) if a.acknowledged_at else None,
                "created_at": str(a.created_at),
            }
            for a in alerts
        ],
        "total": len(alerts),
    }


@router.put("/monitoring/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    body: AcknowledgeBody,
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Acknowledge a performance alert."""
    result = await db.execute(
        select(PerformanceAlert).where(PerformanceAlert.id == alert_id)
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(404, "Alert not found")

    if alert.acknowledged:
        raise HTTPException(400, "Alert already acknowledged")

    alert.acknowledged = True
    alert.acknowledged_by = auth.user_id
    alert.acknowledged_at = utcnow()

    await db.commit()
    return {
        "id": alert_id,
        "acknowledged": True,
        "acknowledged_at": str(alert.acknowledged_at),
    }


@router.get("/monitoring/dashboard")
async def monitoring_dashboard(
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate national monitoring dashboard."""
    # Count distinct monitored sites
    sites_result = await db.execute(
        select(func.count(distinct(MeteringData.site_id)))
    )
    total_sites = sites_result.scalar() or 0

    # Get latest record per site for current stats
    latest_records_result = await db.execute(
        select(MeteringData).order_by(MeteringData.period_end.desc())
    )
    all_records = latest_records_result.scalars().all()

    # Track latest record per site
    seen_sites = set()
    latest_by_site = []
    for r in all_records:
        if r.site_id not in seen_sites:
            seen_sites.add(r.site_id)
            latest_by_site.append(r)

    # Aggregate current stats from latest records
    total_connections = sum(r.active_connections for r in latest_by_site)
    total_pue_connections = sum(r.pue_connections for r in latest_by_site)

    # Aggregate all-time stats
    total_generation = sum(r.total_generation_kwh for r in all_records)
    total_consumption = sum(r.total_consumption_kwh for r in all_records)
    total_revenue = sum(r.total_revenue_usd for r in all_records)

    # Average performance across latest records
    avg_availability = (
        sum(r.system_availability_pct for r in latest_by_site) / len(latest_by_site)
        if latest_by_site else 0
    )
    avg_collection = (
        sum(r.collection_rate_pct for r in latest_by_site) / len(latest_by_site)
        if latest_by_site else 0
    )
    avg_renewable = (
        sum(r.renewable_fraction_pct for r in latest_by_site) / len(latest_by_site)
        if latest_by_site else 0
    )

    # Active alerts count
    alerts_result = await db.execute(
        select(func.count(PerformanceAlert.id))
        .where(PerformanceAlert.acknowledged == False)
    )
    active_alerts = alerts_result.scalar() or 0

    # Grant stats from milestones
    milestones_result = await db.execute(select(Milestone))
    milestones = milestones_result.scalars().all()
    total_grant_committed = sum(m.grant_amount_usd for m in milestones)
    total_grant_disbursed = sum(m.grant_amount_usd for m in milestones if m.status == "disbursed")

    return {
        "total_monitored_sites": total_sites,
        "total_connections": total_connections,
        "total_pue_connections": total_pue_connections,
        "total_generation_kwh": round(total_generation, 2),
        "total_generation_mwh": round(total_generation / 1000, 2),
        "total_consumption_kwh": round(total_consumption, 2),
        "total_revenue_usd": round(total_revenue, 2),
        "avg_system_availability_pct": round(avg_availability, 1),
        "avg_collection_rate_pct": round(avg_collection, 1),
        "avg_renewable_fraction_pct": round(avg_renewable, 1),
        "active_alerts": active_alerts,
        "grant_stats": {
            "total_committed_usd": round(total_grant_committed, 2),
            "total_disbursed_usd": round(total_grant_disbursed, 2),
            "remaining_usd": round(total_grant_committed - total_grant_disbursed, 2),
        },
        "metering_records_total": len(all_records),
    }
