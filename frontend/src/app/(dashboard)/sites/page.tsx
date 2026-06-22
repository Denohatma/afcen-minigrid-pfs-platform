"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { useRole } from "@/lib/role-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SettlementMap = dynamic(
  () => import("@/components/settlement-map").then((m) => m.SettlementMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading map...
      </div>
    ),
  }
);

const AlfredChat = dynamic(
  () => import("@/components/alfred-chat").then((m) => m.AlfredChat),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading Alfred...
      </div>
    ),
  }
);

const DISCO_OPTIONS = [
  { value: "", label: "All" },
  { value: "AEDC", label: "AEDC" },
  { value: "KEDCO", label: "KEDCO" },
  { value: "IE", label: "IE" },
];

const MG_OPTIONS = [
  { value: "", label: "All" },
  { value: "interconnected", label: "Interconnected" },
  { value: "undergrid", label: "Under-grid" },
  { value: "isolated", label: "Isolated" },
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

type Signal = "HIGH_PRIORITY" | "CONDITIONAL" | "LOW_PRIORITY" | "REVIEW";

function getSignal(score: number): Signal {
  if (score >= 70) return "HIGH_PRIORITY";
  if (score >= 50) return "CONDITIONAL";
  if (score >= 30) return "LOW_PRIORITY";
  return "REVIEW";
}

const SIGNAL_ORDER: Record<Signal, number> = {
  HIGH_PRIORITY: 0,
  CONDITIONAL: 1,
  LOW_PRIORITY: 2,
  REVIEW: 3,
};

const SIGNAL_CONFIG: Record<Signal, { label: string; bg: string; text: string }> = {
  HIGH_PRIORITY: { label: "High Priority", bg: "bg-green-600", text: "text-white" },
  CONDITIONAL: { label: "Conditional", bg: "bg-amber-500", text: "text-white" },
  LOW_PRIORITY: { label: "Low Priority", bg: "bg-red-600", text: "text-white" },
  REVIEW: { label: "Review", bg: "bg-purple-600", text: "text-white" },
};

type PipelineFilter = "all" | "high" | "conditional" | "low" | "in_lot";

const PIPELINE_FILTERS: { key: PipelineFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "high", label: "High Priority" },
  { key: "conditional", label: "Conditional" },
  { key: "low", label: "Low Priority" },
  { key: "in_lot", label: "In Lot" },
];

type Mode = "browse" | "selecting" | "review";

