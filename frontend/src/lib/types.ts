// ── Settlement Data (from JSON) ─────────────────────────────────────

export interface SettlementData {
  rank: number;
  village: string;
  state: string;
  lga: string;
  disco: string;
  lat: number;
  lon: number;
  population: number;
  buildings: number;
  connections: number;
  demand_kwh: number;
  pv_kwh_m2_yr: number;
  grid_dist_km: number;
  hv_dist_km: number;
  has_health: boolean;
  has_education: boolean;
  security_risk: string;
  electrification_status: string;
  recommended_mg_type: string;
  score: number;
}

export interface SettlementStats {
  total_settlements: number;
  by_disco: Record<string, {
    total: number;
    img_candidates: number;
    undergrid_candidates: number;
    isolated_candidates: number;
    total_population: number;
    total_connections: number;
    avg_score: number;
  }>;
}

// ── Module 1: Site Registry ─────────────────────────────────────────

export interface SiteRegistry {
  id: string;
  program_id: string | null;
  disco: string;
  feeder_name: string;
  band: string;
  community: string;
  state: string;
  lga: string;
  latitude: number | null;
  longitude: number | null;
  population: number;
  customers: number;
  supply_hours: number;
  demand_kwh: number;
  genset_proxy: boolean;
  grid_dist_km: number;
  security_risk: string;
  data_quality_score: number;
  status: string;
  source_data: Record<string, unknown>;
  settlement_rank: number | null;
  created_at: string;
  updated_at: string;
}

export interface Program {
  id: string;
  name: string;
  scheme_type: string;
  funding_source: string;
  grant_envelope_usd: number;
  implementing_agency: string;
  status: string;
  config: Record<string, unknown>;
  created_at: string;
}

// ── Module 3: DisCo Readiness ───────────────────────────────────────

export interface DiscoReadiness {
  id: string;
  site_id: string;
  feeder_data_status: string;
  poi_status: string;
  bulk_meter_status: string;
  customer_data_status: string;
  settlement_terms_status: string;
  tripartite_status: string;
  feeder_data: Record<string, unknown>;
  poi_data: Record<string, unknown>;
  bulk_meter_data: Record<string, unknown>;
  customer_data: Record<string, unknown>;
  settlement_terms: Record<string, unknown>;
  validated_by: string | null;
  validated_at: string | null;
  overall_status: string;
  notes: string;
  updated_at: string;
}

export interface InterconnectionRequirement {
  id: string;
  site_id: string;
  voltage_level: string;
  protection_scheme: string;
  islanding_mode: string;
  sync_requirements: string;
  nemsa_status: string;
  responsibilities: Record<string, unknown>;
  created_at: string;
}

// ── Module 5: Lots, Data Rooms, Tenders ─────────────────────────────

export interface Lot {
  id: string;
  program_id: string | null;
  lot_name: string;
  disco: string;
  state: string;
  grant_ceiling_pct: number;
  grant_ceiling_usd: number;
  evaluation_method: string;
  data_room_status: string;
  tender_status: string;
  approval_to_tender: boolean;
  disco_status: string;
  disco_notes: string;
  data_pack_availed: boolean;
  approved_by: string | null;
  approved_at: string | null;
  site_count: number;
  total_connections: number;
  created_at: string;
  updated_at: string;
  sites?: LotSite[];
  data_room?: DataRoom | null;
  tender?: Tender | null;
}

export interface LotSite {
  id: string;
  lot_id: string;
  site_id: string;
  settlement_rank: number | null;
}

export interface DataRoom {
  id: string;
  lot_id: string;
  folder_index: Record<string, unknown>;
  completeness_status: Record<string, unknown>;
  nda_required: boolean;
  documents?: DataRoomDocument[];
  created_at: string;
}

export interface DataRoomDocument {
  id: string;
  data_room_id: string;
  folder_number: number;
  folder_name: string;
  filename: string;
  file_size: number;
  version: number;
  status: string;
  uploaded_at: string;
}

