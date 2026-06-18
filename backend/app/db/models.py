from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, JSON, Text, Boolean
from sqlalchemy.orm import relationship

from app.db.session import Base


def utcnow():
    return datetime.utcnow()


def new_uuid():
    return str(uuid.uuid4())


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String(200), nullable=False)
    clerk_org_id = Column(String(200), unique=True, nullable=False)
    created_at = Column(DateTime, default=utcnow)

    members = relationship("OrgMember", back_populates="organization")
    sites = relationship("Site", back_populates="organization")


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=new_uuid)
    clerk_user_id = Column(String(200), unique=True, nullable=False)
    email = Column(String(300), nullable=False)
    name = Column(String(200), default="")
    role = Column(String(30), default="program_manager")
    created_at = Column(DateTime, default=utcnow)

    memberships = relationship("OrgMember", back_populates="user")


class OrgMember(Base):
    __tablename__ = "org_members"

    id = Column(String, primary_key=True, default=new_uuid)
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    role = Column(String(30), default="program_manager")
    created_at = Column(DateTime, default=utcnow)

    organization = relationship("Organization", back_populates="members")
    user = relationship("User", back_populates="memberships")


class Site(Base):
    __tablename__ = "sites"

    id = Column(String, primary_key=True, default=new_uuid)
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    site_name = Column(String(200), nullable=False)
    district = Column(String(200), default="")
    province = Column(String(200), default="")
    country = Column(String(100), default="")
    site_data = Column(JSON, nullable=False)
    status = Column(String(20), default="draft")
    assessment_status = Column(String(30), default="not_started")
    feeder_band = Column(String(10), default="")
    supply_hours = Column(Float, default=0.0)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    organization = relationship("Organization", back_populates="sites")
    runs = relationship("PipelineRun", back_populates="site", order_by="PipelineRun.started_at.desc()")


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id = Column(String, primary_key=True, default=new_uuid)
    site_id = Column(String, ForeignKey("sites.id"), nullable=False)
    triggered_by = Column(String, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="pending")
    adapter_timings = Column(JSON, default=dict)
    adapter_errors = Column(JSON, default=dict)
    summary_metrics = Column(JSON, default=dict)
    started_at = Column(DateTime, default=utcnow)
    completed_at = Column(DateTime, nullable=True)

    site = relationship("Site", back_populates="runs")
    adapter_results = relationship("AdapterResult", back_populates="run")
    documents = relationship("Document", back_populates="run")


class AdapterResult(Base):
    __tablename__ = "adapter_results"

    id = Column(String, primary_key=True, default=new_uuid)
    run_id = Column(String, ForeignKey("pipeline_runs.id"), nullable=False)
    adapter_name = Column(String(100), nullable=False)
    status = Column(String(20), default="pending")
    output = Column(JSON, nullable=True)
    duration_seconds = Column(Float, nullable=True)

    run = relationship("PipelineRun", back_populates="adapter_results")


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=new_uuid)
    run_id = Column(String, ForeignKey("pipeline_runs.id"), nullable=False)
    format = Column(String(20), nullable=False)
    storage_key = Column(String(500), nullable=False)
    filename = Column(String(300), nullable=False)
    size_bytes = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)

    run = relationship("PipelineRun", back_populates="documents")


class Portfolio(Base):
    __tablename__ = "portfolios"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    disco_name = Column(String, nullable=False)
    status = Column(String, default="draft")
    filters = Column(JSON, default=dict)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    total_capex_usd = Column(Float, default=0.0)
    total_connections = Column(Integer, default=0)
    total_grant_usd = Column(Float, default=0.0)
    avg_lcoe = Column(Float, default=0.0)
    avg_irr = Column(Float, default=0.0)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    sites = relationship("PortfolioSite", back_populates="portfolio", cascade="all, delete-orphan")
    tender = relationship("Tender", back_populates="portfolio", uselist=False)


