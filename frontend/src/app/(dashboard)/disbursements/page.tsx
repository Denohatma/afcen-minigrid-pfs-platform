"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MILESTONE_GATES = [
  { key: "financial_close", label: "M0", title: "Financial Close", pct: 0 },
  { key: "commissioning", label: "M1", title: "Commissioning", pct: 40 },
  { key: "verified_connections", label: "M2", title: "Connections", pct: 40 },
  { key: "one_year_utilisation", label: "M3", title: "Utilisation", pct: 20 },
];

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-amber-100 text-amber-800",
  iva_review: "bg-amber-100 text-amber-800",
  iva_verified: "bg-indigo-100 text-indigo-700",
  iva_confirmed: "bg-indigo-100 text-indigo-700",
  approved: "bg-green-100 text-green-800",
  rea_approved: "bg-green-100 text-green-800",
  disbursed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  overdue: "bg-red-100 text-red-800",
  revision_required: "bg-orange-100 text-orange-800",
  disbursement_requested: "bg-cyan-100 text-cyan-800",
};

function formatUSD(amount: number) {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function MilestoneStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    not_started: "bg-gray-300",
    submitted: "bg-blue-500",
    under_review: "bg-amber-500",
    iva_verified: "bg-indigo-500",
    iva_confirmed: "bg-indigo-500",
    approved: "bg-green-500",
    rea_approved: "bg-green-500",
    disbursed: "bg-emerald-600",
    rejected: "bg-red-500",
    overdue: "bg-red-500",
    revision_required: "bg-orange-500",
    disbursement_requested: "bg-cyan-500",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${colors[status] ?? "bg-gray-300"}`}
      title={formatLabel(status)}
    />
  );
}

interface PortfolioRow {
  agreementId: string;
  lotName: string;
  disco: string;
  developer: string;
  grantAmount: number;
  disbursedAmount: number;
  milestones: Array<{
    id: string;
    gate: number;
    status: string;
    trancheAmount: number;
    targetDate: string | null;
    isOverdue: boolean;
    isDueSoon: boolean;
  }>;
  hasOverdue: boolean;
  hasDueSoon: boolean;
}

export default function DisbursementsPage() {
  const { data: milestoneDashboard } = useQuery({
    queryKey: ["milestones-dashboard"],
    queryFn: () => api.milestones.dashboard(),
  });

  const { data: milestonesData } = useQuery({
    queryKey: ["milestones"],
    queryFn: () => api.milestones.list(),
  });

  const { data: disbursementDashboard } = useQuery({
    queryKey: ["disbursements-dashboard"],
    queryFn: () => api.disbursements.dashboard(),
  });

  const { data: agreementsData } = useQuery({
    queryKey: ["agreements"],
    queryFn: () => api.agreements.list(),
  });

  const { data: lotsData } = useQuery({
    queryKey: ["lots"],
    queryFn: () => api.lots.list(),
  });

  const { data: biddersData } = useQuery({
    queryKey: ["bidders"],
    queryFn: () => api.bidders.list(),
  });

  const milestones = milestonesData?.milestones ?? [];
  const agreements = agreementsData?.agreements ?? (Array.isArray(agreementsData) ? agreementsData : []);
  const lots = lotsData?.lots ?? [];
  const bidders = biddersData?.bidders ?? [];

  const msDash = milestoneDashboard as Record<string, unknown> | undefined;
  const dDash = disbursementDashboard as Record<string, unknown> | undefined;

  const lotsById = Object.fromEntries(lots.map((l) => [l.id, l]));
  const biddersById = Object.fromEntries(bidders.map((b) => [b.id, b]));

  const totalGrantCommitted = agreements.reduce((s, a) => s + (a.grant_amount_usd || 0), 0);
  const totalDisbursed = (dDash?.total_paid_usd as number) ?? 0;
  const totalPending = (dDash?.total_pending_usd as number) ?? 0;

  const now = new Date();
  const overdueCount = milestones.filter((m) => {
    if (m.status === "disbursed" || m.status === "approved") return false;
    if (!m.target_date) return false;
    return new Date(m.target_date) < now;
  }).length;

  const rows: PortfolioRow[] = agreements.map((ag) => {
    const lot = lotsById[ag.lot_id];
    const bidder = biddersById[ag.bidder_id];
    const agMilestones = milestones.filter((m) => m.grant_agreement_id === ag.id);

    const gateMap = MILESTONE_GATES.map((gate, idx) => {
      const ms = agMilestones.find((m) => m.milestone_number === idx) ??
        agMilestones.find((m) => m.milestone_type === gate.key);

      const isOverdue = ms && ms.target_date && ms.status !== "disbursed" && ms.status !== "approved"
        ? new Date(ms.target_date) < now
        : false;
      const isDueSoon = ms && ms.target_date && ms.status !== "disbursed" && ms.status !== "approved" && !isOverdue
        ? (new Date(ms.target_date).getTime() - now.getTime()) < 30 * 24 * 60 * 60 * 1000
        : false;

      return {
        id: ms?.id ?? "",
        gate: idx,
        status: ms?.status ?? "not_started",
        trancheAmount: ms?.tranche_amount_usd ?? ms?.grant_amount_usd ?? 0,
        targetDate: ms?.target_date ?? null,
        isOverdue: !!isOverdue,
        isDueSoon: !!isDueSoon,
      };
    });

    const disbursed = gateMap.reduce(
      (s, g) => s + (g.status === "disbursed" ? g.trancheAmount : 0), 0
    );

    return {
      agreementId: ag.id,
      lotName: lot?.lot_name ?? ag.lot_id.slice(0, 8).toUpperCase(),
      disco: lot?.disco ?? "—",
      developer: bidder?.company_name ?? "—",
      grantAmount: ag.grant_amount_usd || 0,
      disbursedAmount: disbursed,
      milestones: gateMap,
      hasOverdue: gateMap.some((g) => g.isOverdue),
      hasDueSoon: gateMap.some((g) => g.isDueSoon),
    };
  });

  const totalMilestones = (msDash?.total_milestones as number) ?? milestones.length;

  return (
    <div className="text-[13px]">
      <div>
        <h1 className="font-heading text-base font-bold">
          Milestones & Disbursements
        </h1>
        <p className="text-[11px] text-muted-foreground">
          RBF milestone verification, 4-gate approval chain & grant
          disbursement &middot; {totalMilestones} milestones &middot;{" "}
          {agreements.length} agreements
        </p>
      </div>

      <div className="mt-1.5 grid grid-cols-4 gap-2">
        {[
          { label: "Total Grant Committed", value: formatUSD(totalGrantCommitted), color: "" },
          { label: "Total Disbursed", value: formatUSD(totalDisbursed), color: "text-green-700" },
          { label: "Total Pending", value: formatUSD(totalPending), color: "text-amber-700" },
          { label: "Overdue Milestones", value: overdueCount, color: overdueCount > 0 ? "text-red-700" : "" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded border border-border bg-white px-3 py-1"
          >
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
            <div className={`font-heading text-lg font-bold leading-tight ${s.color}`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 rounded border border-border bg-white">
        <div className="border-b border-border px-3 py-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold">Portfolio Milestone Tracker</span>
          <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-gray-300" /> Not Started
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Submitted
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> Under Review
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" /> Approved
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-600" /> Disbursed
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Overdue
            </span>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No grant agreements yet. Milestones are created after agreement
            execution via the{" "}
            <Link href="/agreements" className="text-primary underline">
              Agreements
            </Link>{" "}
            step.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead className="py-1.5">Lot Name</TableHead>
                  <TableHead className="py-1.5">DisCo</TableHead>
                  <TableHead className="py-1.5">Developer</TableHead>
                  <TableHead className="py-1.5 text-right">Grant</TableHead>
                  <TableHead className="py-1.5 text-center border-l border-border">
                    M0 Fin. Close
                  </TableHead>
                  <TableHead className="py-1.5 text-center">
                    M1 Commission
                  </TableHead>
                  <TableHead className="py-1.5 text-center">
                    M2 Connect
                  </TableHead>
                  <TableHead className="py-1.5 text-center">
                    M3 Utilise
                  </TableHead>
                  <TableHead className="py-1.5 text-right border-l border-border">
                    Disbursed
                  </TableHead>
                  <TableHead className="py-1.5 text-center border-l border-border">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  let rowBg = "";
                  if (row.hasOverdue) rowBg = "bg-red-50";
                  else if (row.hasDueSoon) rowBg = "bg-amber-50/50";

                  return (
                    <TableRow key={row.agreementId} className={`text-[12px] ${rowBg}`}>
                      <TableCell className="py-1 font-medium">
                        {row.lotName}
                      </TableCell>
                      <TableCell className="py-1 font-mono text-[10px]">
                        {row.disco}
                      </TableCell>
                      <TableCell className="py-1 max-w-[140px] truncate">
                        {row.developer}
                      </TableCell>
                      <TableCell className="py-1 text-right font-mono text-[10px]">
                        {row.grantAmount > 0 ? formatUSD(row.grantAmount) : "—"}
                      </TableCell>

                      {row.milestones.map((ms, idx) => (
                        <TableCell
                          key={ms.id ?? `ms-${idx}`}
                          className={`py-1 text-center ${idx === 0 ? "border-l border-border" : ""}`}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center gap-1">
                              <MilestoneStatusDot
                                status={ms.isOverdue ? "overdue" : ms.status}
                              />
                              <span className={`text-[10px] font-medium ${
                                ms.isOverdue ? "text-red-700" : ""
                              }`}>
                                {ms.status === "not_started" ? "—" : formatLabel(ms.status).slice(0, 10)}
                              </span>
                            </div>
                            {ms.trancheAmount > 0 && ms.status !== "not_started" && (
                              <span className="text-[9px] text-muted-foreground font-mono">
                                {formatUSD(ms.trancheAmount)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      ))}

                      <TableCell className="py-1 text-right font-mono text-[10px] border-l border-border">
                        {row.disbursedAmount > 0 ? (
                          <span className="text-green-700 font-semibold">
                            {formatUSD(row.disbursedAmount)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="py-1 text-center border-l border-border">
                        <Link href={`/milestones/${row.agreementId}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-5 px-2 text-[10px]"
                          >
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {milestones.length > 0 && (
        <div className="mt-2 rounded border border-border bg-white">
          <div className="border-b border-border px-3 py-1.5">
            <span className="text-[11px] font-semibold">Recent Milestone Activity</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead className="py-1.5">Milestone</TableHead>
                  <TableHead className="py-1.5">Type</TableHead>
                  <TableHead className="py-1.5 text-right">Tranche %</TableHead>
                  <TableHead className="py-1.5 text-right">Amount</TableHead>
                  <TableHead className="py-1.5">IVA Status</TableHead>
                  <TableHead className="py-1.5">REA Approval</TableHead>
                  <TableHead className="py-1.5">Status</TableHead>
                  <TableHead className="py-1.5">Target Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {milestones.slice(0, 20).map((m) => (
                  <TableRow key={m.id} className="text-[12px]">
                    <TableCell className="py-1 font-medium">{m.title}</TableCell>
                    <TableCell className="py-1 text-[10px]">
                      {formatLabel(m.milestone_type)}
                    </TableCell>
                    <TableCell className="py-1 text-right font-mono text-[10px]">
                      {(m.tranche_pct * 100).toFixed(0)}%
                    </TableCell>
                    <TableCell className="py-1 text-right font-mono text-[10px]">
                      {formatUSD(m.grant_amount_usd)}
                    </TableCell>
                    <TableCell className="py-1">
                      <Badge className={STATUS_COLORS[m.iva_status] ?? "bg-gray-100 text-gray-700"}>
                        {formatLabel(m.iva_status || "pending")}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1">
                      <Badge className={STATUS_COLORS[m.rea_approval_status] ?? "bg-gray-100 text-gray-700"}>
                        {formatLabel(m.rea_approval_status || "pending")}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1">
                      <Badge className={STATUS_COLORS[m.status] ?? "bg-gray-100 text-gray-700"}>
                        {formatLabel(m.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1 font-mono text-[10px]">
                      {m.target_date
                        ? new Date(m.target_date).toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
