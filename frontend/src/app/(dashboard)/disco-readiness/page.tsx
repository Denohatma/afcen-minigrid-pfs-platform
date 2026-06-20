"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

const DISCO_OPTIONS = [
  { value: "", label: "All DisCos" },
  { value: "AEDC", label: "AEDC" },
  { value: "KEDCO", label: "KEDCO" },
  { value: "IE", label: "IE" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export default function DiscoReadinessPage() {
  const queryClient = useQueryClient();
  const [disco, setDisco] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [rejectRank, setRejectRank] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [siteStatuses, setSiteStatuses] = useState<Record<number, { status: string; reason?: string }>>({});
  const ps = 50;

  const params: Record<string, string | number> = { limit: ps, offset: page * ps };
  if (disco) params.disco = disco;
  if (search) params.search = search;

  const { data, isLoading } = useQuery({
    queryKey: ["settlements-disco", disco, search, page],
    queryFn: () => api.settlements.list(params),
  });

  const { data: stats } = useQuery({
    queryKey: ["settlement-stats"],
    queryFn: () => api.settlements.stats(),
  });

  const { data: lotsData } = useQuery({
    queryKey: ["lots"],
    queryFn: () => api.lots.list({}),
  });

  const settlements = data?.settlements ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / ps);
  const lots = lotsData?.lots ?? [];

  const getSiteStatus = (rank: number) => siteStatuses[rank]?.status ?? "pending";

  const pendingSites = useMemo(() => settlements.filter((s) => getSiteStatus(s.rank) === "pending"), [settlements, siteStatuses]);
  const approvedSites = useMemo(() => settlements.filter((s) => getSiteStatus(s.rank) === "approved"), [settlements, siteStatuses]);
  const rejectedSites = useMemo(() => settlements.filter((s) => getSiteStatus(s.rank) === "rejected"), [settlements, siteStatuses]);

  const approvedByDisco = useMemo(() => {
    const groups: Record<string, typeof approvedSites> = {};
    for (const s of approvedSites) {
      const key = s.disco;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    return groups;
  }, [approvedSites]);

  const handleApprove = (rank: number) => {
    setSiteStatuses((prev) => ({ ...prev, [rank]: { status: "approved" } }));
  };

  const handleReject = (rank: number) => {
    setSiteStatuses((prev) => ({ ...prev, [rank]: { status: "rejected", reason: rejectReason } }));
    setRejectRank(null);
    setRejectReason("");
  };

  const counts = {
    pending: pendingSites.length,
    approved: approvedSites.length,
    rejected: rejectedSites.length,
  };

  const currentSites = tab === "pending" ? pendingSites : tab === "approved" ? approvedSites : rejectedSites;

  function renderSiteTable(sites: typeof settlements, showActions: boolean) {
    if (sites.length === 0) {
      return (
        <div className="p-4 text-center text-xs text-muted-foreground">
          {tab === "pending" ? "No sites pending review." : tab === "approved" ? "No sites approved yet." : "No rejected sites."}
        </div>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow className="text-[11px]">
            <TableHead className="py-1.5 w-8">#</TableHead>
            <TableHead className="py-1.5">Settlement</TableHead>
            <TableHead className="py-1.5">LGA</TableHead>
            <TableHead className="py-1.5">State</TableHead>
            <TableHead className="py-1.5">DisCo</TableHead>
            <TableHead className="py-1.5 text-right">Pop.</TableHead>
            <TableHead className="py-1.5 text-right">Connections</TableHead>
            <TableHead className="py-1.5 text-right">kWh/yr</TableHead>
            <TableHead className="py-1.5 text-right">Grid km</TableHead>
            <TableHead className="py-1.5 text-right">Score</TableHead>
            <TableHead className="py-1.5">Status</TableHead>
            {showActions && <TableHead className="py-1.5">Actions</TableHead>}
            {tab === "rejected" && <TableHead className="py-1.5">Reason</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sites.map((s) => (
            <TableRow key={s.rank} className="text-[12px]">
              <TableCell className="py-0.5 font-mono text-[10px] text-muted-foreground">{s.rank}</TableCell>
              <TableCell className="py-0.5 font-medium">{s.village}</TableCell>
              <TableCell className="py-0.5 text-[11px]">{s.lga}</TableCell>
              <TableCell className="py-0.5 text-[11px]">{s.state}</TableCell>
              <TableCell className="py-0.5">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{s.disco}</span>
              </TableCell>
              <TableCell className="py-0.5 text-right font-mono text-[11px]">{fmt(s.population)}</TableCell>
              <TableCell className="py-0.5 text-right font-mono text-[11px]">{fmt(s.connections)}</TableCell>
              <TableCell className="py-0.5 text-right font-mono text-[11px]">{fmt(Math.round(s.demand_kwh))}</TableCell>
              <TableCell className="py-0.5 text-right font-mono text-[11px]">{s.grid_dist_km.toFixed(1)}</TableCell>
              <TableCell className="py-0.5 text-right">
                <span className={`font-mono text-[11px] font-semibold ${s.score >= 70 ? "text-green-700" : s.score >= 50 ? "text-amber-700" : "text-red-700"}`}>
                  {s.score.toFixed(1)}
                </span>
              </TableCell>
              <TableCell className="py-0.5">
                <span className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${STATUS_COLORS[getSiteStatus(s.rank)]}`}>
                  {getSiteStatus(s.rank).charAt(0).toUpperCase() + getSiteStatus(s.rank).slice(1)}
                </span>
              </TableCell>
              {showActions && (
                <TableCell className="py-0.5">
                  {rejectRank === s.rank ? (
                    <div className="flex flex-col gap-1 min-w-[160px]">
                      <input
                        type="text"
                        placeholder="Reason..."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="h-5 w-full rounded border border-input bg-background px-1.5 text-[10px]"
                      />
                      <div className="flex gap-1">
                        <Button size="sm" variant="destructive" className="h-5 px-2 text-[10px]" onClick={() => handleReject(s.rank)}>
                          Confirm
                        </Button>
                        <button className="text-[10px] text-muted-foreground underline" onClick={() => { setRejectRank(null); setRejectReason(""); }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" className="h-5 px-2 text-[10px]" onClick={() => handleApprove(s.rank)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" className="h-5 px-2 text-[10px] text-red-700 border-red-200 hover:bg-red-50" onClick={() => setRejectRank(s.rank)}>
                        Reject
                      </Button>
                    </div>
                  )}
                </TableCell>
              )}
              {tab === "rejected" && (
                <TableCell className="py-0.5 text-[10px] text-muted-foreground max-w-[200px]">
                  {siteStatuses[s.rank]?.reason || "—"}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="text-[13px]">
      <div>
        <h1 className="font-heading text-base font-bold">DisCo Interconnection Approval</h1>
        <p className="text-[11px] text-muted-foreground">
          Site-level approval &middot; {fmt(total)} settlements &middot; {counts.pending} pending &middot; {counts.approved} approved &middot; {counts.rejected} rejected
        </p>
      </div>

      {/* Flow indicator */}
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">1</span>
        <span>Sites</span>
        <span className="text-border">→</span>
        <span className="rounded bg-muted px-1.5 py-0.5">2</span>
        <span>System Sizing</span>
        <span className="text-border">→</span>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">3</span>
        <span>DisCo Approval</span>
        <span className="text-border">→</span>
        <span className="rounded bg-muted px-1.5 py-0.5">4</span>
        <span>Tenders</span>
      </div>

      {/* Filters */}
      <div className="mt-2 flex items-center gap-2">
        <select className="h-6 rounded border border-input bg-background px-1.5 text-[11px]" value={disco} onChange={(e) => { setDisco(e.target.value); setPage(0); }}>
          {DISCO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Input placeholder="Search..." value={search} className="h-6 w-36 text-[11px] px-1.5" onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
      </div>

      {/* Tabs */}
      <div className="mt-2 flex items-center gap-0.5 border-b border-border">
        {(["pending", "approved", "rejected"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)} ({counts[t]})
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="mt-2 rounded border border-border bg-white">
        {tab === "approved" && Object.keys(approvedByDisco).length > 0 ? (
          <div>
            <div className="border-b border-border px-3 py-1.5">
              <span className="text-[11px] font-semibold">Approved Sites — Consolidated by DisCo Lot</span>
            </div>
            {Object.entries(approvedByDisco).map(([discoName, sites]) => (
              <div key={discoName} className="border-b last:border-b-0">
                <div className="flex items-center justify-between bg-green-50/50 px-3 py-1">
                  <span className="text-[11px] font-semibold text-green-800">
                    {discoName}-IMG Lot — {sites.length} sites
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {fmt(sites.reduce((a, s) => a + s.population, 0))} pop &middot;
                    {fmt(sites.reduce((a, s) => a + s.connections, 0))} connections
                  </span>
                </div>
                {renderSiteTable(sites, false)}
              </div>
            ))}
          </div>
        ) : (
          <>
            {isLoading ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Loading sites...</div>
            ) : (
              renderSiteTable(currentSites, tab === "pending")
            )}
          </>
        )}
      </div>

      {/* Pagination */}
      {settlements.length > 0 && (
        <div className="mt-1 flex items-center justify-between px-1">
          <span className="text-[10px] text-muted-foreground">
            {page * ps + 1}–{Math.min((page + 1) * ps, total)} of {fmt(total)}
          </span>
          <div className="flex gap-1">
            <button className="rounded border border-input px-1.5 py-0.5 text-[10px] disabled:opacity-30" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <button className="rounded border border-input px-1.5 py-0.5 text-[10px] disabled:opacity-30" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        </div>
      )}

      {/* Proceed */}
      {counts.approved > 0 && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="text-[10px] text-muted-foreground">{counts.approved} sites approved — proceed to tender preparation</span>
          <Link href="/lots">
            <Button size="sm" className="h-6 px-3 text-[11px]">Proceed to Tenders →</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
