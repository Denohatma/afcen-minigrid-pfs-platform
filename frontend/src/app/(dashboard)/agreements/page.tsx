"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  terminated: "bg-red-100 text-red-700",
};

const PBG_COLORS: Record<string, string> = {
  not_assigned: "bg-gray-100 text-gray-700",
  assigned: "bg-green-100 text-green-700",
};

const CP_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  verified: "bg-green-100 text-green-700",
  returned: "bg-amber-100 text-amber-700",
  waived: "bg-purple-100 text-purple-700",
  overdue: "bg-red-100 text-red-700",
};

function formatUSD(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

export default function AgreementsPage() {
  const { data: dashboard } = useQuery({
    queryKey: ["agreements-dashboard"],
    queryFn: () => api.agreements.dashboard(),
  });

  const { data: agreementsData } = useQuery({
    queryKey: ["agreements"],
    queryFn: () => api.agreements.list(),
  });

  const { data: cpDashboard } = useQuery({
    queryKey: ["cps-dashboard"],
    queryFn: () => api.cps.dashboard(),
  });

  const agreements = agreementsData?.agreements || [];
  const dash = dashboard as Record<string, unknown> | undefined;
  const cpDash = cpDashboard as Record<string, unknown> | undefined;

  const totalAgreements = (dash?.total_agreements as number) || agreements.length;
  const activeCount = (dash?.active_count as number) || agreements.filter(a => a.status === "active").length;
  const totalGrantValue = (dash?.total_grant_value as number) || agreements.reduce((sum, a) => sum + a.grant_amount_usd, 0);
  const totalRingfenced = (dash?.total_ringfenced as number) || agreements.reduce((sum, a) => sum + a.ringfenced_amount, 0);

  const cpTotal = (cpDash?.total_cps as number) || 0;
  const cpVerified = (cpDash?.verified as number) || 0;
  const cpPending = (cpDash?.pending as number) || 0;
  const cpSubmitted = (cpDash?.submitted as number) || 0;
  const cpReturned = (cpDash?.returned as number) || 0;
  const cpWaived = (cpDash?.waived as number) || 0;
  const cpOverdue = (cpDash?.overdue as number) || 0;
  const cpCompletionPct = cpTotal > 0 ? (((cpVerified + cpWaived) / cpTotal) * 100) : 0;

  // Collect all CPs from agreements that have them
  const allCPs = agreements.flatMap(a =>
    (a.cps || []).map(cp => ({ ...cp, agreement_id_short: shortId(a.id) }))
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Agreements &amp; Conditions Precedent</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Grant agreement management and CP tracking (Modules 7-8)
          </p>
        </div>
      </div>

      <Tabs defaultValue="agreements" className="mt-6">
        <TabsList>
          <TabsTrigger value="agreements">Grant Agreements ({agreements.length})</TabsTrigger>
          <TabsTrigger value="cps">Conditions Precedent</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Grant Agreements ──────────────────────────────────── */}
        <TabsContent value="agreements" className="mt-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Agreements</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalAgreements}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Active</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">{activeCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Grant Value</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatUSD(totalGrantValue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Ringfenced</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-amber-600">{formatUSD(totalRingfenced)}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardContent className="pt-6">
              {agreements.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No grant agreements created yet. Agreements are generated after tender award.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agreement ID</TableHead>
                      <TableHead>Lot</TableHead>
                      <TableHead className="text-right">Grant Amount</TableHead>
                      <TableHead className="text-right">Grant %</TableHead>
                      <TableHead className="text-right">CAPEX Ceiling</TableHead>
                      <TableHead>PBG Status</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Effective Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agreements.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium font-mono text-sm">{shortId(a.id)}</TableCell>
                        <TableCell>{a.lot_id ? shortId(a.lot_id) : "—"}</TableCell>
                        <TableCell className="text-right">{formatUSD(a.grant_amount_usd)}</TableCell>
                        <TableCell className="text-right">{(a.grant_pct * 100).toFixed(0)}%</TableCell>
                        <TableCell className="text-right">{formatUSD(a.eligible_capex_ceiling_usd)}</TableCell>
                        <TableCell>
                          <Badge className={PBG_COLORS[a.pbg_assignment_status] || "bg-gray-100 text-gray-700"}>
                            {a.pbg_assignment_status?.replace(/_/g, " ") || "unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[a.status] || "bg-gray-100 text-gray-700"}>
                            {a.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {a.effective_date ? new Date(a.effective_date).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Conditions Precedent ──────────────────────────────── */}
        <TabsContent value="cps" className="mt-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total CPs</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{cpTotal}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Verified</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">{cpVerified}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Pending / Submitted</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-amber-600">{cpPending + cpSubmitted}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Completion</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{cpCompletionPct.toFixed(0)}%</p>
                <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-green-500 transition-all"
                    style={{ width: `${cpCompletionPct}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Returned</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-amber-600">{cpReturned}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Waived</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-purple-600">{cpWaived}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Overdue</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-600">{cpOverdue}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">CP Status by Agreement</CardTitle>
            </CardHeader>
            <CardContent>
              {allCPs.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No conditions precedent recorded. CPs are attached to grant agreements.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agreement</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Verified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allCPs.map((cp) => (
                      <TableRow key={cp.id}>
                        <TableCell className="font-mono text-sm">{cp.agreement_id_short}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{cp.cp_category?.replace(/_/g, " ") || "—"}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{cp.title}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {cp.owner_role?.replace(/_/g, " ") || "—"}
                        </TableCell>
                        <TableCell>
                          {cp.due_date ? new Date(cp.due_date).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={CP_STATUS_COLORS[cp.status] || "bg-gray-100 text-gray-700"}>
                            {cp.status?.replace(/_/g, " ") || "unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {cp.verified_at ? new Date(cp.verified_at).toLocaleDateString() : "—"}
                        </TableCell>
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