export interface Tender {
  id: string;
  lot_id: string;
  tender_reference: string;
  procurement_method: string;
  status: string;
  title: string;
  description: string;
  currency: string;
  grant_ceiling_pct: number;
  bid_validity_days: number;
  submission_deadline: string | null;
  created_at: string;
}

export interface TenderQuestion {
  id: string;
  tender_id: string;
  company_name: string;
  question: string;
  answer: string | null;
  asked_at: string;
  answered_at: string | null;
  published: boolean;
}

// ── Bidders & Bids ──────────────────────────────────────────────────

export interface Bidder {
  id: string;
  company_name: string;
  registration_number: string;
  country: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  qualification_status: string;
  kyc_status: string;
  sanctions_check: string;
  years_experience: number;
  completed_sites: number;
  total_capacity_kwp: number;
  created_at: string;
}

export interface Bid {
  id: string;
  lot_id: string;
  tender_id: string;
  bidder_id: string;
  grant_ask_pct: number;
  eligible_capex_usd: number;
  total_capex_usd: number;
  grant_amount_usd: number;
  tariff_residential: number;
  tariff_commercial: number;
  tariff_pue: number;
  pv_kwp: number;
  bess_kwh: number;
  connections: number;
  timeline_months: number;
  status: string;
  submitted_at: string;
}

// ── Module 6: Evaluation ────────────────────────────────────────────

export interface Evaluation {
  id: string;
  bid_id: string;
  tender_id: string;
  evaluator_id: string | null;
  admin_responsive: boolean | null;
  technical_score: number | null;
  technical_threshold_met: boolean | null;
  financial_score: number | null;
  experience_score: number | null;
  es_score: number | null;
  total_score: number | null;
  criteria_scores: Record<string, unknown>;
  ai_flags_reviewed: boolean;
  status: string;
  recommended_for_award: boolean;
  ai_flags?: AIFlag[];
  created_at: string;
}

export interface AIFlag {
  id: string;
  evaluation_id: string;
  flag_type: string;
  severity: string;
  recommendation_text: string;
  human_action: string | null;
  override_reason: string | null;
  timestamp: string;
}

export interface NoObjectionPack {
  id: string;
  lot_id: string;
  tender_id: string;
  wb_status: string;
  comments: string;
  approval_date: string | null;
  created_at: string;
}

// ── Module 7: Grant Agreements ──────────────────────────────────────

export interface GrantAgreement {
  id: string;
  lot_id: string;
  bidder_id: string;
  grant_amount_usd: number;
  eligible_capex_ceiling_usd: number;
  grant_pct: number;
  tranche_rules: Record<string, unknown>;
  currency: string;
  ringfenced_amount: number;
  pbg_assignment_status: string;
  pbg_lender: string;
  agreement_date: string | null;
  effective_date: string | null;
  status: string;
  created_at: string;
  cps?: ConditionPrecedent[];
}

// ── Module 8: Conditions Precedent ──────────────────────────────────

export interface ConditionPrecedent {
  id: string;
  grant_agreement_id: string;
  cp_category: string;
  title: string;
  description: string;
  evidence_type: string;
  owner_role: string;
  verifier_role: string;
  due_date: string | null;
  status: string;
  evidence_files: unknown[];
  submitted_at: string | null;
  verified_at: string | null;
  waiver_status: string | null;
  retry_count: number;
  return_reason: string | null;
  created_at: string;
}

// ── Module 9: CAPEX, Milestones, Disbursement ───────────────────────

export interface EligibleCapex {
  id: string;
  grant_agreement_id: string;
  category: string;
  description: string;
  invoice_ref: string;
  claimed_amount: number;
  eligible_amount: number;
  iva_verified_amount: number;
  disallowed_amount: number;
  disallow_reason: string;
  status: string;
  created_at: string;
}

export interface Milestone {
  id: string;
  grant_agreement_id: string;
  site_id: string | null;
  milestone_type: string;
  title: string;
  description: string;
  tranche_pct: number;
  grant_amount_usd: number;
  evidence: Record<string, unknown>;
  iva_status: string;
  nemsa_status: string;
  rea_approval_status: string;
  target_date: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  approved_at: string | null;
  status: string;
  created_at: string;
  disbursement?: Disbursement | null;
  gps_photos?: GPSPhoto[];
  iva_visits?: IVAVisit[];
}

