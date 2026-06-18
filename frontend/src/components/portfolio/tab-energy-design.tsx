"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";

interface TabEnergyDesignProps {
  portfolioId: string;
}

export function TabEnergyDesign({ portfolioId }: TabEnergyDesignProps) {
  const queryClient = useQueryClient();
  const [hasTriggered, setHasTriggered] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const runPipeline = useMutation({
    mutationFn: () => api.portfolios.run(portfolioId),
    onSuccess: (res) => {
      const r = res as unknown as { status: string; sites_queued: number; estimated_seconds?: number; sites_processed?: number };
      const count = r.sites_queued || r.sites_processed || 0;
      const est = r.estimated_seconds || count * 5;
      toast.success(`Pipeline started: ${count} sites (~${Math.ceil(est / 60)} min)`);
      setHasTriggered(true);
      setStartTime(Date.now());
      setEstimatedSeconds(est);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  useEffect(() => {
    if (!startTime || !hasTriggered) return;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime, hasTriggered]);

  const { data: portfolio, isLoading } = useQuery({
    queryKey: ["portfolio", portfolioId],
    queryFn: () => api.portfolios.get(portfolioId),
    refetchInterval: () => {
      if (hasTriggered) return 5000;
      return false;
    },
  });

  // Auto-trigger on mount if status is screening (just created)
  useEffect(() => {
    if (!hasTriggered && portfolio && (portfolio.status === "draft" || portfolio.status === "screening")) {
      runPipeline.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio?.status]);

  const pendingSites = (portfolio?.sites ?? []).filter((s) => s.pipeline_status === "pending" || s.pipeline_status === "running");
  const isRunning = pendingSites.length > 0 || runPipeline.isPending;
  const isCompleted = portfolio?.status === "designed" || (pendingSites.length === 0 && (portfolio?.sites?.length ?? 0) > 0);

  const completedSites = (portfolio?.sites ?? [])
    .filter((s) => s.pipeline_status === "completed")
    .sort((a, b) => b.arpu - a.arpu);

  const totalSites = portfolio?.sites.length ?? 0;
  const progressPct = totalSites > 0 ? Math.round((completedSites.length / totalSites) * 100) : 0;

  return (
    <div className="mt-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-lg font-semibold">Energy System Design</h3>
          <p className="text-sm text-muted-foreground">
            Batch pipeline designs optimal PV + battery systems for each site.
          </p>
        </div>
        {!isCompleted && !isRunning && (
          <Button onClick={() => runPipeline.mutate()} disabled={runPipeline.isPending}>
            {runPipeline.isPending ? "Starting..." : "Run Pipeline"}
          </Button>
        )}
      </div>

      {/* Progress */}
      {(isRunning || (hasTriggered && !isCompleted)) && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Running 15-adapter pipeline on each site...</span>
            <span>{completedSites.length} / {totalSites} complete ({progressPct}%)</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Elapsed: {Math.floor(elapsed / 60)}m {elapsed % 60}s</span>
            <span>
              {estimatedSeconds > 0 && `Estimated: ~${Math.ceil(estimatedSeconds / 60)} min total`}
              {completedSites.length > 0 && elapsed > 0 && ` | ~${Math.ceil((totalSites - completedSites.length) * (elapsed / completedSites.length) / 60)} min remaining`}
            </span>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}

      {/* Results Table */}
      {completedSites.length > 0 && (
        <div className="max-h-[500px] overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site Name</TableHead>
                <TableHead>DisCo</TableHead>
                <TableHead>PV (kWp)</TableHead>
                <TableHead>Battery (kWh)</TableHead>
                <TableHead>Connections</TableHead>
                <TableHead>LCOE ($/kWh)</TableHead>
                <TableHead>CAPEX ($)</TableHead>
                <TableHead>ARPU ($)</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {completedSites.map((site) => {
                const sizing = (site.results?.hybrid_sizing ?? {}) as Record<string, unknown>;
                const financial = (site.results?.financial_model ?? {}) as Record<string, unknown>;
                const demand = (site.results?.demand_assessment ?? {}) as Record<string, unknown>;
                return (
                  <TableRow key={site.id}>
                    <TableCell className="font-medium">{site.settlement_data.village}</TableCell>
                    <TableCell>{site.settlement_data.disco}</TableCell>
                    <TableCell>{Number(sizing.pv_capacity_kwp ?? 0).toFixed(1)}</TableCell>
                    <TableCell>{Number(sizing.battery_capacity_kwh ?? 0).toFixed(0)}</TableCell>
                    <TableCell>{Number(demand.total_customers ?? site.settlement_data.connections).toLocaleString()}</TableCell>
                    <TableCell>${Number(financial.lcoe_usd_kwh ?? 0).toFixed(3)}</TableCell>
                    <TableCell>${Number(financial.total_capex_usd ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="font-semibold">${site.arpu.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant="default">completed</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {isCompleted && completedSites.length === 0 && (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">Pipeline completed but no results available.</p>
        </div>
      )}
    </div>
  );
}
