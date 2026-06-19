"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DISCO_OPTIONS = ["AEDC", "KEDCO", "IE"];
const EVAL_METHODS = [
  { value: "quality_cost", label: "Quality & Cost Based (QCBS)" },
  { value: "least_cost", label: "Least Cost" },
  { value: "fixed_budget", label: "Fixed Budget" },
];

export default function CreateLotPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [lotName, setLotName] = useState("");
  const [disco, setDisco] = useState("AEDC");
  const [state, setState] = useState("");
  const [grantCeilingUsd, setGrantCeilingUsd] = useState("1500000");
  const [grantCeilingPct, setGrantCeilingPct] = useState("40");
  const [evalMethod, setEvalMethod] = useState("quality_cost");
  const [selectedSiteIds, setSelectedSiteIds] = useState<Set<string>>(new Set());

  const { data: sitesData } = useQuery({
    queryKey: ["site-registry-for-lot", disco],
    queryFn: () => api.siteRegistry.list({ limit: 200, disco }),
  });

  const sites = (sitesData?.items ?? []) as Array<Record<string, any>>;

  const toggleSite = (id: string) => {
    setSelectedSiteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!lotName.trim()) { setError("Lot name is required"); return; }
    if (selectedSiteIds.size === 0) { setError("Select at least one site"); return; }
    setSubmitting(true);
    setError("");
    try {
      const lot = await api.lots.create({
        lot_name: lotName,
        disco,
        state,
        grant_ceiling_usd: parseFloat(grantCeilingUsd) || 0,
        grant_ceiling_pct: (parseFloat(grantCeilingPct) || 40) / 100,
        evaluation_method: evalMethod,
      });
      await api.lots.addSites(lot.id, Array.from(selectedSiteIds));
      router.push(`/lots/${lot.id}`);
    } catch (e: any) {
      setError(e.message || "Failed to create lot");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl font-bold">Create New Lot</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Group assessed sites into a competitive lot for tendering
      </p>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Lot Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Lot Name</Label>
            <Input
              placeholder="e.g. AEDC Batch 2 - Niger State"
              value={lotName}
              onChange={(e) => setLotName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>DisCo</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={disco}
                onChange={(e) => {
                  setDisco(e.target.value);
                  setSelectedSiteIds(new Set());
                }}
              >
                {DISCO_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>State</Label>
              <Input
                placeholder="e.g. Niger"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Grant Ceiling (USD)</Label>
              <Input
                type="number"
                value={grantCeilingUsd}
                onChange={(e) => setGrantCeilingUsd(e.target.value)}
              />
            </div>
            <div>
              <Label>Grant Ceiling (%)</Label>
              <Input
                type="number"
                value={grantCeilingPct}
                onChange={(e) => setGrantCeilingPct(e.target.value)}
              />
            </div>
            <div>
              <Label>Evaluation Method</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={evalMethod}
                onChange={(e) => setEvalMethod(e.target.value)}
              >
                {EVAL_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-lg">
            Select Sites ({selectedSiteIds.size} selected)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sites.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No assessed sites found for {disco}. Register sites from the
              Settlement Registry first.
            </p>
          ) : (
            <div className="space-y-2">
              {sites.map((site) => (
                <label
                  key={site.id}
                  className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all ${
                    selectedSiteIds.has(site.id)
                      ? "border-primary bg-primary/5"
                      : "border-input hover:border-primary/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSiteIds.has(site.id)}
                    onChange={() => toggleSite(site.id)}
                    className="rounded"
                  />
                  <div className="flex-1">
                    <span className="font-medium">{site.community}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      {site.state}/{site.lga}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Pop: {site.population?.toLocaleString()} | Conn: {site.customers?.toLocaleString()}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {site.grid_dist_km?.toFixed(1)}km
                  </span>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex gap-3">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Creating..." : "Create Lot"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/lots")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
