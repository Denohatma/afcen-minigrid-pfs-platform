"use client";

import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import type { SiteFormData } from "@/lib/schemas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const GRID_STATUS_OPTIONS = [
  { value: "off_grid", label: "Off-Grid" },
  { value: "on_grid_expected", label: "Grid Expected" },
  { value: "grid_connected", label: "Grid Connected" },
];

const RISK_OPTIONS = ["low", "moderate", "high"];
const IFC_OPTIONS = ["A", "B", "C"];
const DISCO_OPTIONS = ["poor", "mixed", "good"];

interface RiskItem {
  category: string;
  risk: string;
  likelihood: string;
  impact: string;
  mitigation: string;
}

function getAutoRisks(data: SiteFormData): RiskItem[] {
  const risks: RiskItem[] = [];

  if (data.grid_status === "on_grid_expected") {
    risks.push({
      category: "Grid Arrival",
      risk: "National grid arrives during project lifetime, threatening demand",
      likelihood: "moderate",
      impact: "high",
      mitigation: "Adopt ESMAP transition scenario; negotiate distributor conversion or side-by-side operation",
    });
  }

  if (data.flood_risk === "high" || data.flood_risk === "moderate") {
    risks.push({
      category: "Environmental",
      risk: `${data.flood_risk === "high" ? "High" : "Moderate"} flood risk threatens infrastructure`,
      likelihood: data.flood_risk === "high" ? "high" : "moderate",
      impact: "high",
      mitigation: "Elevate equipment platforms; install flood barriers; ensure adequate insurance coverage",
    });
  }

  if (data.biodiversity_risk === "high" || data.biodiversity_risk === "moderate") {
    risks.push({
      category: "Environmental",
      risk: `${data.biodiversity_risk === "high" ? "High" : "Moderate"} biodiversity sensitivity in project area`,
      likelihood: "moderate",
      impact: data.biodiversity_risk === "high" ? "high" : "moderate",
      mitigation: "Conduct Environmental Impact Assessment; avoid sensitive habitats; implement biodiversity offset",
    });
  }

  if (data.protected_area_overlap) {
    risks.push({
      category: "Regulatory",
      risk: "Project overlaps with protected area requiring special permits",
      likelihood: "high",
      impact: "high",
      mitigation: "Obtain protected area permits; redesign layout to minimize impact; engage conservation authorities",
    });
  }

  if (data.terrain === "mountainous" || data.terrain === "hilly") {
    risks.push({
      category: "Construction",
      risk: `${data.terrain === "mountainous" ? "Mountainous" : "Hilly"} terrain increases construction cost and complexity`,
      likelihood: "high",
      impact: "moderate",
      mitigation: "Apply terrain multipliers to distribution cost; plan phased construction; ensure adequate access roads",
    });
  }

  const totalCustomers = data.customers?.reduce((sum, c) => sum + (c.count || 0), 0) ?? 0;
  if (totalCustomers < 50) {
    risks.push({
      category: "Commercial",
      risk: "Small customer base limits revenue potential and LCOE reduction",
      likelihood: "high",
      impact: "moderate",
      mitigation: "Identify productive use loads; incentivize demand growth; consider phased capacity expansion",
    });
  }

  risks.push(
    {
      category: "Technical",
      risk: "Battery degradation faster than projected reduces system performance",
      likelihood: "moderate",
      impact: "moderate",
      mitigation: "Specify tier-1 batteries; monitor SOH; budget for replacement at year 10-12",
    },
    {
      category: "Financial",
      risk: "Tariff collection rate below projections affects cash flow",
      likelihood: "moderate",
      impact: "high",
      mitigation: "Implement prepaid metering; establish community engagement program; maintain collection rate >85%",
    },
    {
      category: "Operational",
      risk: "Lack of trained local technicians delays fault response",
      likelihood: "moderate",
      impact: "moderate",
      mitigation: "Train local operators; establish spare parts inventory; set up remote monitoring system",
    }
  );

  return risks;
}