export default function SitesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { role, isReadOnly } = useRole();
  const readOnly = isReadOnly("sites");
  const [disco, setDisco] = useState(role.disco ?? "");
  const [mgType, setMgType] = useState("");
  const [search, setSearch] = useState("");
  const [minPop, setMinPop] = useState("");
  const [maxGridDist, setMaxGridDist] = useState("");
  const [page, setPage] = useState(0);
  const [selectedRanks, setSelectedRanks] = useState<Set<number>>(new Set());
  const [lotSuffix, setLotSuffix] = useState("");
  const [mode, _setMode] = useState<Mode>("browse");
  const setMode = (m: Mode) => { if (!readOnly) _setMode(m); };
  const [lotDisco, setLotDisco] = useState("");
  const [creating, setCreating] = useState(false);
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>("all");
  const ps = 50;

  const params: Record<string, string | number> = { limit: ps, offset: page * ps };
  if (disco) params.disco = disco;
  if (mgType) params.mg_type = mgType;
  if (search) params.search = search;
  if (minPop) params.min_pop = parseInt(minPop) || 0;
  if (maxGridDist) params.max_grid_dist = parseFloat(maxGridDist) || 100;
  if (pipelineFilter === "high") { params.min_score = 70; }
  else if (pipelineFilter === "conditional") { params.min_score = 50; params.max_score = 70; }
  else if (pipelineFilter === "low") { params.max_score = 50; }

  const { data, isLoading } = useQuery({
    queryKey: ["settlements", disco, mgType, search, minPop, maxGridDist, page, pipelineFilter],
    queryFn: () => api.settlements.list(params),
  });

  const { data: stats } = useQuery({
    queryKey: ["settlement-stats"],
    queryFn: () => api.settlements.stats(),
  });

  const { data: lotsData } = useQuery({
    queryKey: ["lots"],
    queryFn: () => api.lots.list(),
  });

  const { data: assignmentsData } = useQuery({
    queryKey: ["lot-site-assignments"],
    queryFn: () => api.lots.siteAssignments(),
  });

  const existingLots = lotsData?.lots ?? [];
  const lotRanks = useMemo(() => {
    const set = new Set<number>();
    for (const a of (assignmentsData?.assignments ?? [])) {
      if (a.settlement_rank != null) set.add(a.settlement_rank);
    }
    return set;
  }, [assignmentsData]);

  const rawSettlements = data?.settlements ?? [];
  const settlements = useMemo(() => {
    let filtered = rawSettlements;
    if (pipelineFilter === "in_lot") filtered = filtered.filter((s) => lotRanks.has(s.rank));

    return [...filtered].sort((a, b) => {
      const sa = SIGNAL_ORDER[getSignal(a.score)];
      const sb = SIGNAL_ORDER[getSignal(b.score)];
      if (sa !== sb) return sa - sb;
      return b.score - a.score;
    });
  }, [rawSettlements, pipelineFilter, lotRanks]);
  const total = pipelineFilter === "in_lot" ? settlements.length : (data?.total ?? 0);
  const totalPages = pipelineFilter === "in_lot" ? 1 : Math.ceil((data?.total ?? 0) / ps);

  const toggleSelect = useCallback((rank: number) => {
    if (mode !== "selecting") return;
    const s = settlements.find((x) => x.rank === rank);
    if (!s || (lotDisco && s.disco !== lotDisco)) return;
    setSelectedRanks((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) next.delete(rank);
      else next.add(rank);
      return next;
    });
  }, [mode, lotDisco, settlements]);

  const selectAllOnPage = () => {
    if (mode !== "selecting") return;
    const pageRanks = settlements
      .filter((s) => !lotDisco || s.disco === lotDisco)
      .map((s) => s.rank);
    const allPageSelected = pageRanks.every((r) => selectedRanks.has(r));
    setSelectedRanks((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageRanks.forEach((r) => next.delete(r));
      } else {
        pageRanks.forEach((r) => next.add(r));
      }
      return next;
    });
  };

  const resetFilters = () => {
    setDisco(role.disco ?? ""); setMgType(""); setSearch(""); setMinPop(""); setMaxGridDist(""); setPage(0);
  };

  const sel = useMemo(() => {
    const s = settlements.filter((s) => selectedRanks.has(s.rank));
    const discos = new Set(s.map((x) => x.disco));
    const states = new Set(s.map((x) => x.state));
    return {
      n: selectedRanks.size,
      conn: s.reduce((a, x) => a + x.connections, 0),
      demand: Math.round(s.reduce((a, x) => a + x.demand_kwh, 0)),
      pop: s.reduce((a, x) => a + x.population, 0),
      disco: discos.size === 1 ? [...discos][0] : "",
      state: states.size === 1 ? [...states][0] : "",
      discoCount: discos.size,
    };
  }, [settlements, selectedRanks]);

  const handleStartCreateLot = () => {
    setMode("selecting");
    setSelectedRanks(new Set());
    setLotSuffix("");
    setLotDisco("");
  };

  const handleEndSelection = () => {
    if (selectedRanks.size === 0) return;
    setMode("review");
  };

  const handleBackToSelecting = () => {
    setMode("selecting");
  };

  const handleCancel = () => {
    setMode("browse");
    setSelectedRanks(new Set());
    setLotSuffix("");
    setLotDisco("");
  };

  const lotPrefix = lotDisco ? `${lotDisco}-IMG-` : (sel.disco ? `${sel.disco}-IMG-` : "");
  const fullLotName = `${lotPrefix}${lotSuffix}`;
  const effectiveDisco = lotDisco || sel.disco;

  const handleCreateLotAndProceed = async () => {
    if (!lotSuffix.trim() || !effectiveDisco || selectedRanks.size === 0) return;
    setCreating(true);
    try {
      const lot = await api.lots.create({
        lot_name: fullLotName,
        disco: effectiveDisco,
        state: sel.state,
      });
      await api.lots.addSitesByRank(lot.id, Array.from(selectedRanks));
      await queryClient.invalidateQueries({ queryKey: ["lots"] });
      await queryClient.invalidateQueries({ queryKey: ["lot-site-assignments"] });
      setSelectedRanks(new Set());
      setMode("browse");
      setLotSuffix("");
      router.push("/system-sizing");
    } catch (e) {
      alert("Failed to create lot. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const pageRanksFilterable = settlements.filter((s) => !lotDisco || s.disco === lotDisco).map((s) => s.rank);
  const allPageSelected = mode === "selecting" && pageRanksFilterable.length > 0 && pageRanksFilterable.every((r) => selectedRanks.has(r));

  return (
    <div className="text-[13px]">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-base font-bold">Site Registry</h1>
          <p className="text-[11px] text-muted-foreground">
            {fmt(total)} settlements across {stats ? Object.keys(stats.by_disco || {}).length : 3} DisCos
            {mode === "selecting" && selectedRanks.size > 0 && (
              <> &middot; <span className="font-semibold text-primary">{selectedRanks.size} selected for lot</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mode === "browse" && !readOnly && (
            <Button size="sm" className="h-7 px-3 text-[11px]" onClick={handleStartCreateLot}>
              + Create Lot
            </Button>
          )}

          {mode === "selecting" && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {selectedRanks.size > 0
                  ? <>{fmt(sel.pop)} pop &middot; {fmt(sel.conn)} conn &middot; {fmt(sel.demand)} kWh/d</>
                  : "Select sites for this lot"}
              </span>
              {selectedRanks.size > 0 && (
                <Button size="sm" className="h-7 px-3 text-[11px]" onClick={handleEndSelection}>
                  End Site Selection ({selectedRanks.size} sites)
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          )}

          {mode === "review" && (
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">{lotPrefix}</span>
              <Input
                value={lotSuffix}
                onChange={(e) => setLotSuffix(e.target.value)}
                placeholder="Enter lot name..."
                className="h-7 w-40 text-[11px] px-1.5"
                onKeyDown={(e) => e.key === "Enter" && handleCreateLotAndProceed()}
                autoFocus
              />
              <span className="text-[10px] text-muted-foreground">{selectedRanks.size} sites &middot; {fmt(sel.conn)} conn</span>
              <Button size="sm" className="h-7 px-3 text-[11px]" onClick={handleCreateLotAndProceed} disabled={creating || !lotSuffix.trim()}>
                {creating ? "Creating..." : "Proceed to Preliminary Sizing →"}
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={handleBackToSelecting}>
                ← Back
              </Button>
              <button className="text-[10px] text-muted-foreground underline" onClick={handleCancel}>cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Mode-specific banner */}
      {mode === "selecting" && (
        <div className="mt-1.5 rounded border border-blue-200 bg-blue-50 px-3 py-1.5 flex items-center gap-3">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">1</span>
          <span className="text-[11px] font-medium text-blue-800">
            Select sites for the new lot.
            {lotDisco
              ? <> Filtering to <strong>{lotDisco}</strong> sites only.</>
              : " Select from a single DisCo. Once you pick the first site, only that DisCo's sites will be selectable."}
          </span>
          {sel.discoCount > 1 && (
            <span className="text-[11px] font-semibold text-amber-700">Sites must be from one DisCo only</span>
          )}
        </div>
      )}

      {mode === "review" && (
        <div className="mt-1.5 rounded border border-green-200 bg-green-50 px-3 py-1.5 flex items-center gap-3">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-[10px] font-bold text-white">2</span>
          <span className="text-[11px] font-medium text-green-800">
            <strong>{selectedRanks.size} sites</strong> selected from <strong>{effectiveDisco}</strong>.
            Enter a lot name and proceed to preliminary sizing.
          </span>
        </div>
      )}

      {/* Flow indicator */}
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded px-1.5 py-0.5 bg-primary/10 font-semibold text-primary">1</span>
        <span>Select sites</span>
        <span className="text-border">→</span>
        <span className="rounded bg-muted px-1.5 py-0.5">2</span>
        <span>System Sizing</span>
        <span className="text-border">→</span>
        <span className="rounded bg-muted px-1.5 py-0.5">3</span>
        <span>DisCo Approval</span>
        <span className="text-border">→</span>
        <span className="rounded bg-muted px-1.5 py-0.5">4</span>
        <span>Tenders</span>
      </div>

      {/* Existing lots strip */}
      {existingLots.length > 0 && mode === "browse" && (
        <div className="mt-2 flex items-center gap-2 rounded border border-border bg-white px-3 py-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lots</span>
          {existingLots.map((lot) => (
            <Badge key={lot.id} variant="secondary" className="text-[10px] px-1.5 py-0.5">
              {lot.lot_name} — {lot.site_count ?? 0} sites
            </Badge>
          ))}
        </div>
      )}

      {/* Scoring + stats strip */}
      <div className="mt-2 flex items-center gap-3 rounded border border-border bg-white px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Score</span>
        {[
          { n: "Population", w: 25 }, { n: "Wealth", w: 20 }, { n: "Demand", w: 25 },
          { n: "Security", w: 15 }, { n: "Grid Dist", w: 15 },
        ].map((c) => (
          <span key={c.n} className="text-[11px]">
            {c.n} <span className="rounded bg-primary/10 px-1 py-px text-[10px] font-bold text-primary">{c.w}%</span>
          </span>
        ))}
        <div className="ml-auto flex items-center gap-3 text-[11px] font-mono">
          {stats && (
            <>
              <span>Total <strong>{fmt(stats.total_settlements)}</strong></span>
              {(["AEDC", "KEDCO", "IE"] as const).map((d) => (
                <span
                  key={d}
                  className={`${role.disco ? "" : "cursor-pointer "}${disco === d ? "font-bold text-primary underline" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => { if (!role.disco) { setDisco(disco === d ? "" : d); setPage(0); } }}
                >
                  {d} <strong>{fmt(stats.by_disco?.[d]?.total ?? 0)}</strong>
                </span>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Map + List side by side */}
      <div className="mt-2 grid gap-2 lg:grid-cols-2">
        {/* Map */}
        <div className="rounded border border-border bg-white">
          <div className="flex items-center justify-between border-b border-border px-2 py-1">
            <span className="text-[11px] font-semibold">DisCo Concession Map</span>
            <span className="text-[10px] text-muted-foreground">
              {mode === "selecting"
                ? selectedRanks.size > 0
                  ? `${selectedRanks.size} sites selected for lot`
                  : "Click sites in the table to add to lot"
                : mode === "review"
                  ? `${selectedRanks.size} sites ready for lot creation`
                  : readOnly ? "View-only mode" : "Click 'Create Lot' to start building a lot"}
            </span>
          </div>
          <div className="h-[380px]">
            <SettlementMap
              settlements={settlements}
              selectedRanks={selectedRanks}
              onToggleSelect={toggleSelect}
              activeDisco={disco}
            />
          </div>
          <div className="h-[230px] border-t border-border">
            <AlfredChat />
          </div>
        </div>

        {/* Filters + Table */}
        <div className="flex flex-col rounded border border-border bg-white">
          {/* Pipeline filter pills */}
          <div className="flex items-center gap-1 border-b border-border px-2 py-1">
            {PIPELINE_FILTERS.map((f) => (
              <button
                key={f.key}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                  pipelineFilter === f.key
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                onClick={() => { setPipelineFilter(f.key); setPage(0); }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Compact filters */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
            {mode === "selecting" && !lotDisco ? (
              <select className="h-6 rounded border border-blue-300 bg-blue-50 px-1.5 text-[11px] font-medium text-blue-800" value={disco} onChange={(e) => { setDisco(e.target.value); setPage(0); }}>
                {DISCO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <select className="h-6 rounded border border-input bg-background px-1.5 text-[11px]" value={disco} onChange={(e) => { setDisco(e.target.value); setPage(0); }} disabled={(mode === "selecting" && !!lotDisco) || !!role.disco}>
                {DISCO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            <select className="h-6 rounded border border-input bg-background px-1.5 text-[11px]" value={mgType} onChange={(e) => { setMgType(e.target.value); setPage(0); }}>
              {MG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <Input placeholder="Search..." value={search} className="h-6 w-28 text-[11px] px-1.5" onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
            <Input placeholder="Min pop" value={minPop} className="h-6 w-16 text-[11px] px-1.5" type="number" onChange={(e) => { setMinPop(e.target.value); setPage(0); }} />
            <Input placeholder="Max km" value={maxGridDist} className="h-6 w-16 text-[11px] px-1.5" type="number" onChange={(e) => { setMaxGridDist(e.target.value); setPage(0); }} />
            <button className="text-[10px] text-muted-foreground underline" onClick={resetFilters}>reset</button>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>
            ) : settlements.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No matches. <button className="text-primary underline" onClick={resetFilters}>Reset</button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    {mode === "selecting" && (
                      <TableHead className="w-6 py-1">
                        <input type="checkbox" checked={allPageSelected} onChange={selectAllOnPage} />
                      </TableHead>
                    )}
                    <TableHead className="py-1 w-8">#</TableHead>
                    <TableHead className="py-1">Settlement</TableHead>
                    <TableHead className="py-1">Signal</TableHead>
                    <TableHead className="py-1">DisCo</TableHead>
                    <TableHead className="py-1 text-right">Pop</TableHead>
                    <TableHead className="py-1 text-right">kWh</TableHead>
                    <TableHead className="py-1 text-right">km</TableHead>
                    <TableHead className="py-1 text-right">Score</TableHead>
                    <TableHead className="py-1 text-center">Lot</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlements.map((s) => {
                    const disabledDisco = mode === "selecting" && lotDisco && s.disco !== lotDisco;
                    const isSelected = selectedRanks.has(s.rank);
                    return (
                      <TableRow
                        key={s.rank}
                        className={`text-[12px] ${
                          mode === "selecting"
                            ? disabledDisco
                              ? "opacity-30 cursor-not-allowed"
                              : isSelected
                                ? "bg-blue-50 cursor-pointer"
                                : "hover:bg-muted/40 cursor-pointer"
                            : mode === "review"
                              ? isSelected
                                ? "bg-green-50"
                                : "opacity-30"
                              : "hover:bg-muted/40"
                        }`}
                        onClick={() => {
                          if (mode === "selecting" && !disabledDisco) {
                            if (!lotDisco && !isSelected) {
                              setLotDisco(s.disco);
                              setDisco(s.disco);
                            }
                            toggleSelect(s.rank);
                          }
                        }}
                      >
                        {mode === "selecting" && (
                          <TableCell className="py-0.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={disabledDisco as boolean}
                              onChange={() => {
                                if (!disabledDisco) {
                                  if (!lotDisco && !isSelected) {
                                    setLotDisco(s.disco);
                                    setDisco(s.disco);
                                  }
                                  toggleSelect(s.rank);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </TableCell>
                        )}
                        <TableCell className="py-0.5 font-mono text-[10px] text-muted-foreground">{s.rank}</TableCell>
                        <TableCell className="py-0.5">
                          <span className="font-medium">{s.village}</span>
                          <span className="ml-1 text-[10px] text-muted-foreground">{s.lga}</span>
                        </TableCell>
                        <TableCell className="py-0.5">
                          {(() => {
                            const sig = getSignal(s.score);
                            const cfg = SIGNAL_CONFIG[sig];
                            return (
                              <span className={`inline-block rounded px-1.5 py-px text-[9px] font-bold ${cfg.bg} ${cfg.text}`}>
                                {cfg.label}
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="py-0.5 font-mono text-[10px]">{s.disco}</TableCell>
                        <TableCell className="py-0.5 text-right font-mono text-[11px]">{fmt(s.population)}</TableCell>
                        <TableCell className="py-0.5 text-right font-mono text-[11px]">{fmt(Math.round(s.demand_kwh * 1000))}</TableCell>
                        <TableCell className="py-0.5 text-right font-mono text-[11px]">{s.grid_dist_km.toFixed(1)}</TableCell>
                        <TableCell className="py-0.5 text-right">
                          <span className={`font-mono text-[11px] font-semibold ${s.score >= 70 ? "text-green-700" : s.score >= 50 ? "text-amber-700" : "text-red-700"}`}>
                            {s.score.toFixed(1)}
                          </span>
                        </TableCell>
                        <TableCell className="py-0.5 text-center">
                          {lotRanks.has(s.rank) ? (
                            <span className="inline-block rounded bg-primary/10 px-1.5 py-px text-[9px] font-bold text-primary">In Lot</span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Pagination */}
          {settlements.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-2 py-1">
              <span className="text-[10px] text-muted-foreground">
                {page * ps + 1}–{Math.min((page + 1) * ps, total)} of {fmt(total)}
              </span>
              <div className="flex gap-1">
                <button className="rounded border border-input px-1.5 py-0.5 text-[10px] disabled:opacity-30" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
                <button className="rounded border border-input px-1.5 py-0.5 text-[10px] disabled:opacity-30" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
