"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function formatNum(n: number, decimals = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals }).format(n);
}

function formatUSD(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

export default function MonitoringPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: dashboard } = useQuery({
    queryKey: ["monitoring-dashboard"],
    queryFn: () => api.monitoring.dashboard(),
  });

  const { data: sitesData } = useQuery({
    queryKey: ["monitoring-sites"],
    queryFn: () => api.monitoring.listSites(),
  });

  const { data: alertsData } = useQuery({
    queryKey: ["monitoring-alerts"],
    queryFn: () => api.monitoring.alerts(),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => api.monitoring.acknowledgeAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitoring-alerts"] });
    },
  });

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.monitoring.uploadCSV(formData);
      queryClient.invalidateQueries({ queryKey: ["monitoring-sites"] });
      queryClient.invalidateQueries({ queryKey: ["monitoring-dashboard"] });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setUploading(false);
    }
  };

  const sites = sitesData?.sites || [];
  const alerts = alertsData?.alerts || [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Performance Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live performance dashboard for commissioned minigrid sites
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading..." : "Upload CSV"}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Commissioned Sites</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{dashboard?.total_sites || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Active Connections</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatNum(dashboard?.total_connections || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Installed Capacity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{(dashboard?.total_capacity_mwp || 0).toFixed(2)} MWp</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Generation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatNum(dashboard?.total_generation_kwh || 0)} kWh</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Avg Availability</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{(dashboard?.avg_availability || 0).toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sites" className="mt-6">
        <TabsList>
          <TabsTrigger value="sites">Monitored Sites ({sites.length})</TabsTrigger>
          <TabsTrigger value="alerts">
            Alerts ({alerts.filter(a => !a.acknowledged).length})
          </TabsTrigger>
          <TabsTrigger value="national">National Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="sites" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {sites.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No monitored sites yet. Upload metering CSV data to begin.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead>Developer</TableHead>
                      <TableHead className="text-right">Capacity (kWp)</TableHead>
                      <TableHead className="text-right">Connections</TableHead>
                      <TableHead className="text-right">Availability</TableHead>
                      <TableHead className="text-right">ARPU (USD)</TableHead>
                      <TableHead className="text-right">Generation (kWh)</TableHead>
                      <TableHead>Alerts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sites.map((site) => (
                      <TableRow key={site.site_id}>
                        <TableCell className="font-medium">{site.site_name}</TableCell>
                        <TableCell>{site.developer || "—"}</TableCell>
                        <TableCell className="text-right">{formatNum(site.capacity_kwp, 1)}</TableCell>
                        <TableCell className="text-right">{formatNum(site.active_connections)}</TableCell>
                        <TableCell className="text-right">
                          <span className={site.latest_availability >= 95 ? "text-green-600" : site.latest_availability >= 85 ? "text-amber-600" : "text-red-600"}>
                            {site.latest_availability.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{formatUSD(site.latest_arpu)}</TableCell>
                        <TableCell className="text-right">{formatNum(site.latest_generation)}</TableCell>
                        <TableCell>
                          {site.alert_count > 0 ? (
                            <Badge className="bg-red-100 text-red-700">{site.alert_count}</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-700">OK</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No performance alerts
                </CardContent>
              </Card>
            ) : (
              alerts.map((alert) => (
                <Card key={alert.id} className={alert.acknowledged ? "opacity-60" : ""}>
                  <CardContent className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-4">
                      <div className={`h-3 w-3 rounded-full ${
                        alert.severity === "critical" ? "bg-red-500" :
                        alert.severity === "warning" ? "bg-amber-500" : "bg-blue-500"
                      }`} />
                      <div>
                        <p className="font-medium">{alert.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {alert.site_name} &middot; {alert.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Value: {alert.metric_value.toFixed(2)} | Threshold: {alert.threshold_value.toFixed(2)} &middot;
                          {new Date(alert.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {!alert.acknowledged && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => acknowledgeMutation.mutate(alert.id)}
                        disabled={acknowledgeMutation.isPending}
                      >
                        Acknowledge
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="national" className="mt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Grant Disbursed vs Committed</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold text-green-600">{formatUSD(dashboard?.total_grant_disbursed || 0)}</p>
                <p className="text-sm text-muted-foreground">of {formatUSD(dashboard?.total_grant_committed || 0)} committed</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Avg LCOE</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold">${(dashboard?.avg_lcoe || 0).toFixed(3)}/kWh</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Avg ARPU</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold">{formatUSD(dashboard?.avg_arpu || 0)}/month</p>
              </CardContent>
            </Card>
          </div>

          {dashboard?.by_disco && Object.keys(dashboard.by_disco).length > 0 && (
            <Card className="mt-4">
              <CardHeader><CardTitle>By DisCo</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DisCo</TableHead>
                      <TableHead className="text-right">Sites</TableHead>
                      <TableHead className="text-right">Connections</TableHead>
                      <TableHead className="text-right">Capacity (MWp)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(dashboard.by_disco).map(([disco, data]) => (
                      <TableRow key={disco}>
                        <TableCell className="font-medium">{disco}</TableCell>
                        <TableCell className="text-right">{data.sites}</TableCell>
                        <TableCell className="text-right">{formatNum(data.connections)}</TableCell>
                        <TableCell className="text-right">{data.capacity_mwp.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
