"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
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

const RISK_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export default function SitesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [disco, setDisco] = useState("");
  const [mgType, setMgType] = useState("");
  const [search, setSearch] = useState("");
  const [minPop, setMinPop] = useState("");
  const [maxGridDist, setMaxGridDist] = useState("");
  const [page, setPage] = useState(0);
  const [selectedRanks, setSelectedRanks] = useState<Set<number>>(new Set());
  const [lotSuffix, setLotSuffix] = useState("");
  const [showLotForm, setShowLotForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const ps = 50;

  const params: Record<string, string | number> = { limit: ps, offset: page * ps };
  if (disco) params.disco = disco;
  if (mgType) params.mg_type = mgType;
  if (search) params.search = search;
  if (minPop) params.min_pop = parseInt(minPop) || 0;
  if (maxGridDist) params.max_grid_dist = parseFloat(maxGridDist) || 100;

  const { data, isLoading } = useQuery({
    queryKey: ["settlements", disco, mgType, search, minPop, maxGridDist, page],
    queryFn: () => api.settlements.list(params),
  });

  const { data: stats } = useQuery({
    queryKey: ["settlement-stats"],
    queryFn: () => api.settlements.stats(),
  });

  const settlements = data?.settlements ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / ps);

  const toggleSelect = useCallback((rank: number) => {
    setSelectedRanks((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) next.delete(rank);
      else next.add(rank);
      return next;
    });
  }, []);

  const selectAll = () => {
    setSelectedRanks(
      selectedRanks.size === settlements.length
        ? new Set()
        : new Set(settlements.map((s) => s.rank))
    );
  };

  const resetFilters = () => {
    setDisco(""); setMgType(""); setSearch(""); setMinPop(""); setMaxGridDist(""); setPage(0);
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

  const lotPrefix = sel.disco ? `${sel.disco}-IMG-` : "";
  const fullLotName = `${lotPrefix}${lotSuffix}`;

  const handleCreateLot = async () => {
    if (!lotSuffix.trim() || !sel.disco) return;
    setCreating(true);
    try {
      const lot = await api.lots.create({
        lot_name: fullLotName,
        disco: sel.disco,
        state: sel.state,
      });
      await api.lots.update(lot.id, {
        site_count: sel.n,
        total_connections: sel.conn,
      } as any);
      await queryClient.invalidateQueries({ queryKey: ["lots"] });
      setSelectedRanks(new Set());
      setShowLotForm(false);
      setLotSuffix("");
      router.push("/system-sizing");
    } catch (e) {
      alert("Failed to create lot. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="text-[13px]">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-base font-bold">Site Registry</h1>
          <p className="text-[11px] text-muted-foreground">
            {fmt(total)} settlements across {stats ? Object.keys(stats.by_disco || {}).length : 3} DisCos
            {selectedRanks.size > 0 && (
              <> &middot; <span className="font-semibold text-primary">{selectedRanks.size} selected</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedRanks.size > 0 && !showLotForm && (
            <>
              <span className="text-[11px] text-muted-foreground">
                {fmt(sel.pop)} pop &middot; {fmt(sel.conn)} conn &middot; {fmt(sel.demand)} kWh/d
              </span>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setSelectedRanks(new Set())}>
                Clear
              </Button>
              {sel.discoCount > 1 ? (
                <span className="text-[11px] text-amber-700">Select sites from one DisCo only</span>
              ) : (
                <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => { setShowLotForm(true); setLotSuffix(""); }}>
                  Proceed to Preliminary Sizing →
                </Button>
              )}
            </>
          )}
          {showLotForm && (
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">{lotPrefix}</span>
              <Input
                value={lotSuffix}
                onChange={(e) => setLotSuffix(e.target.value)}
                placeholder="Lot name..."
                className="h-6 w-36 text-[11px] px-1.5"
                onKeyDown={(e) => e.key === "Enter" && handleCreateLot()}
                autoFocus
              />
              <span className="text-[10px] text-muted-foreground">{sel.n} sites &middot; {fmt(sel.conn)} conn</span>
              <Button size="sm" className="h-6 px-2 text-[11px]" onClick={handleCreateLot} disabled={creating || !lotSuffix.trim()}>
                {creating ? "Creating..." : "Proceed to Sizing →"}
              </Button>
              <button className="text-[10px] text-muted-foreground underline" onClick={() => setShowLotForm(false)}>cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Flow indicator */}
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">1</span>
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
                  className={`cursor-pointer ${disco === d ? "font-bold text-primary underline" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => { setDisco(disco === d ? "" : d); setPage(0); }}
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
              {selectedRanks.size > 0
                ? `${selectedRanks.size} sites selected for lot`
                : "Select sites from the table to create a lot"}
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
          {/* Compact filters */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
            <select className="h-6 rounded border border-input bg-background px-1.5 text-[11px]" value={disco} onChange={(e) => { setDisco(e.target.value); setPage(0); }}>
              {DISCO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
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
                    <TableHead className="w-6 py-1"><input type="checkbox" checked={settlements.length > 0 && selectedRanks.size === settlements.length} onChange={selectAll} /></TableHead>
                    <TableHead className="py-1 w-8">#</TableHead>
                    <TableHead className="py-1">Settlement</TableHead>
                    <TableHead className="py-1">DisCo</TableHead>
                    <TableHead className="py-1 text-right">Pop</TableHead>
                    <TableHead className="py-1 text-right">kWh</TableHead>
                    <TableHead className="py-1 text-right">km</TableHead>
                    <TableHead className="py-1 text-right">Score</TableHead>
                    <TableHead className="py-1">Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlements.map((s) => (
                    <TableRow
                      key={s.rank}
                      className={`cursor-pointer text-[12px] ${selectedRanks.has(s.rank) ? "bg-primary/5" : "hover:bg-muted/40"}`}
                      onClick={() => toggleSelect(s.rank)}
                    >
                      <TableCell className="py-0.5"><input type="checkbox" checked={selectedRanks.has(s.rank)} onChange={() => toggleSelect(s.rank)} onClick={(e) => e.stopPropagation()} /></TableCell>
                      <TableCell className="py-0.5 font-mono text-[10px] text-muted-foreground">{s.rank}</TableCell>
                      <TableCell className="py-0.5">
                        <span className="font-medium">{s.village}</span>
                        <span className="ml-1 text-[10px] text-muted-foreground">{s.lga}</span>
                      </TableCell>
                      <TableCell className="py-0.5 font-mono text-[10px]">{s.disco}</TableCell>
                      <TableCell className="py-0.5 text-right font-mono text-[11px]">{fmt(s.population)}</TableCell>
                      <TableCell className="py-0.5 text-right font-mono text-[11px]">{Math.round(s.demand_kwh)}</TableCell>
                      <TableCell className="py-0.5 text-right font-mono text-[11px]">{s.grid_dist_km.toFixed(1)}</TableCell>
                      <TableCell className="py-0.5 text-right">
                        <span className={`font-mono text-[11px] font-semibold ${s.score >= 70 ? "text-green-700" : s.score >= 50 ? "text-amber-700" : "text-red-700"}`}>
                          {s.score.toFixed(1)}
                        </span>
                      </TableCell>
                      <TableCell className="py-0.5">
                        <span className={`inline-block rounded px-1 py-px text-[9px] font-medium ${RISK_COLORS[s.security_risk] ?? "bg-gray-100 text-gray-700"}`}>
                          {s.security_risk}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
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
