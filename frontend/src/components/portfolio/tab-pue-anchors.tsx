"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TabPueAnchorsProps {
  portfolioId: string;
}

interface PueSector {
  sector: string;
  value_chains: string[];
  potential_revenue_usd?: number;
}

export function TabPueAnchors({ portfolioId }: TabPueAnchorsProps) {
  const { data: portfolio, isLoading } = useQuery({
    queryKey: ["portfolio", portfolioId],
    queryFn: () => api.portfolios.get(portfolioId),
  });

  const completedSites = (portfolio?.sites ?? []).filter(
    (s) => s.pipeline_status === "completed"
  );

  if (isLoading) {
    return (
      <div className="mt-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg border bg-muted" />
        ))}
      </div>
    );
  }

  if (completedSites.length === 0) {
    return (
      <div className="mt-4 flex h-48 items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">
          No completed sites yet. Run the energy design pipeline first.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-6">
      <div>
        <h3 className="font-heading text-lg font-semibold">Productive Use of Energy &amp; Anchor Loads</h3>
        <p className="text-sm text-muted-foreground">
          Top productive use sectors and value chains for each site.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {completedSites.map((site) => {
          const pueData = (site.results?.productive_use ?? {}) as Record<string, unknown>;
          const sectors = (pueData.sectors ?? pueData.top_sectors ?? []) as PueSector[];
          const topSectors = sectors.slice(0, 3);

          return (
            <Card key={site.id}>
              <CardHeader>
                <CardTitle>{site.settlement_data.village}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{site.settlement_data.state}</span>
                  <span>&middot;</span>
                  <span>{site.settlement_data.connections} connections</span>
                </div>

                {topSectors.length > 0 ? (
                  <div className="space-y-2">
                    {topSectors.map((sector, idx) => (
                      <div key={idx} className="rounded-md border p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{sector.sector}</span>
                          {sector.potential_revenue_usd != null && (
                            <Badge variant="secondary">
                              ${sector.potential_revenue_usd.toLocaleString()}/yr
                            </Badge>
                          )}
                        </div>
                        {sector.value_chains && sector.value_chains.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {sector.value_chains.map((vc, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {vc}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No PUE data available.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
