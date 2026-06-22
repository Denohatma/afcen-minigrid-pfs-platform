"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useRole } from "@/lib/role-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const DISCO_OPTIONS = [
  { value: "", label: "All DisCos" },
  { value: "AEDC", label: "AEDC" },
  { value: "KEDCO", label: "KEDCO" },
  { value: "IE", label: "IE" },
];

const TENDER_STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-100 text-green-800",
  draft: "bg-gray-100 text-gray-700",
  issued: "bg-blue-100 text-blue-800",
  closed: "bg-amber-100 text-amber-800",
  awarded: "bg-emerald-100 text-emerald-800",
  none: "bg-gray-100 text-gray-500",
};

const DATA_ROOM_COLORS: Record<string, string> = {
  complete: "bg-green-100 text-green-800",
  in_progress: "bg-blue-100 text-blue-800",
  not_started: "bg-gray-100 text-gray-500",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

export default function LotsPage() {
  const { role } = useRole();
  const isBidder = role.backendRole === "developer";

  if (isBidder) return <BidderView />;
  return <PMUView />;
}

/* ===================================================================
   PMU / Default View — Tender Pipeline Manager
   =================================================================== */
function PMUView() {
  const [disco, setDisco] = useState("");

  const params: Record<string, string> = {};
  if (disco) params.disco = disco;

  const { data: lotsData, isLoading } = useQuery({
    queryKey: ["lots", disco],
    queryFn: () => api.lots.list(params),
  });

  const { data: biddersData } = useQuery({
    queryKey: ["bidders"],
    queryFn: () => api.bidders.list(),
  });

  const allLots = lotsData?.lots ?? [];
  const bidders = biddersData?.bidders ?? [];

  const approvedLots = allLots.filter((l) => l.disco_status === "approved");
  const pendingLots = allLots.filter((l) => (l.disco_status || "pending") === "pending");

  const readyForTender = approvedLots.filter((l) => l.tender_status === "approved" || l.tender_status === "none" || l.tender_status === "draft");
  const tendersIssued = approvedLots.filter((l) => l.tender_status === "issued");
  const totalConnections = approvedLots.reduce((s, l) => s + l.total_connections, 0);

  return (
    <div className="text-[13px]">
      <div>
        <h1 className="font-heading text-base font-bold">Lot & Tender Management</h1>
        <p className="text-[11px] text-muted-foreground">
          Program manager dashboard for tender lifecycle
          {pendingLots.length > 0 && (
            <> &middot; <Link href="/disco-readiness" className="text-amber-700 underline">{pendingLots.length} pending DisCo</Link></>
          )}
        </p>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">1</span><span>Sites</span>
        <span className="text-border">→</span>
        <span className="rounded bg-muted px-1.5 py-0.5">2</span><span>System Sizing</span>
        <span className="text-border">→</span>
        <span className="rounded bg-muted px-1.5 py-0.5">3</span><span>DisCo Approval</span>
        <span className="text-border">→</span>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">4</span><span>Tenders</span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2">
        {[
          { label: "DisCo-Approved Lots", value: approvedLots.length },
          { label: "Ready for Tender", value: readyForTender.length },
          { label: "Tenders Issued", value: tendersIssued.length },
          { label: "Total Connections", value: fmt(totalConnections) },
        ].map((s) => (
          <div key={s.label} className="rounded border border-border bg-white px-3 py-1.5">
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
            <div className="font-heading text-lg font-bold leading-tight">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <select className="h-5 rounded border border-input bg-background px-1.5 text-[10px]" value={disco} onChange={(e) => setDisco(e.target.value)}>
          {DISCO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {disco && <button className="text-[10px] text-muted-foreground underline" onClick={() => setDisco("")}>clear</button>}
      </div>

      <div className="mt-2 rounded border border-border bg-white">
        <div className="border-b border-border px-3 py-1.5">
          <span className="text-[11px] font-semibold">Tender Pipeline ({approvedLots.length})</span>
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>
        ) : approvedLots.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No DisCo-approved lots available.{" "}
            <Link href="/disco-readiness" className="text-primary underline">Go to DisCo Approval</Link>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead className="py-1.5">Lot Name</TableHead>
                <TableHead className="py-1.5">DisCo</TableHead>
                <TableHead className="py-1.5 text-right">Connections</TableHead>
                <TableHead className="py-1.5">Data Room</TableHead>
                <TableHead className="py-1.5">Tender Status</TableHead>
                <TableHead className="py-1.5 text-center">EOIs</TableHead>
                <TableHead className="py-1.5 text-center">Bids</TableHead>
                <TableHead className="py-1.5">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedLots.map((lot) => {
                const drStatus = lot.data_room_status || "not_started";
                const hasTender = lot.tender_status === "issued" || lot.tender_status === "closed" || lot.tender_status === "awarded";
                return (
                  <TableRow key={lot.id} className="text-[12px]">
                    <TableCell className="py-1">
                      <div className="font-medium">{lot.lot_name}</div>
                      {lot.state && <div className="text-[10px] text-muted-foreground">{lot.state}</div>}
                    </TableCell>
                    <TableCell className="py-1">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{lot.disco}</span>
                    </TableCell>
                    <TableCell className="py-1 text-right font-mono text-[11px]">{fmt(lot.total_connections)}</TableCell>
                    <TableCell className="py-1">
                      <span className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${DATA_ROOM_COLORS[drStatus] || "bg-gray-100 text-gray-500"}`}>
                        {formatLabel(drStatus)}
                      </span>
                    </TableCell>
                    <TableCell className="py-1">
                      <span className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${TENDER_STATUS_COLORS[lot.tender_status] || "bg-gray-100 text-gray-500"}`}>
                        {lot.tender_status === "approved" ? "Ready" : formatLabel(lot.tender_status)}
                      </span>
                    </TableCell>
                    <TableCell className="py-1 text-center font-mono text-[11px]">
                      {hasTender ? (bidders.length || "—") : "—"}
                    </TableCell>
                    <TableCell className="py-1 text-center font-mono text-[11px]">—</TableCell>
                    <TableCell className="py-1">
                      <Link href={`/lots/${lot.id}`}>
                        <Button variant="outline" size="sm" className="h-5 px-1.5 text-[10px]">Manage</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {bidders.length > 0 && (
        <div className="mt-2.5 rounded border border-border bg-white">
          <div className="border-b border-border px-3 py-1.5">
            <span className="text-[11px] font-semibold">Registered Bidders / EOIs ({bidders.length})</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead className="py-1.5">Company</TableHead>
                <TableHead className="py-1.5">Contact</TableHead>
                <TableHead className="py-1.5">Country</TableHead>
                <TableHead className="py-1.5 text-right">Experience</TableHead>
                <TableHead className="py-1.5 text-right">Sites Done</TableHead>
                <TableHead className="py-1.5">KYC</TableHead>
                <TableHead className="py-1.5">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bidders.map((bidder) => (
                <TableRow key={bidder.id} className="text-[12px]">
                  <TableCell className="py-1">
                    <div className="font-medium">{bidder.company_name}</div>
                    <div className="text-[10px] text-muted-foreground">{bidder.registration_number}</div>
                  </TableCell>
                  <TableCell className="py-1 text-[11px]">
                    {bidder.contact_name}
                    <div className="text-[10px] text-muted-foreground">{bidder.contact_email}</div>
                  </TableCell>
                  <TableCell className="py-1 text-[11px]">{bidder.country}</TableCell>
                  <TableCell className="py-1 text-right font-mono text-[11px]">{bidder.years_experience} yrs</TableCell>
                  <TableCell className="py-1 text-right font-mono text-[11px]">{fmt(bidder.completed_sites)}</TableCell>
                  <TableCell className="py-1">
                    <span className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${
                      bidder.kyc_status === "verified" ? "bg-green-100 text-green-800"
                      : bidder.kyc_status === "failed" ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800"
                    }`}>{formatLabel(bidder.kyc_status)}</span>
                  </TableCell>
                  <TableCell className="py-1">
                    <span className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${
                      bidder.qualification_status === "approved" ? "bg-green-100 text-green-800"
                      : bidder.qualification_status === "rejected" ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800"
                    }`}>{formatLabel(bidder.qualification_status)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/* ===================================================================
   Bidder View — Available Tenders, EOI, Download Docs
   =================================================================== */
function BidderView() {
  const queryClient = useQueryClient();
  const [disco, setDisco] = useState("");
  const [showEOI, setShowEOI] = useState<string | null>(null);
  const [eoiForm, setEoiForm] = useState({
    company_name: "", contact_name: "", contact_email: "", contact_phone: "",
    registration_number: "", country: "Nigeria", years_experience: "",
    completed_sites: "", total_capacity_kwp: "",
  });
  const [submittingEOI, setSubmittingEOI] = useState(false);

  const params: Record<string, string> = {};
  if (disco) params.disco = disco;

  const { data: lotsData, isLoading } = useQuery({
    queryKey: ["lots", disco],
    queryFn: () => api.lots.list(params),
  });

  const { data: biddersData } = useQuery({
    queryKey: ["bidders"],
    queryFn: () => api.bidders.list(),
  });

  const allLots = lotsData?.lots ?? [];
  const bidders = biddersData?.bidders ?? [];
  const issuedLots = allLots.filter((l) => l.tender_status === "issued" || l.tender_status === "closed");
  const myBidder = bidders.length > 0 ? bidders[0] : null;

  const handleSubmitEOI = async () => {
    if (!eoiForm.company_name.trim() || !eoiForm.contact_name.trim() || !eoiForm.contact_email.trim()) return;
    setSubmittingEOI(true);
    try {
      await api.bidders.register({
        company_name: eoiForm.company_name,
        contact_name: eoiForm.contact_name,
        contact_email: eoiForm.contact_email,
        contact_phone: eoiForm.contact_phone,
        registration_number: eoiForm.registration_number,
        country: eoiForm.country,
        years_experience: parseInt(eoiForm.years_experience) || 0,
        completed_sites: parseInt(eoiForm.completed_sites) || 0,
        total_capacity_kwp: parseFloat(eoiForm.total_capacity_kwp) || 0,
      });
      await queryClient.invalidateQueries({ queryKey: ["bidders"] });
      setShowEOI(null);
    } catch {
      alert("Failed to submit EOI. Please try again.");
    } finally {
      setSubmittingEOI(false);
    }
  };

  return (
    <div className="text-[13px]">
      <div>
        <h1 className="font-heading text-base font-bold">Available Tenders</h1>
        <p className="text-[11px] text-muted-foreground">
          DARES Interconnected Mini-Grid Programme — browse open tenders, express interest, download bid documents, and submit bids
        </p>
      </div>

      {myBidder && (
        <div className="mt-2 rounded border border-green-200 bg-green-50 px-3 py-2 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-green-800">EOI Submitted</span>
            <span className="text-[10px] text-green-700 ml-2">
              {myBidder.company_name} &middot; {myBidder.contact_name} &middot; {myBidder.contact_email}
            </span>
          </div>
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
            {formatLabel(myBidder.qualification_status)}
          </span>
        </div>
      )}

      <div className="mt-2 grid grid-cols-3 gap-2">
        {[
          { label: "Open Tenders", value: issuedLots.filter((l) => l.tender_status === "issued").length },
          { label: "Total Lots", value: issuedLots.length },
          { label: "EOI Status", value: myBidder ? "Registered" : "Not Submitted" },
        ].map((s) => (
          <div key={s.label} className="rounded border border-border bg-white px-3 py-1.5">
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
            <div className="font-heading text-lg font-bold leading-tight">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <select className="h-5 rounded border border-input bg-background px-1.5 text-[10px]" value={disco} onChange={(e) => setDisco(e.target.value)}>
          {DISCO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="mt-4 p-4 text-center text-xs text-muted-foreground">Loading tenders...</div>
      ) : issuedLots.length === 0 ? (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm font-medium text-amber-800">No tenders currently available</p>
          <p className="mt-1 text-[11px] text-amber-700">
            Tenders will appear here once the REA PMU issues them. Check back soon.
          </p>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {issuedLots.map((lot) => (
            <div key={lot.id} className="rounded border border-border bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <div>
                  <h3 className="text-[13px] font-bold">{lot.lot_name}</h3>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{lot.disco}</span>
                    <span>{fmt(lot.total_connections)} potential connections</span>
                    <span>&middot;</span>
                    <span>{lot.site_count} sites</span>
                    <span>&middot;</span>
                    <span>Grant ceiling: {(lot.grant_ceiling_pct * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                    lot.tender_status === "issued" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                  }`}>
                    {lot.tender_status === "issued" ? "Open for Bids" : "Closed"}
                  </span>
                </div>
              </div>

              <div className="px-4 py-2.5 flex items-center gap-2">
                {!myBidder ? (
                  <Button
                    size="sm"
                    className="h-7 px-3 text-[11px]"
                    onClick={() => setShowEOI(lot.id)}
                  >
                    Express Interest (EOI)
                  </Button>
                ) : (
                  <>
                    <Link href={`/lots/${lot.id}`}>
                      <Button size="sm" variant="outline" className="h-7 px-3 text-[11px]">
                        Download Bid Documents
                      </Button>
                    </Link>
                    <Link href={`/lots/${lot.id}`}>
                      <Button size="sm" className="h-7 px-3 text-[11px]">
                        View Tender & Submit Bid
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* EOI Registration Modal */}
      {showEOI && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEOI(null)}>
          <div className="relative mx-4 w-full max-w-[550px] rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-3">
              <div>
                <h2 className="font-heading text-sm font-bold">Expression of Interest (EOI)</h2>
                <p className="text-[11px] text-muted-foreground">Register your company to access tender documents and submit bids</p>
              </div>
              <button onClick={() => setShowEOI(null)} className="rounded px-2 py-1 text-xs hover:bg-muted">Close</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
                By submitting this EOI, you confirm your interest in participating in the DARES IMG tender process. Your details will be shared with the REA Programme Management Unit.
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Company Name *</label>
                  <Input value={eoiForm.company_name} onChange={(e) => setEoiForm((f) => ({ ...f, company_name: e.target.value }))} className="h-7 text-[11px] px-2 mt-0.5" placeholder="e.g. SolarTech Nigeria Ltd" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Registration Number</label>
                  <Input value={eoiForm.registration_number} onChange={(e) => setEoiForm((f) => ({ ...f, registration_number: e.target.value }))} className="h-7 text-[11px] px-2 mt-0.5" placeholder="e.g. RC-123456" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Contact Person *</label>
                  <Input value={eoiForm.contact_name} onChange={(e) => setEoiForm((f) => ({ ...f, contact_name: e.target.value }))} className="h-7 text-[11px] px-2 mt-0.5" placeholder="Full name" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Email *</label>
                  <Input value={eoiForm.contact_email} onChange={(e) => setEoiForm((f) => ({ ...f, contact_email: e.target.value }))} className="h-7 text-[11px] px-2 mt-0.5" placeholder="email@company.com" type="email" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Phone</label>
                  <Input value={eoiForm.contact_phone} onChange={(e) => setEoiForm((f) => ({ ...f, contact_phone: e.target.value }))} className="h-7 text-[11px] px-2 mt-0.5" placeholder="+234..." />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Country</label>
                  <Input value={eoiForm.country} onChange={(e) => setEoiForm((f) => ({ ...f, country: e.target.value }))} className="h-7 text-[11px] px-2 mt-0.5" />
                </div>
              </div>

              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pt-1">Experience & Track Record</h3>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Years of Experience</label>
                  <Input value={eoiForm.years_experience} onChange={(e) => setEoiForm((f) => ({ ...f, years_experience: e.target.value }))} className="h-7 text-[11px] px-2 mt-0.5" type="number" placeholder="e.g. 5" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Sites Completed</label>
                  <Input value={eoiForm.completed_sites} onChange={(e) => setEoiForm((f) => ({ ...f, completed_sites: e.target.value }))} className="h-7 text-[11px] px-2 mt-0.5" type="number" placeholder="e.g. 10" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Total Capacity (kWp)</label>
                  <Input value={eoiForm.total_capacity_kwp} onChange={(e) => setEoiForm((f) => ({ ...f, total_capacity_kwp: e.target.value }))} className="h-7 text-[11px] px-2 mt-0.5" type="number" placeholder="e.g. 500" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <button className="text-[11px] text-muted-foreground underline" onClick={() => setShowEOI(null)}>Cancel</button>
              <Button
                size="sm"
                className="h-7 px-4 text-[11px]"
                disabled={submittingEOI || !eoiForm.company_name.trim() || !eoiForm.contact_name.trim() || !eoiForm.contact_email.trim()}
                onClick={handleSubmitEOI}
              >
                {submittingEOI ? "Submitting..." : "Submit EOI"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
