"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

interface TabSummaryProps {
  portfolioId: string;
}

export function TabSummary({ portfolioId }: TabSummaryProps) {
  const { data: portfolio, isLoading: loadingPortfolio } = useQuery({
    queryKey: ["portfolio", portfolioId],
    queryFn: () => api.portfolios.get(portfolioId),
  });

  const { data: results, isLoading: loadingResults } = useQuery({
    queryKey: ["portfolio-results", portfolioId],
    queryFn: () => api.portfolios.results(portfolioId),
  });

  const isLoading = loadingPortfolio || loadingResults;

  if (isLoading) {
    return (
      <div className="mt-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted" />
        ))}
      </div>
    );
  }

  if (!portfolio || !results) {
    return (
      <div className="mt-4 flex h-48 items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">
          No summary available. Complete the pipeline first.
        </p>
      </div>
    );
  }

  const completedSites = portfolio.sites.filter((s) => s.pipeline_status === "completed");
  const fmt = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const handleDownload = () => {
    const summaryData = {
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        disco: portfolio.disco_name,
        status: portfolio.status,
        total_sites: portfolio.sites.length,
        completed_sites: completedSites.length,
      },
      financials: results,
      sites: completedSites.map((s) => ({
        village: s.settlement_data.village,
        state: s.settlement_data.state,
        lga: s.settlement_data.lga,
        population: s.settlement_data.population,
        connections: s.settlement_data.connections,
        arpu: s.arpu,
        results: s.results,
      })),
    };
    const blob = new Blob([JSON.stringify(summaryData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${portfolio.name.replace(/\s+/g, "_")}_summary.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-lg font-semibold">Portfolio Summary</h3>
          <p className="text-sm text-muted-foreground">
            {portfolio.name} &mdash; {portfolio.disco_name}
          </p>
        </div>
        <Button variant="outline" onClick={handleDownload}>
          Download Summary (JSON)
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader><CardTitle>Sites</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{completedSites.length} / {portfolio.sites.length}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardTitle>Total CAPEX</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{fmt(results.total_capex_usd)}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardTitle>Total Connections</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{results.total_connections.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardTitle>Avg LCOE</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xl font-bold">${results.avg_lcoe.toFixed(3)}/kWh</p>
          </CardContent>
        </Card>
      </div>

      {/* Sites Summary Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Village</TableHead>
              <TableHead>State</TableHead>
              <TableHead>LGA</TableHead>
              <TableHead>Population</TableHead>
              <TableHead>Connections</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>ARPU ($)</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {portfolio.sites.map((site) => (
              <TableRow key={site.id}>
                <TableCell className="font-medium">{site.settlement_data.village}</TableCell>
                <TableCell>{site.settlement_data.state}</TableCell>
                <TableCell>{site.settlement_data.lga}</TableCell>
                <TableCell>{site.settlement_data.population.toLocaleString()}</TableCell>
                <TableCell>{site.settlement_data.connections.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {site.settlement_data.recommended_mg_type.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell className="font-semibold">
                  {site.arpu > 0 ? `$${site.arpu.toFixed(2)}` : "-"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      site.pipeline_status === "completed"
                        ? "default"
                        : site.pipeline_status === "running"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {site.pipeline_status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
