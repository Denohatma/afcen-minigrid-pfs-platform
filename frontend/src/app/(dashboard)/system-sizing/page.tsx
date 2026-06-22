"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useRole } from "@/lib/role-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

function fmt(n: number, dec = 0) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
}
function fmtUSD(n: number) {
  return "$" + fmt(n, 0);
}

const COST = {
  pvPerKwp: 600,
  battPerKwh: 310,
  invPerKva: 440,
  civilFixed: 22000,
  meterPerConn: 55,
  distributionPerConn: 280,
};

const SOLAR_HOURS: Record<string, number> = { KEDCO: 5.2, AEDC: 4.8, IE: 4.2 };
const BATT_DOD = 0.8;
const BATT_AUTONOMY_DAYS = 1;
const SYSTEM_EFF = 0.85;
const INV_SAFETY = 1.25;
const HH_SIZE = 5.0;
const PUE_FRACTION = 0.15;

interface SizingResult {
  rank: number;
  village: string;
  state: string;
  lga: string;
  disco: string;
  lotName: string;
  lotId: string;
  population: number;
  connections: number;
  demandKwhYear: number;
  gridDistKm: number;
  score: number;
  solarHours: number;
  s1: ScenarioResult;
  s2: ScenarioResult;
}

interface ScenarioResult {
  label: string;
  connServed: number;
  dailyDemandKwh: number;
  pvKwp: number;
  battKwh: number;
  invKva: number;
  capexUsd: number;
  lcoeUsd: number;
  grantPerConn: number;
  gridImportKwhDay: number;
  gridExportKwhDay: number;
}

function computeScenario(
  label: string,
  fraction: number,
  connections: number,
  demandKwhYear: number,
  solarHours: number,
): ScenarioResult {
  const connServed = Math.round(connections * fraction);
  const totalDailyDemand = demandKwhYear / 365;
  const dailyDemandKwh = totalDailyDemand * fraction;
  const pueDemand = dailyDemandKwh * PUE_FRACTION;
  const totalLoad = dailyDemandKwh + pueDemand;

  const pvKwp = totalLoad / (solarHours * SYSTEM_EFF);
  const battKwh = (totalLoad * BATT_AUTONOMY_DAYS) / BATT_DOD;
  const peakKw = totalLoad / 5;
  const invKva = peakKw * INV_SAFETY;

  const capexUsd = (pvKwp * COST.pvPerKwp) + (battKwh * COST.battPerKwh) +
    (invKva * COST.invPerKva) + COST.civilFixed +
    (connServed * COST.meterPerConn) + (connServed * COST.distributionPerConn);

  const lcoeUsd = connServed > 0 ? capexUsd / (totalLoad * 365 * 25) * 1.3 : 0;
  const grantPerConn = connServed > 0 ? Math.min(600, capexUsd * 0.25 / connServed) : 0;

  const gridImportKwhDay = fraction < 1 ? totalDailyDemand * (1 - fraction) : 0;
  const gridExportKwhDay = fraction >= 1 ? Math.max(0, (pvKwp * solarHours * SYSTEM_EFF) - totalLoad) * 0.3 : 0;

  return {
    label, connServed, dailyDemandKwh: totalLoad, pvKwp, battKwh, invKva,
    capexUsd, lcoeUsd, grantPerConn, gridImportKwhDay, gridExportKwhDay,
  };
}

function computeSizing(s: any, lotName: string, lotId: string): SizingResult {
  const solarHours = SOLAR_HOURS[s.disco] ?? 4.8;
  const demandKwh = s.demand_kwh * 1000;
  return {
    rank: s.rank,
    village: s.village,
    state: s.state,
    lga: s.lga,
    disco: s.disco,
    lotName,
    lotId,
    population: s.population,
    connections: s.connections,
    demandKwhYear: demandKwh,
    gridDistKm: s.grid_dist_km,
    score: s.score,
    solarHours,
    s1: computeScenario("50% Connections", 0.5, s.connections, demandKwh, solarHours),
    s2: computeScenario("100% Connections", 1.0, s.connections, demandKwh, solarHours),
  };
}

