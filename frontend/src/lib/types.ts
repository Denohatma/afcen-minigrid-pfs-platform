export interface SiteResponse {
  id: string;
  org_id: string;
  site_name: string;
  district: string;
  country: string;
  status: string;
  site_data: SiteData;
  created_at: string;
  updated_at: string;
}

export interface SiteListResponse {
  sites: SiteResponse[];
  total: number;
}

export interface RunResponse {
  id: string;
  site_id: string;
  status: string;
  adapter_timings: Record<string, number> | null;
  adapter_errors: Record<string, string> | null;
  summary_metrics: SummaryMetrics | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface RunListResponse {
  runs: RunResponse[];
  total: number;
}

export interface AdapterResultResponse {
  adapter_name: string;
  status: string;
  duration_seconds: number | null;
}

export interface RunDetailResponse extends RunResponse {
  adapter_results: AdapterResultResponse[];
}

export interface DocumentResponse {
  id: string;
  run_id: string;
  format: string;
  filename: string;
  size_bytes: number;
  created_at: string;
}

export interface DocumentDownloadResponse {
  download_url: string;
  filename: string;
  expires_in_seconds: number;
}

export interface SummaryMetrics {
  pv_capacity_kwp?: number | null;
  battery_capacity_kwh?: number | null;
  total_capex_usd?: number | null;
  lcoe_usd_kwh?: number | null;
  base_irr?: number | null;
}

export interface CustomerSegment {
  category: string;
  sub_type: string;
  count: number;
  tier: string;
  estimated_load_kw: number | null;
  operating_hours: string;
}

export interface AnchorLoad {
  load_type: string;
  name: string;
  count: number;
  estimated_load_kw: number | null;
  operating_hours: string;
  load_shape: string;
}

export interface TariffScenarios {
  low: number;
  base: number;
  high: number;
}

export interface FinancingStructure {
  grant_pct: number;
  debt_pct: number;
  equity_pct: number;
}

export interface SiteData {
  site_name: string;
  district: string;
  province: string;
  country: string;
  coordinates: [number, number];
  developer: string;
  disco_name: string;
  minigrid_type: string;
  disco_supply_hours: number;
  population: number;
  mapped_structures: number;
  settlement_radius_m: number;
  customers: CustomerSegment[];
  anchors: AnchorLoad[];
  grid_status: string;
  grid_arrival_evidence: Record<string, unknown>;
  tariff_scenarios: TariffScenarios;
  discount_rate: number;
  inflation_rate: number;
  fx_rate_ngn_usd: number;
  financing_structure: FinancingStructure;
  debt_interest_rate: number;
  debt_tenor_years: number;
  protected_area_overlap: boolean;
  flood_risk: string;
  biodiversity_risk: string;
  ifc_category: string;
  terrain: string;
  economic_activities: string[];
  social_services: string[];
  access_description: string;
  existing_pfs: Record<string, unknown>;
}

export interface SSEEvent {
  event: string;
  run_id?: string;
  adapter?: string;
  status?: string;
  duration?: number;
  error?: string | null;
  message?: string;
}

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

export interface PortfolioSite {
  id: string;
  settlement_rank: number;
  settlement_data: SettlementData;
  pipeline_status: string;
  results: Record<string, Record<string, unknown>>;
  arpu: number;
}

export interface Portfolio {
  id: string;
  name: string;
  disco_name: string;
  status: string;
  filters: Record<string, unknown>;
  sites: PortfolioSite[];
  tender: { id: string; status: string; launched_at: string | null; deadline: string | null } | null;
  created_at: string;
}

export interface PortfolioResults {
  portfolio_id: string;
  portfolio_name: string;
  disco_name: string;
  sites_completed: number;
  total_capex_usd: number;
  total_connections: number;
  total_pv_kwp: number;
  total_pv_mwp: number;
  total_battery_kwh: number;
  total_battery_mwh: number;
  total_grant_usd: number;
  avg_grant_per_connection: number;
  avg_lcoe: number;
  avg_irr: number;
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

// Developer Registration
export interface DeveloperRegistration {
  id: string;
  company_name: string;
  registration_number: string;
  country_of_incorporation: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  years_experience: number;
  completed_sites: number;
  total_capacity_kwp: number;
  qualification_docs: Record<string, unknown>;
  approval_status: string; // pending, approved, rejected
  approval_notes: string;
  approved_at: string | null;
  valid_until: string | null;
  created_at: string;
}

// Bid Evaluation
export interface BidEvaluation {
  id: string;
  submission_id: string;
  tender_id: string;
  company_name: string;
  ai_total_score: number;
  human_total_score: number | null;
  final_score: number;
  ai_summary: string;
  ai_red_flags: string[];
  ai_comparative_notes: string;
  dares_eligible: boolean;
  confidence_level: string;
  status: string;
  recommended_for_award: boolean;
  award_approved: boolean;
  scores: EvaluationScoreItem[];
  clarifications: ClarificationItem[];
  created_at: string;
}

export interface EvaluationScoreItem {
  id: string;
  criterion: string;
  weight: number;
  ai_score: number;
  ai_reasoning: string;
  human_score: number | null;
  human_justification: string;
  final_score: number;
}

export interface ClarificationItem {
  id: string;
  round_number: number;
  request_text: string;
  response_text: string;
  status: string;
  requested_at: string;
  responded_at: string | null;
}

// Disbursement / Milestones
export interface MilestoneData {
  id: string;
  site_name: string;
  milestone_number: number;
  title: string;
  description: string;
  tranche_pct: number;
  grant_amount_usd: number;
  status: string; // not_started, submitted, under_review, approved, disbursed, overdue
  target_date: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  disbursed_at: string | null;
  payment_reference: string;
  evidence: MilestoneEvidenceItem[];
  kpi_data: Record<string, unknown>;
  created_at: string;
}

export interface MilestoneEvidenceItem {
  id: string;
  file_name: string;
  file_type: string;
  description: string;
  verified: boolean;
  verified_by: string | null;
  uploaded_at: string;
}

export interface DisbursementDashboard {
  total_committed: number;
  total_disbursed: number;
  total_remaining: number;
  by_status: Record<string, number>;
  by_developer: Array<{ developer: string; committed: number; disbursed: number; sites: number }>;
  sites_on_track: number;
  sites_delayed: number;
}

// Performance Monitoring
export interface MonitoringSite {
  site_id: string;
  site_name: string;
  developer: string;
  capacity_kwp: number;
  active_connections: number;
  latest_availability: number;
  latest_arpu: number;
  latest_generation: number;
  alert_count: number;
}

export interface SitePerformance {
  site_id: string;
  site_name: string;
  records: MeteringRecord[];
  kpis: SiteKPIs;
}

export interface MeteringRecord {
  id: string;
  period_start: string;
  period_end: string;
  total_generation_kwh: number;
  total_consumption_kwh: number;
  active_connections: number;
  new_connections: number;
  total_revenue_usd: number;
  collection_rate_pct: number;
  system_availability_pct: number;
  renewable_fraction_pct: number;
}

export interface SiteKPIs {
  avg_availability: number;
  total_generation_kwh: number;
  total_revenue_usd: number;
  avg_arpu: number;
  connection_growth_rate: number;
  avg_collection_rate: number;
  avg_renewable_fraction: number;
}

export interface PerformanceAlertData {
  id: string;
  site_id: string;
  site_name: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  metric_value: number;
  threshold_value: number;
  acknowledged: boolean;
  created_at: string;
}

export interface MonitoringDashboard {
  total_sites: number;
  total_connections: number;
  total_capacity_mwp: number;
  total_generation_kwh: number;
  total_grant_disbursed: number;
  total_grant_committed: number;
  avg_lcoe: number;
  avg_arpu: number;
  avg_availability: number;
  by_disco: Record<string, { sites: number; connections: number; capacity_mwp: number }>;
}

// Banking
export interface BankOfferData {
  id: string;
  bank_name: string;
  contact_name: string;
  contact_email: string;
  loan_amount_usd: number;
  interest_rate: number;
  tenor_years: number;
  grace_period_months: number;
  collateral_requirements: string;
  conditions: string;
  status: string;
  developer_interest: boolean;
  created_at: string;
}

export interface InvestmentSummary {
  portfolio_id: string;
  portfolio_name: string;
  disco_name: string;
  total_sites: number;
  total_capacity_kwp: number;
  total_connections: number;
  total_capex_usd: number;
  capital_stack: { grant_pct: number; debt_pct: number; equity_pct: number };
  avg_irr: number;
  avg_lcoe: number;
  avg_tariff: number;
  grant_per_connection: number;
  total_jobs_created: number;
  total_co2_displaced: number;
  sites: Array<{ name: string; capacity_kwp: number; connections: number; irr: number; lcoe: number }>;
}

// Grievances (Module 8)
export interface Grievance {
  id: string;
  site_id: string | null;
  site_name_text: string | null;
  submitter_name: string | null;
  submitter_contact: string | null;
  submitter_type: string;
  category: string;
  description: string;
  location_description: string | null;
  is_anonymous: boolean;
  status: string;
  assigned_developer_id: string | null;
  developer_response: string | null;
  resolution_notes: string | null;
  escalated_at: string | null;
  resolved_at: string | null;
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

export interface GrievanceReport {
  total: number;
  by_category: Record<string, number>;
  by_status: Record<string, number>;
  avg_resolution_days: number | null;
  anonymous_count: number;
  escalated_count: number;
}

// GPS Verification (Module 9)
export interface GPSPhoto {
  id: string;
  milestone_id: string;
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

export interface GPSVerificationSummary {
  milestone_id: string;
  photos: GPSPhoto[];
  total_photos: number;
  passing: number;
  amber: number;
  red: number;
  can_approve: boolean;
}

export interface IVAVisit {
  id: string;
  site_id: string;
  milestone_id: string;
  trigger_reason: string;
  iva_name: string;
  status: string;
  verification_result: string | null;
  notes: string | null;
  created_at: string;
}

// ESG & Impact Reporting (Module 10)
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

export interface BenchmarkData {
  total_sites: number;
  avg_system_availability_pct: number;
  avg_collection_rate_pct: number;
  avg_renewable_fraction_pct: number;
  avg_connections_per_site: number;
  total_connections: number;
  total_pue_connections: number;
  total_generation_kwh: number;
  avg_supply_hours: number;
}
