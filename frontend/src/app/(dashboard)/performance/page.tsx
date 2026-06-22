"use client";

import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MELSubmission, MELLearningEntry, MELTarget } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}
function fmtD(n: number, d = 1) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}
function fmtUSD(n: number) {
  return "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtM(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const STATUS_COLORS: Record<string, string> = {
  verified: "bg-green-100 text-green-800",
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-800",
  superseded: "bg-gray-100 text-gray-600",
};

const TAG_COLORS: Record<string, string> = {
  productive_use: "bg-emerald-100 text-emerald-800",
  reliability: "bg-blue-100 text-blue-800",
  gesi: "bg-purple-100 text-purple-800",
  generator_displacement: "bg-orange-100 text-orange-800",
  tariff: "bg-amber-100 text-amber-800",
  community: "bg-pink-100 text-pink-800",
  technical: "bg-cyan-100 text-cyan-800",
  commercial: "bg-indigo-100 text-indigo-800",
  financing: "bg-teal-100 text-teal-800",
  esia_es: "bg-rose-100 text-rose-800",
  interconnection: "bg-sky-100 text-sky-800",
  replication: "bg-lime-100 text-lime-800",
};

// ── DARES PAD Results Framework (Section VII) ──────────────────

interface RFIndicator {
  id: string;
  name: string;
  unit: string;
  isCRI?: boolean;
  isPBC?: boolean;
  isSub?: boolean;
  baseline: number | string;
  p1: number | string;   // Jun/2024
  p2: number | string;   // Jun/2025
  p3: number | string;   // Jun/2026
  p4: number | string;   // Jun/2027
  closing: number | string; // Dec/2028
}

const PDO_INDICATORS: RFIndicator[] = [
  { id: "people_new_improved", name: "People provided with new or improved electricity service", unit: "Number", isCRI: true, baseline: 0, p1: 2628652, p2: 5257304, p3: 9638391, p4: 140190478, closing: 17524348 },
  { id: "people_new_improved_female", name: "People — Female", unit: "Number", isCRI: true, isSub: true, baseline: 0, p1: 1296188, p2: 2592377, p3: 4752691, p4: 6913005, closing: 8641256 },
  { id: "hh_new_elec", name: "Households with new electricity services", unit: "Number", isSub: true, baseline: 0, p1: 486735, p2: 973470, p3: 1784695, p4: 2595920, closing: 3244900 },
  { id: "hh_improved_elec", name: "Households with improved electricity services", unit: "Number", isSub: true, baseline: 0, p1: 38995, p2: 77991, p3: 142983, p4: 207976, closing: 259970 },
  { id: "fhh_new_elec", name: "Female-headed HH with new electricity services (100% FHH)", unit: "Number", isSub: true, baseline: 0, p1: 73010, p2: 146021, p3: 267704, p4: 389388, closing: 486735 },
  { id: "fhh_improved_elec", name: "Female-headed HH with improved electricity services (100% FHH)", unit: "Number", isSub: true, baseline: 0, p1: 5849, p2: 11699, p3: 21447, p4: 31196, closing: 38996 },
  { id: "gen_capacity_mw", name: "Generation capacity of energy constructed or rehabilitated", unit: "MW", isCRI: true, baseline: 0, p1: 70, p2: 140, p3: 256, p4: 372, closing: 465 },
  { id: "re_gen_capacity_mw", name: "Renewable energy generation capacity (other than hydropower)", unit: "MW", isCRI: true, isSub: true, baseline: 0, p1: 70, p2: 140, p3: 256, p4: 372, closing: 465 },
  { id: "net_ghg", name: "Net GHG emissions", unit: "Metric ton", baseline: 0, p1: 0, p2: 0, p3: 0, p4: 0, closing: -16242863 },
  { id: "msme_services", name: "MSMEs provided with new and improved electricity services", unit: "Number", baseline: 0, p1: 35548, p2: 71096, p3: 130342, p4: 189588, closing: 236986 },
  { id: "msme_female", name: "Female-managed MSMEs with new/improved services", unit: "Number", isSub: true, baseline: 0, p1: 10664, p2: 21329, p3: 39103, p4: 56877, closing: 71096 },
];

