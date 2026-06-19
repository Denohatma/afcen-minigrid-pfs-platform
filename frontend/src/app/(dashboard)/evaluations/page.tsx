"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Lot } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/* ── Status badge colour maps ─────────────────────────────────────── */

const TENDER_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  issued: "bg-green-100 text-green-700",
  open: "bg-green-100 text-green-700",
  closed: "bg-amber-100 text-amber-700",
  under_evaluation: "bg-blue-100 text-blue-700",
  awarded: "bg-primary text-white",
};

const EVAL_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  "in progress": "bg-blue-100 text-blue-700",
  complete: "bg-green-100 text-green-700",
  admin_check: "bg-yellow-100 text-yellow-700",
  technical: "bg-blue-100 text-blue-700",
  financial: "bg-indigo-100 text-indigo-700",
  recommended: "bg-emerald-100 text-emerald-700",
};

const NO_OBJECTION_COLORS: Record<string, string> = {
  not_submitted: "bg-gray-100 text-gray-700",
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const FLAG_SEVERITY_COLORS: Record<string, string> = {
  none: "bg-green-100 text-green-700",
  low: "bg-yellow-100 text-yellow-700",
  medium: "bg-orange-100 text-orange-700",
  high: "bg-red-100 text-red-700",
};

/* ── Helpers ──────────────────────────────────────────────────────── */

function tenderStatusLabel(lot: Lot): string {
  if (!lot.tender_status || lot.tender_status === "none") return "No tender";
  return lot.tender_status.replace(/_/g, " ");
}

function evaluationStatusLabel(lot: Lot): string {
  if (!lot.tender_status || lot.tender_status === "none") return "—";
  return lot.tender_status === "awarded"
    ? "complete"
    : lot.tender_status === "under_evaluation"
    ? "in progress"
    : "pending";
}

/* ── Page component ───────────────────────────────────────────────── */

export default function EvaluationsPage() {
  const { data: lotsData, isLoading } = useQuery({
    queryKey: ["lots"],
    queryFn: () => api.lots.list(),
  });

  const lots = lotsData?.lots || [];

  /* Summary counters */
  const withTender = lots.filter((l) => l.tender_status && l.tender_status !== "none");
  const underEval = lots.filter(
    (l) => l.tender_status === "under_evaluation"
  );
  const awarded = lots.filter((l) => l.tender_status === "awarded");

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            Bid Evaluation &amp; No-Objection
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            5-stage evaluation: Administrative responsiveness, Technical
            scoring, Financial scoring, AI flag review, and World Bank
            no-objection
          </p>
        </div>
      </div>

      {/* ── Summary cards ──────────────────────────────────────────── */}
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total Lots
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{lots.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              With Tenders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{withTender.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Under Evaluation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              {underEval.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Awarded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {awarded.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Lots table ─────────────────────────────────────────────── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Lot Evaluation Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading lots...
            </div>
          ) : lots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <svg
                className="h-12 w-12 text-muted-foreground/50 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="font-semibold text-lg">No lots found</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Create lots and launch tenders before evaluating bids
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot Name</TableHead>
                  <TableHead>DisCo</TableHead>
                  <TableHead>Sites</TableHead>
                  <TableHead>Tender Status</TableHead>
                  <TableHead>Evaluation Status</TableHead>
                  <TableHead>No-Objection</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((lot) => {
                  const hasTender = !!lot.tender_status && lot.tender_status !== "none";
                  const tenderStatus = lot.tender_status || "";
                  const evalStatus = evaluationStatusLabel(lot);

                  return (
                    <TableRow key={lot.id}>
                      {/* Lot Name */}
                      <TableCell className="font-medium">
                        {lot.lot_name}
                      </TableCell>

                      {/* DisCo */}
                      <TableCell>{lot.disco}</TableCell>

                      {/* Site count */}
                      <TableCell>{lot.site_count}</TableCell>

                      {/* Tender Status */}
                      <TableCell>
                        {hasTender ? (
                          <Badge
                            className={
                              TENDER_STATUS_COLORS[tenderStatus] ||
                              "bg-gray-100 text-gray-700"
                            }
                          >
                            {tenderStatusLabel(lot)}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            No tender
                          </span>
                        )}
                      </TableCell>

                      {/* Evaluation Status */}
                      <TableCell>
                        {hasTender ? (
                          <Badge
                            className={
                              EVAL_STATUS_COLORS[evalStatus] ||
                              "bg-gray-100 text-gray-700"
                            }
                          >
                            {evalStatus}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>

                      {/* No-Objection */}
                      <TableCell>
                        {hasTender &&
                        lot.tender_status === "awarded" ? (
                          <Badge
                            className={
                              NO_OBJECTION_COLORS["approved"] ||
                              "bg-green-100 text-green-700"
                            }
                          >
                            approved
                          </Badge>
                        ) : hasTender ? (
                          <Badge
                            className={
                              NO_OBJECTION_COLORS["not_submitted"]
                            }
                          >
                            not submitted
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        {hasTender ? (
                          <Link
                            href={`/evaluations/${lot.id}`}
                          >
                            <Button size="sm" variant="outline">
                              View
                            </Button>
                          </Link>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled
                          >
                            View
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
