"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PipelineProgress } from "@/components/wizard/pipeline-progress";
import { toast } from "sonner";

export default function SiteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const siteId = params.id as string;

  const { data: site, isLoading: siteLoading } = useQuery({
    queryKey: ["site", siteId],
    queryFn: () => api.sites.get(siteId),
    enabled: !!siteId,
  });

  const { data: runsData } = useQuery({
    queryKey: ["runs", siteId],
    queryFn: () => api.runs.list(siteId),
    enabled: !!siteId,
    refetchInterval: 10_000,
  });

  const deleteSite = useMutation({
    mutationFn: () => api.sites.delete(siteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      toast.success("Site deleted");
      router.push("/sites");
    },
  });

  if (siteLoading) {
    return <div className="space-y-4"><div className="h-64 animate-pulse rounded-lg bg-muted" /></div>;
  }

  if (!site) {
    return <p className="text-red-600">Site not found</p>;
  }

  const sd = site.site_data;
  const runs = runsData?.runs ?? [];
  const latestRun = runs[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/sites" className="text-sm text-muted-foreground hover:text-primary">
            &larr; All Sites
          </Link>
          <h1 className="font-heading text-2xl font-bold mt-1">
            {sd?.site_name || "Unnamed Site"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {sd?.district && `${sd.district} LGA, `}
            {sd?.province && `${sd.province} State, `}
            {sd?.country}
            {sd?.disco_name && ` | DisCo: ${sd.disco_name}`}
            {sd?.minigrid_type && sd.minigrid_type !== "isolated" && ` | ${sd.minigrid_type.replace("_", " ")}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/sites/new?clone=${siteId}`}>
            <Button variant="outline" size="sm">Edit</Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600"
            onClick={() => { if (confirm("Delete this site?")) deleteSite.mutate(); }}
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{sd?.customers?.reduce((s: number, c: { count: number }) => s + c.count, 0) ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Anchor Loads</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{sd?.anchors?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Tariff (Base)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${sd?.tariff_scenarios?.base ?? "—"}/kWh</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <PipelineProgress siteId={siteId} onClose={() => queryClient.invalidateQueries({ queryKey: ["runs", siteId] })} />
        </CardContent>
      </Card>

      {runs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Run History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {runs.map((run) => (
                <div key={run.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Run #{run.id.slice(-6)}</p>
                    <p className="text-xs text-muted-foreground">
                      {run.started_at ? new Date(run.started_at).toLocaleString() : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>
                      {run.status}
                    </Badge>
                    {run.summary_metrics && (
                      <span className="text-xs text-muted-foreground">
                        {run.summary_metrics.pv_capacity_kwp && `${run.summary_metrics.pv_capacity_kwp} kWp`}
                        {run.summary_metrics.lcoe_usd_kwh && ` | LCOE $${run.summary_metrics.lcoe_usd_kwh}`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