export interface Disbursement {
  id: string;
  milestone_id: string;
  amount_usd: number;
  currency: string;
  beneficiary_account: string;
  evidence_submitted_by: string | null;
  evidence_submitted_at: string | null;
  iva_verified_by: string | null;
  iva_verified_at: string | null;
  rea_approved_by: string | null;
  rea_approved_at: string | null;
  grant_admin_approved_by: string | null;
  grant_admin_approved_at: string | null;
  payment_status: string;
  payment_reference: string;
  created_at: string;
}

export interface GPSPhoto {
  id: string;
  milestone_id: string;
  site_id: string | null;
  photo_filename: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  device_id: string;
  captured_at: string;
  distance_from_site_km: number;
  coordinate_check: string;
  timestamp_check: string;
  duplicate_check: string;
  overall_status: string;
  reviewer_notes: string | null;
}

export interface IVAVisit {
  id: string;
  site_id: string;
  milestone_id: string;
  trigger_reason: string;
  iva_name: string;
  scheduled_date: string | null;
  completed_date: string | null;
  status: string;
  verification_result: string | null;
  notes: string | null;
  created_at: string;
}

// ── Module 10: Grievances ───────────────────────────────────────────

export interface Grievance {
  id: string;
  site_id: string | null;
  lot_id: string | null;
  complainant_type: string;
  submitter_name: string | null;
  submitter_contact: string | null;
  category: string;
  severity: string;
  description: string;
  location_description: string;
  is_anonymous: boolean;
  is_sea_sh: boolean;
  status: string;
  assigned_to: string | null;
  resolution_date: string | null;
  corrective_action: string;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
  comments?: GrievanceComment[];
}

export interface GrievanceComment {
  id: string;
  grievance_id: string;
  author_role: string;
  comment_text: string;
  created_at: string;
}

// ── Module 11: Settlement Ledger ────────────────────────────────────

export interface SettlementLedgerEntry {
  id: string;
  site_id: string;
  grant_agreement_id: string | null;
  month: string;
  bulk_meter_kwh: number;
  grid_import_kwh: number;
  der_generation_kwh: number;
  duos_charge_usd: number;
  grid_energy_charge_usd: number;
  total_settlement_usd: number;
  invoice_ref: string;
  developer_accepted: boolean | null;
  dispute_status: string | null;
  dispute_reason: string | null;
  payment_status: string;
  created_at: string;
}

// ── Module 12: Performance & M&E ────────────────────────────────────

export interface PerformanceRecord {
  id: string;
  site_id: string;
  month: string;
  connections: number;
  new_connections: number;
  pue_connections: number;
  kwh_generated: number;
  kwh_sold: number;
  grid_import_kwh: number;
  der_kwh: number;
  revenue_usd: number;
  collection_rate_pct: number;
  availability_pct: number;
  supply_hours: number;
  saidi_minutes: number;
  saifi_events: number;
  capacity_utilisation_pct: number;
  renewable_fraction_pct: number;
  diesel_litres: number;
  battery_soh_pct: number;
  uploaded_at: string;
}

export interface GESIMetric {
  id: string;
  site_id: string;
  period: string;
  female_connections_pct: number;
  female_headed_hh_pct: number;
  women_employed_construction: number;
  women_employed_operations: number;
  youth_employed: number;
  disability_accessible_facilities: number;
  community_meetings_held: number;
  grievances_from_women: number;
}

export interface CarbonCredit {
  id: string;
  site_id: string;
  methodology: string;
  annual_tco2e_avoided: number;
  credit_status: string;
  credits_issued_count: number | null;
  revenue_usd: number | null;
}

export interface ESGReport {
  id: string;
  report_type: string;
  title: string;
  scope_type: string;
  scope_id: string | null;
  period_start: string;
  period_end: string;
  generated_at: string;
  generated_by: string;
  data_snapshot: Record<string, unknown>;
  status: string;
}
