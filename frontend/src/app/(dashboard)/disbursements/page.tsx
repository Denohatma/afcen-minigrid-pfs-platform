"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ── Milestone status badges ─────────────────────────────────────────

const MILESTONE_STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-500/20 text-gray-300",
  submitted: "bg-blue-500/20 text-blue-400",
  iva_verified: "bg-amber-500/20 text-amber-400",
  rea_approved: "bg-indigo-100 text-indigo-700",
  disbursed: "bg-emerald-500/20 text-emerald-400",
};

const APPROVAL_COLORS: Record<string, string> = {
  not_started: "bg-gray-500/20 text-gray-400",
  pending: "bg-gray-500/20 text-gray-400",
  submitted: "bg-blue-500/20 text-blue-400",
  in_progress: "bg-amber-500/20 text-amber-400",
  verified: "bg-emerald-500/20 text-emerald-400",
  approved: "bg-emerald-500/20 text-emerald-400",
  passed: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-red-500/20 text-red-400",
  rejected: "bg-red-500/20 text-red-400",
};

// ── Disbursement payment status badges ──────────────────────────────

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-500/20 text-gray-300",
  iva_verified: "bg-amber-500/20 text-amber-400",
  rea_approved: "bg-blue-500/20 text-blue-400",
  grant_admin_approved: "bg-indigo-100 text-indigo-700",
  paid: "bg-emerald-500/20 text-emerald-400",
};