class PortfolioSite(Base):
    __tablename__ = "portfolio_sites"

    id = Column(String, primary_key=True, default=new_uuid)
    portfolio_id = Column(String, ForeignKey("portfolios.id"), nullable=False)
    settlement_rank = Column(Integer)
    settlement_data = Column(JSON, default=dict)
    site_id = Column(String, ForeignKey("sites.id"), nullable=True)
    pipeline_status = Column(String, default="pending")
    results = Column(JSON, default=dict)
    arpu = Column(Float, default=0.0)

    portfolio = relationship("Portfolio", back_populates="sites")


# --- Module 4: Tender Management ---

class Tender(Base):
    __tablename__ = "tenders"

    id = Column(String, primary_key=True, default=new_uuid)
    portfolio_id = Column(String, ForeignKey("portfolios.id"), nullable=False)
    status = Column(String, default="draft")
    title = Column(String(300), default="")
    description = Column(Text, default="")
    tender_type = Column(String(30), default="mst")
    currency = Column(String(10), default="USD")
    max_grant_pct = Column(Float, default=0.40)
    min_connections = Column(Integer, default=0)
    require_pue = Column(Boolean, default=True)
    require_prepaid = Column(Boolean, default=True)
    qa_close_date = Column(DateTime, nullable=True)
    launched_at = Column(DateTime, nullable=True)
    deadline = Column(DateTime, nullable=True)
    awarded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    portfolio = relationship("Portfolio", back_populates="tender")
    invitees = relationship("TenderInvitee", back_populates="tender", cascade="all, delete-orphan")
    questions = relationship("TenderQuestion", back_populates="tender", cascade="all, delete-orphan")
    submissions = relationship("TenderSubmission", back_populates="tender", cascade="all, delete-orphan")


class TenderInvitee(Base):
    __tablename__ = "tender_invitees"

    id = Column(String, primary_key=True, default=new_uuid)
    tender_id = Column(String, ForeignKey("tenders.id"), nullable=False)
    company_name = Column(String, nullable=False)
    contact_name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    invited_at = Column(DateTime, default=utcnow)
    viewed_at = Column(DateTime, nullable=True)

    tender = relationship("Tender", back_populates="invitees")


class TenderQuestion(Base):
    __tablename__ = "tender_questions"

    id = Column(String, primary_key=True, default=new_uuid)
    tender_id = Column(String, ForeignKey("tenders.id"), nullable=False)
    asked_by = Column(String, default="")
    company_name = Column(String, default="")
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=True)
    asked_at = Column(DateTime, default=utcnow)
    answered_at = Column(DateTime, nullable=True)

    tender = relationship("Tender", back_populates="questions")


class TenderSubmission(Base):
    __tablename__ = "tender_submissions"

    id = Column(String, primary_key=True, default=new_uuid)
    tender_id = Column(String, ForeignKey("tenders.id"), nullable=False)
    developer_id = Column(String, ForeignKey("developer_registrations.id"), nullable=True)
    company_name = Column(String, nullable=False)
    contact_name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    proposal_data = Column(JSON, default=dict)
    financial_data = Column(JSON, default=dict)
    technical_data = Column(JSON, default=dict)
    team_data = Column(JSON, default=dict)
    status = Column(String, default="submitted")
    submitted_at = Column(DateTime, default=utcnow)

    tender = relationship("Tender", back_populates="submissions")
    evaluation = relationship("BidEvaluation", back_populates="submission", uselist=False)


# --- Developer Registration ---

class DeveloperRegistration(Base):
    __tablename__ = "developer_registrations"

    id = Column(String, primary_key=True, default=new_uuid)
    company_name = Column(String(300), nullable=False)
    registration_number = Column(String(100), default="")
    country_of_incorporation = Column(String(100), default="Nigeria")
    contact_name = Column(String(200), nullable=False)
    contact_email = Column(String(300), nullable=False)
    contact_phone = Column(String(50), default="")
    years_experience = Column(Integer, default=0)
    completed_sites = Column(Integer, default=0)
    total_capacity_kwp = Column(Float, default=0.0)
    qualification_docs = Column(JSON, default=dict)
    approval_status = Column(String(20), default="pending")
    approval_notes = Column(Text, default="")
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    valid_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


# --- Module 5: Bid Evaluation ---

