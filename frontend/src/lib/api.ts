import type {
  SiteListResponse,
  SiteResponse,
  RunListResponse,
  RunDetailResponse,
  RunResponse,
  DocumentResponse,
  SiteData,
  SettlementData,
  SettlementStats,
  Portfolio,
  PortfolioResults,
  DeveloperRegistration,
  BidEvaluation,
  MilestoneData,
  DisbursementDashboard,
  MonitoringSite,
  SitePerformance,
  SiteKPIs,
  PerformanceAlertData,
  MonitoringDashboard,
  BankOfferData,
  InvestmentSummary,
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

export const api = {
  sites: {
    list: () => request<SiteListResponse>("/sites"),
    get: (id: string) => request<SiteResponse>(`/sites/${id}`),
    create: (site_data: SiteData) =>
      request<SiteResponse>("/sites", {
        method: "POST",
        body: JSON.stringify({ site_data }),
      }),
    update: (id: string, site_data: SiteData) =>
      request<SiteResponse>(`/sites/${id}`, {
        method: "PUT",
        body: JSON.stringify({ site_data }),
      }),
    delete: (id: string) =>
      request<void>(`/sites/${id}`, { method: "DELETE" }),
    clone: (id: string) =>
      request<SiteResponse>(`/sites/${id}/clone`, { method: "POST" }),
  },

  runs: {
    list: (siteId: string) =>
      request<RunListResponse>(`/sites/${siteId}/runs`),
    get: (siteId: string, runId: string) =>
      request<RunDetailResponse>(`/sites/${siteId}/runs/${runId}`),
    trigger: (siteId: string) =>
      request<RunResponse>(`/sites/${siteId}/runs`, { method: "POST" }),
  },

  documents: {
    generate: (siteId: string, runId: string) =>
      request<DocumentResponse[]>(
        `/sites/${siteId}/runs/${runId}/documents`,
        { method: "POST" }
      ),
    list: (siteId: string, runId: string) =>
      request<DocumentResponse[]>(
        `/sites/${siteId}/runs/${runId}/documents`
      ),
    downloadUrl: (siteId: string, runId: string, docId: string) =>
      `/api/proxy/sites/${siteId}/runs/${runId}/documents/${docId}/download`,
  },

  settlements: {
    list: (params?: Record<string, string | number>) => {
      const qs = params ? "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : "";
      return request<{ settlements: SettlementData[]; total: number }>(`/settlements${qs}`);
    },
    stats: () => request<SettlementStats>("/settlements/stats"),
  },

  portfolios: {
    list: () => request<{ portfolios: Array<{ id: string; name: string; disco_name: string; status: string; created_at: string }> }>("/portfolios"),
    get: (id: string) => request<Portfolio>(`/portfolios/${id}`),
    create: (data: { name: string; disco_name: string; filters: Record<string, unknown>; settlement_ranks: number[] }) =>
      request<{ id: string }>("/portfolios", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/portfolios/${id}`, { method: "DELETE" }),
    run: (id: string) => request<{ status: string; sites_processed: number }>(`/portfolios/${id}/run`, { method: "POST" }),
    results: (id: string) => request<PortfolioResults>(`/portfolios/${id}/results`),
    launchTender: (id: string) => request<{ tender_id: string }>(`/portfolios/${id}/tender`, { method: "POST", body: JSON.stringify({}) }),
  },

  tenders: {
    get: (id: string) => request<Record<string, unknown>>(`/tenders/${id}`),
    addInvitee: (tenderId: string, data: { company_name: string; contact_name: string; email: string }) =>
      request<{ id: string }>(`/tenders/${tenderId}/invitees`, { method: "POST", body: JSON.stringify(data) }),
    askQuestion: (tenderId: string, data: { asked_by: string; company_name: string; question: string }) =>
      request<{ id: string }>(`/tenders/${tenderId}/questions`, { method: "POST", body: JSON.stringify(data) }),
    submitBid: (tenderId: string, data: { company_name: string; contact_name: string; email: string; proposal_data: Record<string, unknown> }) =>
      request<{ id: string }>(`/tenders/${tenderId}/submissions`, { method: "POST", body: JSON.stringify(data) }),
  },

  developers: {
    list: () => request<{ developers: DeveloperRegistration[] }>("/developers"),
    get: (id: string) => request<DeveloperRegistration>(`/developers/${id}`),
    register: (data: { company_name: string; registration_number: string; contact_name: string; contact_email: string; contact_phone: string; years_experience: number; completed_sites: number; total_capacity_kwp: number }) =>
      request<{ id: string }>("/developers", { method: "POST", body: JSON.stringify(data) }),
    approve: (id: string) => request<{ ok: boolean }>(`/developers/${id}/approve`, { method: "PUT" }),
    reject: (id: string, reason: string) => request<{ ok: boolean }>(`/developers/${id}/reject`, { method: "PUT", body: JSON.stringify({ reason }) }),
  },

  evaluations: {
    scoreTender: (tenderId: string) => request<{ evaluations: BidEvaluation[] }>(`/evaluations/tender/${tenderId}/score`, { method: "POST" }),
    getTenderEvaluations: (tenderId: string) => request<{ evaluations: BidEvaluation[] }>(`/evaluations/tender/${tenderId}`),
    overrideScore: (evalId: string, scoreId: string, data: { score: number; justification: string }) =>
      request<{ ok: boolean }>(`/evaluations/${evalId}/scores/${scoreId}/override`, { method: "PUT", body: JSON.stringify(data) }),
    recommend: (evalId: string) => request<{ ok: boolean }>(`/evaluations/${evalId}/recommend`, { method: "POST" }),
    sendClarification: (evalId: string, data: { request_text: string }) =>
      request<{ id: string }>(`/evaluations/${evalId}/clarification`, { method: "POST", body: JSON.stringify(data) }),
    respondClarification: (evalId: string, clarId: string, data: { response_text: string }) =>
      request<{ ok: boolean }>(`/evaluations/${evalId}/clarification/${clarId}/respond`, { method: "PUT", body: JSON.stringify(data) }),
    awardTender: (tenderId: string, evalId: string) =>
      request<{ ok: boolean }>(`/evaluations/tender/${tenderId}/award/${evalId}`, { method: "POST" }),
  },

  disbursements: {
    setup: (tenderId: string) => request<{ milestones_created: number }>(`/disbursements/setup/${tenderId}`, { method: "POST" }),
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ milestones: MilestoneData[] }>(`/disbursements${qs}`);
    },
    get: (id: string) => request<MilestoneData>(`/disbursements/${id}`),
    submit: (id: string, data: { notes: string }) => request<{ ok: boolean }>(`/disbursements/${id}/submit`, { method: "POST", body: JSON.stringify(data) }),
    review: (id: string, data: { status: string; notes: string }) => request<{ ok: boolean }>(`/disbursements/${id}/review`, { method: "PUT", body: JSON.stringify(data) }),
    approve: (id: string) => request<{ ok: boolean }>(`/disbursements/${id}/approve`, { method: "PUT" }),
    disburse: (id: string, data: { payment_reference: string }) => request<{ ok: boolean }>(`/disbursements/${id}/disburse`, { method: "PUT", body: JSON.stringify(data) }),
    dashboard: () => request<DisbursementDashboard>("/disbursements/dashboard"),
  },

  monitoring: {
    uploadCSV: (formData: FormData) =>
      fetch(`/api/proxy/monitoring/upload`, { method: "POST", body: formData }).then(r => r.json()),
    listSites: () => request<{ sites: MonitoringSite[] }>("/monitoring/sites"),
    getSite: (siteId: string) => request<SitePerformance>(`/monitoring/sites/${siteId}`),
    getKPIs: (siteId: string) => request<SiteKPIs>(`/monitoring/sites/${siteId}/kpis`),
    alerts: () => request<{ alerts: PerformanceAlertData[] }>("/monitoring/alerts"),
    acknowledgeAlert: (id: string) => request<{ ok: boolean }>(`/monitoring/alerts/${id}/acknowledge`, { method: "PUT" }),
    dashboard: () => request<MonitoringDashboard>("/monitoring/dashboard"),
  },

  banking: {
    createOffer: (data: { bank_name: string; loan_amount_usd: number; interest_rate: number; tenor_years: number; portfolio_id?: string }) =>
      request<{ id: string }>("/banking/offers", { method: "POST", body: JSON.stringify(data) }),
    listOffers: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ offers: BankOfferData[] }>(`/banking/offers${qs}`);
    },
    expressInterest: (id: string) => request<{ ok: boolean }>(`/banking/offers/${id}/interest`, { method: "PUT" }),
    investmentSummary: (portfolioId: string) => request<InvestmentSummary>(`/banking/investment-summary/${portfolioId}`),
  },
};
