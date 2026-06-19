import type {
  SettlementData,
  SettlementStats,
  SiteRegistry,
  Program,
  DiscoReadiness,
  InterconnectionRequirement,
  Lot,
  DataRoom,
  DataRoomDocument,
  Tender,
  TenderQuestion,
  Bidder,
  Bid,
  Evaluation,
  AIFlag,
  NoObjectionPack,
  GrantAgreement,
  ConditionPrecedent,
  EligibleCapex,
  Milestone,
  Disbursement,
  GPSPhoto,
  IVAVisit,
  Grievance,
  GrievanceComment,
  SettlementLedgerEntry,
  PerformanceRecord,
  GESIMetric,
  CarbonCredit,
  ESGReport,
} from "./types";

const API_BASE = "/api/proxy";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function qs(params?: Record<string, string | number | undefined>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (!entries.length) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export const api = {
  // ── Settlements (JSON data) ─────────────────────────────────────
  settlements: {
    list: (params?: Record<string, string | number>) =>
      request<{ settlements: SettlementData[]; total: number }>(`/settlements${qs(params)}`),
    stats: () => request<SettlementStats>("/settlements/stats"),
    get: (rank: number) => request<SettlementData>(`/settlements/${rank}`),
  },

  // ── Module 1: Site Registry ─────────────────────────────────────
  siteRegistry: {
    list: (params?: Record<string, string | number>) =>
      request<{ items: SiteRegistry[]; total: number }>(`/site-registry/sites${qs(params)}`),
    get: (id: string) => request<SiteRegistry>(`/site-registry/sites/${id}`),
    create: (data: Partial<SiteRegistry>) =>
      request<SiteRegistry>("/site-registry/sites", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<SiteRegistry>) =>
      request<SiteRegistry>(`/site-registry/sites/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    stats: () => request<Record<string, unknown>>("/site-registry/sites/stats"),
    programs: () => request<{ programs: Program[] }>("/site-registry/programs"),
    createProgram: (data: Partial<Program>) =>
      request<Program>("/site-registry/programs", { method: "POST", body: JSON.stringify(data) }),
  },

  // ── Module 3: DisCo Readiness ───────────────────────────────────
  discoReadiness: {
    list: (params?: Record<string, string>) =>
      request<{ items: DiscoReadiness[]; total: number }>(`/disco-readiness${qs(params)}`),
    get: (siteId: string) => request<DiscoReadiness>(`/disco-readiness/${siteId}`),
    upsert: (data: Partial<DiscoReadiness>) =>
      request<DiscoReadiness>("/disco-readiness", { method: "POST", body: JSON.stringify(data) }),
    validate: (id: string) =>
      request<{ ok: boolean }>(`/disco-readiness/${id}/validate`, { method: "PUT" }),
    interconnection: (siteId: string) =>
      request<InterconnectionRequirement>(`/interconnection/${siteId}`),
    createInterconnection: (data: Partial<InterconnectionRequirement>) =>
      request<InterconnectionRequirement>("/interconnection", { method: "POST", body: JSON.stringify(data) }),
    dashboard: () => request<Record<string, unknown>>("/disco-readiness/dashboard"),
  },

  // ── Module 5: Lots, Data Rooms, Tenders ─────────────────────────
  lots: {
    list: (params?: Record<string, string>) =>
      request<{ lots: Lot[] }>(`/lots${qs(params)}`),
    get: (id: string) => request<Lot>(`/lots/${id}`),
    create: (data: Partial<Lot>) =>
      request<Lot>("/lots", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Lot>) =>
      request<Lot>(`/lots/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    addSites: (id: string, siteIds: string[]) =>
      request<{ added: number }>(`/lots/${id}/sites`, { method: "POST", body: JSON.stringify({ site_ids: siteIds }) }),
    removeSite: (lotId: string, siteId: string) =>
      request<void>(`/lots/${lotId}/sites/${siteId}`, { method: "DELETE" }),
    approve: (id: string) =>
      request<{ ok: boolean }>(`/lots/${id}/approve`, { method: "PUT" }),
    dataRoom: (lotId: string) =>
      request<DataRoom>(`/lots/${lotId}/data-room`),
    addDocument: (lotId: string, data: Partial<DataRoomDocument>) =>
      request<DataRoomDocument>(`/lots/${lotId}/data-room/documents`, { method: "POST", body: JSON.stringify(data) }),
    completeness: (lotId: string) =>
      request<Record<string, unknown>>(`/lots/${lotId}/data-room/completeness`),
  },

  tenders: {
    create: (lotId: string, data: Partial<Tender>) =>
      request<Tender>(`/lots/${lotId}/tender`, { method: "POST", body: JSON.stringify(data) }),
    get: (id: string) => request<Tender & { questions: TenderQuestion[] }>(`/tenders/${id}`),
    update: (id: string, data: Partial<Tender>) =>
      request<Tender>(`/tenders/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    issue: (id: string) =>
      request<{ ok: boolean }>(`/tenders/${id}/issue`, { method: "PUT" }),
    close: (id: string) =>
      request<{ ok: boolean }>(`/tenders/${id}/close`, { method: "PUT" }),
    questions: (id: string) =>
      request<{ questions: TenderQuestion[] }>(`/tenders/${id}/questions`),
    askQuestion: (id: string, data: { company_name: string; question: string }) =>
      request<TenderQuestion>(`/tenders/${id}/questions`, { method: "POST", body: JSON.stringify(data) }),
    answerQuestion: (qId: string, data: { answer: string; published: boolean }) =>
      request<{ ok: boolean }>(`/tender-questions/${qId}/answer`, { method: "PUT", body: JSON.stringify(data) }),
  },

  bidders: {
    list: () => request<{ bidders: Bidder[] }>("/bidders"),
    get: (id: string) => request<Bidder>(`/bidders/${id}`),
    register: (data: Partial<Bidder>) =>
      request<Bidder>("/bidders", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Bidder>) =>
      request<Bidder>(`/bidders/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    acceptNDA: (bidderId: string, lotId: string) =>
      request<{ ok: boolean }>(`/bidders/${bidderId}/nda/${lotId}`, { method: "POST" }),
  },

  bids: {
    submit: (tenderId: string, data: Partial<Bid>) =>
      request<Bid>(`/tenders/${tenderId}/bids`, { method: "POST", body: JSON.stringify(data) }),
    listForTender: (tenderId: string) =>
      request<{ bids: Bid[] }>(`/tenders/${tenderId}/bids`),
    get: (id: string) => request<Bid>(`/bids/${id}`),
  },

  // ── Module 6: Evaluation ────────────────────────────────────────
  evaluations: {
    createForTender: (tenderId: string) =>
      request<{ evaluations: Evaluation[] }>(`/evaluations/tender/${tenderId}/create`, { method: "POST" }),
    listForTender: (tenderId: string) =>
      request<{ evaluations: Evaluation[] }>(`/evaluations/tender/${tenderId}`),
    get: (id: string) => request<Evaluation>(`/evaluations/${id}`),
    adminCheck: (id: string, data: { admin_responsive: boolean; admin_notes: string }) =>
      request<{ ok: boolean }>(`/evaluations/${id}/admin-check`, { method: "PUT", body: JSON.stringify(data) }),
    technicalScore: (id: string, data: Record<string, unknown>) =>
      request<{ ok: boolean }>(`/evaluations/${id}/technical-score`, { method: "PUT", body: JSON.stringify(data) }),
    financialScore: (id: string, data: Record<string, unknown>) =>
      request<{ ok: boolean }>(`/evaluations/${id}/financial-score`, { method: "PUT", body: JSON.stringify(data) }),
    recommend: (id: string) =>
      request<{ ok: boolean }>(`/evaluations/${id}/recommend`, { method: "POST" }),
    createAIFlag: (evalId: string, data: Partial<AIFlag>) =>
      request<AIFlag>(`/evaluations/${evalId}/ai-flags`, { method: "POST", body: JSON.stringify(data) }),
    actionAIFlag: (flagId: string, data: { action: string; override_reason?: string }) =>
      request<{ ok: boolean }>(`/ai-flags/${flagId}/action`, { method: "PUT", body: JSON.stringify(data) }),
    aiFlags: (evalId: string) =>
      request<{ flags: AIFlag[] }>(`/evaluations/${evalId}/ai-flags`),
  },

  noObjection: {
    create: (data: Partial<NoObjectionPack>) =>
      request<NoObjectionPack>("/no-objection", { method: "POST", body: JSON.stringify(data) }),
    get: (lotId: string) => request<NoObjectionPack>(`/no-objection/lot/${lotId}`),
    submit: (id: string) =>
      request<{ ok: boolean }>(`/no-objection/${id}/submit`, { method: "PUT" }),
    approve: (id: string) =>
      request<{ ok: boolean }>(`/no-objection/${id}/approve`, { method: "PUT" }),
  },

  // ── Module 7-8: Agreements & CPs ───────────────────────────────
  agreements: {
    list: (params?: Record<string, string>) =>
      request<{ agreements: GrantAgreement[] }>(`/agreements${qs(params)}`),
    get: (id: string) => request<GrantAgreement>(`/agreements/${id}`),
    create: (data: Partial<GrantAgreement>) =>
      request<GrantAgreement>("/agreements", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<GrantAgreement>) =>
      request<GrantAgreement>(`/agreements/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    activate: (id: string) =>
      request<{ ok: boolean }>(`/agreements/${id}/activate`, { method: "PUT" }),
    dashboard: () => request<Record<string, unknown>>("/agreements/dashboard"),
  },

  cps: {
    list: (agreementId: string) =>
      request<{ cps: ConditionPrecedent[] }>(`/agreements/${agreementId}/cps`),
    create: (agreementId: string, data: Partial<ConditionPrecedent>) =>
      request<ConditionPrecedent>(`/agreements/${agreementId}/cps`, { method: "POST", body: JSON.stringify(data) }),
    get: (id: string) => request<ConditionPrecedent>(`/cps/${id}`),
    update: (id: string, data: Partial<ConditionPrecedent>) =>
      request<ConditionPrecedent>(`/cps/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    submit: (id: string, data: { evidence_files: unknown[] }) =>
      request<{ ok: boolean }>(`/cps/${id}/submit`, { method: "PUT", body: JSON.stringify(data) }),
    verify: (id: string) =>
      request<{ ok: boolean }>(`/cps/${id}/verify`, { method: "PUT" }),
    returnCP: (id: string, data: { return_reason: string }) =>
      request<{ ok: boolean }>(`/cps/${id}/return`, { method: "PUT", body: JSON.stringify(data) }),
    waive: (id: string, data: { waiver_authority: string; waiver_justification: string; waiver_expiry?: string }) =>
      request<{ ok: boolean }>(`/cps/${id}/waive`, { method: "PUT", body: JSON.stringify(data) }),
    dashboard: () => request<Record<string, unknown>>("/cps/dashboard"),
  },

  // ── Module 9: CAPEX, Milestones, Disbursement ──────────────────
  capex: {
    list: (agreementId: string) =>
      request<{ items: EligibleCapex[] }>(`/agreements/${agreementId}/capex`),
    create: (agreementId: string, data: Partial<EligibleCapex>) =>
      request<EligibleCapex>(`/agreements/${agreementId}/capex`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<EligibleCapex>) =>
      request<EligibleCapex>(`/capex/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    verify: (id: string, data: { iva_verified_amount: number }) =>
      request<{ ok: boolean }>(`/capex/${id}/verify`, { method: "PUT", body: JSON.stringify(data) }),
  },

  milestones: {
    list: (params?: Record<string, string>) =>
      request<{ milestones: Milestone[] }>(`/milestones${qs(params)}`),
    get: (id: string) => request<Milestone>(`/milestones/${id}`),
    create: (data: Partial<Milestone>) =>
      request<Milestone>("/milestones", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Milestone>) =>
      request<Milestone>(`/milestones/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    submit: (id: string, data: { evidence: Record<string, unknown> }) =>
      request<{ ok: boolean }>(`/milestones/${id}/submit`, { method: "PUT", body: JSON.stringify(data) }),
    ivaVerify: (id: string) =>
      request<{ ok: boolean }>(`/milestones/${id}/iva-verify`, { method: "PUT" }),
    reaApprove: (id: string) =>
      request<{ ok: boolean }>(`/milestones/${id}/rea-approve`, { method: "PUT" }),
    dashboard: () => request<Record<string, unknown>>("/milestones/dashboard"),
  },

  disbursements: {
    list: (params?: Record<string, string>) =>
      request<{ disbursements: Disbursement[] }>(`/disbursements${qs(params)}`),
    get: (id: string) => request<Disbursement>(`/disbursements/${id}`),
    create: (milestoneId: string, data: Partial<Disbursement>) =>
      request<Disbursement>(`/milestones/${milestoneId}/disburse`, { method: "POST", body: JSON.stringify(data) }),
    ivaVerify: (id: string) =>
      request<{ ok: boolean }>(`/disbursements/${id}/iva-verify`, { method: "PUT" }),
    reaApprove: (id: string) =>
      request<{ ok: boolean }>(`/disbursements/${id}/rea-approve`, { method: "PUT" }),
    grantAdminApprove: (id: string) =>
      request<{ ok: boolean }>(`/disbursements/${id}/grant-admin-approve`, { method: "PUT" }),
    confirmPayment: (id: string, data: { payment_reference: string }) =>
      request<{ ok: boolean }>(`/disbursements/${id}/confirm-payment`, { method: "PUT", body: JSON.stringify(data) }),
    dashboard: () => request<Record<string, unknown>>("/disbursements/dashboard"),
  },

  gpsPhotos: {
    upload: (data: Partial<GPSPhoto>) =>
      request<GPSPhoto>("/gps-photos", { method: "POST", body: JSON.stringify(data) }),
    listForMilestone: (milestoneId: string) =>
      request<{ photos: GPSPhoto[] }>(`/milestones/${milestoneId}/gps-photos`),
    review: (id: string, data: { overall_status: string; reviewer_notes: string }) =>
      request<{ ok: boolean }>(`/gps-photos/${id}/review`, { method: "PUT", body: JSON.stringify(data) }),
  },

  ivaVisits: {
    list: () => request<{ visits: IVAVisit[] }>("/iva-visits"),
    create: (data: Partial<IVAVisit>) =>
      request<IVAVisit>("/iva-visits", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<IVAVisit>) =>
      request<IVAVisit>(`/iva-visits/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  },

  // ── Module 10: Grievances ───────────────────────────────────────
  grievances: {
    list: (params?: Record<string, string>) =>
      request<{ grievances: Grievance[] }>(`/grievances${qs(params)}`),
    get: (id: string) => request<Grievance>(`/grievances/${id}`),
    submit: (data: Partial<Grievance>) =>
      request<Grievance>("/grievances", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Grievance>) =>
      request<Grievance>(`/grievances/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    acknowledge: (id: string) =>
      request<{ ok: boolean }>(`/grievances/${id}/acknowledge`, { method: "PUT" }),
    assign: (id: string, data: { assigned_to: string }) =>
      request<{ ok: boolean }>(`/grievances/${id}/assign`, { method: "PUT", body: JSON.stringify(data) }),
    resolve: (id: string, data: { corrective_action: string }) =>
      request<{ ok: boolean }>(`/grievances/${id}/resolve`, { method: "PUT", body: JSON.stringify(data) }),
    escalate: (id: string) =>
      request<{ ok: boolean }>(`/grievances/${id}/escalate`, { method: "PUT" }),
    addComment: (id: string, data: { author_role: string; comment_text: string }) =>
      request<GrievanceComment>(`/grievances/${id}/comments`, { method: "POST", body: JSON.stringify(data) }),
    report: (params?: Record<string, string>) =>
      request<Record<string, unknown>>(`/grievances/report${qs(params)}`),
    dashboard: () => request<Record<string, unknown>>("/grievances/dashboard"),
  },

  // ── Module 11: Settlement Ledger ────────────────────────────────
  settlementLedger: {
    list: (params?: Record<string, string>) =>
      request<{ items: SettlementLedgerEntry[] }>(`/settlements-ledger${qs(params)}`),
    get: (id: string) => request<SettlementLedgerEntry>(`/settlements-ledger/${id}`),
    create: (data: Partial<SettlementLedgerEntry>) =>
      request<SettlementLedgerEntry>("/settlements-ledger", { method: "POST", body: JSON.stringify(data) }),
    accept: (id: string) =>
      request<{ ok: boolean }>(`/settlements-ledger/${id}/accept`, { method: "PUT" }),
    dispute: (id: string, data: { dispute_reason: string; dispute_category: string }) =>
      request<{ ok: boolean }>(`/settlements-ledger/${id}/dispute`, { method: "PUT", body: JSON.stringify(data) }),
    resolve: (id: string, data: { resolution_notes: string; resolved_amount_usd: number }) =>
      request<{ ok: boolean }>(`/settlements-ledger/${id}/resolve`, { method: "PUT", body: JSON.stringify(data) }),
    confirmPayment: (id: string) =>
      request<{ ok: boolean }>(`/settlements-ledger/${id}/confirm-payment`, { method: "PUT" }),
    dashboard: () => request<Record<string, unknown>>("/settlements-ledger/dashboard"),
  },

  // ── Module 12: Performance & M&E ───────────────────────────────
  performance: {
    list: (params?: Record<string, string>) =>
      request<{ records: PerformanceRecord[] }>(`/performance${qs(params)}`),
    submit: (data: Partial<PerformanceRecord>) =>
      request<PerformanceRecord>("/performance", { method: "POST", body: JSON.stringify(data) }),
    siteHistory: (siteId: string) =>
      request<{ records: PerformanceRecord[] }>(`/performance/site/${siteId}`),
    dashboard: () => request<Record<string, unknown>>("/performance/dashboard"),
    submitGESI: (data: Partial<GESIMetric>) =>
      request<GESIMetric>("/gesi", { method: "POST", body: JSON.stringify(data) }),
    getGESI: (siteId: string) =>
      request<{ metrics: GESIMetric[] }>(`/gesi/${siteId}`),
    submitCarbon: (data: Partial<CarbonCredit>) =>
      request<CarbonCredit>("/carbon", { method: "POST", body: JSON.stringify(data) }),
    getCarbon: (siteId: string) =>
      request<{ credits: CarbonCredit[] }>(`/carbon/${siteId}`),
    generateReport: (data: Partial<ESGReport>) =>
      request<ESGReport>("/esg-reports", { method: "POST", body: JSON.stringify(data) }),
    listReports: () => request<{ reports: ESGReport[] }>("/esg-reports"),
    getReport: (id: string) => request<ESGReport>(`/esg-reports/${id}`),
    lockReport: (id: string) =>
      request<{ ok: boolean }>(`/esg-reports/${id}/lock`, { method: "PUT" }),
  },
};
