"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function formatUSD(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

const REPORT_STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  final: "bg-green-100 text-green-700",
  locked: "bg-blue-100 text-blue-700",
};

export default function ReportsPage() {
  const queryClient = useQueryClient();

  const [generateForm, setGenerateForm] = useState({
    report_type: "dares_quarterly",
    scope_type: "portfolio",
    scope_id: "",
    period_start: "",
    period_end: "",
    title: "",
  });

  const [gesiForm, setGesiForm] = useState({
    site_id: "",
    period: "",
    female_connections_pct: "",
    female_headed_hh_pct: "",
    women_employed_construction: "",
    women_employed_operations: "",
    youth_employed: "",
    disability_accessible_facilities: "",
    community_meetings_held: "",
    grievances_from_women: "",
  });

  const [carbonSiteId, setCarbonSiteId] = useState("");
  const [gesiSiteId, setGesiSiteId] = useState("");

  const { data: reportsData } = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.reports.list(),
  });

  const { data: benchmarkData } = useQuery({
    queryKey: ["benchmarks"],
    queryFn: () => api.reports.getBenchmarks(),
  });

  const { data: gesiData } = useQuery({
    queryKey: ["gesi", gesiSiteId],
    queryFn: () => api.reports.getGESI(gesiSiteId),
    enabled: !!gesiSiteId,
  });

  const { data: carbonData } = useQuery({
    queryKey: ["carbon", carbonSiteId],
    queryFn: () => api.reports.getCarbon(carbonSiteId),
    enabled: !!carbonSiteId,
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      api.reports.generate({
        report_type: generateForm.report_type,
        title: generateForm.title,
        scope_type: generateForm.scope_type,
        scope_id: generateForm.scope_id || undefined,
        period_start: generateForm.period_start,
        period_end: generateForm.period_end,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      setGenerateForm({
        report_type: "dares_quarterly",
        scope_type: "portfolio",
        scope_id: "",
        period_start: "",
        period_end: "",
        title: "",
      });
    },
  });

  const lockMutation = useMutation({
    mutationFn: (id: string) => api.reports.lock(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.reports.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
  });

  const gesiMutation = useMutation({
    mutationFn: () =>
      api.reports.submitGESI({
        site_id: gesiForm.site_id,
        period: gesiForm.period,
        female_connections_pct: parseFloat(gesiForm.female_connections_pct) || 0,
        female_headed_hh_pct: parseFloat(gesiForm.female_headed_hh_pct) || 0,
        women_employed_construction: parseInt(gesiForm.women_employed_construction) || 0,
        women_employed_operations: parseInt(gesiForm.women_employed_operations) || 0,
        youth_employed: parseInt(gesiForm.youth_employed) || 0,
        disability_accessible_facilities: parseInt(gesiForm.disability_accessible_facilities) || 0,
        community_meetings_held: parseInt(gesiForm.community_meetings_held) || 0,
        grievances_from_women: parseInt(gesiForm.grievances_from_women) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gesi"] });
      setGesiForm({
        site_id: "",
        period: "",
        female_connections_pct: "",
        female_headed_hh_pct: "",
        women_employed_construction: "",
        women_employed_operations: "",
        youth_employed: "",
        disability_accessible_facilities: "",
        community_meetings_held: "",
        grievances_from_women: "",
      });
    },
  });

  const reports = reportsData?.reports || [];
  const gesiMetrics = gesiData?.metrics || [];
  const carbonCredits = carbonData?.credits || [];

  const totalCarbon = carbonCredits.reduce((s, c) => s + c.annual_tco2e_avoided, 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">ESG &amp; Impact Reporting</h1>
          <p className="text-sm text-muted-foreground mt-1">
            DARES quarterly reports, GESI metrics &amp; carbon credit tracking
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Generated Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{reports.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">GESI Metrics Submitted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{gesiMetrics.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Carbon Sites Tracked</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{carbonCredits.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Avg tCO2e/Year</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {carbonCredits.length > 0
                ? (totalCarbon / carbonCredits.length).toFixed(1)
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="reports" className="mt-6">
        <TabsList>
          <TabsTrigger value="reports">Reports ({reports.length})</TabsTrigger>
          <TabsTrigger value="gesi">GESI Metrics</TabsTrigger>
          <TabsTrigger value="carbon">Carbon Credits</TabsTrigger>
          <TabsTrigger value="benchmarks">Benchmarks</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-4">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Generate Report</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Report Type *</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={generateForm.report_type}
                    onChange={(e) => setGenerateForm((f) => ({ ...f, report_type: e.target.value }))}
                  >
                    <option value="dares_quarterly">DARES Quarterly</option>
                    <option value="investor_esg">Investor ESG</option>
                    <option value="carbon_data">Carbon Data</option>
                  </select>
                </div>
                <div>
                  <Label>Scope Type *</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={generateForm.scope_type}
                    onChange={(e) => setGenerateForm((f) => ({ ...f, scope_type: e.target.value }))}
                  >
                    <option value="portfolio">Portfolio</option>
                    <option value="site">Site</option>
                    <option value="national">National</option>
                  </select>
                </div>
                <div>
                  <Label>Scope ID</Label>
                  <Input
                    placeholder="Portfolio or site ID (optional for national)"
                    value={generateForm.scope_id}
                    onChange={(e) => setGenerateForm((f) => ({ ...f, scope_id: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Title *</Label>
                  <Input
                    placeholder="Report title"
                    value={generateForm.title}
                    onChange={(e) => setGenerateForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Period Start *</Label>
                  <Input
                    type="date"
                    value={generateForm.period_start}
                    onChange={(e) => setGenerateForm((f) => ({ ...f, period_start: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Period End *</Label>
                  <Input
                    type="date"
                    value={generateForm.period_end}
                    onChange={(e) => setGenerateForm((f) => ({ ...f, period_end: e.target.value }))}
                  />
                </div>
              </div>
              <Button
                className="mt-4"
                onClick={() => generateMutation.mutate()}
                disabled={
                  generateMutation.isPending ||
                  !generateForm.title ||
                  !generateForm.period_start ||
                  !generateForm.period_end
                }
              >
                {generateMutation.isPending ? "Generating..." : "Generate Report"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              {reports.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No reports generated yet
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell className="font-medium">{report.title}</TableCell>
                        <TableCell className="capitalize">
                          {report.report_type.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell className="capitalize">{report.scope_type}</TableCell>
                        <TableCell className="text-sm">
                          {new Date(report.period_start).toLocaleDateString()} -{" "}
                          {new Date(report.period_end).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={REPORT_STATUS_COLORS[report.status] || "bg-gray-100"}>
                            {report.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {report.status === "draft" && (
                              <Button
                                size="sm"
                                onClick={() => lockMutation.mutate(report.id)}
                                disabled={lockMutation.isPending}
                              >
                                Lock
                              </Button>
                            )}
                            {report.status !== "locked" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => deleteMutation.mutate(report.id)}
                                disabled={deleteMutation.isPending}
                              >
                                Delete
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

        <TabsContent value="gesi" className="mt-4">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Submit GESI Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label>Site ID *</Label>
                  <Input
                    value={gesiForm.site_id}
                    onChange={(e) => setGesiForm((f) => ({ ...f, site_id: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Period * (e.g. 2026-Q2)</Label>
                  <Input
                    placeholder="2026-Q2"
                    value={gesiForm.period}
                    onChange={(e) => setGesiForm((f) => ({ ...f, period: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Female Connections (%)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={gesiForm.female_connections_pct}
                    onChange={(e) => setGesiForm((f) => ({ ...f, female_connections_pct: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Female-Headed HH (%)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={gesiForm.female_headed_hh_pct}
                    onChange={(e) => setGesiForm((f) => ({ ...f, female_headed_hh_pct: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Women Employed (Construction)</Label>
                  <Input
                    type="number"
                    value={gesiForm.women_employed_construction}
                    onChange={(e) => setGesiForm((f) => ({ ...f, women_employed_construction: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Women Employed (Operations)</Label>
                  <Input
                    type="number"
                    value={gesiForm.women_employed_operations}
                    onChange={(e) => setGesiForm((f) => ({ ...f, women_employed_operations: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Youth Employed</Label>
                  <Input
                    type="number"
                    value={gesiForm.youth_employed}
                    onChange={(e) => setGesiForm((f) => ({ ...f, youth_employed: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Disability Accessible Facilities</Label>
                  <Input
                    type="number"
                    value={gesiForm.disability_accessible_facilities}
                    onChange={(e) => setGesiForm((f) => ({ ...f, disability_accessible_facilities: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Community Meetings Held</Label>
                  <Input
                    type="number"
                    value={gesiForm.community_meetings_held}
                    onChange={(e) => setGesiForm((f) => ({ ...f, community_meetings_held: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Grievances from Women</Label>
                  <Input
                    type="number"
                    value={gesiForm.grievances_from_women}
                    onChange={(e) => setGesiForm((f) => ({ ...f, grievances_from_women: e.target.value }))}
                  />
                </div>
              </div>
              <Button
                className="mt-4"
                onClick={() => gesiMutation.mutate()}
                disabled={gesiMutation.isPending || !gesiForm.site_id || !gesiForm.period}
              >
                {gesiMutation.isPending ? "Submitting..." : "Submit GESI Metrics"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>GESI History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-4 mb-4">
                <div className="flex-1">
                  <Label>Load by Site ID</Label>
                  <Input
                    placeholder="Enter site ID"
                    value={gesiSiteId}
                    onChange={(e) => setGesiSiteId(e.target.value)}
                  />
                </div>
              </div>
              {gesiSiteId && gesiMetrics.length === 0 ? (
                <div className="py-4 text-center text-muted-foreground">
                  No GESI metrics for this site
                </div>
              ) : gesiMetrics.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Female Conn %</TableHead>
                      <TableHead className="text-right">Female HH %</TableHead>
                      <TableHead className="text-right">Women (Constr)</TableHead>
                      <TableHead className="text-right">Women (Ops)</TableHead>
                      <TableHead className="text-right">Youth</TableHead>
                      <TableHead className="text-right">Meetings</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gesiMetrics.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.period}</TableCell>
                        <TableCell className="text-right">{m.female_connections_pct.toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{m.female_headed_hh_pct.toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{m.women_employed_construction}</TableCell>
                        <TableCell className="text-right">{m.women_employed_operations}</TableCell>
                        <TableCell className="text-right">{m.youth_employed}</TableCell>
                        <TableCell className="text-right">{m.community_meetings_held}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="carbon" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Carbon Credit Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-4 mb-4">
                <div className="flex-1">
                  <Label>Load by Site ID</Label>
                  <Input
                    placeholder="Enter site ID"
                    value={carbonSiteId}
                    onChange={(e) => setCarbonSiteId(e.target.value)}
                  />
                </div>
              </div>
              {carbonSiteId && carbonCredits.length === 0 ? (
                <div className="py-4 text-center text-muted-foreground">
                  No carbon credits for this site
                </div>
              ) : carbonCredits.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead>Methodology</TableHead>
                      <TableHead className="text-right">tCO2e Avoided</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Credits Issued</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {carbonCredits.map((credit) => (
                      <TableRow key={credit.id}>
                        <TableCell className="font-mono text-xs">{credit.site_id.slice(0, 8)}...</TableCell>
                        <TableCell>{credit.methodology}</TableCell>
                        <TableCell className="text-right">{credit.annual_tco2e_avoided.toFixed(1)}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              credit.credit_status === "issued"
                                ? "bg-green-100 text-green-700"
                                : credit.credit_status === "pending"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-blue-100 text-blue-700"
                            }
                          >
                            {credit.credit_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {credit.credits_issued_count ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {credit.revenue_usd != null ? formatUSD(credit.revenue_usd) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="benchmarks" className="mt-4">
          {benchmarkData ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Total Sites</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{benchmarkData.total_sites}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Avg Availability</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{(benchmarkData.avg_system_availability_pct ?? 0).toFixed(1)}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Total Connections</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{benchmarkData.total_connections ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Avg Connections/Site</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{(benchmarkData.avg_connections_per_site ?? 0).toFixed(0)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Avg Collection Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{(benchmarkData.avg_collection_rate_pct ?? 0).toFixed(1)}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Avg Renewable Fraction</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{(benchmarkData.avg_renewable_fraction_pct ?? 0).toFixed(1)}%</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading benchmark data...
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