class BidEvaluation(Base):
    __tablename__ = "bid_evaluations"

    id = Column(String, primary_key=True, default=new_uuid)
    submission_id = Column(String, ForeignKey("tender_submissions.id"), nullable=False)
    tender_id = Column(String, ForeignKey("tenders.id"), nullable=False)
    ai_total_score = Column(Float, default=0.0)
    human_total_score = Column(Float, nullable=True)
    final_score = Column(Float, default=0.0)
    ai_summary = Column(Text, default="")
    ai_red_flags = Column(JSON, default=list)
    ai_comparative_notes = Column(Text, default="")
    dares_eligible = Column(Boolean, default=True)
    confidence_level = Column(String(20), default="medium")
    status = Column(String(20), default="pending")
    recommended_for_award = Column(Boolean, default=False)
    award_approved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    submission = relationship("TenderSubmission", back_populates="evaluation")
    scores = relationship("EvaluationScore", back_populates="evaluation", cascade="all, delete-orphan")
    clarifications = relationship("ClarificationRound", back_populates="evaluation", cascade="all, delete-orphan")


class EvaluationScore(Base):
    __tablename__ = "evaluation_scores"

    id = Column(String, primary_key=True, default=new_uuid)
    evaluation_id = Column(String, ForeignKey("bid_evaluations.id"), nullable=False)
    criterion = Column(String(100), nullable=False)
    weight = Column(Float, default=0.0)
    ai_score = Column(Float, default=0.0)
    ai_reasoning = Column(Text, default="")
    human_score = Column(Float, nullable=True)
    human_justification = Column(Text, default="")
    overridden_by = Column(String, nullable=True)
    overridden_at = Column(DateTime, nullable=True)
    final_score = Column(Float, default=0.0)

    evaluation = relationship("BidEvaluation", back_populates="scores")


class ClarificationRound(Base):
    __tablename__ = "clarification_rounds"

    id = Column(String, primary_key=True, default=new_uuid)
    evaluation_id = Column(String, ForeignKey("bid_evaluations.id"), nullable=False)
    round_number = Column(Integer, default=1)
    request_text = Column(Text, nullable=False)
    response_text = Column(Text, default="")
    requested_by = Column(String, default="")
    requested_at = Column(DateTime, default=utcnow)
    response_deadline = Column(DateTime, nullable=True)
    responded_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="pending")

    evaluation = relationship("BidEvaluation", back_populates="clarifications")


# --- Module 6: RBF Grant Disbursement ---

class Milestone(Base):
    __tablename__ = "milestones"

    id = Column(String, primary_key=True, default=new_uuid)
    portfolio_site_id = Column(String, ForeignKey("portfolio_sites.id"), nullable=True)
    site_name = Column(String(200), default="")
    tender_id = Column(String, ForeignKey("tenders.id"), nullable=True)
    developer_id = Column(String, ForeignKey("developer_registrations.id"), nullable=True)
    milestone_number = Column(Integer, nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    tranche_pct = Column(Float, default=0.0)
    grant_amount_usd = Column(Float, default=0.0)
    status = Column(String(30), default="not_started")
    target_date = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    disbursed_at = Column(DateTime, nullable=True)
    payment_reference = Column(String(200), default="")
    reviewer_notes = Column(Text, default="")
    kpi_data = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)

    evidence = relationship("MilestoneEvidence", back_populates="milestone", cascade="all, delete-orphan")


