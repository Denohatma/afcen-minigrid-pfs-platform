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

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  admin_check: "bg-amber-100 text-amber-800",
  technical: "bg-blue-100 text-blue-800",
  financial: "bg-indigo-100 text-indigo-800",
  recommended: "bg-green-100 text-green-800",
  awarded: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-amber-100 text-amber-800",
};

const STAGE_RESPONSIBLE: Record<string, string> = {
  pending: "—",
  admin_check: "PMU Admin Officer",
  technical: "Technical Evaluator",
  financial: "Financial Evaluator",
  recommended: "Evaluation Committee",
  awarded: "REA PMU Director",
  submitted: "Bidder",
  under_review: "Evaluation Committee",
};

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function EvaluationsPage() {
  const { data: lotsData, isLoading } = useQuery({
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

  interface EvalRow {
    lotId: string;
    lotName: string;
    disco: string;
    bidderName: string;
    bidderId: string;
    status: string;
    responsible: string;
  }

  const evalRows: EvalRow[] = lotsWithTender.flatMap((lot) => {
    if (bidders.length === 0) {
      const status = lot.tender_status === "awarded" ? "awarded" : lot.tender_status === "issued" ? "pending" : "under_review";
      return [{ lotId: lot.id, lotName: lot.lot_name, disco: lot.disco, bidderName: "Awaiting bids", bidderId: "", status, responsible: STAGE_RESPONSIBLE[status] || "—" }];
    }
    return bidders.map((bidder) => {
      const status = lot.tender_status === "awarded" ? "awarded" : lot.tender_status === "issued" ? "submitted" : "under_review";
      return { lotId: lot.id, lotName: lot.lot_name, disco: lot.disco, bidderName: bidder.company_name, bidderId: bidder.id, status, responsible: STAGE_RESPONSIBLE[status] || "—" };
    });
  });

  const totalBids = evalRows.filter((r) => r.bidderId).length;
  const underReview = evalRows.filter((r) => ["under_review", "admin_check", "technical", "financial"].includes(r.status)).length;
  const awarded = evalRows.filter((r) => r.status === "awarded").length;

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

      <div className="mt-2 rounded border border-border bg-white">
        {isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>
        ) : evalRows.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No bids to evaluate. <Link href="/lots" className="text-primary underline">Issue tenders</Link> first.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead className="py-1.5">Lot Name</TableHead>
                <TableHead className="py-1.5">DisCo</TableHead>
                <TableHead className="py-1.5">Bidder Name</TableHead>
                <TableHead className="py-1.5">Status</TableHead>
                <TableHead className="py-1.5">Responsible Person</TableHead>
                <TableHead className="py-1.5">Actions</TableHead>
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
                  <TableCell className="py-1 text-muted-foreground">{row.responsible}</TableCell>
                  <TableCell className="py-1">
                    <Link href={`/lots/${row.lotId}`}>
                      <Button variant="outline" size="sm" className="h-5 px-2 text-[10px]">View Bid</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
