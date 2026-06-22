from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from datetime import datetime, timedelta

from sqlalchemy import select, func

from app.config import settings
from app.db.session import engine, Base, async_session
from app.api.routes import (
    settlements,
    site_registry,
    disco_readiness,
    lots,
    evaluations,
    eval_stages,
    agreements,
    disbursements,
    grievances,
    tickets,
    settlement_ledger,
    performance,
    alfred,
    mel,
)
from app.db.models import (
    Ticket, TicketHistory, TicketComment,
    SettlementInvoice, SettlementInvoiceHistory, SettlementNetPosition,
    MELSubmission, MELTarget, MELLearningLog,
    new_uuid, utcnow,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s"
    if settings.environment == "development"
    else '{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)
logger = logging.getLogger("minigrid")


async def _seed_tickets(db):
    count = (await db.execute(select(func.count(Ticket.id)))).scalar() or 0
    if count > 0:
        return
    logger.info("Seeding 8 test tickets …")

    now = datetime.utcnow()
    tickets_data = [
        {
            "ticket_ref": "TKT-2026-0001",
            "title": "Community grievance: land access dispute, Karshi site",
            "description": "Community elders in Karshi report that minigrid construction has encroached on communal farmland without adequate compensation. Three households affected. Community meeting requested before construction can resume.",
            "category": "Grievance",
            "priority": "Critical",
            "status": "escalated",
            "sla_hours": 24,
            "reporter_name": "Amina Bello",
            "reporter_org": "Karshi Community Development Association",
            "site_name": "Karshi",
            "tags": ["AEDC", "land", "community"],
            "escalation_reason": "Community threatening to block site access — 48h to resolve",
            "created_at": now - timedelta(days=3),
            "due_date": now - timedelta(days=2, hours=21),
            "sla_breached": True,
        },
        {
            "ticket_ref": "TKT-2026-0002",
            "title": "Metering API 403 errors blocking Milestone 2 data feed",
            "description": "KEDCO metering API returns HTTP 403 Forbidden since 2026-06-12. Bulk meter readings for Zawaciki and Bichi sites cannot be pulled automatically. Manual readings submitted as interim measure but IVA requires API-sourced data for M2 verification.",
            "category": "Technical",
            "priority": "Critical",
            "status": "in_progress",
            "sla_hours": 24,
            "reporter_name": "Usman Danjuma",
            "reporter_org": "Havenhill Energy",
            "site_name": "Zawaciki",
            "tags": ["KEDCO", "metering", "API", "M2"],
            "assignee_id": None,
            "created_at": now - timedelta(days=5),
            "due_date": now - timedelta(days=4, hours=21),
            "sla_breached": True,
        },
        {
            "ticket_ref": "TKT-2026-0003",
            "title": "Tariff structure mismatch between PPA and billing system",
            "description": "Bboxx Nigeria reports that the tariff bands in the signed PPA (₦95/kWh residential, ₦120/kWh commercial) do not match what the billing system charges (₦105/kWh flat). Affects all 412 connections at Robinyan site. Revenue reconciliation blocked.",
            "category": "Commercial",
            "priority": "High",
            "status": "in_review",
            "sla_hours": 72,
            "reporter_name": "Emmanuel Okonkwo",
            "reporter_org": "Bboxx Nigeria",
            "site_name": "Robinyan",
            "tags": ["Ikeja Electric", "tariff", "PPA", "billing"],
            "created_at": now - timedelta(days=8),
            "due_date": now - timedelta(days=5),
            "sla_breached": True,
        },
        {
            "ticket_ref": "TKT-2026-0004",
            "title": "ESMP non-compliance: waste oil disposal at Keffi North",
            "description": "Routine E&S monitoring visit found 200L of waste transformer oil stored in unsealed containers near the battery room at Keffi North site. ESMP requires sealed containment within bunded area. Developer given 14-day corrective action notice.",
            "category": "E&S",
            "priority": "High",
            "status": "open",
            "sla_hours": 72,
            "reporter_name": "Dr. Funke Adeyemi",
            "reporter_org": "REA PMU E&S Unit",
            "site_name": "Keffi North",
            "tags": ["AEDC", "ESMP", "waste", "compliance"],
            "created_at": now - timedelta(days=2),
            "due_date": now + timedelta(hours=70),
        },
        {
            "ticket_ref": "TKT-2026-0005",
            "title": "Milestone 1 evidence incomplete: missing NEMSA certificate for Bichi",
            "description": "M1 submission for Bichi site is missing the NEMSA safety inspection certificate. Developer claims inspection was done but certificate issuance is delayed at NEMSA Kano office. M1 review cannot proceed without this document.",
            "category": "Milestone",
            "priority": "Medium",
            "status": "open",
            "sla_hours": 168,
            "reporter_name": "IVA Team",
            "reporter_org": "AfCEN Verification",
            "site_name": "Bichi",
            "tags": ["KEDCO", "M1", "NEMSA", "evidence"],
            "created_at": now - timedelta(days=4),
            "due_date": now + timedelta(days=3),
        },
        {
            "ticket_ref": "TKT-2026-0006",
            "title": "NERC mini-grid regulation update: tariff methodology change",
            "description": "NERC has issued a new mini-grid regulation (NERC/R/2026/07) effective 1 August 2026 that changes the tariff methodology for interconnected mini-grids. All PPAs signed under the old methodology may need amendment. Legal review required for all 6 active grant agreements.",
            "category": "Regulatory",
            "priority": "Medium",
            "status": "open",
            "sla_hours": 168,
            "reporter_name": "REA Legal Unit",
            "reporter_org": "REA PMU",
            "site_name": "",
            "tags": ["NERC", "regulation", "tariff", "PPA"],
            "created_at": now - timedelta(days=1),
            "due_date": now + timedelta(days=6),
        },
        {
            "ticket_ref": "TKT-2026-0007",
            "title": "Battery degradation exceeding warranty threshold at Zawaciki",
            "description": "Quarterly battery health check shows Zawaciki BESS at 78% SOH after only 14 months of operation. Manufacturer warranty guarantees >85% SOH for first 2 years. Developer requested to file warranty claim and provide replacement timeline.",
            "category": "Technical",
            "priority": "Medium",
            "status": "in_progress",
            "sla_hours": 168,
            "reporter_name": "Site Monitoring Team",
            "reporter_org": "AfCEN Technical",
            "site_name": "Zawaciki",
            "tags": ["KEDCO", "battery", "BESS", "warranty"],
            "assignee_id": None,
            "created_at": now - timedelta(days=6),
            "due_date": now + timedelta(hours=48),
        },
        {
            "ticket_ref": "TKT-2026-0008",
            "title": "Gender-based violence incident reported near Robinyan construction site",
            "description": "Anonymous report of harassment of female community member by construction worker at Robinyan site. Incident reported through community GRM channel. SEA/SH protocol activated. Investigation team dispatched. All construction activities paused pending preliminary assessment.",
            "category": "Grievance",
            "priority": "Critical",
            "status": "in_progress",
            "sla_hours": 24,
            "reporter_name": "Anonymous",
            "reporter_org": "",
            "anonymous": True,
            "site_name": "Robinyan",
            "tags": ["Ikeja Electric", "SEA/SH", "GBV", "safeguards"],
            "assignee_id": None,
            "created_at": now - timedelta(hours=18),
            "due_date": now + timedelta(hours=6),
        },
    ]

    for td in tickets_data:
        t = Ticket(
            id=new_uuid(),
            ticket_ref=td["ticket_ref"],
            title=td["title"],
            description=td["description"],
            category=td["category"],
            priority=td["priority"],
            status=td["status"],
            sla_hours=td["sla_hours"],
            sla_breached=td.get("sla_breached", False),
            reporter_name=td["reporter_name"],
            reporter_org=td["reporter_org"],
            anonymous=td.get("anonymous", False),
            assignee_id=td.get("assignee_id"),
            site_name=td["site_name"],
            due_date=td["due_date"],
            escalation_reason=td.get("escalation_reason"),
            tags=td["tags"],
            created_at=td["created_at"],
        )
        db.add(t)
        db.add(TicketHistory(
            ticket_id=t.id,
            actor_name="System",
            action="created",
            note=f"Ticket {td['ticket_ref']} created",
            created_at=td["created_at"],
        ))
        if td["status"] == "escalated":
            db.add(TicketHistory(
                ticket_id=t.id,
                actor_name="REA PMU Officer",
                action="escalated",
                note=td.get("escalation_reason", ""),
                created_at=td["created_at"] + timedelta(hours=6),
            ))

    await db.commit()
    logger.info("Seeded 8 test tickets")


async def _seed_settlement_invoices(db):
    count = (await db.execute(select(func.count(SettlementInvoice.id)))).scalar() or 0
    if count > 0:
        return
    logger.info("Seeding 9 settlement invoices …")

    now = datetime.utcnow()
    invoices = [
        {
            "invoice_ref": "KEDCO-IMP-2026-041",
            "site_name": "Zawaciki", "disco_name": "KEDCO",
            "developer_name": "Havenhill Energy",
            "invoice_type": "grid_import", "direction": "dev_to_disco",
            "billing_period": "2026-05", "amount_usd": 8420.00,
            "kwh_quantity": 42100.0, "rate_per_kwh": 0.20,
            "status": "paid", "amount_paid_usd": 8420.00,
            "issued_date": now - timedelta(days=42),
            "due_date": now - timedelta(days=12),
            "paid_date": now - timedelta(days=15),
            "payment_reference": "NIP/KEDCO/2026/05/1184",
            "created_at": now - timedelta(days=42),
        },
        {
            "invoice_ref": "KEDCO-DUOS-2026-041",
            "site_name": "Zawaciki", "disco_name": "KEDCO",
            "developer_name": "Havenhill Energy",
            "invoice_type": "duos", "direction": "dev_to_disco",
            "billing_period": "2026-05", "amount_usd": 1260.00,
            "status": "paid", "amount_paid_usd": 1260.00,
            "issued_date": now - timedelta(days=42),
            "due_date": now - timedelta(days=12),
            "paid_date": now - timedelta(days=15),
            "payment_reference": "NIP/KEDCO/2026/05/1185",
            "created_at": now - timedelta(days=42),
        },
        {
            "invoice_ref": "KEDCO-IMP-2026-047",
            "site_name": "Zawaciki", "disco_name": "KEDCO",
            "developer_name": "Havenhill Energy",
            "invoice_type": "grid_import", "direction": "dev_to_disco",
            "billing_period": "2026-06", "amount_usd": 9140.00,
            "kwh_quantity": 45700.0, "rate_per_kwh": 0.20,
            "status": "pending",
            "issued_date": now - timedelta(days=10),
            "due_date": now + timedelta(days=10),
            "created_at": now - timedelta(days=10),
        },
        {
            "invoice_ref": "IE-EXP-2026-019",
            "site_name": "Robinyan", "disco_name": "Ikeja Electric",
            "developer_name": "Bboxx Nigeria",
            "invoice_type": "power_export", "direction": "disco_to_dev",
            "billing_period": "2026-05", "amount_usd": 3200.00,
            "kwh_quantity": 16000.0, "rate_per_kwh": 0.20,
            "status": "overdue",
            "notes": "Disputed meter reading — DisCo claims 12,400 kWh vs developer 16,000 kWh",
            "issued_date": now - timedelta(days=40),
            "due_date": now - timedelta(days=10),
            "dispute_reason": "Bulk meter reading discrepancy: DisCo recorded 12,400 kWh exported but developer SCADA shows 16,000 kWh. Meter calibration certificate requested.",
            "dispute_raised_at": now - timedelta(days=8),
            "created_at": now - timedelta(days=40),
        },
        {
            "invoice_ref": "IE-LEASE-2026-019",
            "site_name": "Robinyan", "disco_name": "Ikeja Electric",
            "developer_name": "Bboxx Nigeria",
            "invoice_type": "grid_lease", "direction": "dev_to_disco",
            "billing_period": "2026-05", "amount_usd": 1800.00,
            "status": "paid", "amount_paid_usd": 1800.00,
            "issued_date": now - timedelta(days=40),
            "due_date": now - timedelta(days=10),
            "paid_date": now - timedelta(days=12),
            "payment_reference": "NIP/IE/2026/05/0891",
            "created_at": now - timedelta(days=40),
        },
        {
            "invoice_ref": "AEDC-IMP-2026-033",
            "site_name": "Karshi", "disco_name": "AEDC",
            "developer_name": "Privida Power",
            "invoice_type": "grid_import", "direction": "dev_to_disco",
            "billing_period": "2026-06", "amount_usd": 5630.00,
            "kwh_quantity": 28150.0, "rate_per_kwh": 0.20,
            "status": "disputed",
            "dispute_reason": "kWh discrepancy of 4,200 kWh between developer meter and DisCo bulk meter. Developer claims faulty CT ratio on DisCo meter. Independent meter test requested.",
            "dispute_raised_at": now - timedelta(days=5),
            "issued_date": now - timedelta(days=12),
            "due_date": now + timedelta(days=18),
            "created_at": now - timedelta(days=12),
        },
        {
            "invoice_ref": "AEDC-DUOS-2026-033",
            "site_name": "Karshi", "disco_name": "AEDC",
            "developer_name": "Privida Power",
            "invoice_type": "duos", "direction": "dev_to_disco",
            "billing_period": "2026-06", "amount_usd": 845.00,
            "status": "pending",
            "notes": "Held pending resolution of AEDC-IMP-2026-033 kWh dispute",
            "issued_date": now - timedelta(days=12),
            "due_date": now + timedelta(days=18),
            "created_at": now - timedelta(days=12),
        },
        {
            "invoice_ref": "KEDCO-EXP-2026-031",
            "site_name": "Bichi", "disco_name": "KEDCO",
            "developer_name": "Privida Power",
            "invoice_type": "power_export", "direction": "disco_to_dev",
            "billing_period": "2026-05", "amount_usd": 2780.00,
            "kwh_quantity": 13900.0, "rate_per_kwh": 0.20,
            "status": "partial", "amount_paid_usd": 1400.00,
            "notes": "Partial payment of USD 1,400 received. Remainder USD 1,380 disputed — KEDCO claims net-off against prior period arrears",
            "issued_date": now - timedelta(days=38),
            "due_date": now - timedelta(days=8),
            "paid_date": now - timedelta(days=10),
            "payment_reference": "NIP/KEDCO/2026/05/1201",
            "created_at": now - timedelta(days=38),
        },
        {
            "invoice_ref": "AEDC-LEASE-2026-028",
            "site_name": "Keffi North", "disco_name": "AEDC",
            "developer_name": "Havenhill Energy",
            "invoice_type": "grid_lease", "direction": "dev_to_disco",
            "billing_period": "2026-06", "amount_usd": 1500.00,
            "status": "pending",
            "issued_date": now - timedelta(days=8),
            "due_date": now + timedelta(days=22),
            "created_at": now - timedelta(days=8),
        },
    ]

    for inv in invoices:
        si = SettlementInvoice(
            id=new_uuid(),
            invoice_ref=inv["invoice_ref"],
            site_name=inv["site_name"],
            disco_name=inv["disco_name"],
            developer_name=inv["developer_name"],
            invoice_type=inv["invoice_type"],
            direction=inv["direction"],
            billing_period=inv["billing_period"],
            amount_usd=inv["amount_usd"],
            kwh_quantity=inv.get("kwh_quantity"),
            rate_per_kwh=inv.get("rate_per_kwh"),
            status=inv["status"],
            amount_paid_usd=inv.get("amount_paid_usd", 0.0),
            issued_date=inv.get("issued_date"),
            due_date=inv["due_date"],
            paid_date=inv.get("paid_date"),
            payment_reference=inv.get("payment_reference"),
            notes=inv.get("notes"),
            dispute_reason=inv.get("dispute_reason"),
            dispute_raised_at=inv.get("dispute_raised_at"),
            created_at=inv["created_at"],
        )
        db.add(si)
        db.add(SettlementInvoiceHistory(
            invoice_id=si.id,
            actor_name="System",
            action="created",
            new_status=inv["status"],
            note=f"Invoice {inv['invoice_ref']} created",
            created_at=inv["created_at"],
        ))
        if inv["status"] == "paid":
            db.add(SettlementInvoiceHistory(
                invoice_id=si.id,
                actor_name="System",
                action="payment_recorded",
                old_status="pending",
                new_status="paid",
                new_amount_paid=inv.get("amount_paid_usd"),
                note=f"Payment confirmed: {inv.get('payment_reference', '')}",
                created_at=inv.get("paid_date", inv["created_at"] + timedelta(days=20)),
            ))
        elif inv["status"] == "disputed":
            db.add(SettlementInvoiceHistory(
                invoice_id=si.id,
                actor_name="REA PMU Officer",
                action="dispute_raised",
                old_status="pending",
                new_status="disputed",
                note=inv.get("dispute_reason", ""),
                created_at=inv.get("dispute_raised_at", inv["created_at"] + timedelta(days=5)),
            ))
        elif inv["status"] == "partial":
            db.add(SettlementInvoiceHistory(
                invoice_id=si.id,
                actor_name="System",
                action="partial_payment",
                old_status="pending",
                new_status="partial",
                new_amount_paid=inv.get("amount_paid_usd"),
                note=f"Partial payment: {inv.get('payment_reference', '')}",
                created_at=inv.get("paid_date", inv["created_at"] + timedelta(days=15)),
            ))
        elif inv["status"] == "overdue":
            db.add(SettlementInvoiceHistory(
                invoice_id=si.id,
                actor_name="System",
                action="status_changed",
                old_status="pending",
                new_status="overdue",
                note="Auto-marked overdue: past due date",
                created_at=inv["due_date"],
            ))

    await db.commit()
    logger.info("Seeded 9 settlement invoices")


async def _seed_mel_data(db):
    count = (await db.execute(select(func.count(MELTarget.id)))).scalar() or 0
    if count > 0:
        return
    logger.info("Seeding MEL targets and sample submissions …")

    targets = [
        {"indicator_key": "hh_connected_cumulative", "target_value": 80000, "target_year": 2030, "source": "dares_pdo", "notes": "PDO indicator 1: HH with new/improved electricity"},
        {"indicator_key": "msme_connected_cumulative", "target_value": 8000, "target_year": 2030, "source": "dares_pdo", "notes": "PDO indicator 2: MSMEs with new/improved electricity"},
        {"indicator_key": "female_hh_pct", "target_value": 30.0, "target_year": 2030, "source": "dares_pdo", "notes": "PDO indicator 3: % female-headed HH beneficiaries"},
        {"indicator_key": "co2_avoided_cumulative", "target_value": 50000.0, "target_year": 2030, "source": "dares_pdo", "notes": "PDO indicator 4: tCO2e avoided cumulative"},
        {"indicator_key": "diesel_generators_decommissioned", "target_value": 500, "target_year": 2030, "source": "dares_pdo", "notes": "PDO indicator 5: generators displaced"},
        {"indicator_key": "direct_jobs_created", "target_value": 1200, "target_year": 2030, "source": "dares_pdo", "notes": "PDO indicator 6: direct jobs"},
        {"indicator_key": "avg_availability_pct", "target_value": 95.0, "target_year": 2028, "source": "dares_pim", "notes": "PIM Table 4.5: system availability target"},
        {"indicator_key": "avg_supply_hours", "target_value": 20.0, "target_year": 2028, "source": "dares_pim", "notes": "PIM Table 4.5: min supply hours/day"},
        {"indicator_key": "collection_rate_pct", "target_value": 85.0, "target_year": 2028, "source": "programme", "notes": "Programme minimum collection rate"},
        {"indicator_key": "pue_anchors_operational", "target_value": 300, "target_year": 2030, "source": "dares_pdo", "notes": "Productive use anchors"},
    ]
    for t in targets:
        db.add(MELTarget(**t))

    now = datetime.utcnow()
    submissions = [
        {
            "site_name": "Zawaciki", "reporting_period": "2026-04", "period_label": "Q2 2026 Apr",
            "submission_type": "developer_declaration", "status": "verified",
            "verified_at": now - timedelta(days=20),
            "hh_connected": 412, "hh_connected_cumulative": 412,
            "msme_connected": 38, "msme_connected_cumulative": 38,
            "anchor_connected": 5, "new_connections_this_period": 47,
            "female_hh_connected": 134, "female_hh_pct": 32.5,
            "women_led_msme": 12, "youth_led_msme": 8, "vulnerable_hh": 22,
            "supply_hours_per_day": 21.3, "system_availability_pct": 97.2,
            "saidi_minutes": 42.0, "saifi_events": 3,
            "kwh_generated": 48200.0, "kwh_from_grid": 12400.0, "kwh_sold": 42100.0,
            "kwh_exported_to_grid": 6300.0, "renewable_energy_fraction": 79.6,
            "diesel_generators_decommissioned": 18, "generator_kva_displaced": 126.0,
            "co2_avoided_tco2e": 38.4, "co2_avoided_cumulative": 142.8,
            "fuel_litres_saved": 4200.0,
            "arpu_usd": 8.40, "arpu_ngn": 12600.0, "total_revenue_usd": 4580.0,
            "collection_rate_pct": 91.2, "direct_jobs_created": 12, "indirect_jobs_created": 34,
            "women_employed_direct": 4,
            "pue_anchors_operational": 5, "pue_categories": ["milling", "welding", "cold_storage"],
            "productive_use_kwh": 8400.0,
            "key_observation": "Strong uptake in first quarter. Cold storage anchor driving evening demand curve.",
            "learning_tag": "productive_use",
            "data_completeness_pct": 100.0,
            "created_at": now - timedelta(days=30),
        },
        {
            "site_name": "Bichi", "reporting_period": "2026-04", "period_label": "Q2 2026 Apr",
            "submission_type": "developer_declaration", "status": "verified",
            "verified_at": now - timedelta(days=18),
            "hh_connected": 286, "hh_connected_cumulative": 286,
            "msme_connected": 22, "msme_connected_cumulative": 22,
            "anchor_connected": 3, "new_connections_this_period": 31,
            "female_hh_connected": 89, "female_hh_pct": 31.1,
            "women_led_msme": 7, "youth_led_msme": 5, "vulnerable_hh": 15,
            "supply_hours_per_day": 19.8, "system_availability_pct": 94.5,
            "saidi_minutes": 68.0, "saifi_events": 5,
            "kwh_generated": 32100.0, "kwh_from_grid": 8900.0, "kwh_sold": 28400.0,
            "kwh_exported_to_grid": 4100.0, "renewable_energy_fraction": 78.3,
            "diesel_generators_decommissioned": 11, "generator_kva_displaced": 82.0,
            "co2_avoided_tco2e": 24.6, "co2_avoided_cumulative": 92.1,
            "fuel_litres_saved": 2800.0,
            "arpu_usd": 7.20, "arpu_ngn": 10800.0, "total_revenue_usd": 2890.0,
            "collection_rate_pct": 86.4, "direct_jobs_created": 8, "indirect_jobs_created": 22,
            "women_employed_direct": 3,
            "pue_anchors_operational": 3, "pue_categories": ["milling", "irrigation"],
            "productive_use_kwh": 5200.0,
            "key_observation": "Irrigation PUE anchor seasonal — expect higher utilisation in dry season.",
            "learning_tag": "productive_use",
            "data_completeness_pct": 100.0,
            "created_at": now - timedelta(days=28),
        },
        {
            "site_name": "Robinyan", "reporting_period": "2026-05", "period_label": "Q2 2026 May",
            "submission_type": "developer_declaration", "status": "under_review",
            "hh_connected": 198, "hh_connected_cumulative": 198,
            "msme_connected": 15, "msme_connected_cumulative": 15,
            "anchor_connected": 2, "new_connections_this_period": 22,
            "female_hh_connected": 61, "female_hh_pct": 30.8,
            "women_led_msme": 5, "youth_led_msme": 3, "vulnerable_hh": 11,
            "supply_hours_per_day": 18.4, "system_availability_pct": 92.1,
            "saidi_minutes": 94.0, "saifi_events": 7,
            "kwh_generated": 24800.0, "kwh_from_grid": 6200.0, "kwh_sold": 21600.0,
            "diesel_generators_decommissioned": 8, "generator_kva_displaced": 56.0,
            "co2_avoided_tco2e": 18.2, "co2_avoided_cumulative": 18.2,
            "arpu_usd": 6.80, "total_revenue_usd": 1920.0,
            "collection_rate_pct": 82.5, "direct_jobs_created": 6, "indirect_jobs_created": 18,
            "women_employed_direct": 2,
            "pue_anchors_operational": 2, "pue_categories": ["tailoring", "phone_charging"],
            "productive_use_kwh": 3100.0,
            "challenges_faced": "Grid instability causing more frequent switchovers than planned.",
            "learning_tag": "reliability",
            "data_completeness_pct": 87.5,
            "created_at": now - timedelta(days=12),
        },
        {
            "site_name": "Karshi", "reporting_period": "2026-05", "period_label": "Q2 2026 May",
            "submission_type": "analyst_entry", "status": "submitted",
            "hh_connected": 340, "hh_connected_cumulative": 340,
            "msme_connected": 28, "msme_connected_cumulative": 28,
            "anchor_connected": 4, "new_connections_this_period": 38,
            "female_hh_connected": 108, "female_hh_pct": 31.8,
            "women_led_msme": 9, "youth_led_msme": 6, "vulnerable_hh": 18,
            "supply_hours_per_day": 20.1, "system_availability_pct": 95.8,
            "kwh_generated": 41200.0, "kwh_from_grid": 10800.0, "kwh_sold": 36400.0,
            "diesel_generators_decommissioned": 14, "generator_kva_displaced": 98.0,
            "co2_avoided_tco2e": 31.2, "co2_avoided_cumulative": 31.2,
            "arpu_usd": 7.90, "total_revenue_usd": 3680.0,
            "collection_rate_pct": 88.7, "direct_jobs_created": 10, "indirect_jobs_created": 28,
            "women_employed_direct": 3,
            "pue_anchors_operational": 4, "pue_categories": ["milling", "welding", "barbing", "cold_storage"],
            "productive_use_kwh": 7200.0,
            "key_observation": "Community land dispute (TKT-2026-0001) may affect new connections next period.",
            "data_completeness_pct": 87.5,
            "created_at": now - timedelta(days=8),
        },
    ]
    for s in submissions:
        db.add(MELSubmission(**s))

    learning_entries = [
        {
            "site_name": "Zawaciki", "reporting_period": "2026-04",
            "author_name": "REA PMU Officer", "tag": "productive_use",
            "title": "Cold storage anchor transforms evening demand profile",
            "body": "The cold storage facility at Zawaciki has shifted the demand curve significantly. Pre-commissioning, evening peak was 15-18h driven by lighting. Post cold-storage, peak extends to 21h with a plateau between 17-21h. This has improved the capacity utilisation factor from 22% to 34%. Recommendation: prioritise cold storage as anchor PUE for all KEDCO sites.",
            "is_portfolio_wide": False, "is_published": True, "upvotes": 4,
        },
        {
            "tag": "reliability", "author_name": "AfCEN Technical",
            "title": "Grid interconnection switchover time: lesson from Robinyan",
            "body": "Robinyan experiences 5-7 grid outages per week, each lasting 20-90 minutes. The automatic transfer switch (ATS) takes 8-12 seconds per switchover, causing brief power interruptions that affect sensitive equipment (computers, fridges). Recommendation: specify maximum 3-second ATS response time in future technical specifications. Consider UPS buffer for critical anchor loads.",
            "is_portfolio_wide": True, "is_published": True, "upvotes": 7,
        },
        {
            "tag": "gesi", "author_name": "REA PMU E&S Unit",
            "title": "Women-led MSME identification methodology needs standardisation",
            "body": "Across 4 pilot sites, developers are using inconsistent criteria to identify women-led MSMEs. Some count businesses with female employees, others require female ownership >50%. The DARES PIM defines women-led as '>=50% female ownership or female primary decision-maker'. Recommendation: issue standardised guidance note with verification checklist to all developers before next reporting period.",
            "is_portfolio_wide": True, "is_published": True, "upvotes": 3,
        },
    ]
    for le in learning_entries:
        db.add(MELLearningLog(**le))

    await db.commit()
    logger.info("Seeded MEL targets, 4 submissions, 3 learning entries")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        await _seed_tickets(db)
        await _seed_settlement_invoices(db)
        await _seed_mel_data(db)
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
app.include_router(eval_stages.router, prefix="/api/v1", tags=["eval-stages"])
app.include_router(agreements.router, prefix="/api/v1", tags=["agreements"])
app.include_router(disbursements.router, prefix="/api/v1", tags=["disbursements"])
app.include_router(grievances.router, prefix="/api/v1", tags=["grievances"])
app.include_router(tickets.router, prefix="/api/v1", tags=["tickets"])
app.include_router(settlement_ledger.router, prefix="/api/v1", tags=["settlement-ledger"])
app.include_router(performance.router, prefix="/api/v1", tags=["performance"])
app.include_router(alfred.router, prefix="/api/v1", tags=["alfred"])
app.include_router(mel.router, prefix="/api/v1", tags=["mel"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0", "environment": settings.environment}
