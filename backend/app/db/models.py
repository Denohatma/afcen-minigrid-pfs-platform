"""
AfCEN DARES IMG Platform — Database Models
12-module programme operating system for interconnected mini-grids.
Schema aligned to Platform Build Document v1.0, Section 5.3.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, DateTime, ForeignKey,
    JSON, Text, Boolean, Index,
)
from sqlalchemy.orm import relationship

from app.db.session import Base


def utcnow():
    return datetime.utcnow()


def new_uuid():
    return str(uuid.uuid4())


# ── Core: Users & Audit ──────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=new_uuid)
    email = Column(String(300), nullable=False, unique=True)
    name = Column(String(200), default="")
    role = Column(String(40), default="rea_pmu_officer")
    organisation = Column(String(200), default="")
    disco_scope = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(String, primary_key=True, default=new_uuid)
    actor_id = Column(String, nullable=True)
    actor_name = Column(String(200), default="")
    actor_role = Column(String(40), default="")
    action = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String, nullable=True)
    before_json = Column(JSON, nullable=True)
    after_json = Column(JSON, nullable=True)
    ip_address = Column(String(50), default="")
    timestamp = Column(DateTime, default=utcnow)


# ── Module 1: Portfolio / Site Registry ──────────────────────────────

class Program(Base):
    __tablename__ = "programs"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String(300), nullable=False)
    scheme_type = Column(String(30), default="img_capex_grant")
    funding_source = Column(String(100), default="DARES/IDA")
    grant_envelope_usd = Column(Float, default=0.0)
    implementing_agency = Column(String(200), default="REA")
    status = Column(String(20), default="active")
    config = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)


class SiteRegistry(Base):
    __tablename__ = "site_registry"

    id = Column(String, primary_key=True, default=new_uuid)
    program_id = Column(String, ForeignKey("programs.id"), nullable=True)
    disco = Column(String(20), nullable=False)
    feeder_name = Column(String(200), default="")
    band = Column(String(5), default="")
    community = Column(String(200), nullable=False)
    state = Column(String(100), default="")
    lga = Column(String(100), default="")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    population = Column(Integer, default=0)
    customers = Column(Integer, default=0)
    supply_hours = Column(Float, default=0.0)
    demand_kwh = Column(Float, default=0.0)
    genset_proxy = Column(Boolean, default=False)
    grid_dist_km = Column(Float, default=0.0)
    security_risk = Column(String(20), default="low")
    data_quality_score = Column(Float, default=0.0)
    status = Column(String(30), default="candidate")
    source_data = Column(JSON, default=dict)
    settlement_rank = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    disco_readiness = relationship("DiscoReadiness", back_populates="site", uselist=False)

    __table_args__ = (
        Index("ix_site_disco", "disco"),
        Index("ix_site_status", "status"),
    )


# ── Module 3: DisCo Readiness & Interconnection ─────────────────────

class DiscoReadiness(Base):
    __tablename__ = "disco_readiness"

    id = Column(String, primary_key=True, default=new_uuid)
    site_id = Column(String, ForeignKey("site_registry.id"), nullable=False, unique=True)
    feeder_data_status = Column(String(20), default="not_started")
    poi_status = Column(String(20), default="not_started")
    bulk_meter_status = Column(String(20), default="not_started")
    customer_data_status = Column(String(20), default="not_started")
    settlement_terms_status = Column(String(20), default="not_started")
    tripartite_status = Column(String(20), default="not_started")
    feeder_data = Column(JSON, default=dict)
    poi_data = Column(JSON, default=dict)
    bulk_meter_data = Column(JSON, default=dict)
    customer_data = Column(JSON, default=dict)
    settlement_terms = Column(JSON, default=dict)
    validated_by = Column(String, nullable=True)
    validated_at = Column(DateTime, nullable=True)
    overall_status = Column(String(20), default="not_started")
    notes = Column(Text, default="")
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    site = relationship("SiteRegistry", back_populates="disco_readiness")


class InterconnectionRequirement(Base):
    __tablename__ = "interconnection_requirements"

    id = Column(String, primary_key=True, default=new_uuid)
    site_id = Column(String, ForeignKey("site_registry.id"), nullable=False)
    voltage_level = Column(String(20), default="")
    protection_scheme = Column(Text, default="")
    islanding_mode = Column(String(30), default="")
    sync_requirements = Column(Text, default="")
    nemsa_status = Column(String(30), default="not_started")
    responsibilities = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)


# ── Module 5: Lots, Data Rooms & Tenders ─────────────────────────────

class Lot(Base):
    __tablename__ = "lots"

    id = Column(String, primary_key=True, default=new_uuid)
    program_id = Column(String, ForeignKey("programs.id"), nullable=True)
    lot_name = Column(String(200), nullable=False)
    disco = Column(String(20), nullable=False)
    state = Column(String(100), default="")
    grant_ceiling_pct = Column(Float, default=0.40)
    grant_ceiling_usd = Column(Float, default=0.0)
    evaluation_method = Column(String(30), default="quality_cost")
    data_room_status = Column(String(20), default="not_started")
    tender_status = Column(String(30), default="draft")
    approval_to_tender = Column(Boolean, default=False)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    site_count = Column(Integer, default=0)
    total_connections = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    sites = relationship("LotSite", back_populates="lot", cascade="all, delete-orphan")
    data_room = relationship("DataRoom", back_populates="lot", uselist=False)
    tender = relationship("Tender", back_populates="lot", uselist=False)


class LotSite(Base):
    __tablename__ = "lot_sites"

    id = Column(String, primary_key=True, default=new_uuid)
    lot_id = Column(String, ForeignKey("lots.id"), nullable=False)
    site_id = Column(String, ForeignKey("site_registry.id"), nullable=False)
    settlement_rank = Column(Integer, nullable=True)

    lot = relationship("Lot", back_populates="sites")


class DataRoom(Base):
    __tablename__ = "data_rooms"

    id = Column(String, primary_key=True, default=new_uuid)
    lot_id = Column(String, ForeignKey("lots.id"), nullable=False, unique=True)
    folder_index = Column(JSON, default=dict)
    completeness_status = Column(JSON, default=dict)
    nda_required = Column(Boolean, default=True)
    bidder_access_log = Column(JSON, default=list)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    lot = relationship("Lot", back_populates="data_room")
    documents = relationship("DataRoomDocument", back_populates="data_room", cascade="all, delete-orphan")


class DataRoomDocument(Base):
    __tablename__ = "data_room_documents"

    id = Column(String, primary_key=True, default=new_uuid)
    data_room_id = Column(String, ForeignKey("data_rooms.id"), nullable=False)
    folder_number = Column(Integer, nullable=False)
    folder_name = Column(String(100), default="")
    filename = Column(String(300), nullable=False)
    storage_key = Column(String(500), default="")
    file_size = Column(Integer, default=0)
    version = Column(Integer, default=1)
    status = Column(String(20), default="provided")
    uploaded_by = Column(String, nullable=True)
    uploaded_at = Column(DateTime, default=utcnow)

    data_room = relationship("DataRoom", back_populates="documents")


class Tender(Base):
    __tablename__ = "tenders"

    id = Column(String, primary_key=True, default=new_uuid)
    lot_id = Column(String, ForeignKey("lots.id"), nullable=False, unique=True)
    tender_reference = Column(String(100), default="")
    procurement_method = Column(String(50), default="open_competitive")
    status = Column(String(30), default="draft")
    title = Column(String(300), default="")
    description = Column(Text, default="")
    currency = Column(String(10), default="USD")
    grant_ceiling_pct = Column(Float, default=0.40)
    bid_validity_days = Column(Integer, default=90)
    bid_security_amount = Column(Float, default=0.0)
    eoi_deadline = Column(DateTime, nullable=True)
    clarification_deadline = Column(DateTime, nullable=True)
    submission_deadline = Column(DateTime, nullable=True)
    bid_opening_date = Column(DateTime, nullable=True)
    bids_encrypted = Column(Boolean, default=True)
    issued_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    awarded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    lot = relationship("Lot", back_populates="tender")
    questions = relationship("TenderQuestion", back_populates="tender", cascade="all, delete-orphan")
    addenda = relationship("TenderAddendum", back_populates="tender", cascade="all, delete-orphan")


class TenderQuestion(Base):
    __tablename__ = "tender_questions"

    id = Column(String, primary_key=True, default=new_uuid)
    tender_id = Column(String, ForeignKey("tenders.id"), nullable=False)
    bidder_id = Column(String, ForeignKey("bidders.id"), nullable=True)
    company_name = Column(String(300), default="")
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=True)
    asked_at = Column(DateTime, default=utcnow)
    answered_at = Column(DateTime, nullable=True)
    published = Column(Boolean, default=False)

    tender = relationship("Tender", back_populates="questions")


class TenderAddendum(Base):
    __tablename__ = "tender_addenda"

    id = Column(String, primary_key=True, default=new_uuid)
    tender_id = Column(String, ForeignKey("tenders.id"), nullable=False)
    addendum_number = Column(Integer, nullable=False)
    title = Column(String(300), default="")
    description = Column(Text, default="")
    issued_by = Column(String, nullable=True)
    issued_at = Column(DateTime, default=utcnow)

    tender = relationship("Tender", back_populates="addenda")


# ── Bidders & Bids ───────────────────────────────────────────────────

class Bidder(Base):
    __tablename__ = "bidders"

    id = Column(String, primary_key=True, default=new_uuid)
    company_name = Column(String(300), nullable=False)
    registration_number = Column(String(100), default="")
    country = Column(String(100), default="Nigeria")
    contact_name = Column(String(200), nullable=False)
    contact_email = Column(String(300), nullable=False)
    contact_phone = Column(String(50), default="")
    qualification_status = Column(String(20), default="pending")
    kyc_status = Column(String(20), default="not_started")
    sanctions_check = Column(String(20), default="not_started")
    financial_capacity = Column(JSON, default=dict)
    track_record = Column(JSON, default=dict)
    docs_status = Column(JSON, default=dict)
    beneficial_ownership = Column(JSON, default=dict)
    years_experience = Column(Integer, default=0)
    completed_sites = Column(Integer, default=0)
    total_capacity_kwp = Column(Float, default=0.0)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    bids = relationship("Bid", back_populates="bidder")
    nda_acceptances = relationship("NDAAcceptance", back_populates="bidder")


class NDAAcceptance(Base):
    __tablename__ = "nda_acceptances"

    id = Column(String, primary_key=True, default=new_uuid)
    bidder_id = Column(String, ForeignKey("bidders.id"), nullable=False)
    lot_id = Column(String, ForeignKey("lots.id"), nullable=False)
    accepted_at = Column(DateTime, default=utcnow)
    ip_address = Column(String(50), default="")

    bidder = relationship("Bidder", back_populates="nda_acceptances")


class Bid(Base):
    __tablename__ = "bids"

    id = Column(String, primary_key=True, default=new_uuid)
    lot_id = Column(String, ForeignKey("lots.id"), nullable=False)
    tender_id = Column(String, ForeignKey("tenders.id"), nullable=False)
    bidder_id = Column(String, ForeignKey("bidders.id"), nullable=False)
    grant_ask_pct = Column(Float, default=0.0)
    eligible_capex_usd = Column(Float, default=0.0)
    total_capex_usd = Column(Float, default=0.0)
    grant_amount_usd = Column(Float, default=0.0)
    tariff_residential = Column(Float, default=0.0)
    tariff_commercial = Column(Float, default=0.0)
    tariff_pue = Column(Float, default=0.0)
    pv_kwp = Column(Float, default=0.0)
    bess_kwh = Column(Float, default=0.0)
    connections = Column(Integer, default=0)
    timeline_months = Column(Integer, default=0)
    financing_plan = Column(JSON, default=dict)
    technical_proposal = Column(JSON, default=dict)
    financial_proposal = Column(JSON, default=dict)
    es_proposal = Column(JSON, default=dict)
    programme_of_works = Column(JSON, default=dict)
    deviations = Column(JSON, default=list)
    bid_security_ref = Column(String(200), default="")
    status = Column(String(20), default="submitted")
    submitted_at = Column(DateTime, default=utcnow)
    opened_at = Column(DateTime, nullable=True)

    bidder = relationship("Bidder", back_populates="bids")
    evaluation = relationship("Evaluation", back_populates="bid", uselist=False)

    __table_args__ = (
        Index("ix_bid_lot", "lot_id"),
        Index("ix_bid_tender", "tender_id"),
    )


# ── Module 6: Evaluation & No-Objection ─────────────────────────────

class Evaluation(Base):
    __tablename__ = "evaluations"

    id = Column(String, primary_key=True, default=new_uuid)
    bid_id = Column(String, ForeignKey("bids.id"), nullable=False, unique=True)
    tender_id = Column(String, ForeignKey("tenders.id"), nullable=False)
    evaluator_id = Column(String, ForeignKey("users.id"), nullable=True)
    coi_status = Column(String(20), default="not_declared")
    coi_declaration = Column(JSON, nullable=True)
    admin_responsive = Column(Boolean, nullable=True)
    admin_notes = Column(Text, default="")
    technical_score = Column(Float, nullable=True)
    technical_threshold_met = Column(Boolean, nullable=True)
    financial_score = Column(Float, nullable=True)
    experience_score = Column(Float, nullable=True)
    es_score = Column(Float, nullable=True)
    total_score = Column(Float, nullable=True)
    criteria_scores = Column(JSON, default=dict)
    clarifications = Column(JSON, default=list)
    ai_flags_reviewed = Column(Boolean, default=False)
    audit_notes = Column(Text, default="")
    status = Column(String(30), default="pending")
    recommended_for_award = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    bid = relationship("Bid", back_populates="evaluation")
    ai_flags = relationship("AIFlag", back_populates="evaluation", cascade="all, delete-orphan")


class AIFlag(Base):
    __tablename__ = "ai_flags"

    id = Column(String, primary_key=True, default=new_uuid)
    evaluation_id = Column(String, ForeignKey("evaluations.id"), nullable=False)
    entity_id = Column(String, nullable=True)
    flag_type = Column(String(50), nullable=False)
    severity = Column(String(20), default="medium")
    recommendation_text = Column(Text, default="")
    human_action = Column(String(30), nullable=True)
    override_reason = Column(Text, nullable=True)
    evaluator_id = Column(String, ForeignKey("users.id"), nullable=True)
    timestamp = Column(DateTime, default=utcnow)

    evaluation = relationship("Evaluation", back_populates="ai_flags")


class NoObjectionPack(Base):
    __tablename__ = "no_objection_packs"

    id = Column(String, primary_key=True, default=new_uuid)
    lot_id = Column(String, ForeignKey("lots.id"), nullable=False)
    tender_id = Column(String, ForeignKey("tenders.id"), nullable=False)
    procurement_report = Column(JSON, default=dict)
    attachments = Column(JSON, default=list)
    submission_date = Column(DateTime, nullable=True)
    wb_status = Column(String(30), default="not_submitted")
    comments = Column(Text, default="")
    approval_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)


# ── Module 7: Agreement Management ──────────────────────────────────

class GrantAgreement(Base):
    __tablename__ = "grant_agreements"

    id = Column(String, primary_key=True, default=new_uuid)
    lot_id = Column(String, ForeignKey("lots.id"), nullable=False)
    bidder_id = Column(String, ForeignKey("bidders.id"), nullable=False)
    grant_amount_usd = Column(Float, default=0.0)
    eligible_capex_ceiling_usd = Column(Float, default=0.0)
    grant_pct = Column(Float, default=0.0)
    tranche_rules = Column(JSON, default=dict)
    currency = Column(String(10), default="USD")
    ringfenced_amount = Column(Float, default=0.0)
    pbg_assignment_status = Column(String(20), default="not_assigned")
    pbg_lender = Column(String(200), default="")
    agreement_date = Column(DateTime, nullable=True)
    effective_date = Column(DateTime, nullable=True)
    status = Column(String(20), default="draft")
    agreement_data = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)

    cps = relationship("ConditionPrecedent", back_populates="grant_agreement", cascade="all, delete-orphan")
    milestones = relationship("Milestone", back_populates="grant_agreement")
    capex_items = relationship("EligibleCapex", back_populates="grant_agreement", cascade="all, delete-orphan")


# ── Module 8: Conditions Precedent Tracker ───────────────────────────

class ConditionPrecedent(Base):
    __tablename__ = "conditions_precedent"

    id = Column(String, primary_key=True, default=new_uuid)
    grant_agreement_id = Column(String, ForeignKey("grant_agreements.id"), nullable=False)
    cp_category = Column(String(30), nullable=False)
    title = Column(String(300), nullable=False)
    description = Column(Text, default="")
    evidence_type = Column(String(100), default="")
    owner_role = Column(String(40), default="")
    verifier_role = Column(String(40), default="")
    due_date = Column(DateTime, nullable=True)
    status = Column(String(20), default="not_started")
    evidence_files = Column(JSON, default=list)
    submitted_at = Column(DateTime, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    verified_by = Column(String, nullable=True)
    waiver_status = Column(String(20), nullable=True)
    waiver_authority = Column(String(200), nullable=True)
    waiver_justification = Column(Text, nullable=True)
    waiver_expiry = Column(DateTime, nullable=True)
    retry_count = Column(Integer, default=0)
    return_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    grant_agreement = relationship("GrantAgreement", back_populates="cps")

    __table_args__ = (
        Index("ix_cp_category", "cp_category"),
        Index("ix_cp_status", "status"),
    )


# ── Module 9: Eligible CAPEX, Milestones & Disbursement ─────────────

class EligibleCapex(Base):
    __tablename__ = "eligible_capex"

    id = Column(String, primary_key=True, default=new_uuid)
    grant_agreement_id = Column(String, ForeignKey("grant_agreements.id"), nullable=False)
    category = Column(String(100), nullable=False)
    description = Column(Text, default="")
    invoice_ref = Column(String(200), default="")
    claimed_amount = Column(Float, default=0.0)
    eligible_amount = Column(Float, default=0.0)
    iva_verified_amount = Column(Float, default=0.0)
    disallowed_amount = Column(Float, default=0.0)
    disallow_reason = Column(Text, default="")
    evidence_files = Column(JSON, default=list)
    status = Column(String(20), default="claimed")
    created_at = Column(DateTime, default=utcnow)

    grant_agreement = relationship("GrantAgreement", back_populates="capex_items")


class Milestone(Base):
    __tablename__ = "milestones"

    id = Column(String, primary_key=True, default=new_uuid)
    grant_agreement_id = Column(String, ForeignKey("grant_agreements.id"), nullable=False)
    site_id = Column(String, ForeignKey("site_registry.id"), nullable=True)
    milestone_type = Column(String(30), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    tranche_pct = Column(Float, default=0.0)
    grant_amount_usd = Column(Float, default=0.0)
    evidence = Column(JSON, default=dict)
    iva_status = Column(String(20), default="not_started")
    nemsa_status = Column(String(20), default="not_applicable")
    rea_approval_status = Column(String(20), default="not_started")
    target_date = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="not_started")
    created_at = Column(DateTime, default=utcnow)

    grant_agreement = relationship("GrantAgreement", back_populates="milestones")
    disbursement = relationship("Disbursement", back_populates="milestone", uselist=False)
    gps_photos = relationship("GPSPhoto", back_populates="milestone")
    iva_visits = relationship("IVAVisit", back_populates="milestone")


class Disbursement(Base):
    __tablename__ = "disbursements"

    id = Column(String, primary_key=True, default=new_uuid)
    milestone_id = Column(String, ForeignKey("milestones.id"), nullable=False, unique=True)
    amount_usd = Column(Float, default=0.0)
    currency = Column(String(10), default="USD")
    beneficiary_account = Column(String(200), default="")
    evidence_submitted_by = Column(String, nullable=True)
    evidence_submitted_at = Column(DateTime, nullable=True)
    iva_verified_by = Column(String, nullable=True)
    iva_verified_at = Column(DateTime, nullable=True)
    rea_approved_by = Column(String, nullable=True)
    rea_approved_at = Column(DateTime, nullable=True)
    grant_admin_approved_by = Column(String, nullable=True)
    grant_admin_approved_at = Column(DateTime, nullable=True)
    payment_status = Column(String(20), default="pending")
    payment_reference = Column(String(200), default="")
    audit_ref = Column(String(200), default="")
    ringfence_checked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    milestone = relationship("Milestone", back_populates="disbursement")


class GPSPhoto(Base):
    __tablename__ = "gps_photos"

    id = Column(String, primary_key=True, default=new_uuid)
    milestone_id = Column(String, ForeignKey("milestones.id"), nullable=False)
    site_id = Column(String, ForeignKey("site_registry.id"), nullable=True)
    photo_filename = Column(String(300), default="")
    storage_key = Column(String(500), default="")
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    accuracy_meters = Column(Float, default=0.0)
    device_id = Column(String(200), default="")
    captured_at = Column(DateTime, nullable=False)
    uploaded_at = Column(DateTime, default=utcnow)
    distance_from_site_km = Column(Float, default=0.0)
    coordinate_check = Column(String(10), default="pass")
    timestamp_check = Column(String(10), default="pass")
    duplicate_check = Column(String(10), default="pass")
    overall_status = Column(String(10), default="pass")
    reviewer_notes = Column(Text, nullable=True)

    milestone = relationship("Milestone", back_populates="gps_photos")


class IVAVisit(Base):
    __tablename__ = "iva_visits"

    id = Column(String, primary_key=True, default=new_uuid)
    site_id = Column(String, ForeignKey("site_registry.id"), nullable=False)
    milestone_id = Column(String, ForeignKey("milestones.id"), nullable=False)
    trigger_reason = Column(String(30), default="auto_flag")
    iva_name = Column(String(200), default="")
    scheduled_date = Column(DateTime, nullable=True)
    completed_date = Column(DateTime, nullable=True)
    status = Column(String(20), default="pending")
    field_report_key = Column(String(500), nullable=True)
    verification_result = Column(String(20), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    milestone = relationship("Milestone", back_populates="iva_visits")


# ── Module 10: E&S, SEP & GRM ───────────────────────────────────────

class Grievance(Base):
    __tablename__ = "grievances"

    id = Column(String, primary_key=True, default=new_uuid)
    site_id = Column(String, ForeignKey("site_registry.id"), nullable=True)
    lot_id = Column(String, ForeignKey("lots.id"), nullable=True)
    complainant_type = Column(String(30), default="community_member")
    submitter_name = Column(String(200), nullable=True)
    submitter_contact = Column(String(300), nullable=True)
    category = Column(String(50), default="other")
    severity = Column(String(20), default="medium")
    description = Column(Text, nullable=False)
    location_description = Column(Text, default="")
    is_anonymous = Column(Boolean, default=False)
    is_sea_sh = Column(Boolean, default=False)
    status = Column(String(30), default="received")
    assigned_to = Column(String, nullable=True)
    resolution_date = Column(DateTime, nullable=True)
    corrective_action = Column(Text, default="")
    escalated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    comments = relationship("GrievanceComment", back_populates="grievance", cascade="all, delete-orphan")


class GrievanceComment(Base):
    __tablename__ = "grievance_comments"

    id = Column(String, primary_key=True, default=new_uuid)
    grievance_id = Column(String, ForeignKey("grievances.id"), nullable=False)
    author_id = Column(String, ForeignKey("users.id"), nullable=True)
    author_role = Column(String(40), default="")
    comment_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow)

    grievance = relationship("Grievance", back_populates="comments")


# ── Module 11: DisCo Settlement & Dispute ────────────────────────────

class SettlementLedger(Base):
    __tablename__ = "settlement_ledger"

    id = Column(String, primary_key=True, default=new_uuid)
    site_id = Column(String, ForeignKey("site_registry.id"), nullable=False)
    grant_agreement_id = Column(String, ForeignKey("grant_agreements.id"), nullable=True)
    month = Column(String(7), nullable=False)
    bulk_meter_kwh = Column(Float, default=0.0)
    grid_import_kwh = Column(Float, default=0.0)
    der_generation_kwh = Column(Float, default=0.0)
    duos_charge_usd = Column(Float, default=0.0)
    grid_energy_charge_usd = Column(Float, default=0.0)
    total_settlement_usd = Column(Float, default=0.0)
    invoice_ref = Column(String(200), default="")
    invoice_file_key = Column(String(500), default="")
    developer_accepted = Column(Boolean, nullable=True)
    dispute_status = Column(String(20), nullable=True)
    dispute_reason = Column(Text, nullable=True)
    dispute_category = Column(String(30), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    resolved_amount_usd = Column(Float, nullable=True)
    payment_status = Column(String(20), default="pending")
    payment_confirmed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        Index("ix_settlement_site_month", "site_id", "month"),
    )


# ── Module 12: Performance Monitoring & M&E ──────────────────────────

class PerformanceMonitoring(Base):
    __tablename__ = "performance_monitoring"

    id = Column(String, primary_key=True, default=new_uuid)
    site_id = Column(String, ForeignKey("site_registry.id"), nullable=False)
    month = Column(String(7), nullable=False)
    connections = Column(Integer, default=0)
    new_connections = Column(Integer, default=0)
    pue_connections = Column(Integer, default=0)
    kwh_generated = Column(Float, default=0.0)
    kwh_sold = Column(Float, default=0.0)
    grid_import_kwh = Column(Float, default=0.0)
    der_kwh = Column(Float, default=0.0)
    revenue_usd = Column(Float, default=0.0)
    collection_rate_pct = Column(Float, default=0.0)
    availability_pct = Column(Float, default=0.0)
    supply_hours = Column(Float, default=0.0)
    saidi_minutes = Column(Float, default=0.0)
    saifi_events = Column(Float, default=0.0)
    capacity_utilisation_pct = Column(Float, default=0.0)
    renewable_fraction_pct = Column(Float, default=100.0)
    diesel_litres = Column(Float, default=0.0)
    battery_soh_pct = Column(Float, default=100.0)
    raw_data = Column(JSON, default=dict)
    uploaded_at = Column(DateTime, default=utcnow)

    __table_args__ = (
        Index("ix_perf_site_month", "site_id", "month"),
    )


class GESIMetric(Base):
    __tablename__ = "gesi_metrics"

    id = Column(String, primary_key=True, default=new_uuid)
    site_id = Column(String, ForeignKey("site_registry.id"), nullable=False)
    period = Column(String(7), nullable=False)
    female_connections_pct = Column(Float, default=0.0)
    female_headed_hh_pct = Column(Float, default=0.0)
    women_employed_construction = Column(Integer, default=0)
    women_employed_operations = Column(Integer, default=0)
    youth_employed = Column(Integer, default=0)
    disability_accessible_facilities = Column(Integer, default=0)
    community_meetings_held = Column(Integer, default=0)
    grievances_from_women = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)


class CarbonCredit(Base):
    __tablename__ = "carbon_credits"

    id = Column(String, primary_key=True, default=new_uuid)
    site_id = Column(String, ForeignKey("site_registry.id"), nullable=False)
    methodology = Column(String(30), default="gold_standard")
    annual_tco2e_avoided = Column(Float, default=0.0)
    credit_status = Column(String(30), default="not_applied")
    credits_issued_count = Column(Integer, nullable=True)
    revenue_usd = Column(Float, nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    created_at = Column(DateTime, default=utcnow)


class ESGReport(Base):
    __tablename__ = "esg_reports"

    id = Column(String, primary_key=True, default=new_uuid)
    report_type = Column(String(30), nullable=False)
    title = Column(String(300), default="")
    scope_type = Column(String(20), default="all")
    scope_id = Column(String, nullable=True)
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    generated_at = Column(DateTime, default=utcnow)
    generated_by = Column(String(200), default="")
    data_snapshot = Column(JSON, default=dict)
    status = Column(String(20), default="draft")
    created_at = Column(DateTime, default=utcnow)
