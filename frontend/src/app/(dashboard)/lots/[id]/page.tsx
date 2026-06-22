"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { useRole } from "@/lib/role-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const TENDER_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  issued: "bg-green-100 text-green-800",
  closed: "bg-amber-100 text-amber-800",
  awarded: "bg-primary text-white",
};

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function LotDetailPage() {
  const { role } = useRole();
  const isBidder = role.backendRole === "developer";

  if (isBidder) return <BidderLotView />;
  return <PMULotView />;
}

/* ===================================================================
   Bidder Lot Detail — Download docs, Q&A chat, Submit bid
   =================================================================== */

const DATA_ROOM_FOLDERS = [
  { id: "01", name: "Procurement Documents", desc: "IFB/RFP, Instructions to Bidders, Bid Data Sheet, addenda, Q&A log" },
  { id: "02", name: "Lot Summary", desc: "Lot overview, site list, GPS coordinates, connection targets, system capacities" },
  { id: "03", name: "GIS and Site Maps", desc: "GIS files (KMZ/Shapefiles), site maps, feeder routes, POI locations" },
  { id: "04", name: "Technical Baseline", desc: "Feeder condition data, transformer capacity, network SLD, PV/BESS parameters" },
  { id: "05", name: "Commercial Baseline", desc: "Customer count by category, consumption estimates, tariff analysis" },
  { id: "06", name: "E&S Baseline", desc: "Screening report, stakeholder mapping, consultation records, GRM framework" },
  { id: "07", name: "Permitting & CPs", desc: "NERC/NEMSA pathway, DisCo POI confirmation, community consent" },
  { id: "08", name: "Contract & Grant Annexes", desc: "Draft project agreement, grant agreement, tripartite agreement" },
];

