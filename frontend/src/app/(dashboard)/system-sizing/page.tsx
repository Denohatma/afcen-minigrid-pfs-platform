"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function fmt(n: number, dec = 0) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(n);
}

interface SizingRow {
  lotId: string;
  lotName: string;
  siteName: string;
  population: number;
  disco: string;
  demandKwh: number;
  connections: number;
  s1PvKw: number;
  s1ImportMw: number;
  s1ImportMwhDay: number;
  s2PvKw: number;
  s2ExportMw: number;
  s2ExportMwhDay: number;
}

function computeSizing(settlement: any, lotId: string, lotName: string): SizingRow {
  const pop = settlement.population || 0;
  const demandKwh = settlement.demand_kwh || 0;
  const connections = settlement.connections || 0;

  const dailyDemandKwh = demandKwh / 365;
  const peakDemandKw = dailyDemandKwh / 5;
  const solarHours = 4.5;

  // Scenario 1: High Import — minigrid serves 50% of connections, imports the rest
  const s1FractionServed = 0.5;
  const s1DemandKwh = dailyDemandKwh * s1FractionServed;
  const s1PvKw = s1DemandKwh / solarHours;
  const s1ImportKw = peakDemandKw * (1 - s1FractionServed);
  const s1ImportKwhDay = dailyDemandKwh * (1 - s1FractionServed);

  // Scenario 2: High Export — minigrid covers full demand + exports surplus during troughs
  const s2OverBuildFactor = 1.8;
  const s2PvKw = (dailyDemandKwh / solarHours) * s2OverBuildFactor;
  const s2GenerationKwhDay = s2PvKw * solarHours;
  const s2ExcessKwhDay = Math.max(0, s2GenerationKwhDay - dailyDemandKwh);
  const s2ExportKw = s2ExcessKwhDay / solarHours;

  return {
    lotId,
    lotName,
    siteName: settlement.village || settlement.name || "Unknown",
    population: pop,
    disco: settlement.disco || "",
    demandKwh,
    connections,
    s1PvKw,
    s1ImportMw: s1ImportKw / 1000,
    s1ImportMwhDay: s1ImportKwhDay / 1000,
    s2PvKw,
    s2ExportMw: s2ExportKw / 1000,
    s2ExportMwhDay: s2ExcessKwhDay / 1000,
  };
}

