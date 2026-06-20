"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
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
  const [disco, setDisco] = useState("");
  const [mgType, setMgType] = useState("");
  const [search, setSearch] = useState("");
  const [minPop, setMinPop] = useState("");
  const [maxGridDist, setMaxGridDist] = useState("");
  const [page, setPage] = useState(0);
  const [selectedRanks, setSelectedRanks] = useState<Set<number>>(new Set());
  const [discoRequest, setDiscoRequest] = useState<string | null>(null);
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
    return {
      n: selectedRanks.size,
      conn: s.reduce((a, x) => a + x.connections, 0),
      demand: Math.round(s.reduce((a, x) => a + x.demand_kwh, 0)),
      pop: s.reduce((a, x) => a + x.population, 0),
    };
  }, [settlements, selectedRanks]);

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
          {selectedRanks.size > 0 && (
            <>
              <span className="text-[11px] text-muted-foreground">
                {fmt(sel.pop)} pop &middot; {fmt(sel.conn)} conn &middot; {fmt(sel.demand)} kWh/d
              </span>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setSelectedRanks(new Set())}>
                Clear
              </Button>
              <Link href="/lots">
                <Button size="sm" className="h-6 px-2 text-[11px]">Create Lot →</Button>
              </Link>
            </>
          )}
        </div>
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
            {discoRequest ? (
              <span className="flex items-center gap-1">
                <Badge className="bg-green-100 text-green-800 text-[10px] py-0">Sent to {discoRequest}</Badge>
                <button className="text-[10px] text-muted-foreground underline" onClick={() => setDiscoRequest(null)}>reset</button>
              </span>
            ) : (
              <button
                className={`text-[10px] ${selectedRanks.size > 0 ? "text-primary font-semibold" : "text-muted-foreground"}`}
                disabled={selectedRanks.size === 0}
                onClick={() => setDiscoRequest(disco || settlements.find((s) => selectedRanks.has(s.rank))?.disco || "DisCo")}
              >
                {selectedRanks.size > 0 ? `Request ${disco || "DisCo"} Approval →` : "Select sites to request DisCo data"}
              </button>
            )}
          </div>
          <div className="h-[480px]">
            <SettlementMap
              settlements={settlements}
              selectedRanks={selectedRanks}
              onToggleSelect={toggleSelect}
              activeDisco={disco}
            />
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
