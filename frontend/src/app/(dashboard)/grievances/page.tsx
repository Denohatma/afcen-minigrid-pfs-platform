"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
  critical: "bg-red-200 text-red-900",
};

const STATUS_COLORS: Record<string, string> = {
  received: "bg-gray-100 text-gray-700",
  acknowledged: "bg-blue-100 text-blue-700",
  investigating: "bg-amber-100 text-amber-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-700",
  escalated: "bg-red-100 text-red-700",
};

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "received", label: "Received" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "escalated", label: "Escalated" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "land_resettlement", label: "Land / Resettlement" },
  { value: "environmental", label: "Environmental" },
  { value: "worker_safety", label: "Worker Safety" },
  { value: "service_quality", label: "Service Quality" },
  { value: "sea_sh", label: "SEA/SH" },
  { value: "labour", label: "Labour" },
  { value: "compensation", label: "Compensation" },
  { value: "noise_dust", label: "Noise / Dust" },
  { value: "other", label: "Other" },
];

export default function GrievancesPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const { data: dashboardRaw } = useQuery({
    queryKey: ["grievances-dashboard"],
    queryFn: () => api.grievances.dashboard(),
  });
  const dashboard = dashboardRaw as Record<string, any> | undefined;

  const { data: grievancesData } = useQuery({
    queryKey: ["grievances", statusFilter, categoryFilter],
    queryFn: () =>
      api.grievances.list({
        ...(statusFilter && { status: statusFilter }),
        ...(categoryFilter && { category: categoryFilter }),
      }),
  });

  const grievances = grievancesData?.grievances ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            Grievance Redress Mechanism
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Module 10: E&amp;S / SEP / GRM -- intake, tracking &amp; resolution
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="mt-6 grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total Grievances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {dashboard?.total ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Open
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">
              {dashboard?.open ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Resolved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {dashboard?.resolved ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Escalated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">
              {dashboard?.escalated ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              SEA/SH Flagged
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-700">
              {dashboard?.sea_sh_flagged ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="mt-6 flex items-center gap-4">
        <select
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Grievances table */}
      <Card className="mt-4">
        <CardContent className="pt-6">
          {grievances.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No grievances found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Anonymous?</TableHead>
                  <TableHead>SEA/SH</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grievances.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-mono text-xs">
                      {g.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="capitalize">
                      {g.category.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          SEVERITY_COLORS[g.severity] ??
                          "bg-gray-100 text-gray-700"
                        }
                      >
                        {g.severity}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="max-w-[220px] truncate"
                      title={g.description}
                    >
                      {g.description}
                    </TableCell>
                    <TableCell>{g.is_anonymous ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      {g.is_sea_sh ? (
                        <Badge className="bg-red-200 text-red-900">
                          SEA/SH
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          STATUS_COLORS[g.status] ??
                          "bg-gray-100 text-gray-700"
                        }
                      >
                        {g.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{g.assigned_to ?? "--"}</TableCell>
                    <TableCell>
                      {new Date(g.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
