"use client";

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SSEEvent, DocumentResponse } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ADAPTER_LABELS: Record<string, string> = {
  gis_screening: "GIS Settlement Screening",
  demand_assessment: "Demand Assessment",
  solar_resource: "Solar Resource",
  grid_arrival: "Grid Arrival Risk",
  hybrid_sizing: "Hybrid Sizing",
  distribution_routing: "Distribution Routing",
  carbon_assessment: "Carbon Assessment",
  productive_use: "Productive Use Analysis",
  financial_model: "Financial Model",
  pbg_calculator: "DARES PBG Grant",
  ess_screening: "Environmental & Social",
  climate_assessment: "Climate Rationale",
  risk_assessment: "Risk Analysis",
  confidence_assessment: "Confidence Assessment",
  concession_generator: "Concession Data Sheet",
};

const ADAPTER_ORDER = [
  "gis_screening",
  "demand_assessment",
  "solar_resource",
  "grid_arrival",
  "hybrid_sizing",
  "distribution_routing",
  "carbon_assessment",
  "productive_use",
  "financial_model",
  "pbg_calculator",
  "ess_screening",
  "climate_assessment",
  "risk_assessment",
  "confidence_assessment",
  "concession_generator",
];

type AdapterStatus = "pending" | "running" | "completed" | "failed";

interface PipelineProgressProps {
  siteId: string;
  onClose: () => void;
}

export function PipelineProgress({ siteId, onClose }: PipelineProgressProps) {
  const queryClient = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);
  const [adapterStatuses, setAdapterStatuses] = useState<Record<string, AdapterStatus>>(
    Object.fromEntries(ADAPTER_ORDER.map((a) => [a, "pending" as AdapterStatus]))
  );
  const [pipelineStatus, setPipelineStatus] = useState<"running" | "completed" | "failed">("running");
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocumentResponse[]>([]);
  const [generatingDocs, setGeneratingDocs] = useState(false);

  const startPipeline = useCallback(async () => {
    try {
      const response = await fetch(`/api/proxy/sites/${siteId}/runs/stream`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Pipeline failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data: SSEEvent = JSON.parse(line.slice(6));

          if (data.event === "started" && data.run_id) {
            setRunId(data.run_id);
          } else if (data.event === "adapter_complete" && data.adapter) {
            setAdapterStatuses((prev) => ({
              ...prev,
              [data.adapter!]: data.status === "completed" ? "completed" : "failed",
            }));
          } else if (data.event === "completed") {
            setPipelineStatus(data.status === "completed" ? "completed" : "failed");
            queryClient.invalidateQueries({ queryKey: ["runs", siteId] });
          } else if (data.event === "error") {
            setError(data.message ?? "Unknown error");
            setPipelineStatus("failed");
          }
        }
      }
    } catch (err) {
      setError((err as Error).message);
      setPipelineStatus("failed");
    }
  }, [siteId, queryClient]);

  useEffect(() => {
    startPipeline();
  }, [startPipeline]);

  const handleGenerateDocs = async () => {
    if (!runId) return;
    setGeneratingDocs(true);
    try {
      const generated = await api.documents.generate(siteId, runId);
      setDocs(generated);
      queryClient.invalidateQueries({ queryKey: ["documents", siteId, runId] });
      toast.success("PFS documents generated");
    } catch (err) {
      setError(`Document generation failed: ${(err as Error).message}`);
      toast.error("Document generation failed");
    } finally {
      setGeneratingDocs(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-lg mx-4">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Pipeline Execution</span>
            <Badge
              variant={
                pipelineStatus === "completed"
                  ? "default"
                  : pipelineStatus === "failed"
                  ? "destructive"
                  : "secondary"
              }
            >
              {pipelineStatus}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Adapter Progress */}
          <div className="space-y-2">
            {ADAPTER_ORDER.map((adapter) => {
              const status = adapterStatuses[adapter];
              return (
                <div
                  key={adapter}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-sm">{ADAPTER_LABELS[adapter]}</span>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      status === "completed" && "text-green-600",
                      status === "failed" && "text-red-600",
                      status === "running" && "text-blue-600",
                      status === "pending" && "text-muted-foreground"
                    )}
                  >
                    {status === "pending" && "\u23F3"}
                    {status === "running" && "\u25B6"}
                    {status === "completed" && "\u2713"}
                    {status === "failed" && "\u2717"}
                    {" "}{status}
                  </span>
                </div>
              );
            })}
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          {pipelineStatus === "completed" && docs.length === 0 && (
            <Button
              onClick={handleGenerateDocs}
              disabled={generatingDocs}
              className="w-full"
            >
              {generatingDocs ? "Generating PFS Documents..." : "Generate PFS Documents"}
            </Button>
          )}

          {docs.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-green-700">
                Documents ready for download:
              </p>
              <div className="flex gap-2">
                {docs.map((doc) => (
                  <a
                    key={doc.id}
                    href={api.documents.downloadUrl(siteId, runId!, doc.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Download {doc.format === "docx" ? "DOCX" : "Markdown"} ({Math.round(doc.size_bytes / 1024)} KB)
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={onClose}>
              {pipelineStatus === "running" ? "Running in background..." : "Close"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
