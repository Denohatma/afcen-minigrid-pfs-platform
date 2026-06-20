"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
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
  {
    key: "financial_close",
    number: 0,
    label: "M0 — Financial Close",
    pct: 0,
    description: "Grant agreement signed, CPs met. Gate only — no cash disbursement.",
    requiredEvidence: [],
  },
  {
    key: "commissioning",
    number: 1,
    label: "M1 — Commissioning",
    pct: 40,
    description: "Mini-grid commissioned and energised. ~40% tranche.",
    requiredEvidence: [
      "Commissioning certificate",
      "NEMSA test report",
      "As-built drawings",
      "GPS-tagged site photos",
      "Equipment serial numbers",
      "Grid-tie test results",
      "Insurance certificate",
    ],
  },
  {
    key: "verified_connections",
    number: 2,
    label: "M2 — Verified Connections",
    pct: 40,
    description: "Target connections achieved and verified. ~40% tranche.",
    requiredEvidence: [
      "Connection register (meter IDs)",
      "GPS-tagged meter photos",
      "Billing system screenshot",
      "Community sign-off letter",
      "Supply quality report",
    ],
  },
  {
    key: "one_year_utilisation",
    number: 3,
    label: "M3 — One-Year Utilisation",
    pct: 20,
    description: "12-month operating performance verified. ~20% tranche.",
    requiredEvidence: [
      "12-month meter data export",
      "Revenue collection report",
      "CUF calculation sheet",
      "Maintenance log",
      "Customer satisfaction survey",
    ],
  },
];

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-amber-100 text-amber-800",
  iva_review: "bg-amber-100 text-amber-800",
  iva_verified: "bg-indigo-100 text-indigo-700",
  approved: "bg-green-100 text-green-800",
  rea_approved: "bg-green-100 text-green-800",
  disbursed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  revision_required: "bg-orange-100 text-orange-800",
  disbursement_requested: "bg-cyan-100 text-cyan-800",
};

const STEP_COLORS: Record<string, { ring: string; fill: string; text: string; line: string }> = {
  not_started: { ring: "border-gray-300", fill: "bg-gray-100", text: "text-gray-500", line: "bg-gray-200" },
  submitted: { ring: "border-blue-500", fill: "bg-blue-50", text: "text-blue-700", line: "bg-blue-200" },
  under_review: { ring: "border-amber-500", fill: "bg-amber-50", text: "text-amber-700", line: "bg-amber-200" },
  iva_verified: { ring: "border-indigo-500", fill: "bg-indigo-50", text: "text-indigo-700", line: "bg-indigo-200" },
  approved: { ring: "border-green-500", fill: "bg-green-50", text: "text-green-700", line: "bg-green-200" },
  rea_approved: { ring: "border-green-500", fill: "bg-green-50", text: "text-green-700", line: "bg-green-200" },
  disbursed: { ring: "border-emerald-600", fill: "bg-emerald-50", text: "text-emerald-700", line: "bg-emerald-400" },
  rejected: { ring: "border-red-500", fill: "bg-red-50", text: "text-red-700", line: "bg-red-200" },
  revision_required: { ring: "border-orange-500", fill: "bg-orange-50", text: "text-orange-700", line: "bg-orange-200" },
  disbursement_requested: { ring: "border-cyan-500", fill: "bg-cyan-50", text: "text-cyan-700", line: "bg-cyan-200" },
};

