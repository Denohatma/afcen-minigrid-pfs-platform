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
  pending: "bg-gray-100 text-gray-700",
  admin_checked: "bg-amber-100 text-amber-800",
  admin_rejected: "bg-red-100 text-red-800",
  technical_scored: "bg-blue-100 text-blue-800",
  financial_scored: "bg-indigo-100 text-indigo-800",
  recommended: "bg-green-100 text-green-800",
  not_recommended: "bg-red-100 text-red-800",
  awarded: "bg-green-100 text-green-800",
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-amber-100 text-amber-800",
};

const REVIEWERS = [
  { name: "Abubakar Musa", role: "Technical" },
  { name: "Fatima Bello", role: "Financial" },
  { name: "Chukwu Emeka", role: "E&S" },
];

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(n: number) {
  return n.toFixed(1);
}

interface EvalRow {
  lotId: string;
  lotName: string;
  disco: string;
  bidderName: string;
  bidderId: string;
  evaluationId: string | null;
  status: string;
  r1Score: number | null;
  r2Score: number | null;
  r3Score: number | null;
}

export default function EvaluationsPage() {
  const { data: lotsData, isLoading: lotsLoading } = useQuery({
    queryKey: ["lots"],
    queryFn: () => api.lots.list(),
  });

  const { data: biddersData } = useQuery({
    queryKey: ["bidders"],
    queryFn: () => api.bidders.list(),
  });

  const lots = lotsData?.lots ?? [];
  const bidders = biddersData?.bidders ?? [];

  const lotsWithTender = lots.filter(
    (l) => l.tender_status && l.tender_status !== "none" && l.tender_status !== "draft"
  );

  const evalRows: EvalRow[] = lotsWithTender.flatMap((lot) => {
    if (bidders.length === 0) {
      const status = lot.tender_status === "awarded" ? "awarded" : "pending";
      return [{
        lotId: lot.id,
        lotName: lot.lot_name,
        disco: lot.disco,
        bidderName: "Awaiting bids",
        bidderId: "",
        evaluationId: null,
        status,
        r1Score: null,
        r2Score: null,
        r3Score: null,
      }];
    }
    return bidders.map((bidder) => {
      const status = lot.tender_status === "awarded" ? "awarded" : "under_review";
      return {
        lotId: lot.id,
        lotName: lot.lot_name,
        disco: lot.disco,
        bidderName: bidder.company_name,
        bidderId: bidder.id,
        evaluationId: null,
        status,
        r1Score: null,
        r2Score: null,
        r3Score: null,
      };
    });
  });

  const totalBids = evalRows.filter((r) => r.bidderId).length;
  const underReview = evalRows.filter((r) =>
    ["under_review", "pending", "admin_checked", "technical_scored", "financial_scored"].includes(r.status)
  ).length;
  const scored = evalRows.filter((r) => r.r1Score !== null || r.r2Score !== null || r.r3Score !== null).length;
  const awarded = evalRows.filter((r) => r.status === "awarded" || r.status === "recommended").length;

  return (
    <div className="text-[13px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-base font-bold">Bid Evaluation</h1>
          <p className="text-[11px] text-muted-foreground">
            {lotsWithTender.length} lots &middot; {totalBids} bids &middot; {underReview} under review &middot; {awarded} awarded
          </p>
        </div>
      </div>

      <div className="mt-1.5 grid grid-cols-4 gap-2">
        {[
          { label: "Total Bids", value: totalBids },
          { label: "Under Review", value: underReview },
          { label: "Scored", value: scored },
          { label: "Awarded", value: awarded },
        ].map((s) => (
          <div key={s.label} className="rounded border border-border bg-white px-3 py-1">
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
            <div className="font-heading text-lg font-bold leading-tight">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-2 rounded border border-border bg-white">
        <div className="border-b border-border px-3 py-1.5">
          <span className="text-[11px] font-semibold">Evaluation Pipeline</span>
        </div>
        {lotsLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>
        ) : evalRows.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No bids to evaluate. <Link href="/lots" className="text-primary underline">Issue tenders</Link> first.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead className="py-1.5">Lot Name</TableHead>
                  <TableHead className="py-1.5">DisCo</TableHead>
                  <TableHead className="py-1.5">Bidder Name</TableHead>
                  <TableHead className="py-1.5">Status</TableHead>
                  <TableHead className="py-1.5 text-center border-l border-border">Reviewer 1</TableHead>
                  <TableHead className="py-1.5 text-center">Reviewer 2</TableHead>
                  <TableHead className="py-1.5 text-center">Reviewer 3</TableHead>
                  <TableHead className="py-1.5 text-center border-l border-border">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evalRows.map((row, idx) => (
                  <TableRow key={`${row.lotId}-${row.bidderId || idx}`} className="text-[12px]">
                    <TableCell className="py-1 font-medium">{row.lotName}</TableCell>
                    <TableCell className="py-1 font-mono text-[10px]">{row.disco}</TableCell>
                    <TableCell className="py-1">
                      {row.bidderId ? row.bidderName : <span className="italic text-muted-foreground">{row.bidderName}</span>}
                    </TableCell>
                    <TableCell className="py-1">
                      <span className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${STATUS_COLORS[row.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {formatLabel(row.status)}
                      </span>
                    </TableCell>
                    <TableCell className="py-1 text-center border-l border-border">
                      {row.r1Score !== null ? (
                        <span className="font-mono text-[11px] font-semibold text-primary">{fmt(row.r1Score)}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{REVIEWERS[0].name}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1 text-center">
                      {row.r2Score !== null ? (
                        <span className="font-mono text-[11px] font-semibold text-primary">{fmt(row.r2Score)}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{REVIEWERS[1].name}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1 text-center">
                      {row.r3Score !== null ? (
                        <span className="font-mono text-[11px] font-semibold text-primary">{fmt(row.r3Score)}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{REVIEWERS[2].name}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1 text-center border-l border-border">
                      <div className="flex items-center justify-center gap-1">
                        <Link href={`/lots/${row.lotId}`}>
                          <Button variant="outline" size="sm" className="h-5 px-2 text-[10px]">View</Button>
                        </Link>
                        {row.bidderId && (
                          <Button variant="default" size="sm" className="h-5 px-2 text-[10px]">Score Bid</Button>
                        )}
                      </div>
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
