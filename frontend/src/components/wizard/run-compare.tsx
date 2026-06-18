"use client";

import type { RunResponse, SummaryMetrics } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function formatVal(
  val: number | null | undefined,
  type: "usd" | "kwh" | "kw" | "pct"
): string {
  if (val == null) return "\u2014";
  switch (type) {
    case "usd":
      return `$${val.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    case "kwh":
      return `${val.toLocaleString("en-US", { maximumFractionDigits: 1 })} kWh`;
    case "kw":
      return `${val.toLocaleString("en-US", { maximumFractionDigits: 1 })} kWp`;
    case "pct":
      return `${(val * 100).toFixed(1)}%`;
  }
}

function delta(a: number | null | undefined, b: number | null | undefined): string | null {
  if (a == null || b == null || b === 0) return null;
  const pct = ((a - b) / Math.abs(b)) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

const METRICS: {
  key: keyof SummaryMetrics;
  label: string;
  type: "usd" | "kwh" | "kw" | "pct";
}[] = [
  { key: "pv_capacity_kwp", label: "PV Capacity", type: "kw" },
  { key: "battery_capacity_kwh", label: "Battery", type: "kwh" },
  { key: "total_capex_usd", label: "Total CAPEX", type: "usd" },
  { key: "lcoe_usd_kwh", label: "LCOE", type: "usd" },
  { key: "base_irr", label: "IRR", type: "pct" },
];

interface RunCompareProps {
  runA: RunResponse;
  runB: RunResponse;
  onClose: () => void;
}

export function RunCompare({ runA, runB, onClose }: RunCompareProps) {
  const metricsA = runA.summary_metrics;
  const metricsB = runB.summary_metrics;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Run Comparison</CardTitle>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left font-medium text-muted-foreground">Metric</th>
                <th className="py-2 text-right font-medium text-muted-foreground">
                  Run {runA.id.slice(0, 8)}
                </th>
                <th className="py-2 text-right font-medium text-muted-foreground">
                  Run {runB.id.slice(0, 8)}
                </th>
                <th className="py-2 text-right font-medium text-muted-foreground">Delta</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map(({ key, label, type }) => {
                const valA = metricsA?.[key] ?? null;
                const valB = metricsB?.[key] ?? null;
                const d = delta(valA, valB);
                return (
                  <tr key={key} className="border-b last:border-0">
                    <td className="py-2 text-foreground">{label}</td>
                    <td className="py-2 text-right font-mono">
                      {formatVal(valA, type)}
                    </td>
                    <td className="py-2 text-right font-mono">
                      {formatVal(valB, type)}
                    </td>
                    <td className="py-2 text-right font-mono">
                      {d ? (
                        <span
                          className={
                            d.startsWith("+") ? "text-green-600" : "text-red-600"
                          }
                        >
                          {d}
                        </span>
                      ) : (
                        "\u2014"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Run A: {runA.started_at ? new Date(runA.started_at).toLocaleString() : "\u2014"}{" "}
          | Run B: {runB.started_at ? new Date(runB.started_at).toLocaleString() : "\u2014"}
        </p>
      </CardContent>
    </Card>
  );
}
