"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
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
const KWH_PER_CONN_DAY_TIER2 = 1.2;
const PUE_FRACTION = 0.15;

interface SizingResult {
  rank: number;
  village: string;
  state: string;
  lga: string;
  disco: string;
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
  disco: string,
): ScenarioResult {
  const connServed = Math.round(connections * fraction);
  const totalDailyDemand = (demandKwhYear / 365);
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

function computeSizing(s: any): SizingResult {
  const solarHours = SOLAR_HOURS[s.disco] ?? 4.8;
  return {
    rank: s.rank,
    village: s.village,
    state: s.state,
    lga: s.lga,
    disco: s.disco,
    population: s.population,
    connections: s.connections,
    demandKwhYear: s.demand_kwh,
    gridDistKm: s.grid_dist_km,
    score: s.score,
    solarHours,
    s1: computeScenario("50% Connections", 0.5, s.connections, s.demand_kwh, solarHours, s.disco),
    s2: computeScenario("100% Connections", 1.0, s.connections, s.demand_kwh, solarHours, s.disco),
  };
}

function PFSReport({ site, onClose }: { site: SizingResult; onClose: () => void }) {
  const s1 = site.s1;
  const s2 = site.s2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="relative mx-4 max-h-[90vh] w-full max-w-[800px] overflow-y-auto rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-3">
          <h2 className="font-heading text-base font-bold">Pre-Feasibility Study: {site.village}</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-sm hover:bg-muted">Close</button>
        </div>

        <div className="px-6 py-4 space-y-6 text-[12px]">
          {/* Page 1: Executive Summary */}
          <section>
            <h3 className="font-heading text-sm font-bold border-b pb-1 mb-2 text-primary">1. Executive Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p><strong>Site:</strong> {site.village}, {site.lga}, {site.state}</p>
                <p><strong>DisCo:</strong> {site.disco}</p>
                <p><strong>Population:</strong> {fmt(site.population)}</p>
                <p><strong>Potential Connections:</strong> {fmt(site.connections)}</p>
                <p><strong>Grid Distance:</strong> {site.gridDistKm.toFixed(1)} km</p>
                <p><strong>Site Score:</strong> {site.score.toFixed(1)}/100</p>
              </div>
              <div className="rounded border p-2 bg-muted/30">
                <p className="font-bold text-[11px] uppercase text-muted-foreground mb-1">Recommended Configuration</p>
                <p>Scenario 1 (50% connections) provides the optimal balance of cost efficiency and grid integration for the DARES IMG programme. Total CAPEX of {fmtUSD(s1.capexUsd)} serves {fmt(s1.connServed)} connections with an estimated LCOE of ${s1.lcoeUsd.toFixed(2)}/kWh.</p>
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
              </div>
              <div className="rounded border p-2">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Demographics</p>
                <p>Population: {fmt(site.population)}</p>
                <p>Est. Households: {fmt(Math.round(site.population / HH_SIZE))}</p>
                <p>Potential Connections: {fmt(site.connections)}</p>
                <p>Household Size: {HH_SIZE} persons</p>
              </div>
              <div className="rounded border p-2">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Solar Resource</p>
                <p>Peak Sun Hours: {site.solarHours.toFixed(1)} h/day</p>
                <p>Est. GHI: {(site.solarHours * 365 / 1000).toFixed(1)} MWh/m²/yr</p>
                <p>Grid Distance: {site.gridDistKm.toFixed(1)} km</p>
                <p>Interconnection: {site.gridDistKm <= 5 ? "Feasible" : site.gridDistKm <= 15 ? "Moderate cost" : "High cost"}</p>
              </div>
            </div>
          </section>

          {/* Page 3: Demand Analysis */}
          <section>
            <h3 className="font-heading text-sm font-bold border-b pb-1 mb-2 text-primary">3. Demand Analysis</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Load Profile (PUE-First Approach)</p>
                <p>Annual Demand: {fmt(site.demandKwhYear)} kWh/yr</p>
                <p>Daily Demand: {fmt(Math.round(site.demandKwhYear / 365))} kWh/day</p>
                <p>PUE Load ({(PUE_FRACTION * 100).toFixed(0)}% of total): {fmt(Math.round(site.demandKwhYear / 365 * PUE_FRACTION))} kWh/day</p>
                <p>Peak Demand: {(site.demandKwhYear / 365 / 5).toFixed(1)} kW</p>
                <p>Per Connection: {KWH_PER_CONN_DAY_TIER2.toFixed(1)} kWh/day (MTF Tier 2)</p>
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
            <h3 className="font-heading text-sm font-bold border-b pb-1 mb-2 text-primary">4. System Design</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded border p-3 bg-blue-50/30">
                <p className="text-[11px] font-bold text-blue-800 mb-1">Scenario 1 — 50% Connections</p>
                <div className="space-y-0.5">
                  <p>PV Array: <strong>{s1.pvKwp.toFixed(1)} kWp</strong></p>
                  <p>Battery (LFP): <strong>{s1.battKwh.toFixed(1)} kWh</strong> ({BATT_AUTONOMY_DAYS}d autonomy, {(BATT_DOD * 100).toFixed(0)}% DoD)</p>
                  <p>Inverter: <strong>{s1.invKva.toFixed(1)} kVA</strong> (×{INV_SAFETY} safety factor)</p>
                  <p>Smart Meters: {fmt(s1.connServed)} prepaid units</p>
                  <p>Grid Import Required: {s1.gridImportKwhDay.toFixed(0)} kWh/day</p>
                </div>
              </div>
              <div className="rounded border p-3 bg-amber-50/30">
                <p className="text-[11px] font-bold text-amber-800 mb-1">Scenario 2 — 100% Connections</p>
                <div className="space-y-0.5">
                  <p>PV Array: <strong>{s2.pvKwp.toFixed(1)} kWp</strong></p>
                  <p>Battery (LFP): <strong>{s2.battKwh.toFixed(1)} kWh</strong> ({BATT_AUTONOMY_DAYS}d autonomy, {(BATT_DOD * 100).toFixed(0)}% DoD)</p>
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
            <h3 className="font-heading text-sm font-bold border-b pb-1 mb-2 text-primary">5. Financial Analysis</h3>
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
                <tr><td className="py-0.5">DARES Grant/Conn (25%)</td><td className="text-right font-mono">{fmtUSD(s1.grantPerConn)}</td><td className="text-right font-mono">{fmtUSD(s2.grantPerConn)}</td></tr>
                <tr><td className="py-0.5">Grant Eligibility</td>
                  <td className="text-right"><span className={`rounded px-1 py-px text-[10px] font-medium ${s1.grantPerConn >= 350 && s1.grantPerConn <= 600 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{s1.grantPerConn >= 350 && s1.grantPerConn <= 600 ? "Eligible" : "Out of range"}</span></td>
                  <td className="text-right"><span className={`rounded px-1 py-px text-[10px] font-medium ${s2.grantPerConn >= 350 && s2.grantPerConn <= 600 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{s2.grantPerConn >= 350 && s2.grantPerConn <= 600 ? "Eligible" : "Out of range"}</span></td>
                </tr>
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-1">DARES PBG grant range: $350–$600 per connection. Project life: 25 years. LCOE benchmark: $0.30–$0.65/kWh (ESMAP).</p>
          </section>

          {/* Page 6: Risk Assessment */}
          <section>
            <h3 className="font-heading text-sm font-bold border-b pb-1 mb-2 text-primary">6. Risk Assessment & Recommendations</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Key Risks</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Grid arrival risk: {site.gridDistKm <= 5 ? "High (grid < 5 km)" : site.gridDistKm <= 15 ? "Moderate" : "Low (grid > 15 km)"}</li>
                  <li>ESIA category: {s2.pvKwp > 500 ? "Category 1 (Full ESIA)" : s2.pvKwp > 100 ? "Category 2 (ESMP)" : "Category 3 (Checklist)"}</li>
                  <li>DisCo settlement risk: {site.disco === "IE" ? "Moderate (Ikeja Electric payment history)" : "Standard"}</li>
                  <li>Exchange rate exposure: NGN revenue vs USD-denominated equipment</li>
                  <li>Demand growth uncertainty: 5% p.a. assumed (NPC 2023)</li>
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Recommendations</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Proceed with Scenario {s1.grantPerConn >= 350 && s1.grantPerConn <= 600 ? "1" : "2"} as base case for tender preparation</li>
                  <li>Prioritise PUE anchor identification during site due diligence</li>
                  <li>Conduct NERC concession application in parallel with tender</li>
                  <li>Verify grid interconnection feasibility with {site.disco} before final design</li>
                  <li>Include tariff escalation clause in PPA for NGN depreciation risk</li>
                </ul>
              </div>
            </div>
            <div className="mt-2 rounded border border-primary/20 bg-primary/5 p-2">
              <p className="text-[11px] font-medium text-primary">PFS Conclusion: {site.village} is {site.score >= 60 ? "recommended" : "conditionally recommended"} for DARES IMG programme inclusion.
                {s1.grantPerConn >= 350 && s1.grantPerConn <= 600
                  ? ` Grant per connection of ${fmtUSD(s1.grantPerConn)} falls within DARES PBG eligibility range.`
                  : ` Grant per connection requires adjustment to meet DARES PBG range ($350–$600).`
                }
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function SystemSizingPage() {
  const [disco, setDisco] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pfsRank, setPfsRank] = useState<number | null>(null);
  const ps = 50;

  const params: Record<string, string | number> = { limit: ps, offset: page * ps };
  if (disco) params.disco = disco;
  if (search) params.search = search;

  const { data, isLoading } = useQuery({
    queryKey: ["settlements-sizing", disco, search, page],
    queryFn: () => api.settlements.list(params),
  });

  const { data: stats } = useQuery({
    queryKey: ["settlement-stats"],
    queryFn: () => api.settlements.stats(),
  });

  const settlements = data?.settlements ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / ps);

  const sizingRows = useMemo(() => settlements.map(computeSizing), [settlements]);

  const pfsTarget = pfsRank !== null ? sizingRows.find((r) => r.rank === pfsRank) : null;

  const portfolioTotals = useMemo(() => {
    const rows = sizingRows;
    return {
      sites: rows.length,
      s1Pv: rows.reduce((a, r) => a + r.s1.pvKwp, 0),
      s1Batt: rows.reduce((a, r) => a + r.s1.battKwh, 0),
      s1Capex: rows.reduce((a, r) => a + r.s1.capexUsd, 0),
      s2Pv: rows.reduce((a, r) => a + r.s2.pvKwp, 0),
      s2Batt: rows.reduce((a, r) => a + r.s2.battKwh, 0),
      s2Capex: rows.reduce((a, r) => a + r.s2.capexUsd, 0),
    };
  }, [sizingRows]);

  return (
    <div className="text-[13px]">
      <div>
        <h1 className="font-heading text-base font-bold">Preliminary System Sizing — PFS Engine</h1>
        <p className="text-[11px] text-muted-foreground">
          PUE-first sizing approach (AfCEN Design Document v2) &middot; {fmt(total)} candidate sites
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

      {/* Scenario legend */}
      <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground">
        <div>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />
          <strong>Scenario 1:</strong> 50% of potential connections — grid import for remainder (PUE-first base case)
        </div>
        <div>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />
          <strong>Scenario 2:</strong> 100% of potential connections — full self-sufficiency with grid export
        </div>
      </div>

      {/* Page totals */}
      <div className="mt-2 grid grid-cols-3 md:grid-cols-6 gap-2">
        {[
          { label: "Sites on Page", value: `${sizingRows.length}` },
          { label: "S1 Total PV", value: `${fmt(portfolioTotals.s1Pv, 0)} kWp` },
          { label: "S1 Total Battery", value: `${fmt(portfolioTotals.s1Batt, 0)} kWh` },
          { label: "S1 Total CAPEX", value: fmtUSD(portfolioTotals.s1Capex) },
          { label: "S2 Total PV", value: `${fmt(portfolioTotals.s2Pv, 0)} kWp` },
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
        <Input placeholder="Search settlement..." value={search} className="h-6 w-36 text-[11px] px-1.5" onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        {stats && (
          <span className="ml-auto text-[10px] text-muted-foreground font-mono">
            Total: {fmt(stats.total_settlements)} &middot;
            AEDC {fmt(stats.by_disco?.AEDC?.total ?? 0)} &middot;
            KEDCO {fmt(stats.by_disco?.KEDCO?.total ?? 0)} &middot;
            IE {fmt(stats.by_disco?.IE?.total ?? 0)}
          </span>
        )}
      </div>

      {/* Main table */}
      <div className="mt-2 rounded border border-border bg-white">
        <div className="border-b border-border px-3 py-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold">Site-Level PFS Sizing (PV + Battery + Inverter)</span>
          <span className="text-[10px] text-muted-foreground">Cost basis: PV $600/kWp, Battery $310/kWh, Inverter $440/kVA</span>
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Loading settlement data...</div>
        ) : sizingRows.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">No settlements found.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead className="py-1.5 w-8">#</TableHead>
                  <TableHead className="py-1.5">Settlement</TableHead>
                  <TableHead className="py-1.5">DisCo</TableHead>
                  <TableHead className="py-1.5 text-right">Pop</TableHead>
                  <TableHead className="py-1.5 text-right">Conn</TableHead>
                  <TableHead className="py-1 text-center border-l border-border bg-blue-50/50" colSpan={4}>S1 — 50% Connections</TableHead>
                  <TableHead className="py-1 text-center border-l border-border bg-amber-50/50" colSpan={4}>S2 — 100% Connections</TableHead>
                  <TableHead className="py-1.5 w-16"></TableHead>
                </TableRow>
                <TableRow className="text-[10px]">
                  <TableHead className="py-0.5" colSpan={5}></TableHead>
                  <TableHead className="py-0.5 border-l border-border bg-blue-50/50">PV kWp</TableHead>
                  <TableHead className="py-0.5 bg-blue-50/50">Batt kWh</TableHead>
                  <TableHead className="py-0.5 bg-blue-50/50">Inv kVA</TableHead>
                  <TableHead className="py-0.5 bg-blue-50/50 text-right">CAPEX</TableHead>
                  <TableHead className="py-0.5 border-l border-border bg-amber-50/50">PV kWp</TableHead>
                  <TableHead className="py-0.5 bg-amber-50/50">Batt kWh</TableHead>
                  <TableHead className="py-0.5 bg-amber-50/50">Inv kVA</TableHead>
                  <TableHead className="py-0.5 bg-amber-50/50 text-right">CAPEX</TableHead>
                  <TableHead className="py-0.5"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sizingRows.map((row) => (
                  <TableRow key={row.rank} className="text-[11px] hover:bg-muted/30">
                    <TableCell className="py-0.5 font-mono text-[10px] text-muted-foreground">{row.rank}</TableCell>
                    <TableCell className="py-0.5">
                      <span className="font-medium">{row.village}</span>
                      <span className="ml-1 text-[10px] text-muted-foreground">{row.lga}</span>
                    </TableCell>
                    <TableCell className="py-0.5 font-mono text-[10px]">{row.disco}</TableCell>
                    <TableCell className="py-0.5 text-right font-mono text-[10px]">{fmt(row.population)}</TableCell>
                    <TableCell className="py-0.5 text-right font-mono text-[10px]">{fmt(row.connections)}</TableCell>
                    <TableCell className="py-0.5 border-l border-border font-mono text-[10px] text-blue-800">{row.s1.pvKwp.toFixed(1)}</TableCell>
                    <TableCell className="py-0.5 font-mono text-[10px] text-blue-800">{row.s1.battKwh.toFixed(0)}</TableCell>
                    <TableCell className="py-0.5 font-mono text-[10px] text-blue-800">{row.s1.invKva.toFixed(1)}</TableCell>
                    <TableCell className="py-0.5 text-right font-mono text-[10px] text-blue-800">{fmtUSD(row.s1.capexUsd)}</TableCell>
                    <TableCell className="py-0.5 border-l border-border font-mono text-[10px] text-amber-800">{row.s2.pvKwp.toFixed(1)}</TableCell>
                    <TableCell className="py-0.5 font-mono text-[10px] text-amber-800">{row.s2.battKwh.toFixed(0)}</TableCell>
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
        {settlements.length > 0 && (
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

      {/* Action to proceed */}
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="text-[10px] text-muted-foreground">Sizing complete — proceed to DisCo interconnection review</span>
        <Link href="/disco-readiness">
          <Button size="sm" className="h-6 px-3 text-[11px]">
            Submit to DisCo →
          </Button>
        </Link>
      </div>

      {/* PFS Modal */}
      {pfsTarget && <PFSReport site={pfsTarget} onClose={() => setPfsRank(null)} />}
    </div>
  );
}
