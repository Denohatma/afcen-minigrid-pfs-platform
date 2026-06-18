"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TabFinancialsProps {
  portfolioId: string;
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function TabFinancials({ portfolioId }: TabFinancialsProps) {
  const { data: results, isLoading, error } = useQuery({
    queryKey: ["portfolio-results", portfolioId],
    queryFn: () => api.portfolios.results(portfolioId),
  });

  if (isLoading) {
    return (
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg border bg-muted" />
        ))}
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="mt-4 flex h-48 items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">
          {error ? (error as Error).message : "No financial results available yet. Run the pipeline first."}
        </p>
      </div>
    );
  }

  const fmt = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="mt-4 space-y-6">
      <div>
        <h3 className="font-heading text-lg font-semibold">Portfolio Financial Summary</h3>
        <p className="text-sm text-muted-foreground">
          Aggregated financial metrics for {results.portfolio_name} ({results.disco_name}).
          {results.sites_completed} sites completed.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Total CAPEX"
          value={fmt(results.total_capex_usd)}
          sub={`Across ${results.sites_completed} sites`}
        />
        <MetricCard
          label="Total Connections"
          value={results.total_connections.toLocaleString()}
          sub="Households & businesses"
        />
        <MetricCard
          label="Avg LCOE"
          value={`$${results.avg_lcoe.toFixed(3)}/kWh`}
          sub="Weighted average"
        />
        <MetricCard
          label="Total PV Capacity"
          value={`${results.total_pv_mwp.toFixed(2)} MWp`}
          sub={`${results.total_pv_kwp.toLocaleString()} kWp`}
        />
        <MetricCard
          label="Total Battery"
          value={`${results.total_battery_mwh.toFixed(2)} MWh`}
          sub={`${results.total_battery_kwh.toLocaleString()} kWh`}
        />
        <MetricCard
          label="Avg IRR"
          value={`${(results.avg_irr * 100).toFixed(1)}%`}
          sub="Portfolio average"
        />
        <MetricCard
          label="Total Grant Required"
          value={fmt(results.total_grant_usd)}
          sub="Subsidy component"
        />
        <MetricCard
          label="Grant per Connection"
          value={fmt(results.avg_grant_per_connection)}
          sub="Average across portfolio"
        />
      </div>
    </div>
  );
}
