"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { DiscoReadiness } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "verified", label: "Verified" },
  { value: "flagged", label: "Flagged" },
];

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-500/20 text-gray-300",
  in_progress: "bg-amber-500/20 text-amber-400",
  verified: "bg-emerald-500/20 text-emerald-400",
  flagged: "bg-red-500/20 text-red-400",
};

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DiscoReadinessPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const params: Record<string, string> = {
    limit: String(pageSize),
    offset: String(page * pageSize),
  };
  if (statusFilter) params.overall_status = statusFilter;

  const { data, isLoading } = useQuery({
    queryKey: ["disco-readiness", statusFilter, page],
    queryFn: () => api.discoReadiness.list(params),
  });

  const { data: dashboard } = useQuery({
    queryKey: ["disco-readiness-dashboard"],
    queryFn: () => api.discoReadiness.dashboard(),
  });

  const items: DiscoReadiness[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const stats = dashboard as Record<string, any> | undefined;

  const resetFilters = () => {
    setStatusFilter("");
    setPage(0);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            DisCo Readiness & Interconnection
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track distribution company readiness milestones across all minigrid
            sites
          </p>
        </div>
      </div>

      {/* Dashboard Stats Cards */}
      {stats && (
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Total Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.total ?? 0}</p>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-all ${
              statusFilter === "verified"
                ? "ring-2 ring-primary border-primary"
                : "hover:border-primary/30"
            }`}
            onClick={() => {
              setStatusFilter(statusFilter === "verified" ? "" : "verified");
              setPage(0);
            }}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Verified
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-400">
                {stats.verified ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-all ${
              statusFilter === "in_progress"
                ? "ring-2 ring-primary border-primary"
                : "hover:border-primary/30"
            }`}
            onClick={() => {
              setStatusFilter(
                statusFilter === "in_progress" ? "" : "in_progress"
              );
              setPage(0);
            }}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                In Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-400">
                {stats.in_progress ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-all ${
              statusFilter === "flagged"
                ? "ring-2 ring-primary border-primary"
                : "hover:border-primary/30"
            }`}
            onClick={() => {
              setStatusFilter(statusFilter === "flagged" ? "" : "flagged");
              setPage(0);
            }}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Flagged
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-400">
                {stats.flagged ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="mt-6 mb-4">
        <CardContent className="pt-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label className="text-xs">Overall Status</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(0);
                }}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 text-xs"
                onClick={resetFilters}
              >
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading disco readiness records...
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No records match your filters.{" "}
              <button
                className="text-primary underline"
                onClick={resetFilters}
              >
                Reset filters
              </button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site ID</TableHead>
                    <TableHead>Feeder Data</TableHead>
                    <TableHead>POI</TableHead>
                    <TableHead>Bulk Meter</TableHead>
                    <TableHead>Customer Data</TableHead>
                    <TableHead>Settlement Terms</TableHead>
                    <TableHead>Tripartite</TableHead>
                    <TableHead>Overall Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium font-mono text-sm">
                        {r.site_id}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${
                            STATUS_COLORS[r.feeder_data_status] ??
                            "bg-gray-500/20 text-gray-300"
                          }`}
                        >
                          {statusLabel(r.feeder_data_status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${
                            STATUS_COLORS[r.poi_status] ??
                            "bg-gray-500/20 text-gray-300"
                          }`}
                        >
                          {statusLabel(r.poi_status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${
                            STATUS_COLORS[r.bulk_meter_status] ??
                            "bg-gray-500/20 text-gray-300"
                          }`}
                        >
                          {statusLabel(r.bulk_meter_status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${
                            STATUS_COLORS[r.customer_data_status] ??
                            "bg-gray-500/20 text-gray-300"
                          }`}
                        >
                          {statusLabel(r.customer_data_status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${
                            STATUS_COLORS[r.settlement_terms_status] ??
                            "bg-gray-500/20 text-gray-300"
                          }`}
                        >
                          {statusLabel(r.settlement_terms_status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${
                            STATUS_COLORS[r.tripartite_status] ??
                            "bg-gray-500/20 text-gray-300"
                          }`}
                        >
                          {statusLabel(r.tripartite_status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${
                            STATUS_COLORS[r.overall_status] ??
                            "bg-gray-500/20 text-gray-300"
                          }`}
                        >
                          {statusLabel(r.overall_status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(r.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Showing {page * pageSize + 1}–
                  {Math.min((page + 1) * pageSize, total)} of {total} records
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center px-3 text-sm text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