const COMP1_INDICATORS: RFIndicator[] = [
  { id: "c1_grant_agreements", name: "Grant agreements signed", unit: "Number", baseline: 0, p1: 200, p2: 500, p3: 900, p4: 1295, closing: 1295 },
  { id: "c1_isolated_mg", name: "Isolated mini grids commissioned", unit: "Number", baseline: 0, p1: 100, p2: 300, p3: 600, p4: 1000, closing: 1170 },
  { id: "c1_generators_replaced", name: "Gasoline generator sets replaced", unit: "Number", baseline: 0, p1: 0, p2: 59000, p3: 155000, p4: 223000, closing: 288000 },
  { id: "c1_img_commissioned", name: "Interconnected mini grids commissioned", unit: "Number", baseline: 0, p1: 0, p2: 30, p3: 40, p4: 55, closing: 125 },
  { id: "c1_private_capital_mg", name: "Private capital mobilized for mini grids", unit: "US$", baseline: 0, p1: 91950000, p2: 184000000, p3: 337150000, p4: 490400000, closing: 613000000 },
  { id: "c1_public_rooftop", name: "Public institutions electrified with rooftop solar", unit: "Number", baseline: 0, p1: 0, p2: 10, p3: 20, p4: 30, closing: 30 },
  { id: "c1_nesip", name: "Presidential approval for NESIP", unit: "Text", isPBC: true, baseline: "No plan", p1: "N/A", p2: "Plan prepared", p3: "N/A", p4: "N/A", closing: "Approved" },
  { id: "c1_rea_biz_plan", name: "Adoption and operationalization of new business plan for REA", unit: "Text", isPBC: true, baseline: "Insufficient", p1: "N/A", p2: "Prepared & adopted", p3: "KPIs satisfied", p4: "KPIs satisfied", closing: "KPIs improved" },
  { id: "c1_reg_framework", name: "Improved regulatory framework", unit: "Text", isPBC: true, baseline: "Insufficient", p1: "N/A", p2: "NERC revised", p3: "Permit limit revised", p4: "N/A", closing: "Framework in place" },
];

const COMP2_INDICATORS: RFIndicator[] = [
  { id: "c2_grant_agreements", name: "Grant agreements signed (SAS)", unit: "Number", baseline: 0, p1: 50, p2: 75, p3: 100, p4: 115, closing: 130 },
  { id: "c2_shs_deployed", name: "Solar home systems deployed", unit: "Number", baseline: 0, p1: 550000, p2: 1100000, p3: 1650000, p4: 2200000, closing: 2750000 },
  { id: "c2_pue_deployed", name: "PUE systems deployed", unit: "Number", baseline: 0, p1: 15000, p2: 30000, p3: 45000, p4: 60000, closing: 75000 },
  { id: "c2_women_employed", name: "Women employed by Standalone Solar companies", unit: "%", baseline: 0, p1: 15, p2: 15, p3: 20, p4: 25, closing: 30 },
  { id: "c2_private_capital_shs", name: "Private capital mobilized for solar home systems", unit: "US$", baseline: 0, p1: 62250000, p2: 124500000, p3: 228250000, p4: 332000000, closing: 415000000 },
];

const COMP3_INDICATORS: RFIndicator[] = [
  { id: "c3_geospatial", name: "Geospatial planning platform for mini grids", unit: "Yes/No", baseline: "No", p1: "Yes", p2: "Yes", p3: "Yes", p4: "Yes", closing: "Yes" },
  { id: "c3_img_pipeline", name: "Pipeline of interconnected mini grid projects prepared", unit: "Yes/No", baseline: "No", p1: "No", p2: "Yes", p3: "Yes", p4: "Yes", closing: "Yes" },
  { id: "c3_skills_program", name: "Skills development program for solar supply chain", unit: "Yes/No", baseline: "No", p1: "No", p2: "Yes", p3: "Yes", p4: "Yes", closing: "Yes" },
  { id: "c3_states_ta", name: "Qualified states receiving technical assistance", unit: "Number", baseline: 0, p1: 1, p2: 1, p3: 2, p4: 2, closing: 3 },
  { id: "c3_dre_advisor", name: "DRE expert/advisor embedded at at least one DisCo", unit: "Yes/No", baseline: "No", p1: "Yes", p2: "Yes", p3: "Yes", p4: "Yes", closing: "Yes" },
  { id: "c3_satisfaction", name: "Survey respondents reporting satisfaction with project benefits", unit: "%", baseline: 0, p1: 0, p2: 0, p3: 70, p4: 0, closing: 70 },
  { id: "c3_grievances", name: "Project related grievances registered and addressed", unit: "%", baseline: 0, p1: 60, p2: 70, p3: 80, p4: 90, closing: 95 },
];