function riskColor(level: string) {
  switch (level) {
    case "high":
      return "destructive" as const;
    case "moderate":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

export function StepGridES() {
  const { register, watch, setValue } = useFormContext<SiteFormData>();
  const gridStatus = watch("grid_status");
  const formData = watch();
  const autoRisks = getAutoRisks(formData as SiteFormData);

  useEffect(() => {
    const terrain = formData.terrain;
    const protectedArea = formData.protected_area_overlap;

    if (terrain === "mountainous" || terrain === "hilly") {
      if (formData.flood_risk === "low") {
        setValue("flood_risk", "moderate", { shouldDirty: true });
      }
    }
    if (protectedArea && formData.biodiversity_risk === "low") {
      setValue("biodiversity_risk", "moderate", { shouldDirty: true });
    }
    if (terrain === "mountainous") {
      setValue("ifc_category", "B", { shouldDirty: true });
    }
    if (protectedArea) {
      setValue("ifc_category", "A", { shouldDirty: true });
    }
  }, [formData.terrain, formData.protected_area_overlap, formData.flood_risk, formData.biodiversity_risk, setValue]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Grid Status</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="grid_status">Current Grid Status</Label>
            <select
              id="grid_status"
              className="flex h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              {...register("grid_status")}
            >
              {GRID_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {gridStatus === "on_grid_expected" && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Grid Arrival Evidence
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="grid_extension_planned"
                className="h-4 w-4 rounded border-border accent-primary"
                {...register("grid_arrival_evidence.grid_extension_planned")}
              />
              <Label htmlFor="grid_extension_planned">Extension Planned</Label>
            </div>

            <div>
              <Label htmlFor="timeline_years">Timeline (years)</Label>
              <Input
                id="timeline_years"
                type="number"
                step="0.5"
                {...register("grid_arrival_evidence.timeline_years", {
                  setValueAs: (v: string) => (v === "" ? null : Number(v)),
                })}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="funding_committed"
                className="h-4 w-4 rounded border-border accent-primary"
                {...register("grid_arrival_evidence.funding_committed")}
              />
              <Label htmlFor="funding_committed">Funding Committed</Label>
            </div>

            <div>
              <Label htmlFor="funding_source">Funding Source</Label>
              <Input
                id="funding_source"
                {...register("grid_arrival_evidence.funding_source")}
              />
            </div>

            <div>
              <Label htmlFor="disco_track_record">DisCo Track Record</Label>
              <select
                id="disco_track_record"
                className="flex h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring"
                {...register("grid_arrival_evidence.disco_track_record")}
              >
                {DISCO_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="disco_supply_hours">DisCo Supply Hours (per day)</Label>
              <Input
                id="disco_supply_hours"
                type="number"
                min={0}
                max={24}
                step={0.5}
                {...register("disco_supply_hours", { valueAsNumber: true })}
              />
            </div>

            <div>
              <Label htmlFor="recent_extensions">Recent Extensions in District</Label>
              <Input
                id="recent_extensions"
                type="number"
                min={0}
                {...register("grid_arrival_evidence.recent_extensions_in_district", { valueAsNumber: true })}
              />
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Environmental & Social
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="protected_area"
              className="h-4 w-4 rounded border-border accent-primary"
              {...register("protected_area_overlap")}
            />
            <Label htmlFor="protected_area">Protected Area Overlap</Label>
          </div>

          <div>
            <Label htmlFor="ifc_category">IFC Category</Label>
            <select
              id="ifc_category"
              className="flex h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring"
              {...register("ifc_category")}
            >
              {IFC_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  Category {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="flood_risk">Flood Risk</Label>
            <select
              id="flood_risk"
              className="flex h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring"
              {...register("flood_risk")}
            >
              {RISK_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="biodiversity_risk">Biodiversity Risk</Label>
            <select
              id="biodiversity_risk"
              className="flex h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring"
              {...register("biodiversity_risk")}
            >
              {RISK_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            Auto-Generated Risk Register
          </h3>
          <Badge variant="outline">{autoRisks.length} risks identified</Badge>
        </div>
        <div className="space-y-2">
          {autoRisks.map((risk, i) => (
            <div key={i} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">{risk.category}</Badge>
                    <Badge variant={riskColor(risk.likelihood)} className="text-xs">
                      {risk.likelihood}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium text-foreground">{risk.risk}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium">Mitigation:</span> {risk.mitigation}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