function BidderLotView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"docs" | "qa" | "bid">("docs");
  const [docsDownloaded, setDocsDownloaded] = useState<Set<string>>(new Set());
  const [questionText, setQuestionText] = useState("");
  const [askingQuestion, setAskingQuestion] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Bid form state
  const [bidForm, setBidForm] = useState({
    grant_ask_pct: "", eligible_capex_usd: "", total_capex_usd: "",
    tariff_residential: "", tariff_commercial: "", tariff_pue: "",
    pv_kwp: "", bess_kwh: "", connections: "", timeline_months: "",
  });
  const [submittingBid, setSubmittingBid] = useState(false);
  const [bidSubmitted, setBidSubmitted] = useState(false);

  const { data: lot, isLoading } = useQuery({
    queryKey: ["lot", id],
    queryFn: () => api.lots.get(id),
  });

  const { data: biddersData } = useQuery({
    queryKey: ["bidders"],
    queryFn: () => api.bidders.list(),
  });

  const lotData = lot as Record<string, any> | null;
  const tender = lotData?.tender as Record<string, any> | null;
  const tenderId = tender?.id;
  const myBidder = biddersData?.bidders?.[0] ?? null;

  const { data: questionsData, refetch: refetchQ } = useQuery({
    queryKey: ["tender-questions", tenderId],
    queryFn: () => api.tenders.questions(tenderId!),
    enabled: !!tenderId,
    refetchInterval: 10000,
  });

  const { data: bidsData } = useQuery({
    queryKey: ["tender-bids", tenderId],
    queryFn: () => api.bids.listForTender(tenderId!),
    enabled: !!tenderId,
  });

  const questions = questionsData?.questions ?? [];
  const myBids = bidsData?.bids ?? [];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [questions.length]);

  const handleDownloadFolder = (folderId: string) => {
    setDocsDownloaded((prev) => new Set(prev).add(folderId));
  };

  const handleAskQuestion = async () => {
    if (!questionText.trim() || !tenderId || !myBidder) return;
    setAskingQuestion(true);
    try {
      await api.tenders.askQuestion(tenderId, {
        company_name: myBidder.company_name,
        question: questionText,
      });
      setQuestionText("");
      await refetchQ();
    } catch {
      alert("Failed to send question.");
    } finally {
      setAskingQuestion(false);
    }
  };

  const handleSubmitBid = async () => {
    if (!tenderId || !myBidder) return;
    setSubmittingBid(true);
    try {
      await api.bids.submit(tenderId, {
        lot_id: id,
        bidder_id: myBidder.id,
        grant_ask_pct: parseFloat(bidForm.grant_ask_pct) || 0,
        eligible_capex_usd: parseFloat(bidForm.eligible_capex_usd) || 0,
        total_capex_usd: parseFloat(bidForm.total_capex_usd) || 0,
        tariff_residential: parseFloat(bidForm.tariff_residential) || 0,
        tariff_commercial: parseFloat(bidForm.tariff_commercial) || 0,
        tariff_pue: parseFloat(bidForm.tariff_pue) || 0,
        pv_kwp: parseFloat(bidForm.pv_kwp) || 0,
        bess_kwh: parseFloat(bidForm.bess_kwh) || 0,
        connections: parseInt(bidForm.connections) || 0,
        timeline_months: parseInt(bidForm.timeline_months) || 0,
      });
      setBidSubmitted(true);
      await qc.invalidateQueries({ queryKey: ["tender-bids", tenderId] });
    } catch {
      alert("Failed to submit bid.");
    } finally {
      setSubmittingBid(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground text-xs">Loading...</div>;
  }

  if (!lot || !lotData) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-base font-bold">Lot not found</h2>
        <Button className="mt-4 h-7 text-xs" onClick={() => router.push("/lots")}>Back to Tenders</Button>
      </div>
    );
  }

  const grantCeiling = lotData.grant_ceiling_pct ?? 0.4;
  const sites = (lotData.sites ?? []) as Array<Record<string, any>>;

  return (
    <div className="text-[13px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-base font-bold">{lotData.lot_name}</h1>
          <p className="text-[11px] text-muted-foreground">
            {lotData.disco} &middot; {sites.length} sites &middot; {fmt(lotData.total_connections || 0)} connections &middot; Grant ceiling: {(grantCeiling * 100).toFixed(0)}%
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-6 px-3 text-[11px]" onClick={() => router.push("/lots")}>
          ← Back to Tenders
        </Button>
      </div>

      {/* Tender info bar */}
      {tender && (
        <div className="mt-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 flex items-center justify-between">
          <div className="text-[11px]">
            <span className="font-semibold text-blue-800">Tender: </span>
            <span className="text-blue-700">{tender.title}</span>
            <span className="text-blue-600 ml-2">Ref: {tender.tender_reference}</span>
          </div>
          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
            tender.status === "issued" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
          }`}>{tender.status === "issued" ? "Open for Bids" : tender.status}</span>
        </div>
      )}

      {!tender && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Tender documents are not yet available for this lot. Check back after the PMU publishes the tender.
        </div>
      )}

      {/* Tab navigation */}
      {tender && (
        <>
          <div className="mt-3 flex items-center gap-0.5 border-b border-border">
            {([
              { key: "docs" as const, label: "Bid Documents", count: `${docsDownloaded.size}/${DATA_ROOM_FOLDERS.length}` },
              { key: "qa" as const, label: "Questions & Answers", count: `${questions.length}` },
              { key: "bid" as const, label: "Submit Bid", count: myBids.length > 0 ? "Submitted" : "" },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {tab.count && <span className="ml-1 text-[9px] opacity-70">({tab.count})</span>}
              </button>
            ))}
          </div>

          {/* Tab: Bid Documents (Data Room) */}
          {activeTab === "docs" && (
            <div className="mt-3 space-y-1.5">
              <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
                Download all 8 data room folders to prepare your bid. Downloads are recorded and tracked by the Programme Management Unit.
              </div>
              {DATA_ROOM_FOLDERS.map((folder) => {
                const downloaded = docsDownloaded.has(folder.id);
                return (
                  <div key={folder.id} className={`rounded border px-3 py-2.5 flex items-center justify-between ${
                    downloaded ? "border-green-200 bg-green-50/50" : "border-border bg-white"
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">{folder.id}</span>
                      <div>
                        <div className="text-[12px] font-semibold">{folder.name}</div>
                        <div className="text-[10px] text-muted-foreground">{folder.desc}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {downloaded && (
                        <span className="text-[10px] text-green-700 font-medium">Downloaded</span>
                      )}
                      <Button
                        size="sm"
                        variant={downloaded ? "outline" : "default"}
                        className="h-6 px-2.5 text-[10px]"
                        onClick={() => handleDownloadFolder(folder.id)}
                      >
                        {downloaded ? "Re-download" : "Download"}
                      </Button>
                    </div>
                  </div>
                );
              })}

              {docsDownloaded.size === DATA_ROOM_FOLDERS.length && (
                <div className="mt-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-center text-[11px] text-green-800 font-medium">
                  All documents downloaded. You can now prepare and submit your bid.
                </div>
              )}
            </div>
          )}

          {/* Tab: Q&A Chat */}
          {activeTab === "qa" && (
            <div className="mt-3">
              <div className="rounded border border-border bg-white overflow-hidden">
                <div className="border-b border-border px-3 py-2 bg-muted/30">
                  <span className="text-[11px] font-semibold">Tender Clarification Q&A</span>
                  <span className="text-[10px] text-muted-foreground ml-2">
                    Ask questions about the tender. Responses from the PMU will be shared with all bidders when published.
                  </span>
                </div>

                {/* Chat messages */}
                <div className="h-80 overflow-y-auto px-3 py-2 space-y-2.5">
                  {questions.length === 0 && (
                    <div className="flex items-center justify-center h-full text-[11px] text-muted-foreground">
                      No questions yet. Be the first to ask a clarification question.
                    </div>
                  )}
                  {questions.map((q) => (
                    <div key={q.id} className="space-y-1.5">
                      {/* Question bubble */}
                      <div className="flex justify-end">
                        <div className="max-w-[80%]">
                          <div className="flex items-center justify-end gap-1.5 mb-0.5">
                            <span className="text-[9px] text-muted-foreground">{timeAgo(q.asked_at)}</span>
                            <span className="text-[9px] font-medium text-blue-700">{q.company_name || "Bidder"}</span>
                          </div>
                          <div className="rounded-lg rounded-br-sm bg-blue-500 text-white px-3 py-1.5 text-[11px]">
                            {q.question}
                          </div>
                        </div>
                      </div>

                      {/* Answer bubble */}
                      {q.answer && (
                        <div className="flex justify-start">
                          <div className="max-w-[80%]">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[9px] font-medium text-emerald-700">PMU Response</span>
                              {q.answered_at && <span className="text-[9px] text-muted-foreground">{timeAgo(q.answered_at)}</span>}
                              {q.published && <span className="rounded bg-green-100 px-1 py-px text-[8px] text-green-700">Published</span>}
                            </div>
                            <div className="rounded-lg rounded-bl-sm bg-gray-100 text-foreground px-3 py-1.5 text-[11px]">
                              {q.answer}
                            </div>
                          </div>
                        </div>
                      )}

                      {!q.answer && (
                        <div className="flex justify-start">
                          <div className="rounded-lg rounded-bl-sm bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1 text-[10px] italic">
                            Awaiting PMU response...
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Input */}
                {myBidder ? (
                  <div className="border-t border-border px-3 py-2 flex items-center gap-2">
                    <Input
                      value={questionText}
                      onChange={(e) => setQuestionText(e.target.value)}
                      placeholder="Type your question..."
                      className="flex-1 h-8 text-[11px] px-2.5"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && questionText.trim()) {
                          e.preventDefault();
                          handleAskQuestion();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-8 px-3 text-[11px]"
                      disabled={askingQuestion || !questionText.trim()}
                      onClick={handleAskQuestion}
                    >
                      {askingQuestion ? "..." : "Send"}
                    </Button>
                  </div>
                ) : (
                  <div className="border-t border-border px-3 py-2 text-center text-[11px] text-muted-foreground">
                    Submit your EOI first to ask questions about this tender.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab: Submit Bid */}
          {activeTab === "bid" && (
            <div className="mt-3">
              {myBids.length > 0 || bidSubmitted ? (
                <div className="rounded border border-green-200 bg-green-50 p-4">
                  <h3 className="text-[13px] font-bold text-green-800">Bid Submitted Successfully</h3>
                  <p className="text-[11px] text-green-700 mt-1">
                    Your bid has been received and is under review. You will be notified of the evaluation outcome.
                  </p>
                  {myBids.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                      {[
                        { label: "Grant Ask", value: `${(myBids[0].grant_ask_pct * 100).toFixed(1)}%` },
                        { label: "Total CAPEX", value: formatUSD(myBids[0].total_capex_usd) },
                        { label: "Grant Amount", value: formatUSD(myBids[0].grant_amount_usd) },
                        { label: "PV Capacity", value: `${myBids[0].pv_kwp} kWp` },
                        { label: "BESS", value: `${myBids[0].bess_kwh} kWh` },
                        { label: "Connections", value: fmt(myBids[0].connections) },
                      ].map((s) => (
                        <div key={s.label} className="rounded bg-white border border-green-200 px-2 py-1">
                          <div className="text-[10px] text-green-600">{s.label}</div>
                          <div className="font-semibold text-green-800">{s.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : !myBidder ? (
                <div className="rounded border border-amber-200 bg-amber-50 p-4 text-center">
                  <p className="text-[12px] font-medium text-amber-800">EOI Required</p>
                  <p className="text-[11px] text-amber-700 mt-1">
                    You must submit an Expression of Interest before you can submit a bid.
                    <button className="underline ml-1 font-semibold" onClick={() => router.push("/lots")}>Go back to register</button>
                  </p>
                </div>
              ) : tender.status !== "issued" ? (
                <div className="rounded border border-amber-200 bg-amber-50 p-4 text-center">
                  <p className="text-[12px] font-medium text-amber-800">Tender Not Open</p>
                  <p className="text-[11px] text-amber-700 mt-1">
                    This tender is not currently accepting bids.
                  </p>
                </div>
              ) : (
                <div className="rounded border border-border bg-white">
                  <div className="border-b border-border px-4 py-2.5">
                    <h3 className="text-[12px] font-bold">Bid Submission — {lotData.lot_name}</h3>
                    <p className="text-[10px] text-muted-foreground">
                      Submit your financial and technical proposal. All fields marked with * are required.
                    </p>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Financial Proposal */}
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Financial Proposal</h4>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[10px]">Grant Ask (% of eligible CAPEX) *</Label>
                          <Input value={bidForm.grant_ask_pct} onChange={(e) => setBidForm((f) => ({ ...f, grant_ask_pct: e.target.value }))} className="h-7 text-[11px] mt-0.5" type="number" step="0.01" placeholder={`Max ${(grantCeiling * 100).toFixed(0)}%`} />
                        </div>
                        <div>
                          <Label className="text-[10px]">Eligible CAPEX (USD) *</Label>
                          <Input value={bidForm.eligible_capex_usd} onChange={(e) => setBidForm((f) => ({ ...f, eligible_capex_usd: e.target.value }))} className="h-7 text-[11px] mt-0.5" type="number" placeholder="e.g. 2500000" />
                        </div>
                        <div>
                          <Label className="text-[10px]">Total CAPEX (USD) *</Label>
                          <Input value={bidForm.total_capex_usd} onChange={(e) => setBidForm((f) => ({ ...f, total_capex_usd: e.target.value }))} className="h-7 text-[11px] mt-0.5" type="number" placeholder="e.g. 3200000" />
                        </div>
                      </div>
                    </div>

                    {/* Tariff Proposal */}
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Proposed Tariffs (USD/kWh)</h4>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[10px]">Residential *</Label>
                          <Input value={bidForm.tariff_residential} onChange={(e) => setBidForm((f) => ({ ...f, tariff_residential: e.target.value }))} className="h-7 text-[11px] mt-0.5" type="number" step="0.01" placeholder="e.g. 0.15" />
                        </div>
                        <div>
                          <Label className="text-[10px]">Commercial</Label>
                          <Input value={bidForm.tariff_commercial} onChange={(e) => setBidForm((f) => ({ ...f, tariff_commercial: e.target.value }))} className="h-7 text-[11px] mt-0.5" type="number" step="0.01" placeholder="e.g. 0.20" />
                        </div>
                        <div>
                          <Label className="text-[10px]">PUE/MSME</Label>
                          <Input value={bidForm.tariff_pue} onChange={(e) => setBidForm((f) => ({ ...f, tariff_pue: e.target.value }))} className="h-7 text-[11px] mt-0.5" type="number" step="0.01" placeholder="e.g. 0.18" />
                        </div>
                      </div>
                    </div>

                    {/* Technical Proposal */}
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Technical Proposal</h4>
                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <Label className="text-[10px]">PV Capacity (kWp) *</Label>
                          <Input value={bidForm.pv_kwp} onChange={(e) => setBidForm((f) => ({ ...f, pv_kwp: e.target.value }))} className="h-7 text-[11px] mt-0.5" type="number" placeholder="e.g. 250" />
                        </div>
                        <div>
                          <Label className="text-[10px]">BESS Capacity (kWh) *</Label>
                          <Input value={bidForm.bess_kwh} onChange={(e) => setBidForm((f) => ({ ...f, bess_kwh: e.target.value }))} className="h-7 text-[11px] mt-0.5" type="number" placeholder="e.g. 500" />
                        </div>
                        <div>
                          <Label className="text-[10px]">Connections *</Label>
                          <Input value={bidForm.connections} onChange={(e) => setBidForm((f) => ({ ...f, connections: e.target.value }))} className="h-7 text-[11px] mt-0.5" type="number" placeholder="e.g. 500" />
                        </div>
                        <div>
                          <Label className="text-[10px]">Timeline (months) *</Label>
                          <Input value={bidForm.timeline_months} onChange={(e) => setBidForm((f) => ({ ...f, timeline_months: e.target.value }))} className="h-7 text-[11px] mt-0.5" type="number" placeholder="e.g. 18" />
                        </div>
                      </div>
                    </div>

                    {/* Grant auto-calc */}
                    {bidForm.grant_ask_pct && bidForm.eligible_capex_usd && (
                      <div className="rounded border border-primary/20 bg-primary/5 px-3 py-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium">Calculated Grant Amount</span>
                          <span className="font-bold text-primary text-[13px]">
                            {formatUSD((parseFloat(bidForm.grant_ask_pct) / 100) * parseFloat(bidForm.eligible_capex_usd))}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {bidForm.grant_ask_pct}% of {formatUSD(parseFloat(bidForm.eligible_capex_usd))} eligible CAPEX
                          {parseFloat(bidForm.grant_ask_pct) > grantCeiling * 100 && (
                            <span className="ml-2 font-semibold text-red-600">
                              Exceeds {(grantCeiling * 100).toFixed(0)}% ceiling!
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-border px-4 py-3">
                    <span className="text-[10px] text-muted-foreground">
                      By submitting, you confirm that all information provided is accurate and binding for {tender.bid_validity_days || 120} days.
                    </span>
                    <Button
                      size="sm"
                      className="h-8 px-4 text-[11px]"
                      disabled={submittingBid || !bidForm.grant_ask_pct || !bidForm.eligible_capex_usd || !bidForm.pv_kwp}
                      onClick={handleSubmitBid}
                    >
                      {submittingBid ? "Submitting..." : "Submit Bid"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Sites list */}
      {sites.length > 0 && (
        <div className="mt-3 rounded border border-border bg-white">
          <div className="border-b border-border px-3 py-1.5">
            <span className="text-[11px] font-semibold">Sites in Lot ({sites.length})</span>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {sites.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-1 border-b border-border last:border-b-0 text-[11px]">
                <span className="font-medium">{s.community || `Site ${s.site_id?.slice(0, 8)}...`}</span>
                <span className="text-[10px] text-muted-foreground">Rank: {s.settlement_rank ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


/* ===================================================================
   PMU Lot Detail — Tender Creation Wizard (unchanged from before)
   =================================================================== */

const STEP_LABELS = [
  "Tender Details",
  "Data Room",
  "Technical Requirements",
  "DisCo Interface",
  "Commercial Framework",
  "Grant & Eligible CAPEX",
  "Payment Milestones",
];

const PMU_DATA_ROOM_FOLDERS = [
  { id: "01", name: "Procurement Documents", contents: "IFB/RFP, Instructions to Bidders, Bid Data Sheet, addenda, Q&A log, all submission forms", purpose: "Defines procurement rules and required bid structure" },
  { id: "02", name: "Lot Summary", contents: "Lot overview, site list, GPS coordinates, connection targets, baseline supply hours, proposed system capacities", purpose: "Defines scope and lot boundaries; key inputs for bid pricing" },
  { id: "03", name: "GIS and Site Maps", contents: "GIS files (KMZ/Shapefiles), site maps, feeder route maps, POI locations, transformer locations, satellite imagery", purpose: "Supports engineering design, access routes, network routing" },
  { id: "04", name: "Technical Baseline", contents: "Feeder condition data, transformer capacity, existing meter status, network single-line diagram, grid availability log, proposed PV/BESS parameters", purpose: "Supports detailed engineering design and CAPEX pricing" },
  { id: "05", name: "Commercial Baseline", contents: "Customer count by category, estimated consumption, tariff bill analysis, supply hours log, MSME/PUE segmentation", purpose: "Supports revenue, tariff, demand, and collection assumptions" },
  { id: "06", name: "E&S Baseline", contents: "Screening report, stakeholder mapping, consultation records, land/resettlement risk flags, GRM framework", purpose: "Starting point for bidder E&S workplan" },
  { id: "07", name: "Permitting & Conditions Precedent", contents: "NERC/NEMSA pathway, DisCo POI confirmation, community consent, land status, CP checklist", purpose: "Clarifies post-award permitting and disbursement readiness" },
  { id: "08", name: "Contract & Grant Annexes", contents: "Draft project agreement, grant agreement, tripartite agreement, DisCo cooperation protocol, IVA ToR", purpose: "Defines risk allocation, contractual commitments, grant conditions" },
];

const ELIGIBLE_CAPEX_CATEGORIES = [
  { category: "Solar PV modules, mounting structures, DC cabling and BOS", eligible: true, evidence: "Supplier invoice, delivery note, serial number list, installation certificate" },
  { category: "BESS — cells, modules, and BMS", eligible: true, evidence: "Supplier invoice, OEM certificate, commissioning test report" },
  { category: "PCS / Inverters and energy management system", eligible: true, evidence: "Supplier invoice, OEM certificate, commissioning test" },
  { category: "Backup generator (if permitted)", eligible: "conditional", evidence: "Invoice, emissions specification, commissioning test" },
  { category: "Distribution network rehabilitation", eligible: true, evidence: "BoQ, work completion certificate, as-built drawings, inspection report" },
  { category: "Distribution network extension — new connections", eligible: true, evidence: "BoQ, completion certificate, as-built drawings" },
  { category: "Interconnection equipment and protection at POI", eligible: true, evidence: "POI inspection record, protection relay settings, NEMSA confirmation" },
  { category: "Customer prepaid/smart meters", eligible: true, evidence: "Meter serial list, calibration certificate, customer register" },
  { category: "Bulk meter(s) for grid energy measurement", eligible: true, evidence: "DisCo/NEMSA confirmation, calibration certificate" },
  { category: "SCADA and remote monitoring system", eligible: true, evidence: "System acceptance test, data connectivity confirmation" },
  { category: "Civil works (foundations, enclosures)", eligible: true, evidence: "Engineer completion certificate, inspection report" },
  { category: "Spare parts (first-year critical only)", eligible: "conditional", evidence: "Approved spare parts list, invoices, delivery confirmation" },
];

const PAYMENT_MILESTONES = [
  { id: "M1", name: "Commissioning", description: "DER system energised and NEMSA certified", tranche_pct: 40, evidence: ["NEMSA commissioning certificate", "As-built drawings signed by engineer", "Equipment serial numbers and installation certificates", "Geotagged commissioning photos (PV array, BESS, POI, meters)", "Grid synchronisation test report", "Protection relay commissioning certificates", "Bulk meter calibration certificate"] },
  { id: "M2", name: "Verified Connections", description: "Agreed customer count metered, onboarded, and receiving supply", tranche_pct: 40, evidence: ["Customer register with meter IDs and GPS coordinates", "Customer database with name, address, category, meter number", "First 3 months billing and collection records", "Community engagement completion report", "Tripartite agreement acknowledgement from community", "IVA site visit verification report", "Sample meter activation screenshots"] },
  { id: "M3", name: "One-Year Utilisation / Performance", description: "12 months continuous operation with verified performance", tranche_pct: 20, evidence: ["12-month metering report (grid import, DER generation, energy sold)", "Capacity utilisation calculation showing system performance", "Customer satisfaction survey or GRM summary", "O&M log showing maintenance activities completed", "Monthly DisCo settlement records for 12 months", "System availability report (target: ≥95%)", "Revenue collection rate evidence (target: ≥85%)"] },
];

const TECHNICAL_REQUIREMENTS = [
  { item: "PV Capacity (kWp)", detail: "Proposed capacity, module technology, tilt/azimuth, shading assumptions, degradation rate, annual yield calculation" },
  { item: "BESS Capacity (kWh/kW)", detail: "Battery chemistry, usable DoD, degradation curve, cycle life, warranty, safety standard, thermal management" },
  { item: "PCS / Inverter", detail: "Rated kVA, grid-forming or grid-following mode, protection relays, synchronisation, transfer switch specification" },
  { item: "Backup Generator", detail: "Fuel type, rated kVA, annual operating hours, fuel supply plan, emissions specification" },
  { item: "Distribution Works", detail: "Line routes, conductor sizing, pole spec, transformer requirements, service drops, meter connection schedule, voltage-drop analysis" },
  { item: "Monitoring & Data", detail: "Data logger spec, bulk meter protocol, customer meter data access, SCADA/API integration, monthly reporting format" },
  { item: "O&M Plan", detail: "Staffing, routine maintenance schedule, spares strategy, outage response time, KPIs, SLA commitments" },
  { item: "Standards Compliance", detail: "NERC grid code, NEMSA standards, IEC/IEEE equipment standards, DisCo technical requirements" },
];

const DISCO_INTERFACE = [
  { item: "Point of Interconnection", detail: "Single-line diagram showing POI location, ownership boundary, interface equipment, protection/metering" },
  { item: "Operating Modes", detail: "Normal grid-connected, grid outage (islanded), grid restoration, emergency shutdown" },
  { item: "Protection Coordination", detail: "Protection philosophy, relay types, anti-islanding or intentional islanding controls, fault detection" },
  { item: "Bulk Metering", detail: "Meter type, location, communication protocol, calibration frequency, data reconciliation" },
  { item: "DisCo Coordination", detail: "Interface team, planned/unplanned outage protocol, emergency switching, customer complaint routing" },
  { item: "Customer Data Migration", detail: "Customer database handover from DisCo, existing meter status, new customer onboarding, legacy arrears" },
  { item: "DUOS & Settlement", detail: "Assumed DUOS rate, grid energy purchase tariff, invoice cycle, payment deadline, dispute resolution" },
];

const COMMERCIAL_ITEMS = [
  { item: "Customer Tariff by Class", detail: "Residential, commercial, PUE/MSME, anchor customer tariffs (USD/kWh); affordability justification; NERC pathway" },
  { item: "Grid Energy Purchase", detail: "Grid import tariff or settlement formula payable to DisCo; sensitivity to grid supply hours" },
  { item: "DUOS / Network-Use Charge", detail: "Calculation basis (per kWh or per month), sensitivity to DisCo negotiation" },
  { item: "Billing & Collections", detail: "Metering provider, payment channel (mobile money, USSD, agent), collection rate assumption, arrears management" },
  { item: "Settlement Dispute Procedure", detail: "Disputed bulk meter readings, disputed invoices, escalation per tripartite agreement" },
  { item: "Revenue Sensitivity", detail: "Scenarios: demand ±20%, collection 75/90/95%, grid hours ±30%, tariff delay 6 months, FX +25%" },
];

function PMULotView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [actionMsg, setActionMsg] = useState("");
  const [showTenderWizard, setShowTenderWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [tenderTitle, setTenderTitle] = useState("");
  const [tenderDesc, setTenderDesc] = useState("");
  const [tenderRef, setTenderRef] = useState("");
  const [procMethod, setProcMethod] = useState("open_competitive");
  const [bidValidityDays, setBidValidityDays] = useState("120");
  const [currency, setCurrency] = useState("USD");
  const [submitting, setSubmitting] = useState(false);
  const [dataRoomStatus, setDataRoomStatus] = useState<Record<string, string>>({});
  const [qaTab, setQaTab] = useState(false);

  const { data: lot, isLoading } = useQuery({
    queryKey: ["lot", id],
    queryFn: () => api.lots.get(id),
  });

  const lotData = lot as Record<string, any> | null;
  const tender = lotData?.tender as Record<string, any> | null;
  const tenderId = tender?.id;

  const { data: questionsData } = useQuery({
    queryKey: ["tender-questions", tenderId],
    queryFn: () => api.tenders.questions(tenderId!),
    enabled: !!tenderId,
    refetchInterval: 10000,
  });

  const questions = questionsData?.questions ?? [];
  const unanswered = questions.filter((q) => !q.answer);

  const refresh = () => qc.invalidateQueries({ queryKey: ["lot", id] });

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await api.lots.approve(id);
      setActionMsg("Lot approved for tendering");
      refresh();
    } catch (e: any) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTender = async () => {
    if (!tenderTitle.trim()) return;
    setSubmitting(true);
    try {
      await api.tenders.create(id, {
        title: tenderTitle,
        description: tenderDesc,
        procurement_method: procMethod,
        currency,
        grant_ceiling_pct: lotData?.grant_ceiling_pct ?? 0.4,
        bid_validity_days: parseInt(bidValidityDays) || 120,
      });
      setActionMsg("Tender created with full bidder pack and data room");
      setShowTenderWizard(false);
      setWizardStep(0);
      refresh();
    } catch (e: any) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssueTender = async (tid: string) => {
    setSubmitting(true);
    try {
      await api.tenders.issue(tid);
      setActionMsg("Tender issued — now open for bids");
      refresh();
    } catch (e: any) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const openWizard = () => {
    setTenderTitle(`Supply, Install & Operate Interconnected Mini-Grid — ${lotData?.lot_name}`);
    setTenderRef(`DARES-IMG-${lotData?.disco}-${String(Date.now()).slice(-6)}`);
    setTenderDesc(`DARES Performance-Based Grant tender for the development, financing, design, supply, installation, commissioning, operation and maintenance of utility-enabled interconnected mini-grid lot ${lotData?.lot_name} in ${lotData?.disco} franchise area under the DARES programme.`);
    setShowTenderWizard(true);
    setWizardStep(0);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground text-xs">Loading lot...</div>;
  }

  if (!lot || !lotData) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-base font-bold">Lot not found</h2>
        <Button className="mt-4 h-7 text-xs" onClick={() => router.push("/lots")}>Back to Lots</Button>
      </div>
    );
  }

  const sites = (lotData.sites ?? []) as Array<Record<string, any>>;
  const grantCeiling = lotData.grant_ceiling_pct ?? 0.4;

  if (showTenderWizard) {
    return (
      <div className="text-[13px]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-base font-bold">Create Tender — {lotData.lot_name}</h1>
            <p className="text-[11px] text-muted-foreground">
              {lotData.disco} &middot; {sites.length} sites &middot; {fmt(lotData.total_connections || 0)} connections &middot; Grant ceiling: {(grantCeiling * 100).toFixed(0)}%
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-6 px-3 text-[11px]" onClick={() => setShowTenderWizard(false)}>Cancel</Button>
        </div>

        <div className="mt-3 flex items-center gap-0.5 overflow-x-auto">
          {STEP_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => setWizardStep(i)}
              className={`flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                wizardStep === i ? "bg-primary text-white" : i < wizardStep ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"
              }`}
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[9px] font-bold">{i < wizardStep ? "✓" : i + 1}</span>
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 rounded border border-border bg-white">
          {wizardStep === 0 && (
            <div className="p-4">
              <h2 className="font-heading text-sm font-bold">Step 1 — Tender Details & Bid Data Sheet</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">Based on DARES IMG Bidder Tender Document Template v3 — Part A</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><Label className="text-[11px]">Tender Title</Label><Input className="h-7 text-[11px]" value={tenderTitle} onChange={(e) => setTenderTitle(e.target.value)} /></div>
                <div><Label className="text-[11px]">Tender Reference</Label><Input className="h-7 text-[11px]" value={tenderRef} onChange={(e) => setTenderRef(e.target.value)} /></div>
              </div>
              <div className="mt-2"><Label className="text-[11px]">Description / Scope</Label><textarea className="mt-0.5 w-full rounded border border-input bg-background px-2 py-1.5 text-[11px] h-16 resize-none" value={tenderDesc} onChange={(e) => setTenderDesc(e.target.value)} /></div>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <div><Label className="text-[11px]">Procurement Method</Label><select className="flex h-7 w-full rounded border border-input bg-background px-2 text-[11px]" value={procMethod} onChange={(e) => setProcMethod(e.target.value)}><option value="open_competitive">Open Competitive Bidding</option><option value="minimum_subsidy">Minimum Subsidy Tender (MST)</option><option value="rfp">Request for Proposals (RFP)</option></select></div>
                <div><Label className="text-[11px]">Bid Validity (days)</Label><Input className="h-7 text-[11px]" type="number" value={bidValidityDays} onChange={(e) => setBidValidityDays(e.target.value)} /></div>
                <div><Label className="text-[11px]">Currency</Label><select className="flex h-7 w-full rounded border border-input bg-background px-2 text-[11px]" value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="USD">USD</option><option value="NGN">NGN</option><option value="dual">Dual Currency</option></select></div>
              </div>
              <div className="mt-3 rounded border border-border bg-muted/30 p-3">
                <h3 className="text-[11px] font-semibold">Document Control (auto-populated)</h3>
                <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                  {[["Procuring entity", "Rural Electrification Agency (REA) / DARES PMU"], ["Programme", "DARES — $750M IDA (P179687)"], ["Lot", lotData.lot_name], ["DisCo", lotData.disco], ["Grant ceiling", `${(grantCeiling * 100).toFixed(0)}% of eligible CAPEX`], ["Contract structure", "Design-finance-build-operate-maintain"], ["Grant instrument", "Performance-Based Grant (% of eligible CAPEX)"], ["Governing rules", "World Bank Procurement Regulations for IPF Borrowers"]].map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {wizardStep === 1 && (
            <div className="p-4">
              <h2 className="font-heading text-sm font-bold">Step 2 — 8-Folder Data Room Structure</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">Part C of tender document — bidder-facing evidence base</p>
              <div className="mt-3 space-y-1.5">
                {PMU_DATA_ROOM_FOLDERS.map((folder) => (
                  <div key={folder.id} className="rounded border border-border p-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><span className="inline-flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-[9px] font-bold text-primary">{folder.id}</span><span className="text-[11px] font-semibold">{folder.name}</span></div>
                      <select className="h-5 rounded border border-input bg-background px-1.5 text-[9px]" value={dataRoomStatus[folder.id] || "provided"} onChange={(e) => setDataRoomStatus((prev) => ({ ...prev, [folder.id]: e.target.value }))}><option value="provided">Provided</option><option value="partial">Partial</option><option value="not_available">Not Available</option></select>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{folder.contents}</p>
                    <p className="text-[9px] text-primary/70 mt-0.5">Purpose: {folder.purpose}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="p-4">
              <h2 className="font-heading text-sm font-bold">Step 3 — Technical Requirements (Form 5)</h2>
              <Table><TableHeader><TableRow className="text-[10px]"><TableHead className="py-1.5 w-40">Technical Item</TableHead><TableHead className="py-1.5">Bidder Submission Required</TableHead></TableRow></TableHeader><TableBody>{TECHNICAL_REQUIREMENTS.map((req) => (<TableRow key={req.item} className="text-[11px]"><TableCell className="py-1.5 font-medium">{req.item}</TableCell><TableCell className="py-1.5 text-[10px] text-muted-foreground">{req.detail}</TableCell></TableRow>))}</TableBody></Table>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="p-4">
              <h2 className="font-heading text-sm font-bold">Step 4 — DisCo Interconnection & Interface</h2>
              <Table><TableHeader><TableRow className="text-[10px]"><TableHead className="py-1.5 w-44">Interface Item</TableHead><TableHead className="py-1.5">Bidder Shall Provide</TableHead></TableRow></TableHeader><TableBody>{DISCO_INTERFACE.map((item) => (<TableRow key={item.item} className="text-[11px]"><TableCell className="py-1.5 font-medium">{item.item}</TableCell><TableCell className="py-1.5 text-[10px] text-muted-foreground">{item.detail}</TableCell></TableRow>))}</TableBody></Table>
            </div>
          )}

          {wizardStep === 4 && (
            <div className="p-4">
              <h2 className="font-heading text-sm font-bold">Step 5 — Commercial, Tariff & Settlement Framework</h2>
              <Table><TableHeader><TableRow className="text-[10px]"><TableHead className="py-1.5 w-44">Commercial Item</TableHead><TableHead className="py-1.5">Bidder Submission Required</TableHead></TableRow></TableHeader><TableBody>{COMMERCIAL_ITEMS.map((item) => (<TableRow key={item.item} className="text-[11px]"><TableCell className="py-1.5 font-medium">{item.item}</TableCell><TableCell className="py-1.5 text-[10px] text-muted-foreground">{item.detail}</TableCell></TableRow>))}</TableBody></Table>
            </div>
          )}

          {wizardStep === 5 && (
            <div className="p-4">
              <h2 className="font-heading text-sm font-bold">Step 6 — Grant & Eligible CAPEX Rules</h2>
              <Table><TableHeader><TableRow className="text-[10px]"><TableHead className="py-1.5">CAPEX Category</TableHead><TableHead className="py-1.5 w-20 text-center">Eligible?</TableHead><TableHead className="py-1.5">Evidence Required</TableHead></TableRow></TableHeader><TableBody>{ELIGIBLE_CAPEX_CATEGORIES.map((cat) => (<TableRow key={cat.category} className="text-[11px]"><TableCell className="py-1 font-medium text-[10px]">{cat.category}</TableCell><TableCell className="py-1 text-center"><span className={`inline-block rounded px-1.5 py-px text-[9px] font-medium ${cat.eligible === true ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{cat.eligible === true ? "Yes" : "Conditional"}</span></TableCell><TableCell className="py-1 text-[9px] text-muted-foreground">{cat.evidence}</TableCell></TableRow>))}</TableBody></Table>
            </div>
          )}

          {wizardStep === 6 && (
            <div className="p-4">
              <h2 className="font-heading text-sm font-bold">Step 7 — Payment Milestones & Disbursement</h2>
              <div className="mt-3 space-y-3">
                {PAYMENT_MILESTONES.map((ms) => (
                  <div key={ms.id} className="rounded border border-border overflow-hidden">
                    <div className="flex items-center justify-between bg-primary/5 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold">{ms.id}</span>
                        <div><h3 className="text-[12px] font-bold">{ms.name}</h3><p className="text-[10px] text-muted-foreground">{ms.description}</p></div>
                      </div>
                      <div className="text-right"><div className="text-lg font-bold text-primary">{ms.tranche_pct}%</div><div className="text-[9px] text-muted-foreground">of total grant</div></div>
                    </div>
                    <div className="px-3 py-2">
                      <div className="text-[10px] font-semibold text-muted-foreground mb-1">Evidence Required:</div>
                      <div className="grid grid-cols-2 gap-0.5">{ms.evidence.map((ev, i) => (<div key={i} className="flex items-start gap-1.5 text-[10px]"><span className="w-3 h-3 rounded border border-green-300 bg-green-50 flex items-center justify-center text-[7px] text-green-700 shrink-0 mt-0.5">✓</span><span>{ev}</span></div>))}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <Button variant="outline" size="sm" className="h-7 px-3 text-[11px]" disabled={wizardStep === 0} onClick={() => setWizardStep((s) => s - 1)}>← Previous</Button>
          <span className="text-[10px] text-muted-foreground">Step {wizardStep + 1} of {STEP_LABELS.length}</span>
          {wizardStep < STEP_LABELS.length - 1 ? (
            <Button size="sm" className="h-7 px-3 text-[11px]" onClick={() => setWizardStep((s) => s + 1)}>Next →</Button>
          ) : (
            <Button size="sm" className="h-7 px-4 text-[11px]" onClick={handleCreateTender} disabled={submitting || !tenderTitle.trim()}>{submitting ? "Creating..." : "Create Tender & Generate Bidder Pack"}</Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="text-[13px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-base font-bold">{lotData.lot_name}</h1>
          <p className="text-[11px] text-muted-foreground">
            {lotData.disco} &middot; {lotData.state} &middot; {sites.length} sites &middot; {fmt(lotData.total_connections || 0)} connections
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-6 px-3 text-[11px]" onClick={() => router.push("/lots")}>← Back to Lots</Button>
      </div>

      {actionMsg && (
        <div className={`mt-2 rounded p-2.5 text-[11px] ${actionMsg.startsWith("Error") ? "bg-red-500/10 border border-red-500/30 text-red-700" : "bg-green-500/10 border border-green-500/30 text-green-700"}`}>{actionMsg}</div>
      )}

      <div className="mt-3 grid gap-2 grid-cols-4">
        {[
          { label: "Grant Ceiling", value: formatUSD(lotData.grant_ceiling_usd || 0), sub: `${(grantCeiling * 100).toFixed(0)}% of eligible CAPEX` },
          { label: "Approval", value: lotData.approval_to_tender ? "Approved" : "Pending", sub: lotData.approval_to_tender ? "Ready for tender" : "Awaiting REA PMU" },
          { label: "Tender Status", value: (lotData.tender_status || "none").replace(/_/g, " "), sub: tender ? `Ref: ${tender.tender_reference || "—"}` : "Not created" },
          { label: "Data Room", value: (lotData.data_room_status || "not_started").replace(/_/g, " "), sub: "8-folder structure" },
        ].map((s) => (
          <div key={s.label} className="rounded border border-border bg-white px-3 py-1.5">
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
            <div className="font-heading text-sm font-bold leading-tight capitalize">{s.value}</div>
            <div className="text-[9px] text-muted-foreground">{s.sub}</div>
          </div>
        ))}
      </div>

      {sites.length > 0 && (
        <div className="mt-3 rounded border border-border bg-white">
          <div className="border-b border-border px-3 py-1.5"><span className="text-[11px] font-semibold">Sites in Lot ({sites.length})</span></div>
          <div className="max-h-40 overflow-y-auto">
            {sites.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-1 border-b border-border last:border-b-0 text-[11px]">
                <span className="font-medium">{s.community || `Site ${s.site_id?.slice(0, 8)}...`}</span>
                <span className="text-[10px] text-muted-foreground">Rank: {s.settlement_rank ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workflow Actions */}
      <div className="mt-3 rounded border border-border bg-white">
        <div className="border-b border-border px-3 py-1.5"><span className="text-[11px] font-semibold">Workflow Actions</span></div>
        <div className="p-3 space-y-2">
          {!lotData.approval_to_tender && (
            <div className="flex items-center justify-between p-2.5 rounded border border-amber-200 bg-amber-50">
              <div><p className="text-[11px] font-semibold">Step 1: Approve for Tendering</p><p className="text-[10px] text-muted-foreground">REA PMU must approve this lot before tender creation</p></div>
              <Button size="sm" className="h-6 px-3 text-[11px]" onClick={handleApprove} disabled={submitting}>{submitting ? "..." : "Approve Lot"}</Button>
            </div>
          )}
          {lotData.approval_to_tender && !tender && (
            <div className="flex items-center justify-between p-2.5 rounded border border-blue-200 bg-blue-50">
              <div><p className="text-[11px] font-semibold">Step 2: Create Tender</p><p className="text-[10px] text-muted-foreground">Generate bidder pack, 8-folder data room, tender document, and Form 6 financial template</p></div>
              <Button size="sm" className="h-6 px-3 text-[11px]" onClick={openWizard}>Create Tender</Button>
            </div>
          )}
          {tender && tender.status === "draft" && (
            <div className="flex items-center justify-between p-2.5 rounded border border-green-200 bg-green-50">
              <div><p className="text-[11px] font-semibold">Step 3: Issue Tender</p><p className="text-[10px] text-muted-foreground">Ref: {tender.tender_reference || "—"} — publish to open for bids</p></div>
              <Button size="sm" className="h-6 px-3 text-[11px]" onClick={() => handleIssueTender(tender.id)} disabled={submitting}>{submitting ? "..." : "Issue Tender"}</Button>
            </div>
          )}
          {lotData.tender_status === "issued" && (
            <div className="flex items-center justify-between p-2.5 rounded border border-green-200 bg-green-50">
              <div><p className="text-[11px] font-semibold text-green-700">Tender Live</p><p className="text-[10px] text-muted-foreground">This lot is open for bids</p></div>
              <Badge className="bg-green-100 text-green-800 text-[10px]">Live</Badge>
            </div>
          )}
        </div>
      </div>

      {/* Q&A Management for PMU */}
      {tender && (
        <div className="mt-3 rounded border border-border bg-white">
          <div className="border-b border-border px-3 py-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold">
              Bidder Questions & Answers ({questions.length})
              {unanswered.length > 0 && (
                <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-700">{unanswered.length} unanswered</span>
              )}
            </span>
            <Button variant="outline" size="sm" className="h-5 px-2 text-[9px]" onClick={() => setQaTab(!qaTab)}>
              {qaTab ? "Collapse" : "Expand"}
            </Button>
          </div>
          {qaTab && (
            <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
              {questions.length === 0 && (
                <p className="text-center text-[11px] text-muted-foreground py-4">No questions from bidders yet.</p>
              )}
              {questions.map((q) => (
                <PMUQuestionCard key={q.id} question={q} tenderId={tenderId!} onAnswered={() => qc.invalidateQueries({ queryKey: ["tender-questions", tenderId] })} />
              ))}
            </div>
          )}
        </div>
      )}

      {tender && (
        <div className="mt-3 space-y-2">
          <div className="rounded border border-border bg-white">
            <div className="border-b border-border px-3 py-1.5"><span className="text-[11px] font-semibold">Bidder Pack — Tender Document</span></div>
            <div className="p-3 grid grid-cols-3 gap-2 text-[10px]">
              {["Part A — Invitation & Bid Data", "Part B — IMG Commercial Model", "Part C — Data Room (8 folders)", "Part D — Technical Requirements", "Part E — DisCo Interface", "Part F — Commercial Framework", "Part G — Grant & CAPEX Rules", "Part H — Conditions Precedent", "Part I — E&S Requirements"].map((part) => (
                <div key={part} className="flex items-center gap-1.5 rounded bg-green-50 border border-green-200 px-2 py-1"><span className="text-green-700">✓</span><span>{part}</span></div>
              ))}
            </div>
          </div>
          <div className="rounded border border-border bg-white">
            <div className="border-b border-border px-3 py-1.5"><span className="text-[11px] font-semibold">Payment Milestones</span></div>
            <div className="p-3">
              <div className="flex h-6 rounded overflow-hidden text-[10px]">
                <div className="bg-primary flex items-center justify-center text-white font-bold" style={{ width: "40%" }}>M1 — 40%</div>
                <div className="bg-primary/70 flex items-center justify-center text-white font-bold" style={{ width: "40%" }}>M2 — 40%</div>
                <div className="bg-primary/40 flex items-center justify-center text-white font-bold" style={{ width: "20%" }}>M3 — 20%</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PMUQuestionCard({ question, tenderId, onAnswered }: { question: any; tenderId: string; onAnswered: () => void }) {
  const [answerText, setAnswerText] = useState("");
  const [answering, setAnswering] = useState(false);
  const [showAnswer, setShowAnswer] = useState(!question.answer);

  const handleAnswer = async () => {
    if (!answerText.trim()) return;
    setAnswering(true);
    try {
      await api.tenders.answerQuestion(question.id, { answer: answerText, published: true });
      setShowAnswer(false);
      onAnswered();
    } catch {
      alert("Failed to submit answer.");
    } finally {
      setAnswering(false);
    }
  };

  return (
    <div className={`rounded border p-2.5 ${question.answer ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-amber-50/50"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-blue-700">{question.company_name || "Bidder"}</span>
          <span className="text-[9px] text-muted-foreground">{timeAgo(question.asked_at)}</span>
        </div>
        {question.answer ? (
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-[9px] text-green-700 font-medium">Answered</span>
        ) : (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-700 font-medium">Unanswered</span>
        )}
      </div>
      <p className="text-[11px] mt-1">{question.question}</p>
      {question.answer && !showAnswer && (
        <div className="mt-1.5 rounded bg-white border border-green-200 px-2 py-1.5 text-[11px]">
          <span className="text-[9px] font-medium text-green-700">PMU Response: </span>
          {question.answer}
        </div>
      )}
      {showAnswer && !question.answer && (
        <div className="mt-2 flex items-center gap-1.5">
          <Input value={answerText} onChange={(e) => setAnswerText(e.target.value)} placeholder="Type your response..." className="flex-1 h-7 text-[11px] px-2" onKeyDown={(e) => { if (e.key === "Enter" && answerText.trim()) { e.preventDefault(); handleAnswer(); }}} />
          <Button size="sm" className="h-7 px-2.5 text-[10px]" disabled={answering || !answerText.trim()} onClick={handleAnswer}>{answering ? "..." : "Respond & Publish"}</Button>
        </div>
      )}
    </div>
  );
}