function formatUSD(amount: number) {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MilestoneDetailPage() {
  const params = useParams();
  const agreementId = params.agreementId as string;

  const { data: agreement } = useQuery({
    queryKey: ["agreement", agreementId],
    queryFn: () => api.agreements.get(agreementId),
  });

  const { data: milestonesData } = useQuery({
    queryKey: ["milestones", agreementId],
    queryFn: () => api.milestones.list({ agreement_id: agreementId }),
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
  const lots = lotsData?.lots ?? [];
  const bidders = biddersData?.bidders ?? [];

  const lot = lots.find((l) => l.id === agreement?.lot_id);
  const bidder = bidders.find((b) => b.id === agreement?.bidder_id);

  const grantTotal = agreement?.grant_amount_usd ?? 0;
  const disbursedTotal = milestones
    .filter((m) => m.status === "disbursed")
    .reduce((s, m) => s + (m.tranche_amount_usd || m.grant_amount_usd), 0);
  const pendingTotal = milestones
    .filter((m) => m.status !== "not_started" && m.status !== "disbursed")
    .reduce((s, m) => s + (m.tranche_amount_usd || m.grant_amount_usd), 0);

  return (
    <div className="text-[13px]">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
        <Link href="/disbursements" className="hover:text-primary underline">
          Milestones & Disbursements
        </Link>
        <span>/</span>
        <span>{lot?.lot_name ?? agreementId.slice(0, 8).toUpperCase()}</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-base font-bold">
            {lot?.lot_name ?? "Agreement"} — Milestone Dashboard
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {bidder?.company_name ?? "Developer"} &middot;{" "}
            {lot?.disco ?? "—"} &middot;{" "}
            {milestones.length} milestones &middot;{" "}
            Grant {formatUSD(grantTotal)}
          </p>
        </div>
      </div>

      <div className="mt-1.5 grid grid-cols-4 gap-2">
        {[
          { label: "Total Grant", value: formatUSD(grantTotal), color: "" },
          { label: "Disbursed", value: formatUSD(disbursedTotal), color: "text-green-700" },
          { label: "In Pipeline", value: formatUSD(pendingTotal), color: "text-amber-700" },
          {
            label: "Progress",
            value: grantTotal > 0
              ? `${Math.round((disbursedTotal / grantTotal) * 100)}%`
              : "0%",
            color: "text-primary",
          },
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

      <div className="mt-3 grid grid-cols-[280px_1fr] gap-3">
        {/* Vertical 4-step stepper */}
        <div className="rounded border border-border bg-white p-3">
          <div className="text-[11px] font-semibold mb-3">Milestone Gates</div>
          <div className="relative">
            {MILESTONE_GATES.map((gate, idx) => {
              const ms = milestones.find((m) => m.milestone_number === idx) ??
                milestones.find((m) => m.milestone_type === gate.key);
              const status = ms?.status ?? "not_started";
              const colors = STEP_COLORS[status] ?? STEP_COLORS.not_started;
              const isLast = idx === MILESTONE_GATES.length - 1;

              return (
                <div key={gate.key} className="relative flex gap-3">
                  {/* Connector line + circle */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`h-7 w-7 rounded-full border-2 ${colors.ring} ${colors.fill} flex items-center justify-center shrink-0`}
                    >
                      <span className={`text-[10px] font-bold ${colors.text}`}>
                        {gate.number}
                      </span>
                    </div>
                    {!isLast && (
                      <div className={`w-0.5 flex-1 min-h-[40px] ${colors.line}`} />
                    )}
                  </div>

                  {/* Content */}
                  <div className={`pb-4 ${isLast ? "" : ""}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold">{gate.label}</span>
                      <Badge className={`text-[9px] px-1 py-0 ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}>
                        {formatLabel(status)}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {gate.description}
                    </p>
                    {ms && (
                      <div className="mt-1 space-y-0.5">
                        {ms.tranche_amount_usd > 0 && (
                          <div className="text-[10px] font-mono">
                            Tranche: {formatUSD(ms.tranche_amount_usd)} ({gate.pct}%)
                          </div>
                        )}
                        {ms.target_date && (
                          <div className="text-[10px] text-muted-foreground">
                            Target: {new Date(ms.target_date).toLocaleDateString()}
                          </div>
                        )}
                        {ms.submitted_at && (
                          <div className="text-[10px] text-blue-700">
                            Submitted: {new Date(ms.submitted_at).toLocaleDateString()}
                          </div>
                        )}
                        {ms.disbursed_at && (
                          <div className="text-[10px] text-green-700">
                            Disbursed: {new Date(ms.disbursed_at).toLocaleDateString()}
                          </div>
                        )}
                        {ms.rejection_reason && (
                          <div className="text-[10px] text-red-700">
                            Rejected: {ms.rejection_reason}
                          </div>
                        )}
                      </div>
                    )}
                    {gate.requiredEvidence.length > 0 && (
                      <details className="mt-1">
                        <summary className="text-[9px] text-muted-foreground cursor-pointer hover:text-primary">
                          Required evidence ({gate.requiredEvidence.length} items)
                        </summary>
                        <ul className="mt-0.5 ml-2 space-y-0 text-[9px] text-muted-foreground">
                          {gate.requiredEvidence.map((ev) => (
                            <li key={ev} className="flex items-start gap-1">
                              <span className="text-muted-foreground/50">•</span>
                              {ev}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel — milestone detail table */}
        <div className="rounded border border-border bg-white">
          <div className="border-b border-border px-3 py-1.5">
            <span className="text-[11px] font-semibold">Milestone Detail & Approval Chain</span>
          </div>
          {milestones.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No milestones created for this agreement yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px]">
                    <TableHead className="py-1.5">Gate</TableHead>
                    <TableHead className="py-1.5">Title</TableHead>
                    <TableHead className="py-1.5 text-right">Tranche</TableHead>
                    <TableHead className="py-1.5">IVA</TableHead>
                    <TableHead className="py-1.5">REA</TableHead>
                    <TableHead className="py-1.5">Status</TableHead>
                    <TableHead className="py-1.5">Target</TableHead>
                    <TableHead className="py-1.5">Disbursed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {milestones.map((m) => {
                    const now = new Date();
                    const isOverdue = m.target_date && m.status !== "disbursed" && m.status !== "approved"
                      ? new Date(m.target_date) < now
                      : false;

                    return (
                      <TableRow
                        key={m.id}
                        className={`text-[12px] ${isOverdue ? "bg-red-50" : ""}`}
                      >
                        <TableCell className="py-1 font-mono text-[10px] font-bold">
                          M{m.milestone_number}
                        </TableCell>
                        <TableCell className="py-1 font-medium">{m.title}</TableCell>
                        <TableCell className="py-1 text-right font-mono text-[10px]">
                          {m.tranche_amount_usd > 0
                            ? formatUSD(m.tranche_amount_usd)
                            : formatUSD(m.grant_amount_usd)}
                        </TableCell>
                        <TableCell className="py-1">
                          <Badge className={`text-[9px] ${STATUS_COLORS[m.iva_status] ?? "bg-gray-100 text-gray-700"}`}>
                            {formatLabel(m.iva_status || "pending")}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1">
                          <Badge className={`text-[9px] ${STATUS_COLORS[m.rea_approval_status] ?? "bg-gray-100 text-gray-700"}`}>
                            {formatLabel(m.rea_approval_status || "pending")}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1">
                          <Badge className={`text-[9px] ${STATUS_COLORS[m.status] ?? "bg-gray-100 text-gray-700"}`}>
                            {formatLabel(m.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className={`py-1 font-mono text-[10px] ${isOverdue ? "text-red-700 font-semibold" : ""}`}>
                          {m.target_date
                            ? new Date(m.target_date).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="py-1 font-mono text-[10px]">
                          {m.disbursed_at ? (
                            <span className="text-green-700">
                              {new Date(m.disbursed_at).toLocaleDateString()}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Approval chain info */}
      <div className="mt-2 rounded border border-border bg-white">
        <div className="border-b border-border px-3 py-1.5">
          <span className="text-[11px] font-semibold">4-Role Approval Workflow</span>
        </div>
        <div className="px-3 py-2 grid grid-cols-4 gap-4">
          {[
            { step: 1, role: "Developer", action: "Submit evidence", color: "text-blue-700" },
            { step: 2, role: "IVA", action: "Verify milestone", color: "text-indigo-700" },
            { step: 3, role: "REA PMU", action: "Approve milestone", color: "text-green-700" },
            { step: 4, role: "Grant Admin", action: "Authorise payment", color: "text-emerald-700" },
          ].map((s) => (
            <div key={s.step} className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold">{s.step}</span>
              </div>
              <div>
                <div className={`text-[11px] font-semibold ${s.color}`}>{s.role}</div>
                <div className="text-[10px] text-muted-foreground">{s.action}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