function ProgressBar({ actual, target, label }: { actual: number; target: number; label: string }) {
  const pct = target > 0 ? Math.min((actual / target) * 100, 100) : 0;
  const color = pct >= 80 ? "bg-green-600" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{fmtD(actual, 0)} / {fmtD(target, 0)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-right text-[10px] text-muted-foreground">{fmtD(pct, 1)}%</div>
    </div>
  );
}

function RFTable({ title, indicators, highlight }: { title: string; indicators: RFIndicator[]; highlight?: string }) {
  return (
    <div className="rounded border border-border bg-white">
      <div className="border-b border-border px-3 py-1.5 bg-muted/30">
        <span className="text-[11px] font-semibold">{title}</span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-[10px]">
              <TableHead className="py-1 w-[320px]">Indicator</TableHead>
              <TableHead className="py-1 text-center w-16">Unit</TableHead>
              <TableHead className="py-1 text-right w-24 bg-gray-50">Baseline<br/><span className="font-normal text-muted-foreground">May/2023</span></TableHead>
              <TableHead className="py-1 text-right w-24">Period 1<br/><span className="font-normal text-muted-foreground">Jun/2024</span></TableHead>
              <TableHead className="py-1 text-right w-24">Period 2<br/><span className="font-normal text-muted-foreground">Jun/2025</span></TableHead>
              <TableHead className="py-1 text-right w-24">Period 3<br/><span className="font-normal text-muted-foreground">Jun/2026</span></TableHead>
              <TableHead className="py-1 text-right w-24">Period 4<br/><span className="font-normal text-muted-foreground">Jun/2027</span></TableHead>
              <TableHead className="py-1 text-right w-24 bg-primary/5 font-bold">Closing<br/><span className="font-normal text-muted-foreground">Dec/2028</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {indicators.map((ind) => {
              const isText = typeof ind.baseline === "string";
              const formatVal = (v: number | string) => {
                if (typeof v === "string") return v;
                if (ind.unit === "US$") return fmtM(v);
                if (ind.unit === "%") return `${v}%`;
                if (ind.unit === "Metric ton" && v < 0) return fmt(v);
                return fmt(v);
              };
              return (
                <TableRow key={ind.id} className={`text-[11px] ${ind.isSub ? "bg-muted/10" : ""} ${highlight === ind.id ? "bg-primary/5" : ""}`}>
                  <TableCell className={`py-0.5 ${ind.isSub ? "pl-6 text-muted-foreground" : "font-medium"}`}>
                    {ind.isSub && <span className="mr-1 text-muted-foreground/50">↳</span>}
                    {ind.name}
                    {ind.isCRI && <Badge className="ml-1 text-[8px] px-1 py-0 bg-blue-100 text-blue-700">CRI</Badge>}
                    {ind.isPBC && <Badge className="ml-1 text-[8px] px-1 py-0 bg-purple-100 text-purple-700">PBC</Badge>}
                  </TableCell>
                  <TableCell className="py-0.5 text-center text-[10px] text-muted-foreground">{ind.unit}</TableCell>
                  <TableCell className="py-0.5 text-right font-mono text-[10px] bg-gray-50">{formatVal(ind.baseline)}</TableCell>
                  <TableCell className="py-0.5 text-right font-mono text-[10px]">{formatVal(ind.p1)}</TableCell>
                  <TableCell className="py-0.5 text-right font-mono text-[10px]">{formatVal(ind.p2)}</TableCell>
                  <TableCell className="py-0.5 text-right font-mono text-[10px]">{formatVal(ind.p3)}</TableCell>
                  <TableCell className="py-0.5 text-right font-mono text-[10px]">{formatVal(ind.p4)}</TableCell>
                  <TableCell className="py-0.5 text-right font-mono text-[10px] font-bold bg-primary/5">{formatVal(ind.closing)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SubmissionDetailPanel({ sub }: { sub: MELSubmission }) {
  return (
    <div className="bg-muted/30 border-t px-4 py-3 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
        <div>
          <span className="text-muted-foreground">Type:</span>{" "}
          <span className="font-medium">{sub.submission_type.replace(/_/g, " ")}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Completeness:</span>{" "}
          <span className="font-mono font-medium">{fmtD(sub.data_completeness_pct ?? 0)}%</span>
        </div>
        <div>
          <span className="text-muted-foreground">Created:</span>{" "}
          <span className="font-medium">{sub.created_at ? new Date(sub.created_at).toLocaleDateString() : "—"}</span>
        </div>
        {sub.verified_at && (
          <div>
            <span className="text-muted-foreground">Verified:</span>{" "}
            <span className="font-medium">{new Date(sub.verified_at).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded border bg-white p-2 space-y-1">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Access (PDO Ind. 1)</h4>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <div>HH: <span className="font-mono">{fmt(sub.hh_connected ?? 0)}</span></div>
            <div>MSME: <span className="font-mono">{fmt(sub.msme_connected ?? 0)}</span></div>
            <div>Anchors: <span className="font-mono">{fmt(sub.anchor_connected ?? 0)}</span></div>
            <div>New: <span className="font-mono">{fmt(sub.new_connections_this_period ?? 0)}</span></div>
          </div>
        </div>
        <div className="rounded border bg-white p-2 space-y-1">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground">GESI (PDO Gender Disagg.)</h4>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <div>Female HH: <span className="font-mono">{fmt(sub.female_hh_connected ?? 0)}</span></div>
            <div>Female %: <span className="font-mono">{fmtD(sub.female_hh_pct ?? 0)}%</span></div>
            <div>Women MSME: <span className="font-mono">{fmt(sub.women_led_msme ?? 0)}</span></div>
            <div>Vulnerable: <span className="font-mono">{fmt(sub.vulnerable_hh ?? 0)}</span></div>
          </div>
        </div>
        <div className="rounded border bg-white p-2 space-y-1">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Reliability (IVA KPIs)</h4>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <div>Supply: <span className="font-mono">{fmtD(sub.supply_hours_per_day ?? 0)}h</span></div>
            <div>Avail: <span className="font-mono">{fmtD(sub.system_availability_pct ?? 0)}%</span></div>
            <div>SAIDI: <span className="font-mono">{fmtD(sub.saidi_minutes ?? 0)} min</span></div>
            <div>SAIFI: <span className="font-mono">{fmt(sub.saifi_events ?? 0)}</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded border bg-white p-2 space-y-1">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Energy & GHG (PDO Ind. 2-3)</h4>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <div>Generated: <span className="font-mono">{fmt(sub.kwh_generated ?? 0)} kWh</span></div>
            <div>Sold: <span className="font-mono">{fmt(sub.kwh_sold ?? 0)} kWh</span></div>
            <div>CO₂: <span className="font-mono">{fmtD(sub.co2_avoided_tco2e ?? 0)} tCO₂e</span></div>
            <div>Gen displaced: <span className="font-mono">{fmt(sub.diesel_generators_decommissioned ?? 0)}</span></div>
          </div>
        </div>
        <div className="rounded border bg-white p-2 space-y-1">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Economic (MST Viability)</h4>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <div>ARPU: <span className="font-mono">{fmtUSD(sub.arpu_usd ?? 0)}</span></div>
            <div>Revenue: <span className="font-mono">{fmtUSD(sub.total_revenue_usd ?? 0)}</span></div>
            <div>Collection: <span className="font-mono">{fmtD(sub.collection_rate_pct ?? 0)}%</span></div>
            <div>Jobs: <span className="font-mono">{fmt(sub.direct_jobs_created ?? 0)}</span></div>
          </div>
        </div>
        <div className="rounded border bg-white p-2 space-y-1">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Productive Use (PUE-First)</h4>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <div>PUE anchors: <span className="font-mono">{fmt(sub.pue_anchors_operational ?? 0)}</span></div>
            <div>PUE kWh: <span className="font-mono">{fmt(sub.productive_use_kwh ?? 0)}</span></div>
          </div>
          {sub.pue_categories && sub.pue_categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {sub.pue_categories.map((c) => (
                <span key={c} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] text-emerald-700 font-medium">{c}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {(sub.key_observation || sub.challenges_faced) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sub.key_observation && (
            <div className="rounded border bg-white p-2">
              <h4 className="text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Key Observation</h4>
              <p className="text-[11px] text-foreground">{sub.key_observation}</p>
            </div>
          )}
          {sub.challenges_faced && (
            <div className="rounded border bg-white p-2">
              <h4 className="text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Challenges</h4>
              <p className="text-[11px] text-foreground">{sub.challenges_faced}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PerformancePage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const queryClient = useQueryClient();

  const { data: dashData } = useQuery({
    queryKey: ["mel-dashboard"],
    queryFn: () => api.mel.dashboard(),
  });

  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ["mel-submissions", statusFilter],
    queryFn: () => api.mel.submissions(statusFilter ? { status: statusFilter } : {}),
  });

  const { data: logData } = useQuery({
    queryKey: ["mel-learning-log"],
    queryFn: () => api.mel.learningLog(),
  });

  const { data: targetData } = useQuery({
    queryKey: ["mel-targets"],
    queryFn: () => api.mel.targets(),
  });

  const verifyMut = useMutation({
    mutationFn: (id: string) => api.mel.verify(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mel-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["mel-dashboard"] });
    },
  });

  const dash = dashData;
  const submissions = subData?.submissions ?? [];
  const learningEntries = logData?.entries ?? [];
  const targets = targetData?.targets ?? [];
  const indicators = dash?.indicators ?? {};

  return (
    <div>
      <div>
        <h1 className="font-heading text-lg font-bold">DARES Monitoring, Evaluation & Learning</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          PDO Results Framework (PAD Section VII) &middot; IVA verification &middot; Smart meter data &middot; Developer declarations
        </p>
      </div>

      {/* KPI Cards — aligned to PDO indicators */}
      {dash && (
        <div className="mt-3 grid gap-2 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
          <Card className="p-2">
            <p className="text-[9px] text-muted-foreground uppercase leading-tight">PDO 1: HH Connected</p>
            <p className="text-lg font-bold font-heading text-primary">{fmt(dash.total_hh_connected)}</p>
            <p className="text-[9px] text-muted-foreground font-mono">/ 3,244,900</p>
          </Card>
          <Card className="p-2">
            <p className="text-[9px] text-muted-foreground uppercase leading-tight">PDO 4: MSMEs</p>
            <p className="text-lg font-bold font-heading text-primary">{fmt(dash.total_msme_connected)}</p>
            <p className="text-[9px] text-muted-foreground font-mono">/ 236,986</p>
          </Card>
          <Card className="p-2">
            <p className="text-[9px] text-muted-foreground uppercase leading-tight">GESI: Female HH</p>
            <p className="text-lg font-bold font-heading text-purple-700">{fmt(dash.total_female_hh)}</p>
            <p className="text-[9px] text-muted-foreground font-mono">/ 486,735</p>
          </Card>
          <Card className="p-2">
            <p className="text-[9px] text-muted-foreground uppercase leading-tight">PDO 3: CO₂ Avoided</p>
            <p className="text-lg font-bold font-heading text-emerald-700">{fmtD(dash.total_co2_avoided)} <span className="text-[10px] font-normal">tCO₂e</span></p>
            <p className="text-[9px] text-muted-foreground font-mono">/ -16.2M tCO₂e</p>
          </Card>
          <Card className="p-2">
            <p className="text-[9px] text-muted-foreground uppercase leading-tight">C1: Gen Replaced</p>
            <p className="text-lg font-bold font-heading text-orange-700">{fmt(dash.total_generators_displaced)}</p>
            <p className="text-[9px] text-muted-foreground font-mono">/ 288,000</p>
          </Card>
          <Card className="p-2">
            <p className="text-[9px] text-muted-foreground uppercase leading-tight">Employment</p>
            <p className="text-lg font-bold font-heading text-blue-700">{fmt(dash.total_direct_jobs)}</p>
            <p className="text-[9px] text-muted-foreground">direct jobs</p>
          </Card>
          <Card className="p-2">
            <p className="text-[9px] text-muted-foreground uppercase leading-tight">Avg Avail.</p>
            <p className={`text-lg font-bold font-heading ${dash.avg_availability_pct >= 95 ? "text-green-700" : "text-amber-600"}`}>{fmtD(dash.avg_availability_pct)}%</p>
            <p className="text-[9px] text-muted-foreground">target: 95%</p>
          </Card>
          <Card className="p-2">
            <p className="text-[9px] text-muted-foreground uppercase leading-tight">Collection</p>
            <p className={`text-lg font-bold font-heading ${dash.avg_collection_rate >= 85 ? "text-green-700" : "text-amber-600"}`}>{fmtD(dash.avg_collection_rate)}%</p>
            <p className="text-[9px] text-muted-foreground">target: 85%</p>
          </Card>
        </div>
      )}

      {/* Submission status strip */}
      {dash && (
        <div className="mt-2 flex items-center gap-3 text-[11px]">
          <span className="text-muted-foreground">{dash.total_submissions} submissions</span>
          <span className="text-green-700">{dash.verified_submissions} verified</span>
          <span className="text-amber-700">{dash.pending_review} pending review</span>
          <span className="text-muted-foreground">{dash.unique_sites} sites</span>
        </div>
      )}

      <Tabs defaultValue="results-framework" className="mt-4">
        <TabsList>
          <TabsTrigger value="results-framework">Results Framework</TabsTrigger>
          <TabsTrigger value="pdo-progress">PDO Progress</TabsTrigger>
          <TabsTrigger value="submissions">Submissions ({submissions.length})</TabsTrigger>
          <TabsTrigger value="learning">Learning Log ({learningEntries.length})</TabsTrigger>
          <TabsTrigger value="targets">Targets ({targets.length})</TabsTrigger>
        </TabsList>

        {/* Results Framework — full PAD indicator matrix */}
        <TabsContent value="results-framework" className="mt-3 space-y-3">
          <div className="rounded border border-primary/20 bg-primary/5 px-3 py-2">
            <p className="text-[11px] font-medium text-primary">
              DARES Results Framework — PAD Section VII (P179687). Baseline: May 2023. Closing: December 2028.
              CRI = Corporate Results Indicator. PBC = Performance-Based Condition.
              Targets shown are cumulative unless otherwise noted.
            </p>
          </div>

          <RFTable title="PDO Indicators by PDO Outcomes — Access to Electricity for HH & MSMEs with Private-Sector-Led Distributed RE" indicators={PDO_INDICATORS} />
          <RFTable title="Intermediate Indicators — Component 1: Solar Hybrid Mini Grids for Economic Development" indicators={COMP1_INDICATORS} highlight="c1_img_commissioned" />
          <RFTable title="Intermediate Indicators — Component 2: Stand-alone Solar Systems for Households, MSMEs & Agribusinesses" indicators={COMP2_INDICATORS} />
          <RFTable title="Intermediate Indicators — Component 3: Technical Assistance" indicators={COMP3_INDICATORS} highlight="c3_geospatial" />

          {/* PBC Summary */}
          <div className="rounded border border-purple-200 bg-purple-50/50">
            <div className="border-b border-purple-200 px-3 py-1.5">
              <span className="text-[11px] font-semibold text-purple-800">Performance-Based Conditions (PBC) — IDA Scale-Up Window</span>
            </div>
            <div className="p-3 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                <div className="rounded border border-purple-200 bg-white p-2">
                  <p className="text-[10px] font-bold uppercase text-purple-600">PBC 1: NESIP</p>
                  <p className="text-foreground">Presidential approval for a national electrification strategy and implementation plan</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Allocation: $100M (13% of financing)</p>
                </div>
                <div className="rounded border border-purple-200 bg-white p-2">
                  <p className="text-[10px] font-bold uppercase text-purple-600">PBC 2: REA Business Plan</p>
                  <p className="text-foreground">Adoption and operationalization of new business plan for REA with pre-defined KPIs</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Allocation: $300M (40% of financing)</p>
                </div>
                <div className="rounded border border-purple-200 bg-white p-2">
                  <p className="text-[10px] font-bold uppercase text-purple-600">PBC 3: Regulatory Framework</p>
                  <p className="text-foreground">NERC mini grid regs revised: batch licensing, 12-month DisCo notice, capacity limit increase, community obligations</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Allocation: $200M (27% of financing)</p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* PDO Progress — live data vs targets */}
        <TabsContent value="pdo-progress" className="mt-3">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">DARES PDO Indicator Progress (Verified Data vs PAD Targets)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.keys(indicators).length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No verified data yet. Submit and verify MEL data to see indicator progress against PAD targets.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ProgressBar label="PDO 1: Households Connected" actual={indicators.hh_connected?.actual ?? 0} target={3244900} />
                  <ProgressBar label="PDO 4: MSMEs with Electricity Services" actual={indicators.msme_connected?.actual ?? 0} target={236986} />
                  <ProgressBar label="GESI: Female-Headed HH %" actual={indicators.female_hh_pct?.actual ?? 0} target={100} />
                  <ProgressBar label="PDO 3: CO₂ Avoided (tCO₂e)" actual={indicators.co2_avoided?.actual ?? 0} target={16242863} />
                  <ProgressBar label="C1: Generators Replaced" actual={indicators.generators_displaced?.actual ?? 0} target={288000} />
                  <ProgressBar label="Employment: Direct Jobs" actual={indicators.direct_jobs?.actual ?? 0} target={indicators.direct_jobs?.target || 1000} />
                  <ProgressBar label="System Availability %" actual={indicators.avg_availability?.actual ?? 0} target={95} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Component 1 specifics */}
          <Card className="mt-3">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">Component 1: Solar Hybrid Mini Grids — IMG Focus</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded border p-2">
                  <p className="text-[9px] font-bold uppercase text-muted-foreground">IMGs Commissioned</p>
                  <p className="text-xl font-bold font-heading text-primary">0</p>
                  <p className="text-[9px] text-muted-foreground font-mono">Target: 125 by Dec/2028</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-[9px] font-bold uppercase text-muted-foreground">Isolated MGs</p>
                  <p className="text-xl font-bold font-heading text-blue-700">0</p>
                  <p className="text-[9px] text-muted-foreground font-mono">Target: 1,170 by Dec/2028</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-[9px] font-bold uppercase text-muted-foreground">Grant Agreements</p>
                  <p className="text-xl font-bold font-heading text-emerald-700">0</p>
                  <p className="text-[9px] text-muted-foreground font-mono">Target: 1,295 by Dec/2028</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-[9px] font-bold uppercase text-muted-foreground">Private Capital</p>
                  <p className="text-xl font-bold font-heading text-amber-700">$0</p>
                  <p className="text-[9px] text-muted-foreground font-mono">Target: $613M by Dec/2028</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Portfolio summary cards */}
          {dash && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="p-3 space-y-1">
                <h3 className="text-[10px] font-bold uppercase text-muted-foreground">Energy (PDO 2)</h3>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <div>kWh Sold: <span className="font-mono font-medium">{fmt(dash.total_kwh_sold)}</span></div>
                  <div>Revenue: <span className="font-mono font-medium">{fmtUSD(dash.total_revenue_usd)}</span></div>
                  <div>Avg Supply: <span className="font-mono font-medium">{fmtD(dash.avg_supply_hours)}h/day</span></div>
                  <div>Avg ARPU: <span className="font-mono font-medium">{fmtUSD(dash.avg_arpu_usd)}</span></div>
                </div>
              </Card>
              <Card className="p-3 space-y-1">
                <h3 className="text-[10px] font-bold uppercase text-muted-foreground">Employment</h3>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <div>Direct: <span className="font-mono font-medium">{fmt(dash.total_direct_jobs)}</span></div>
                  <div>Indirect: <span className="font-mono font-medium">{fmt(dash.total_indirect_jobs)}</span></div>
                </div>
              </Card>
              <Card className="p-3 space-y-1">
                <h3 className="text-[10px] font-bold uppercase text-muted-foreground">Reporting Periods</h3>
                <div className="flex flex-wrap gap-1">
                  {(dash.periods_covered ?? []).map((p) => (
                    <span key={p} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{p}</span>
                  ))}
                  {(dash.periods_covered ?? []).length === 0 && (
                    <span className="text-[10px] text-muted-foreground">No periods reported yet</span>
                  )}
                </div>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Submissions */}
        <TabsContent value="submissions" className="mt-3">
          <div className="flex items-center gap-2 mb-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded border px-2 py-1 text-[11px]"
            >
              <option value="">All statuses</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under Review</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <Card>
            <CardContent className="p-0">
              {subLoading ? (
                <div className="p-6 text-center text-muted-foreground text-sm">Loading submissions...</div>
              ) : submissions.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No submissions found. Developer declarations and meter data will appear here once sites are commissioned.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">HH</TableHead>
                      <TableHead className="text-right">MSME</TableHead>
                      <TableHead className="text-right">kWh Sold</TableHead>
                      <TableHead className="text-right">Avail %</TableHead>
                      <TableHead className="text-right">Complete</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submissions.map((sub) => (
                      <Fragment key={sub.id}>
                        <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}>
                          <TableCell className="text-[11px]">{expandedId === sub.id ? "▾" : "▸"}</TableCell>
                          <TableCell className="font-medium text-[12px]">{sub.site_name}</TableCell>
                          <TableCell className="text-[11px]">{sub.period_label || sub.reporting_period}</TableCell>
                          <TableCell className="text-[11px]">{sub.submission_type.replace(/_/g, " ")}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmt(sub.hh_connected ?? 0)}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmt(sub.msme_connected ?? 0)}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmt(sub.kwh_sold ?? 0)}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">
                            <span className={(sub.system_availability_pct ?? 0) >= 95 ? "text-green-700" : (sub.system_availability_pct ?? 0) >= 90 ? "text-amber-600" : "text-red-600"}>
                              {fmtD(sub.system_availability_pct ?? 0)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmtD(sub.data_completeness_pct ?? 0)}%</TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${STATUS_COLORS[sub.status] ?? "bg-gray-100 text-gray-700"}`}>{sub.status.replace(/_/g, " ")}</Badge>
                          </TableCell>
                          <TableCell>
                            {(sub.status === "submitted" || sub.status === "under_review") && (
                              <button
                                onClick={(e) => { e.stopPropagation(); verifyMut.mutate(sub.id); }}
                                className="rounded bg-green-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-green-700"
                              >
                                Verify
                              </button>
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedId === sub.id && (
                          <TableRow key={`${sub.id}-detail`}>
                            <TableCell colSpan={11} className="p-0">
                              <SubmissionDetailPanel sub={sub} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Learning Log */}
        <TabsContent value="learning" className="mt-3">
          <div className="space-y-2">
            {learningEntries.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground text-sm">
                  No learning entries yet. Capture lessons from pilot IMGs, community engagement, PUE anchor identification, and DisCo interconnection experiences here.
                </CardContent>
              </Card>
            ) : (
              learningEntries.map((entry) => (
                <Card key={entry.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`text-[10px] ${TAG_COLORS[entry.tag] ?? "bg-gray-100 text-gray-700"}`}>
                          {entry.tag.replace(/_/g, " ")}
                        </Badge>
                        {entry.is_portfolio_wide && (
                          <Badge className="text-[10px] bg-indigo-100 text-indigo-800">Portfolio-wide</Badge>
                        )}
                        {entry.site_name && (
                          <span className="text-[10px] text-muted-foreground">{entry.site_name}</span>
                        )}
                      </div>
                      <h3 className="text-[13px] font-semibold">{entry.title}</h3>
                      <p className="text-[11px] text-foreground/80 mt-1 leading-relaxed">{entry.body}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        {entry.author_name && <span>By {entry.author_name}</span>}
                        {entry.reporting_period && <span>{entry.reporting_period}</span>}
                        <span>{entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ""}</span>
                        {entry.upvotes > 0 && <span className="font-medium text-primary">▲ {entry.upvotes}</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Targets */}
        <TabsContent value="targets" className="mt-3">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">PDO & Programme Targets (from DARES PAD Results Framework)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {targets.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  No custom targets defined. Default DARES PAD targets are shown in the Results Framework tab.
                  Add site-level or award-level targets here for granular tracking.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Indicator</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead className="text-right">Year</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {targets.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium text-[12px]">{t.indicator_key.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-right font-mono text-[12px]">{fmtD(t.target_value, 0)}</TableCell>
                        <TableCell className="text-right text-[12px]">{t.target_year}</TableCell>
                        <TableCell>
                          <Badge className="text-[10px] bg-blue-50 text-blue-700">{t.source.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground max-w-[300px] truncate">{t.notes ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