function PFSReport({ site, onClose }: { site: SizingResult; onClose: () => void }) {
  const s1 = site.s1;
  const s2 = site.s2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="relative mx-4 max-h-[90vh] w-full max-w-[800px] overflow-y-auto rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-3">
          <h2 className="font-heading text-base font-bold">DARES MST Pre-Feasibility Study: {site.village}</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-sm hover:bg-muted">Close</button>
        </div>

        <div className="px-6 py-4 space-y-6 text-[12px]">
          {/* Page 1: Executive Summary */}
          <section>
            <h3 className="font-heading text-sm font-bold border-b pb-1 mb-2 text-primary">1. Executive Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p><strong>Site:</strong> {site.village}, {site.lga}, {site.state}</p>
                <p><strong>DisCo Franchise:</strong> {site.disco}</p>
                <p><strong>MST Lot:</strong> {site.lotName}</p>
                <p><strong>Population:</strong> {fmt(site.population)}</p>
                <p><strong>Potential Connections:</strong> {fmt(site.connections)}</p>
                <p><strong>Grid Distance:</strong> {site.gridDistKm.toFixed(1)} km</p>
                <p><strong>Site Score:</strong> {site.score.toFixed(1)}/100</p>
              </div>
              <div className="rounded border p-2 bg-muted/30">
                <p className="font-bold text-[11px] uppercase text-muted-foreground mb-1">MST Recommendation</p>
                <p>This interconnected mini grid (IMG) site is assessed under DARES Component 1.1 — Minimum Subsidy Tender. Scenario 1 (50% connections) provides the optimal balance of subsidy efficiency and grid integration. Total CAPEX of {fmtUSD(s1.capexUsd)} serves {fmt(s1.connServed)} connections with an estimated LCOE of ${s1.lcoeUsd.toFixed(2)}/kWh. The developer will bid the minimum subsidy per connection required to build, operate and maintain the IMG.</p>
              </div>
            </div>
          </section>

          {/* Page 2: Site Assessment */}
          <section>
            <h3 className="font-heading text-sm font-bold border-b pb-1 mb-2 text-primary">2. Site Assessment</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded border p-2">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Location</p>
                <p>Community: {site.village}</p>
                <p>LGA: {site.lga}</p>
                <p>State: {site.state}</p>
                <p>DisCo Franchise: {site.disco}</p>
                <p>Grid Interconnection: {site.gridDistKm.toFixed(1)} km</p>
              </div>
              <div className="rounded border p-2">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Demographics</p>
                <p>Population: {fmt(site.population)}</p>
                <p>Est. Households: {fmt(Math.round(site.population / HH_SIZE))}</p>
                <p>Potential Connections: {fmt(site.connections)}</p>
                <p>MTF Target: Tier 2 (1.2 kWh/conn/day)</p>
              </div>
              <div className="rounded border p-2">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Solar Resource</p>
                <p>Peak Sun Hours: {site.solarHours.toFixed(1)} h/day</p>
                <p>Est. GHI: {(site.solarHours * 365 / 1000).toFixed(1)} MWh/m²/yr</p>
                <p>Interconnection: {site.gridDistKm <= 5 ? "Feasible (< 5 km)" : site.gridDistKm <= 15 ? "Moderate cost" : "High cost"}</p>
                <p>NERC Capacity: ≤ 1 MW (mini grid regs)</p>
              </div>
            </div>
          </section>

          {/* Page 3: Demand Analysis */}
          <section>
            <h3 className="font-heading text-sm font-bold border-b pb-1 mb-2 text-primary">3. Demand Analysis</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">PUE-First Load Profile</p>
                <p>Annual Demand: {fmt(site.demandKwhYear)} kWh/yr ({(site.demandKwhYear / 1000).toFixed(1)} MWh/yr)</p>
                <p>Daily Demand: {fmt(Math.round(site.demandKwhYear / 365))} kWh/day</p>
                <p>PUE Load ({(PUE_FRACTION * 100).toFixed(0)}% of total): {fmt(Math.round(site.demandKwhYear / 365 * PUE_FRACTION))} kWh/day</p>
                <p>Peak Demand: {(site.demandKwhYear / 365 / 5).toFixed(1)} kW</p>
                <p>PUE emphasis aligns with DARES PAD guidance on productive use for mini grid sustainability</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Demand by Scenario</p>
                <table className="w-full text-[11px]">
                  <thead><tr className="border-b"><th className="text-left py-0.5">Metric</th><th className="text-right py-0.5">S1 (50%)</th><th className="text-right py-0.5">S2 (100%)</th></tr></thead>
                  <tbody>
                    <tr><td>Connections Served</td><td className="text-right font-mono">{fmt(s1.connServed)}</td><td className="text-right font-mono">{fmt(s2.connServed)}</td></tr>
                    <tr><td>Daily Load (kWh)</td><td className="text-right font-mono">{fmt(Math.round(s1.dailyDemandKwh))}</td><td className="text-right font-mono">{fmt(Math.round(s2.dailyDemandKwh))}</td></tr>
                    <tr><td>Grid Import (kWh/d)</td><td className="text-right font-mono">{fmt(Math.round(s1.gridImportKwhDay))}</td><td className="text-right font-mono">{fmt(Math.round(s2.gridImportKwhDay))}</td></tr>
                    <tr><td>Grid Export (kWh/d)</td><td className="text-right font-mono">{fmt(Math.round(s1.gridExportKwhDay))}</td><td className="text-right font-mono">{fmt(Math.round(s2.gridExportKwhDay))}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Page 4: System Design */}
          <section>
            <h3 className="font-heading text-sm font-bold border-b pb-1 mb-2 text-primary">4. System Design — Solar Hybrid IMG</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded border p-3 bg-blue-50/30">
                <p className="text-[11px] font-bold text-blue-800 mb-1">Scenario 1 — 50% Connections (MST Base Case)</p>
                <div className="space-y-0.5">
                  <p>PV Array: <strong>{s1.pvKwp.toFixed(1)} kWp</strong></p>
                  <p>Battery (LFP): <strong>{s1.battKwh.toFixed(0)} kWh</strong> ({BATT_AUTONOMY_DAYS}d autonomy, {(BATT_DOD * 100).toFixed(0)}% DoD)</p>
                  <p>Inverter: <strong>{s1.invKva.toFixed(1)} kVA</strong> (×{INV_SAFETY} safety factor)</p>
                  <p>Smart Meters: {fmt(s1.connServed)} prepaid units</p>
                  <p>Grid Import: {s1.gridImportKwhDay.toFixed(0)} kWh/day via DisCo interconnection</p>
                </div>
              </div>
              <div className="rounded border p-3 bg-amber-50/30">
                <p className="text-[11px] font-bold text-amber-800 mb-1">Scenario 2 — 100% Connections</p>
                <div className="space-y-0.5">
                  <p>PV Array: <strong>{s2.pvKwp.toFixed(1)} kWp</strong></p>
                  <p>Battery (LFP): <strong>{s2.battKwh.toFixed(0)} kWh</strong> ({BATT_AUTONOMY_DAYS}d autonomy, {(BATT_DOD * 100).toFixed(0)}% DoD)</p>
                  <p>Inverter: <strong>{s2.invKva.toFixed(1)} kVA</strong> (×{INV_SAFETY} safety factor)</p>
                  <p>Smart Meters: {fmt(s2.connServed)} prepaid units</p>
                  <p>Grid Export Potential: {s2.gridExportKwhDay.toFixed(0)} kWh/day</p>
                </div>
              </div>
            </div>
            <div className="mt-2 rounded border p-2 bg-muted/30">
              <p className="text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Design Parameters (AfCEN Standard)</p>
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                <p>PV: ${COST.pvPerKwp}/kWp</p>
                <p>Battery: ${COST.battPerKwh}/kWh</p>
                <p>Inverter: ${COST.invPerKva}/kVA</p>
                <p>Civil: ${fmt(COST.civilFixed)}</p>
                <p>Meter: ${COST.meterPerConn}/conn</p>
                <p>Distribution: ${COST.distributionPerConn}/conn</p>
                <p>System Eff: {(SYSTEM_EFF * 100).toFixed(0)}%</p>
                <p>Solar Hours: {site.solarHours.toFixed(1)}h</p>
              </div>
            </div>
          </section>

          {/* Page 5: Financial Analysis */}
          <section>
            <h3 className="font-heading text-sm font-bold border-b pb-1 mb-2 text-primary">5. Financial Analysis — MST Grant Sizing</h3>
            <table className="w-full text-[11px]">
              <thead><tr className="border-b font-bold"><th className="text-left py-1">Parameter</th><th className="text-right py-1">S1 (50%)</th><th className="text-right py-1">S2 (100%)</th></tr></thead>
              <tbody className="divide-y">
                <tr><td className="py-0.5">Total CAPEX</td><td className="text-right font-mono">{fmtUSD(s1.capexUsd)}</td><td className="text-right font-mono">{fmtUSD(s2.capexUsd)}</td></tr>
                <tr><td className="py-0.5">PV Cost</td><td className="text-right font-mono">{fmtUSD(s1.pvKwp * COST.pvPerKwp)}</td><td className="text-right font-mono">{fmtUSD(s2.pvKwp * COST.pvPerKwp)}</td></tr>
                <tr><td className="py-0.5">Battery Cost</td><td className="text-right font-mono">{fmtUSD(s1.battKwh * COST.battPerKwh)}</td><td className="text-right font-mono">{fmtUSD(s2.battKwh * COST.battPerKwh)}</td></tr>
                <tr><td className="py-0.5">Inverter Cost</td><td className="text-right font-mono">{fmtUSD(s1.invKva * COST.invPerKva)}</td><td className="text-right font-mono">{fmtUSD(s2.invKva * COST.invPerKva)}</td></tr>
                <tr><td className="py-0.5">Distribution + Meters</td><td className="text-right font-mono">{fmtUSD(s1.connServed * (COST.meterPerConn + COST.distributionPerConn))}</td><td className="text-right font-mono">{fmtUSD(s2.connServed * (COST.meterPerConn + COST.distributionPerConn))}</td></tr>
                <tr className="font-medium"><td className="py-0.5">LCOE (est.)</td><td className="text-right font-mono">${s1.lcoeUsd.toFixed(2)}/kWh</td><td className="text-right font-mono">${s2.lcoeUsd.toFixed(2)}/kWh</td></tr>
                <tr><td className="py-0.5">CAPEX per Connection</td><td className="text-right font-mono">{fmtUSD(s1.connServed > 0 ? s1.capexUsd / s1.connServed : 0)}</td><td className="text-right font-mono">{fmtUSD(s2.connServed > 0 ? s2.capexUsd / s2.connServed : 0)}</td></tr>
                <tr><td className="py-0.5">MST Grant/Conn (25% CAPEX)</td><td className="text-right font-mono">{fmtUSD(s1.grantPerConn)}</td><td className="text-right font-mono">{fmtUSD(s2.grantPerConn)}</td></tr>
                <tr><td className="py-0.5">PBG Eligibility</td>
                  <td className="text-right"><span className={`rounded px-1 py-px text-[10px] font-medium ${s1.grantPerConn >= 350 && s1.grantPerConn <= 600 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{s1.grantPerConn >= 350 && s1.grantPerConn <= 600 ? "Eligible" : "Out of range"}</span></td>
                  <td className="text-right"><span className={`rounded px-1 py-px text-[10px] font-medium ${s2.grantPerConn >= 350 && s2.grantPerConn <= 600 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{s2.grantPerConn >= 350 && s2.grantPerConn <= 600 ? "Eligible" : "Out of range"}</span></td>
                </tr>
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-1">DARES MST: developers bid minimum subsidy per connection. PBG grant range: $350–$600/conn. Grant disbursed in two tranches per DARES PIM. LCOE benchmark: $0.30–$0.65/kWh (ESMAP). Project life: 25 years.</p>
          </section>

          {/* Page 6: Risk Assessment */}
          <section>
            <h3 className="font-heading text-sm font-bold border-b pb-1 mb-2 text-primary">6. Risk Assessment & MST Recommendations</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Key Risks</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Grid arrival risk: {site.gridDistKm <= 5 ? "High (grid < 5 km)" : site.gridDistKm <= 15 ? "Moderate" : "Low (grid > 15 km)"}</li>
                  <li>NERC capacity limit: {s2.pvKwp > 1000 ? "Exceeds 1 MW — franchising regs apply" : "Within 1 MW mini grid regs"}</li>
                  <li>ESIA category: {s2.pvKwp > 500 ? "Category 1 (Full ESIA)" : s2.pvKwp > 100 ? "Category 2 (ESMP)" : "Category 3 (Checklist)"}</li>
                  <li>DisCo settlement risk: {site.disco === "IE" ? "Moderate (Ikeja Electric)" : "Standard"}</li>
                  <li>FX exposure: NGN tariff revenue vs USD equipment cost</li>
                  <li>12-month Milestone 1 deadline per DARES PIM</li>
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">MST Tender Recommendations</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Proceed with Scenario {s1.grantPerConn >= 350 && s1.grantPerConn <= 600 ? "1" : "2"} as MST base case</li>
                  <li>PUE anchor identification during site due diligence (DARES PAD §13)</li>
                  <li>NERC concession application on portfolio basis (PBC 3.1)</li>
                  <li>Tripartite agreement with {site.disco} per PBC 3.3</li>
                  <li>Include tariff escalation clause in PPA for NGN depreciation</li>
                  <li>DisCo 12-month expansion notice required (PBC 3.2)</li>
                </ul>
              </div>
            </div>
            <div className="mt-2 rounded border border-primary/20 bg-primary/5 p-2">
              <p className="text-[11px] font-medium text-primary">MST PFS Conclusion: {site.village} is {site.score >= 60 ? "recommended" : "conditionally recommended"} for DARES IMG programme under the Minimum Subsidy Tender mechanism.
                {s1.grantPerConn >= 350 && s1.grantPerConn <= 600
                  ? ` Indicative grant of ${fmtUSD(s1.grantPerConn)}/connection falls within the DARES PBG eligibility range ($350–$600).`
                  : ` Grant per connection requires adjustment to meet DARES PBG range ($350–$600).`
                }
                {` This IMG will interconnect with the ${site.disco} grid at ${site.gridDistKm.toFixed(1)} km, operating under NERC mini grid regulations with islanding capability.`}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function SystemSizingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { role, isReadOnly } = useRole();
  const readOnly = isReadOnly("sizing");
  const [disco, setDisco] = useState(role.disco ?? "");
  const [lotFilter, setLotFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pfsRank, setPfsRank] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const ps = 50;

  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ["lot-site-assignments"],
    queryFn: () => api.lots.siteAssignments(),
  });

  const assignments = assignmentsData?.assignments ?? [];

  const rankToLot = useMemo(() => {
    const map = new Map<number, { lotName: string; lotId: string; disco: string }>();
    for (const a of assignments) {
      if (a.settlement_rank != null) {
        map.set(a.settlement_rank, { lotName: a.lot_name, lotId: a.lot_id, disco: a.disco });
      }
    }
    return map;
  }, [assignments]);

  const lotNames = useMemo(() => {
    const names = new Set<string>();
    for (const a of assignments) names.add(a.lot_name);
    return Array.from(names).sort();
  }, [assignments]);

  const assignedRanks = useMemo(() => new Set(rankToLot.keys()), [rankToLot]);

  const params: Record<string, string | number> = { limit: 25000, offset: 0 };
  if (disco) params.disco = disco;

  const { data, isLoading } = useQuery({
    queryKey: ["settlements-sizing-all", disco],
    queryFn: () => api.settlements.list(params),
  });

  const allSettlements = data?.settlements ?? [];

  const filteredSizingRows = useMemo(() => {
    let filtered = allSettlements.filter((s: any) => assignedRanks.has(s.rank));

    if (lotFilter) {
      const lotRanks = new Set<number>();
      for (const [rank, info] of rankToLot) {
        if (info.lotName === lotFilter) lotRanks.add(rank);
      }
      filtered = filtered.filter((s: any) => lotRanks.has(s.rank));
    }

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((s: any) =>
        s.village.toLowerCase().includes(q) || s.lga.toLowerCase().includes(q)
      );
    }

    return filtered.map((s: any) => {
      const lot = rankToLot.get(s.rank);
      return computeSizing(s, lot?.lotName ?? "", lot?.lotId ?? "");
    });
  }, [allSettlements, assignedRanks, rankToLot, lotFilter, search]);

  const total = filteredSizingRows.length;
  const totalPages = Math.ceil(total / ps);
  const sizingRows = filteredSizingRows.slice(page * ps, (page + 1) * ps);

  const pfsTarget = pfsRank !== null ? filteredSizingRows.find((r) => r.rank === pfsRank) : null;

  const portfolioTotals = useMemo(() => {
    const rows = filteredSizingRows;
    return {
      sites: rows.length,
      totalConn: rows.reduce((a, r) => a + r.connections, 0),
      s1PvMw: rows.reduce((a, r) => a + r.s1.pvKwp, 0) / 1000,
      s1BattMwh: rows.reduce((a, r) => a + r.s1.battKwh, 0) / 1000,
      s1Capex: rows.reduce((a, r) => a + r.s1.capexUsd, 0),
      s2PvMw: rows.reduce((a, r) => a + r.s2.pvKwp, 0) / 1000,
      s2BattMwh: rows.reduce((a, r) => a + r.s2.battKwh, 0) / 1000,
      s2Capex: rows.reduce((a, r) => a + r.s2.capexUsd, 0),
    };
  }, [filteredSizingRows]);

  const allSelected = sizingRows.length > 0 && sizingRows.every((r) => selected.has(r.rank));

  function toggleAll() {
    if (allSelected) {
      const next = new Set(selected);
      for (const r of sizingRows) next.delete(r.rank);
      setSelected(next);
    } else {
      const next = new Set(selected);
      for (const r of sizingRows) next.add(r.rank);
      setSelected(next);
    }
  }

  function toggleOne(rank: number) {
    const next = new Set(selected);
    if (next.has(rank)) next.delete(rank);
    else next.add(rank);
    setSelected(next);
  }

  const noLots = !assignmentsLoading && assignments.length === 0;

  return (
    <div className="text-[13px]">
      <div>
        <h1 className="font-heading text-base font-bold">DARES MST — Preliminary System Sizing</h1>
        <p className="text-[11px] text-muted-foreground">
          Minimum Subsidy Tender PFS engine (PUE-first, AfCEN Design v2) &middot; {fmt(total)} lot-assigned sites
        </p>
      </div>

      {/* Flow indicator */}
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">1</span>
        <span>Sites & Lots</span>
        <span className="text-border">→</span>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">2</span>
        <span>System Sizing</span>
        <span className="text-border">→</span>
        <span className="rounded bg-muted px-1.5 py-0.5">3</span>
        <span>DisCo Approval</span>
        <span className="text-border">→</span>
        <span className="rounded bg-muted px-1.5 py-0.5">4</span>
        <span>MST Tender</span>
      </div>

      {/* Scenario legend */}
      <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground">
        <div>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />
          <strong>Scenario 1:</strong> 50% of connections — grid-interconnected IMG with DisCo import (MST base case)
        </div>
        <div>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />
          <strong>Scenario 2:</strong> 100% of connections — full DER self-sufficiency with grid export
        </div>
      </div>

      {noLots ? (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-sm font-medium text-amber-800">No lot assignments found</p>
          <p className="mt-1 text-[11px] text-amber-700">Go to <Link href="/sites" className="underline font-semibold">Sites</Link> and click <strong>Create Lot</strong> to select sites, then proceed to preliminary sizing. Only lot-assigned sites appear here.</p>
        </div>
      ) : (
        <>
          {/* Portfolio totals */}
          <div className="mt-2 grid grid-cols-4 md:grid-cols-8 gap-2">
            {[
              { label: "Lot Sites", value: `${portfolioTotals.sites}` },
              { label: "Total Connections", value: fmt(portfolioTotals.totalConn) },
              { label: "S1 Total PV", value: `${portfolioTotals.s1PvMw.toFixed(2)} MW` },
              { label: "S1 Total Battery", value: `${portfolioTotals.s1BattMwh.toFixed(1)} MWh` },
              { label: "S1 Total CAPEX", value: fmtUSD(portfolioTotals.s1Capex) },
              { label: "S2 Total PV", value: `${portfolioTotals.s2PvMw.toFixed(2)} MW` },
              { label: "S2 Total Battery", value: `${portfolioTotals.s2BattMwh.toFixed(1)} MWh` },
              { label: "S2 Total CAPEX", value: fmtUSD(portfolioTotals.s2Capex) },
            ].map((s) => (
              <div key={s.label} className="rounded border border-border bg-white px-2 py-1.5">
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
                <div className="font-heading text-sm font-bold leading-tight">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="mt-2 flex items-center gap-2">
            <select className="h-6 rounded border border-input bg-background px-1.5 text-[11px]" value={disco} onChange={(e) => { setDisco(e.target.value); setPage(0); }}>
              <option value="">All DisCos</option>
              <option value="AEDC">AEDC</option>
              <option value="KEDCO">KEDCO</option>
              <option value="IE">IE</option>
            </select>
            <select className="h-6 rounded border border-input bg-background px-1.5 text-[11px]" value={lotFilter} onChange={(e) => { setLotFilter(e.target.value); setPage(0); }}>
              <option value="">All Lots</option>
              {lotNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <Input placeholder="Search settlement..." value={search} className="h-6 w-36 text-[11px] px-1.5" onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
            <span className="ml-auto text-[10px] text-muted-foreground font-mono">
              {selected.size > 0 && <span className="mr-2 text-primary font-semibold">{selected.size} selected</span>}
              Showing {fmt(total)} lot-assigned sites
            </span>
          </div>

          {/* Main table */}
          <div className="mt-2 rounded border border-border bg-white">
            <div className="border-b border-border px-3 py-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold">MST Site-Level PFS Sizing (PV + Battery + Inverter)</span>
              <span className="text-[10px] text-muted-foreground">Cost basis: PV $600/kWp, Battery $310/kWh, Inverter $440/kVA</span>
            </div>
            {isLoading || assignmentsLoading ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Loading lot-assigned settlements...</div>
            ) : sizingRows.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No lot-assigned settlements match the current filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[10px]">
                      {!readOnly && (
                        <TableHead className="py-1.5 w-8">
                          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3 w-3 accent-primary" />
                        </TableHead>
                      )}
                      <TableHead className="py-1.5 w-8">#</TableHead>
                      <TableHead className="py-1.5">Settlement</TableHead>
                      <TableHead className="py-1.5">Lot</TableHead>
                      <TableHead className="py-1.5">DisCo</TableHead>
                      <TableHead className="py-1.5 text-right">Pop</TableHead>
                      <TableHead className="py-1.5 text-right">Conn</TableHead>
                      <TableHead className="py-1 text-center border-l border-border bg-blue-50/50" colSpan={4}>S1 — 50% Connections</TableHead>
                      <TableHead className="py-1 text-center border-l border-border bg-amber-50/50" colSpan={4}>S2 — 100% Connections</TableHead>
                      <TableHead className="py-1.5 w-16"></TableHead>
                    </TableRow>
                    <TableRow className="text-[10px]">
                      <TableHead className="py-0.5" colSpan={readOnly ? 6 : 7}></TableHead>
                      <TableHead className="py-0.5 border-l border-border bg-blue-50/50">PV kW</TableHead>
                      <TableHead className="py-0.5 bg-blue-50/50">Batt kWh</TableHead>
                      <TableHead className="py-0.5 bg-blue-50/50">Inv kVA</TableHead>
                      <TableHead className="py-0.5 bg-blue-50/50 text-right">CAPEX</TableHead>
                      <TableHead className="py-0.5 border-l border-border bg-amber-50/50">PV kW</TableHead>
                      <TableHead className="py-0.5 bg-amber-50/50">Batt kWh</TableHead>
                      <TableHead className="py-0.5 bg-amber-50/50">Inv kVA</TableHead>
                      <TableHead className="py-0.5 bg-amber-50/50 text-right">CAPEX</TableHead>
                      <TableHead className="py-0.5"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sizingRows.map((row) => (
                      <TableRow key={row.rank} className={`text-[11px] hover:bg-muted/30 ${!readOnly && selected.has(row.rank) ? "bg-primary/5" : ""}`}>
                        {!readOnly && (
                          <TableCell className="py-0.5">
                            <input type="checkbox" checked={selected.has(row.rank)} onChange={() => toggleOne(row.rank)} className="h-3 w-3 accent-primary" />
                          </TableCell>
                        )}
                        <TableCell className="py-0.5 font-mono text-[10px] text-muted-foreground">{row.rank}</TableCell>
                        <TableCell className="py-0.5">
                          <span className="font-medium">{row.village}</span>
                          <span className="ml-1 text-[10px] text-muted-foreground">{row.lga}</span>
                        </TableCell>
                        <TableCell className="py-0.5 text-[10px]">{row.lotName}</TableCell>
                        <TableCell className="py-0.5 font-mono text-[10px]">{row.disco}</TableCell>
                        <TableCell className="py-0.5 text-right font-mono text-[10px]">{fmt(row.population)}</TableCell>
                        <TableCell className="py-0.5 text-right font-mono text-[10px]">{fmt(row.connections)}</TableCell>
                        <TableCell className="py-0.5 border-l border-border font-mono text-[10px] text-blue-800">{row.s1.pvKwp.toFixed(1)}</TableCell>
                        <TableCell className="py-0.5 font-mono text-[10px] text-blue-800">{fmt(row.s1.battKwh)}</TableCell>
                        <TableCell className="py-0.5 font-mono text-[10px] text-blue-800">{row.s1.invKva.toFixed(1)}</TableCell>
                        <TableCell className="py-0.5 text-right font-mono text-[10px] text-blue-800">{fmtUSD(row.s1.capexUsd)}</TableCell>
                        <TableCell className="py-0.5 border-l border-border font-mono text-[10px] text-amber-800">{row.s2.pvKwp.toFixed(1)}</TableCell>
                        <TableCell className="py-0.5 font-mono text-[10px] text-amber-800">{fmt(row.s2.battKwh)}</TableCell>
                        <TableCell className="py-0.5 font-mono text-[10px] text-amber-800">{row.s2.invKva.toFixed(1)}</TableCell>
                        <TableCell className="py-0.5 text-right font-mono text-[10px] text-amber-800">{fmtUSD(row.s2.capexUsd)}</TableCell>
                        <TableCell className="py-0.5">
                          <button
                            onClick={() => setPfsRank(row.rank)}
                            className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-medium text-white hover:bg-primary/90"
                          >
                            View PFS
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {sizingRows.length > 0 && (
              <div className="flex items-center justify-between border-t border-border px-3 py-1.5">
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

          {/* Action bar */}
          {!readOnly && (
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {selected.size > 0
                ? `${selected.size} site(s) reviewed — approve sizing and submit lot(s) to DisCo interconnection review`
                : "Select sites to approve their sizing, then submit to DisCo review"}
            </span>
            <Button
              size="sm"
              className="h-6 px-3 text-[11px]"
              disabled={selected.size === 0 || submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  const lotIds = new Set<string>();
                  for (const rank of selected) {
                    const lot = rankToLot.get(rank);
                    if (lot) lotIds.add(lot.lotId);
                  }
                  await Promise.all(
                    Array.from(lotIds).map((id) =>
                      api.lots.update(id, { disco_status: "submitted" } as any)
                    )
                  );
                  await queryClient.invalidateQueries({ queryKey: ["lots"] });
                  router.push("/disco-readiness");
                } catch {
                  alert("Failed to submit. Please try again.");
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? "Submitting..." : "Approve Sizing & Submit to DisCo →"}
            </Button>
          </div>
          )}
        </>
      )}

      {/* PFS Modal */}
      {pfsTarget && <PFSReport site={pfsTarget} onClose={() => setPfsRank(null)} />}
    </div>
  );
}
