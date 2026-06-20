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

function formatNum(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatUSD(n: number) {
  return "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function formatPct(n: number) {
  return n.toFixed(1) + "%";
}

export default function PerformancePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["performance-records"],
    queryFn: () => api.performance.list(),
  });

  const { data: dashboard } = useQuery({
    queryKey: ["performance-dashboard"],
    queryFn: () => api.performance.dashboard(),
  });

  const { data: reportsData, isLoading: reportsLoading } = useQuery({
    queryKey: ["esg-reports"],
    queryFn: () => api.performance.listReports(),
  });

  const records = data?.records ?? [];
  const reports = reportsData?.reports ?? [];
  const stats = dashboard as Record<string, any> | undefined;

  return (
    <div>
      <div>
        <h1 className="font-heading text-2xl font-bold">
          Performance & M&E
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor operational KPIs, track ESG metrics, and generate compliance
          reports across all minigrid sites
        </p>
      </div>

      {/* Dashboard Stats */}
      {stats && (
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Total Sites
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatNum(stats.total_sites ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Total Connections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatNum(stats.total_connections ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Avg Availability %
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-700">
                {formatPct(stats.avg_availability_pct ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Avg Collection Rate %
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-700">
                {formatPct(stats.avg_collection_rate_pct ?? 0)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="kpis" className="mt-6">
        <TabsList>
          <TabsTrigger value="kpis">
            Operational KPIs
          </TabsTrigger>
          <TabsTrigger value="esg">
            ESG Reports ({reports.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Operational KPIs */}
        <TabsContent value="kpis" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  Loading performance records...
                </div>
              ) : records.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No performance records found.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Connections</TableHead>
                      <TableHead className="text-right">PUE</TableHead>
                      <TableHead className="text-right">kWh Generated</TableHead>
                      <TableHead className="text-right">kWh Sold</TableHead>
                      <TableHead className="text-right">Revenue ($)</TableHead>
                      <TableHead className="text-right">Availability %</TableHead>
                      <TableHead className="text-right">Collection %</TableHead>
                      <TableHead className="text-right">Renewable %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">
                          {r.site_id}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {r.month}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNum(r.connections)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNum(r.pue_connections)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNum(r.kwh_generated)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNum(r.kwh_sold)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatUSD(r.revenue_usd)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <span
                            className={
                              r.availability_pct >= 90
                                ? "text-green-700"
                                : r.availability_pct >= 70
                                ? "text-amber-700"
                                : "text-red-700"
                            }
                          >
                            {formatPct(r.availability_pct)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <span
                            className={
                              r.collection_rate_pct >= 85
                                ? "text-green-700"
                                : r.collection_rate_pct >= 60
                                ? "text-amber-700"
                                : "text-red-700"
                            }
                          >
                            {formatPct(r.collection_rate_pct)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatPct(r.renewable_fraction_pct)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: ESG Reports */}
        <TabsContent value="esg" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {reportsLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  Loading ESG reports...
                </div>
              ) : reports.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No ESG reports generated yet.
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
                      <TableHead>Generated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell className="font-medium text-sm">
                          {report.title}
                        </TableCell>
                        <TableCell className="text-sm">
                          {report.report_type}
                        </TableCell>
                        <TableCell className="text-sm">
                          {report.scope_type}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {report.period_start} - {report.period_end}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-xs ${
                              report.status === "final"
                                ? "bg-green-100 text-green-800"
                                : report.status === "locked"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {report.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(report.generated_at).toLocaleDateString()}
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