function formatUSD(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatLabel(s: string) {
  return s.replace(/_/g, " ");
}

// ── Approval step indicator ─────────────────────────────────────────

function ApprovalBadge({ value }: { value: string | null | undefined }) {
  const label = value ? formatLabel(value) : "pending";
  const color =
    APPROVAL_COLORS[value || "pending"] || "bg-gray-500/20 text-gray-400";
  return <Badge className={color}>{label}</Badge>;
}

export default function DisbursementsPage() {
  // ── Milestones data ───────────────────────────────────────────────

  const { data: milestoneDashboard } = useQuery({
    queryKey: ["milestones-dashboard"],
    queryFn: () => api.milestones.dashboard(),
  });

  const { data: milestonesData } = useQuery({
    queryKey: ["milestones"],
    queryFn: () => api.milestones.list(),
  });

  // ── Disbursements data ────────────────────────────────────────────

  const { data: disbursementDashboard } = useQuery({
    queryKey: ["disbursements-dashboard"],
    queryFn: () => api.disbursements.dashboard(),
  });

  const { data: disbursementsData } = useQuery({
    queryKey: ["disbursements"],
    queryFn: () => api.disbursements.list(),
  });

  const milestones = milestonesData?.milestones || [];
  const disbursements = disbursementsData?.disbursements || [];

  // ── Derive milestone counts ───────────────────────────────────────

  const msDash = milestoneDashboard as Record<string, unknown> | undefined;
  const totalMilestones =
    (msDash?.total_milestones as number) ?? milestones.length;
  const submittedCount =
    (msDash?.submitted as number) ??
    milestones.filter((m) => m.status === "submitted").length;
  const verifiedCount =
    (msDash?.verified as number) ??
    milestones.filter((m) => m.status === "iva_verified").length;
  const approvedCount =
    (msDash?.approved as number) ??
    milestones.filter((m) => m.status === "rea_approved").length;
  const disbursedMsCount =
    (msDash?.disbursed as number) ??
    milestones.filter((m) => m.status === "disbursed").length;

  // ── Derive disbursement amounts ───────────────────────────────────

  const dDash = disbursementDashboard as Record<string, unknown> | undefined;
  const totalCommitted = (dDash?.total_committed as number) ?? 0;
  const totalDisbursed = (dDash?.total_disbursed as number) ?? 0;
  const totalPipeline = (dDash?.pipeline as number) ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            Milestones &amp; Disbursement
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            RBF milestone verification, 4-role approval chain &amp; grant
            disbursement tracking
          </p>
        </div>
      </div>

      <Tabs defaultValue="milestones" className="mt-6">
        <TabsList>
          <TabsTrigger value="milestones">
            Milestones ({milestones.length})
          </TabsTrigger>
          <TabsTrigger value="disbursements">
            Disbursements ({disbursements.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Milestones ──────────────────────────────────────── */}

        <TabsContent value="milestones" className="mt-4">
          <div className="grid gap-4 md:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Total Milestones
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalMilestones}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Submitted
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-400">
                  {submittedCount}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  IVA Verified
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-amber-400">
                  {verifiedCount}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  REA Approved
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-indigo-600">
                  {approvedCount}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Disbursed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-400">
                  {disbursedMsCount}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardContent className="pt-6">
              {milestones.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No milestones created yet. Create milestones from a grant
                  agreement.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Tranche %</TableHead>
                      <TableHead className="text-right">Grant Amount</TableHead>
                      <TableHead>IVA Status</TableHead>
                      <TableHead>REA Approval</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Target Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {milestones.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.title}</TableCell>
                        <TableCell className="capitalize">
                          {formatLabel(m.milestone_type)}
                        </TableCell>
                        <TableCell className="text-right">
                          {(m.tranche_pct * 100).toFixed(0)}%
                        </TableCell>
                        <TableCell className="text-right">
                          {formatUSD(m.grant_amount_usd)}
                        </TableCell>
                        <TableCell>
                          <ApprovalBadge value={m.iva_status} />
                        </TableCell>
                        <TableCell>
                          <ApprovalBadge value={m.rea_approval_status} />
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              MILESTONE_STATUS_COLORS[m.status] ||
                              "bg-gray-500/20 text-gray-300"
                            }
                          >
                            {formatLabel(m.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {m.target_date
                            ? new Date(m.target_date).toLocaleDateString()
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Disbursements ───────────────────────────────────── */}

        <TabsContent value="disbursements" className="mt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Total Committed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatUSD(totalCommitted)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Disbursed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-400">
                  {formatUSD(totalDisbursed)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-amber-400">
                  {formatUSD(totalPipeline)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardContent className="pt-6">
              {disbursements.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No disbursements recorded yet
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Milestone</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Evidence</TableHead>
                        <TableHead>IVA Verify</TableHead>
                        <TableHead>REA Approve</TableHead>
                        <TableHead>Grant Admin</TableHead>
                        <TableHead>Payment Status</TableHead>
                        <TableHead>Reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {disbursements.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-mono text-xs">
                            {d.milestone_id.slice(0, 8)}...
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatUSD(d.amount_usd)}
                          </TableCell>

                          {/* 4-role approval chain */}
                          <TableCell>
                            {d.evidence_submitted_at ? (
                              <Badge className="bg-emerald-500/20 text-emerald-400">
                                submitted
                              </Badge>
                            ) : (
                              <Badge className="bg-gray-500/20 text-gray-400">
                                pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {d.iva_verified_at ? (
                              <Badge className="bg-emerald-500/20 text-emerald-400">
                                verified
                              </Badge>
                            ) : (
                              <Badge className="bg-gray-500/20 text-gray-400">
                                pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {d.rea_approved_at ? (
                              <Badge className="bg-emerald-500/20 text-emerald-400">
                                approved
                              </Badge>
                            ) : (
                              <Badge className="bg-gray-500/20 text-gray-400">
                                pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {d.grant_admin_approved_at ? (
                              <Badge className="bg-emerald-500/20 text-emerald-400">
                                approved
                              </Badge>
                            ) : (
                              <Badge className="bg-gray-500/20 text-gray-400">
                                pending
                              </Badge>
                            )}
                          </TableCell>

                          {/* Payment status */}
                          <TableCell>
                            <Badge
                              className={
                                PAYMENT_STATUS_COLORS[d.payment_status] ||
                                "bg-gray-500/20 text-gray-300"
                              }
                            >
                              {formatLabel(d.payment_status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {d.payment_reference || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