class MilestoneEvidence(Base):
    __tablename__ = "milestone_evidence"

    id = Column(String, primary_key=True, default=new_uuid)
    milestone_id = Column(String, ForeignKey("milestones.id"), nullable=False)
    file_name = Column(String(300), nullable=False)
    file_type = Column(String(50), default="")
    file_size = Column(Integer, default=0)
    storage_key = Column(String(500), default="")
    description = Column(Text, default="")
    verified = Column(Boolean, default=False)
    verified_by = Column(String, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    verification_notes = Column(Text, default="")
    uploaded_at = Column(DateTime, default=utcnow)

    milestone = relationship("Milestone", back_populates="evidence")


# --- Module 7: Performance Monitoring ---

class MeteringData(Base):
    __tablename__ = "metering_data"

    id = Column(String, primary_key=True, default=new_uuid)
    site_id = Column(String, nullable=False)
    site_name = Column(String(200), default="")
    developer_id = Column(String, nullable=True)
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    total_generation_kwh = Column(Float, default=0.0)
    total_consumption_kwh = Column(Float, default=0.0)
    pue_consumption_kwh = Column(Float, default=0.0)
    residential_consumption_kwh = Column(Float, default=0.0)
    commercial_consumption_kwh = Column(Float, default=0.0)
    active_connections = Column(Integer, default=0)
    new_connections = Column(Integer, default=0)
    pue_connections = Column(Integer, default=0)
    total_revenue_usd = Column(Float, default=0.0)
    collection_rate_pct = Column(Float, default=0.0)
    system_availability_pct = Column(Float, default=0.0)
    avg_hours_supply = Column(Float, default=0.0)
    outage_events = Column(Integer, default=0)
    outage_hours = Column(Float, default=0.0)
    battery_soh_pct = Column(Float, default=100.0)
    diesel_litres = Column(Float, default=0.0)
    renewable_fraction_pct = Column(Float, default=100.0)
    raw_data = Column(JSON, default=dict)
    uploaded_at = Column(DateTime, default=utcnow)


class PerformanceAlert(Base):
    __tablename__ = "performance_alerts"

    id = Column(String, primary_key=True, default=new_uuid)
    site_id = Column(String, nullable=False)
    site_name = Column(String(200), default="")
    alert_type = Column(String(50), nullable=False)
    severity = Column(String(20), default="warning")
    title = Column(String(300), nullable=False)
    description = Column(Text, default="")
    metric_name = Column(String(100), default="")
    metric_value = Column(Float, default=0.0)
    threshold_value = Column(Float, default=0.0)
    acknowledged = Column(Boolean, default=False)
    acknowledged_by = Column(String, nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)


# --- Banking & Investment ---

class BankOffer(Base):
    __tablename__ = "bank_offers"

    id = Column(String, primary_key=True, default=new_uuid)
    tender_id = Column(String, ForeignKey("tenders.id"), nullable=True)
    portfolio_id = Column(String, ForeignKey("portfolios.id"), nullable=True)
    bank_name = Column(String(200), nullable=False)
    contact_name = Column(String(200), default="")
    contact_email = Column(String(300), default="")
    loan_amount_usd = Column(Float, default=0.0)
    interest_rate = Column(Float, default=0.0)
    tenor_years = Column(Integer, default=0)
    grace_period_months = Column(Integer, default=0)
    collateral_requirements = Column(Text, default="")
    conditions = Column(Text, default="")
    status = Column(String(20), default="indicative")
    developer_interest = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


# --- Audit Log ---

class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(String, primary_key=True, default=new_uuid)
    user_id = Column(String, nullable=True)
    user_name = Column(String(200), default="")
    user_role = Column(String(30), default="")
    action = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String, nullable=True)
    details = Column(JSON, default=dict)
    ip_address = Column(String(50), default="")
    created_at = Column(DateTime, default=utcnow)


# --- Module 8: Community Grievance Mechanism ---

class Grievance(Base):
    __tablename__ = "grievances"

    id = Column(String, primary_key=True, default=new_uuid)
    site_id = Column(String, ForeignKey("sites.id"), nullable=True)
    site_name_text = Column(String(200), default="")
    submitter_name = Column(String(200), nullable=True)
    submitter_contact = Column(String(300), nullable=True)
    submitter_type = Column(String(30), default="community_member")  # community_member, worker, local_government, ngo, other
    category = Column(String(30), default="other")  # land_resettlement, environmental, worker_safety, service_quality, other
    description = Column(Text, nullable=False)
    location_description = Column(Text, default="")
    is_anonymous = Column(Boolean, default=False)
    status = Column(String(30), default="received")  # received, acknowledged, under_investigation, resolved, escalated, closed
    assigned_developer_id = Column(String, ForeignKey("developer_registrations.id"), nullable=True)
    developer_response = Column(Text, nullable=True)
    resolution_notes = Column(Text, nullable=True)
    escalated_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    comments = relationship("GrievanceComment", back_populates="grievance", cascade="all, delete-orphan")


