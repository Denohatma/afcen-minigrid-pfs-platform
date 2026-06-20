"use client";

import { useQuery } from "@tanstack/react-query";
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

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-800",
  completed: "bg-blue-100 text-blue-800",
  terminated: "bg-red-100 text-red-800",
};

const CP_SUMMARY_COLORS: Record<string, string> = {
  none: "text-muted-foreground",
  partial: "text-amber-700",
  complete: "text-green-700",
};

function formatUSD(amount: number) {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AgreementsPage() {
  const { data: lotsData } = useQuery({
    queryKey: ["lots"],
    queryFn: () => api.lots.list(),
  });

  const { data: agreementsData, isLoading } = useQuery({
    queryKey: ["agreements"],
    queryFn: () => api.agreements.list(),
  });

  const { data: cpDashboard } = useQuery({
    queryKey: ["cps-dashboard"],
    queryFn: () => api.cps.dashboard(),
  });

  const lots = lotsData?.lots ?? [];
  const agreements = agreementsData?.agreements ?? (Array.isArray(agreementsData) ? agreementsData : []);
  const cpDash = cpDashboard as Record<string, unknown> | undefined;

  const lotsById = Object.fromEntries(lots.map((l) => [l.id, l]));

  const totalAgreements = agreements.length;
  const agreementsWithCPs = agreements.filter(
    (a) => a.cps && a.cps.length > 0
  ).length;
  const totalProgramValue = agreements.reduce(
    (s, a) => s + (a.eligible_capex_ceiling_usd || 0),
    0
  );
  const totalGrantValue = agreements.reduce(
    (s, a) => s + (a.grant_amount_usd || 0),
    0
  );

  const cpTotal = (cpDash?.total_cps as number) || 0;

  interface AgreementRow {
    id: string;
    lotName: string;
    disco: string;
    bidReviewNotes: string;
    agreementStatus: string;
    cpSummary: string;
    cpState: string;
    grantAmountUsd: number;
    estimatedCOD: string;
    lotId: string;
  }

  const rows: AgreementRow[] = agreements.map((ag) => {
    const lot = lotsById[ag.lot_id];
    const cps = ag.cps || [];
    const cpVerified = cps.filter(
      (cp: { status: string }) => cp.status === "verified" || cp.status === "waived"
    ).length;
    const cpTotal = cps.length;

    let cpSummary = "No CPs";
    let cpState = "none";
    if (cpTotal > 0) {
      cpSummary = `${cpVerified}/${cpTotal} met`;
      cpState = cpVerified === cpTotal ? "complete" : "partial";
    }

    const agreementData = (ag as Record<string, unknown>).agreement_data as
      | Record<string, unknown>
      | undefined;
    const codEstimate =
      (agreementData?.estimated_cod as string) ||
      (ag.effective_date
        ? new Date(
            new Date(ag.effective_date).getTime() + 365 * 24 * 60 * 60 * 1000
          )
            .toISOString()
            .split("T")[0]
        : "—");

    const reviewNotes =
      (agreementData?.bid_review_notes as string) || "Pending review";

    return {
      id: ag.id,
      lotName: lot?.lot_name || ag.lot_id.slice(0, 8).toUpperCase(),
      disco: lot?.disco || "—",
      bidReviewNotes: reviewNotes,
      agreementStatus: ag.status,
      cpSummary,
      cpState,
      grantAmountUsd: ag.grant_amount_usd || 0,
      estimatedCOD: codEstimate,
      lotId: ag.lot_id,
    };
  });

  return (
    <div className="text-[13px]">
      <div>
        <h1 className="font-heading text-base font-bold">
          Agreements & Conditions Precedent
        </h1>
        <p className="text-[11px] text-muted-foreground">
          DARES grant agreements and CP tracking &middot; {totalAgreements}{" "}
          agreements &middot; {cpTotal} conditions precedent
        </p>
      </div>

      <div className="mt-1.5 grid grid-cols-4 gap-2">
        {[
          { label: "Total Agreements", value: totalAgreements },
          { label: "Agreements with CPs", value: agreementsWithCPs },
          {
            label: "Total Program Value",
            value: totalProgramValue > 0 ? formatUSD(totalProgramValue) : "$0",
          },
          {
            label: "Total Grant Value",
            value: totalGrantValue > 0 ? formatUSD(totalGrantValue) : "$0",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded border border-border bg-white px-3 py-1"
          >
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
            <div className="font-heading text-lg font-bold leading-tight">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 rounded border border-border bg-white">
        <div className="border-b border-border px-3 py-1.5">
          <span className="text-[11px] font-semibold">Agreement Pipeline</span>
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Loading...
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No grant agreements yet. Agreements are created after tender award
            via the{" "}
            <Link href="/evaluations" className="text-primary underline">
              Evaluation
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
                  <TableHead className="py-1.5">Bid Review Notes</TableHead>
                  <TableHead className="py-1.5">DARES Agreement</TableHead>
                  <TableHead className="py-1.5">
                    Conditions Precedent
                  </TableHead>
                  <TableHead className="py-1.5 text-right">Grant Secured</TableHead>
                  <TableHead className="py-1.5">Estimated COD</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="text-[12px]">
                    <TableCell className="py-1 font-medium">
                      {row.lotName}
                    </TableCell>
                    <TableCell className="py-1 font-mono text-[10px]">
                      {row.disco}
                    </TableCell>
                    <TableCell className="py-1 max-w-[200px] truncate text-muted-foreground">
                      {row.bidReviewNotes}
                    </TableCell>
                    <TableCell className="py-1">
                      <span
                        className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${
                          STATUS_COLORS[row.agreementStatus] ??
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {formatLabel(row.agreementStatus)}
                      </span>
                    </TableCell>
                    <TableCell className="py-1">
                      <span
                        className={`text-[11px] font-medium ${
                          CP_SUMMARY_COLORS[row.cpState] ??
                          "text-muted-foreground"
                        }`}
                      >
                        {row.cpSummary}
                      </span>
                    </TableCell>
                    <TableCell className="py-1 text-right font-mono text-[10px]">
                      {row.grantAmountUsd > 0
                        ? formatUSD(row.grantAmountUsd)
                        : "—"}
                    </TableCell>
                    <TableCell className="py-1 font-mono text-[10px]">
                      {row.estimatedCOD}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
