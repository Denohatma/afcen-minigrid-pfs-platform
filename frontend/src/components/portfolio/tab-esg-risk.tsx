"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

interface TabEsgRiskProps {
  portfolioId: string;
}

export function TabEsgRisk({ portfolioId }: TabEsgRiskProps) {
  const { data: portfolio, isLoading } = useQuery({
    queryKey: ["portfolio", portfolioId],
    queryFn: () => api.portfolios.get(portfolioId),
  });

  const completedSites = (portfolio?.sites ?? []).filter(
    (s) => s.pipeline_status === "completed"
  );

  if (isLoading) {
    return (
      <div className="mt-4 space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
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
        <h3 className="font-heading text-lg font-semibold">ESG Screening &amp; Risk Assessment</h3>
        <p className="text-sm text-muted-foreground">
          Environmental, social, and governance screening results per site.
        </p>
      </div>

      <div className="max-h-[500px] overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site</TableHead>
              <TableHead>State</TableHead>
              <TableHead>ESIA Category</TableHead>
              <TableHead>Security Risk</TableHead>
              <TableHead>Overall Risk</TableHead>
              <TableHead>Top Risk</TableHead>
              <TableHead>Biodiversity</TableHead>
              <TableHead>Flood Risk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {completedSites.map((site) => {
              const ess = (site.results?.ess_screening ?? {}) as Record<string, unknown>;
              const risk = (site.results?.risk_assessment ?? {}) as Record<string, unknown>;

              const esiaCategory = String(ess.esia_category ?? ess.ifc_category ?? "N/A");
              const securityRisk = String(risk.security_risk ?? site.settlement_data.security_risk ?? "N/A");
              const overallScore = Number(risk.overall_score ?? risk.risk_score ?? 0);
              const topRisk = String(risk.top_risk ?? risk.primary_risk ?? "N/A");
              const biodiversity = String(ess.biodiversity_risk ?? "N/A");
              const floodRisk = String(ess.flood_risk ?? "N/A");

              const riskVariant = (level: string) => {
                const lower = level.toLowerCase();
                if (lower === "low" || lower === "a" || lower === "category a") return "default";
                if (lower === "medium" || lower === "b" || lower === "category b") return "secondary";
                return "destructive";
              };

              return (
                <TableRow key={site.id}>
                  <TableCell className="font-medium">{site.settlement_data.village}</TableCell>
                  <TableCell>{site.settlement_data.state}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{esiaCategory}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={riskVariant(securityRisk)}>{securityRisk}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold">
                      {overallScore > 0 ? overallScore.toFixed(1) : "N/A"}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{topRisk}</TableCell>
                  <TableCell>
                    <Badge variant={riskVariant(biodiversity)}>{biodiversity}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={riskVariant(floodRisk)}>{floodRisk}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