class GrievanceComment(Base):
    __tablename__ = "grievance_comments"

    id = Column(String, primary_key=True, default=new_uuid)
    grievance_id = Column(String, ForeignKey("grievances.id"), nullable=False)
    author_role = Column(Text, default="")
    comment_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow)

    grievance = relationship("Grievance", back_populates="comments")


# --- Module 9: GPS Remote Verification ---

class GPSPhoto(Base):
    __tablename__ = "gps_photos"

    id = Column(String, primary_key=True, default=new_uuid)
    milestone_id = Column(String, ForeignKey("milestones.id"), nullable=False)
    photo_filename = Column(String(300), default="")
    storage_key = Column(String(500), default="")
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    altitude = Column(Float, nullable=True)
    accuracy_meters = Column(Float, default=0.0)
    device_id = Column(String(200), default="")
    captured_at = Column(DateTime, nullable=False)
    uploaded_at = Column(DateTime, default=utcnow)
    distance_from_site_km = Column(Float, default=0.0)
    coordinate_check = Column(String(10), default="pass")  # pass, amber, red
    timestamp_check = Column(String(10), default="pass")  # pass, amber, red
    duplicate_check = Column(String(10), default="pass")  # pass, amber, red
    overall_status = Column(String(10), default="pass")  # pass, amber, red
    reviewer_notes = Column(Text, nullable=True)


class IVAVisit(Base):
    __tablename__ = "iva_visits"

    id = Column(String, primary_key=True, default=new_uuid)
    site_id = Column(String, ForeignKey("sites.id"), nullable=False)
    milestone_id = Column(String, ForeignKey("milestones.id"), nullable=False)
    trigger_reason = Column(String(30), default="auto_flag")  # auto_flag, random_sample, grievance_linked
    iva_name = Column(String(200), default="")
    scheduled_date = Column(DateTime, nullable=True)
    completed_date = Column(DateTime, nullable=True)
    status = Column(String(20), default="pending")  # pending, scheduled, completed, waived
    field_report_key = Column(String(500), nullable=True)
    verification_result = Column(String(20), nullable=True)  # confirmed, issues_found, failed
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)


# --- Module 10: ESG & Impact Reporting ---

class ESGReport(Base):
    __tablename__ = "esg_reports"

    id = Column(String, primary_key=True, default=new_uuid)
    report_type = Column(String(30), nullable=False)  # dares_quarterly, investor_esg, carbon_data
    title = Column(String(300), default="")
    scope_type = Column(String(20), default="all")  # all, disco, developer, lot, site
    scope_id = Column(String, nullable=True)
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    generated_at = Column(DateTime, default=utcnow)
    generated_by = Column(String(200), default="")
    data_snapshot = Column(JSON, default=dict)
    status = Column(String(20), default="draft")  # draft, final, locked
    created_at = Column(DateTime, default=utcnow)


class GESIMetric(Base):
    __tablename__ = "gesi_metrics"

    id = Column(String, primary_key=True, default=new_uuid)
    site_id = Column(String, ForeignKey("sites.id"), nullable=False)
    period = Column(DateTime, nullable=False)
    female_connections_pct = Column(Float, default=0.0)
    female_headed_hh_pct = Column(Float, default=0.0)
    women_employed_construction = Column(Integer, default=0)
    women_employed_operations = Column(Integer, default=0)
    youth_employed = Column(Integer, default=0)
    disability_accessible_facilities = Column(Integer, default=0)
    community_meetings_held = Column(Integer, default=0)
    grievances_from_women = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)


class CarbonCreditTracking(Base):
    __tablename__ = "carbon_credit_tracking"

    id = Column(String, primary_key=True, default=new_uuid)
    site_id = Column(String, ForeignKey("sites.id"), nullable=False)
    methodology = Column(String(30), default="gold_standard")  # gold_standard, verra, other
    annual_tco2e_avoided = Column(Float, default=0.0)
    credit_status = Column(String(30), default="not_applied")  # not_applied, application_submitted, validation_complete, credits_issued, credits_sold
    credits_issued_count = Column(Integer, nullable=True)
    revenue_usd = Column(Float, nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    created_at = Column(DateTime, default=utcnow)
