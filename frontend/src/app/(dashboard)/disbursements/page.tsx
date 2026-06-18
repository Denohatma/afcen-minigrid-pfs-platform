"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  disbursed: "bg-primary text-white",
  overdue: "bg-red-100 text-red-700",
};

function formatUSD(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

export default function DisbursementsPage() {
  const queryClient = useQueryClient();

  const { data: dashboard } = useQuery({
    queryKey: ["disbursements-dashboard"],
    queryFn: () => api.disbursements.dashboard(),
  });

  const { data: milestonesData } = useQuery({
    queryKey: ["milestones"],
    queryFn: () => api.disbursements.list(),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.disbursements.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
      queryClient.invalidateQueries({ queryKey: ["disbursements-dashboard"] });
    },
  });

  const disburseMutation = useMutation({
    mutationFn: (id: string) => api.disbursements.disburse(id, { payment_reference: `PAY-${Date.now()}` }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
      queryClient.invalidateQueries({ queryKey: ["disbursements-dashboard"] });
    },
  });

  const milestones = milestonesData?.milestones || [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">RBF Grant Disbursements</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Results-based financing milestone tracking &amp; disbursement management
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Committed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUSD(dashboard?.total_committed || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Disbursed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatUSD(dashboard?.total_disbursed || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Remaining</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{formatUSD(dashboard?.total_remaining || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {dashboard?.total_committed
                ? ((dashboard.total_disbursed / dashboard.total_committed) * 100).toFixed(0)
                : 0}%
            </p>
            <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{
                  width: `${dashboard?.total_committed ? (dashboard.total_disbursed / dashboard.total_committed) * 100 : 0}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="milestones" className="mt-6">
        <TabsList>
          <TabsTrigger value="milestones">All Milestones ({milestones.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending Review ({milestones.filter(m => m.status === "submitted" || m.status === "under_review").length})</TabsTrigger>
          <TabsTrigger value="developers">By Developer</TabsTrigger>
        </TabsList>

        <TabsContent value="milestones" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {milestones.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No milestones created yet. Set up milestones from an awarded tender.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead>Milestone</TableHead>
                      <TableHead>Tranche</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Target Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {milestones.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.site_name}</TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">M{m.milestone_number}</span>
                            <span className="text-sm text-muted-foreground ml-2">{m.title}</span>
                          </div>
                        </TableCell>
                        <TableCell>{(m.tranche_pct * 100).toFixed(0)}%</TableCell>
                        <TableCell className="text-right">{formatUSD(m.grant_amount_usd)}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[m.status] || "bg-gray-100 text-gray-700"}>
                            {m.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {m.target_date ? new Date(m.target_date).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {(m.status === "submitted" || m.status === "under_review") && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => approveMutation.mutate(m.id)}
                                disabled={approveMutation.isPending}
                              >
                                Approve
                              </Button>
                            )}
                            {m.status === "approved" && (
                              <Button
                                size="sm"
                                onClick={() => disburseMutation.mutate(m.id)}
                                disabled={disburseMutation.isPending}
                              >
                                Disburse
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>Milestone</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {milestones
                    .filter(m => m.status === "submitted" || m.status === "under_review")
                    .map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.site_name}</TableCell>
                        <TableCell>M{m.milestone_number}: {m.title}</TableCell>
                        <TableCell className="text-right">{formatUSD(m.grant_amount_usd)}</TableCell>
                        <TableCell>{m.submitted_at ? new Date(m.submitted_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{m.evidence?.length || 0} files</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => approveMutation.mutate(m.id)}
                            disabled={approveMutation.isPending}
                          >
                            Approve
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="developers" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(dashboard?.by_developer || []).map((dev) => (
              <Card key={dev.developer}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{dev.developer}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Sites</p>
                      <p className="font-bold">{dev.sites}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Committed</p>
                      <p className="font-bold">{formatUSD(dev.committed)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Disbursed</p>
                      <p className="font-bold text-green-600">{formatUSD(dev.disbursed)}</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 w-full rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-green-500 transition-all"
                      style={{ width: `${dev.committed ? (dev.disbursed / dev.committed) * 100 : 0}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