export default function SystemSizingPage() {
  const queryClient = useQueryClient();

  const { data: lotsData, isLoading: lotsLoading } = useQuery({
    queryKey: ["lots"],
    queryFn: () => api.lots.list({}),
  });

  const { data: settlementsData, isLoading: settLoading } = useQuery({
    queryKey: ["settlements", "all"],
    queryFn: () => api.settlements.list({ limit: 24000 }),
  });

  const lots = lotsData?.lots ?? [];
  const settlements = settlementsData?.settlements ?? [];

  const pendingLots = lots.filter(
    (l) => (l.disco_status || "pending") === "pending" || l.disco_status === "approved"
  );

  const sizingRows = useMemo(() => {
    if (!pendingLots.length || !settlements.length) return [];

    const rows: SizingRow[] = [];
    for (const lot of pendingLots) {
      if (!lot.site_count) continue;
      const lotSettlements = settlements.filter(
        (s: any) => s.disco === lot.disco && (lot.state ? s.state === lot.state : true)
      );

      const sitesToShow = lotSettlements.slice(0, lot.site_count);
      for (const s of sitesToShow) {
        rows.push(computeSizing(s, lot.id, lot.lot_name));
      }
    }
    return rows;
  }, [pendingLots, settlements]);

  const isLoading = lotsLoading || settLoading;

  const totalS1Import = sizingRows.reduce((s, r) => s + r.s1ImportMwhDay, 0);
  const totalS2Export = sizingRows.reduce((s, r) => s + r.s2ExportMwhDay, 0);
  const totalPvS1 = sizingRows.reduce((s, r) => s + r.s1PvKw, 0);
  const totalPvS2 = sizingRows.reduce((s, r) => s + r.s2PvKw, 0);

  return (
    <div className="text-[13px]">
      <div>
        <h1 className="font-heading text-base font-bold">System Sizing — PFS Scenarios</h1>
        <p className="text-[11px] text-muted-foreground">
          Preliminary sizing for DisCo interconnection review &middot; {sizingRows.length} sites across {pendingLots.length} lots
        </p>
      </div>

      {/* Flow indicator */}
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">1</span>
        <span>Sites</span>
        <span className="text-border">→</span>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">2</span>
        <span>System Sizing</span>
        <span className="text-border">→</span>
        <span className="rounded bg-muted px-1.5 py-0.5">3</span>
        <span>DisCo Approval</span>
        <span className="text-border">→</span>
        <span className="rounded bg-muted px-1.5 py-0.5">4</span>
        <span>Tenders</span>
      </div>

      {/* Compact stats */}
      <div className="mt-2 grid grid-cols-4 gap-2">
        {[
          { label: "Sites Sized", value: sizingRows.length },
          { label: "S1 Total PV (kWp)", value: fmt(totalPvS1, 0) },
          { label: "S1 Peak Import (MWh/day)", value: fmt(totalS1Import, 2) },
          { label: "S2 Peak Export (MWh/day)", value: fmt(totalS2Export, 2) },
        ].map((s) => (
          <div key={s.label} className="rounded border border-border bg-white px-3 py-1.5">
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
            <div className="font-heading text-lg font-bold leading-tight">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Scenario legend */}
      <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground">
        <div>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />
          <strong>Scenario 1 (High Import):</strong> Minigrid serves 50% of connections, imports remainder from grid
        </div>
        <div>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />
          <strong>Scenario 2 (High Export):</strong> Minigrid sized for full demand (1.8×), exports surplus during low-demand periods
        </div>
      </div>

      {/* Main table */}
      <div className="mt-2 rounded border border-border bg-white">
        <div className="border-b border-border px-3 py-1.5">
          <span className="text-[11px] font-semibold">Site-Level System Sizing</span>
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Loading settlement data...</div>
        ) : sizingRows.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No lots to size. <Link href="/sites" className="text-primary underline">Create a lot</Link> on the Sites page first.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead className="py-1.5" rowSpan={2}>Lot Name</TableHead>
                  <TableHead className="py-1.5" rowSpan={2}>Site Name</TableHead>
                  <TableHead className="py-1.5 text-right" rowSpan={2}>Pop.</TableHead>
                  <TableHead className="py-1 text-center border-l border-border bg-blue-50/50" colSpan={3}>
                    Scenario 1 — High Import
                  </TableHead>
                  <TableHead className="py-1 text-center border-l border-border bg-amber-50/50" colSpan={3}>
                    Scenario 2 — High Export
                  </TableHead>
                </TableRow>
                <TableRow className="text-[10px]">
                  <TableHead className="py-1 border-l border-border bg-blue-50/50">PV (kWp)</TableHead>
                  <TableHead className="py-1 bg-blue-50/50 text-right">Import (MW)</TableHead>
                  <TableHead className="py-1 bg-blue-50/50 text-right">Import (MWh/d)</TableHead>
                  <TableHead className="py-1 border-l border-border bg-amber-50/50">PV (kWp)</TableHead>
                  <TableHead className="py-1 bg-amber-50/50 text-right">Export (MW)</TableHead>
                  <TableHead className="py-1 bg-amber-50/50 text-right">Export (MWh/d)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sizingRows.map((row, i) => (
                  <TableRow key={`${row.lotId}-${row.siteName}-${i}`} className="text-[11px]">
                    <TableCell className="py-1 font-medium text-[11px]">{row.lotName}</TableCell>
                    <TableCell className="py-1 text-[11px]">
                      <div>{row.siteName}</div>
                    </TableCell>
                    <TableCell className="py-1 text-right font-mono text-[10px]">{fmt(row.population)}</TableCell>
                    <TableCell className="py-1 border-l border-border font-mono text-[10px] text-blue-800">{fmt(row.s1PvKw, 1)}</TableCell>
                    <TableCell className="py-1 text-right font-mono text-[10px] text-blue-800">{fmt(row.s1ImportMw, 3)}</TableCell>
                    <TableCell className="py-1 text-right font-mono text-[10px] text-blue-800">{fmt(row.s1ImportMwhDay, 3)}</TableCell>
                    <TableCell className="py-1 border-l border-border font-mono text-[10px] text-amber-800">{fmt(row.s2PvKw, 1)}</TableCell>
                    <TableCell className="py-1 text-right font-mono text-[10px] text-amber-800">{fmt(row.s2ExportMw, 3)}</TableCell>
                    <TableCell className="py-1 text-right font-mono text-[10px] text-amber-800">{fmt(row.s2ExportMwhDay, 3)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Action to proceed */}
      {sizingRows.length > 0 && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="text-[10px] text-muted-foreground">Sizing complete — proceed to DisCo interconnection review</span>
          <Link href="/disco-readiness">
            <Button size="sm" className="h-6 px-3 text-[11px]">
              Submit to DisCo →
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
