"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STATUS_COLORS: Record<string, string> = {
  received: "bg-blue-100 text-blue-700",
  acknowledged: "bg-yellow-100 text-yellow-700",
  under_investigation: "bg-orange-100 text-orange-700",
  resolved: "bg-green-100 text-green-700",
  escalated: "bg-red-100 text-red-700",
  closed: "bg-gray-100 text-gray-700",
};

const CATEGORIES = [
  "land_dispute",
  "environmental_concern",
  "tariff_complaint",
  "service_quality",
  "safety_hazard",
  "construction_damage",
  "noise_pollution",
  "employment_dispute",
  "other",
];

const SUBMITTER_TYPES = [
  "community_member",
  "community_leader",
  "local_government",
  "ngo",
  "other",
];

export default function GrievancesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    site_name_text: "",
    submitter_name: "",
    submitter_contact: "",
    submitter_type: "community_member",
    category: "service_quality",
    description: "",
    location_description: "",
    is_anonymous: false,
  });

  const { data: grievancesData } = useQuery({
    queryKey: ["grievances"],
    queryFn: () => api.grievances.list(),
  });

  const { data: reportData } = useQuery({
    queryKey: ["grievances-report"],
    queryFn: () => api.grievances.getReport(),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      api.grievances.submit({
        site_name_text: form.site_name_text || undefined,
        submitter_name: form.is_anonymous ? undefined : form.submitter_name || undefined,
        submitter_contact: form.is_anonymous ? undefined : form.submitter_contact || undefined,
        submitter_type: form.submitter_type,
        category: form.category,
        description: form.description,
        location_description: form.location_description || undefined,
        is_anonymous: form.is_anonymous,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grievances"] });
      queryClient.invalidateQueries({ queryKey: ["grievances-report"] });
      setForm({
        site_name_text: "",
        submitter_name: "",
        submitter_contact: "",
        submitter_type: "community_member",
        category: "service_quality",
        description: "",
        location_description: "",
        is_anonymous: false,
      });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => api.grievances.acknowledge(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grievances"] }),
  });

  const escalateMutation = useMutation({
    mutationFn: (id: string) => api.grievances.escalate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grievances"] }),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => api.grievances.resolve(id, "Resolved via dashboard"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grievances"] });
      queryClient.invalidateQueries({ queryKey: ["grievances-report"] });
    },
  });

  const grievances = grievancesData?.grievances || [];
  const openCount = grievances.filter(
    (g) => g.status === "received" || g.status === "acknowledged" || g.status === "under_investigation"
  ).length;
  const resolvedCount = grievances.filter((g) => g.status === "resolved" || g.status === "closed").length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Community Grievance Mechanism</h1>
          <p className="text-sm text-muted-foreground mt-1">
            DARES-compliant grievance intake, tracking &amp; resolution
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Grievances</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{grievances.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Open / Active</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{openCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{resolvedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Avg Resolution Days</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {reportData?.avg_resolution_days != null
                ? reportData.avg_resolution_days.toFixed(1)
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="list" className="mt-6">
        <TabsList>
          <TabsTrigger value="list">All Grievances ({grievances.length})</TabsTrigger>
          <TabsTrigger value="submit">Submit Grievance</TabsTrigger>
          <TabsTrigger value="report">Quarterly Report</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {grievances.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No grievances submitted yet
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Submitter Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grievances.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="font-mono text-xs">
                          {g.id.slice(0, 8)}...
                        </TableCell>
                        <TableCell>{g.site_name_text || "—"}</TableCell>
                        <TableCell className="capitalize">
                          {g.category.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell className="capitalize">
                          {g.submitter_type.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[g.status] || "bg-gray-100"}>
                            {g.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(g.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {g.status === "received" && (
                              <Button
                                size="sm"
                                onClick={() => acknowledgeMutation.mutate(g.id)}
                                disabled={acknowledgeMutation.isPending}
                              >
                                Acknowledge
                              </Button>
                            )}
                            {(g.status === "acknowledged" || g.status === "under_investigation") && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => resolveMutation.mutate(g.id)}
                                  disabled={resolveMutation.isPending}
                                >
                                  Resolve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => escalateMutation.mutate(g.id)}
                                  disabled={escalateMutation.isPending}
                                >
                                  Escalate
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Submit Community Grievance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Site Name</Label>
                  <Input
                    placeholder="Name of the minigrid site (if known)"
                    value={form.site_name_text}
                    onChange={(e) => setForm((f) => ({ ...f, site_name_text: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Submitter Type *</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.submitter_type}
                    onChange={(e) => setForm((f) => ({ ...f, submitter_type: e.target.value }))}
                  >
                    {SUBMITTER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Submitter Name</Label>
                  <Input
                    placeholder="Your name (optional if anonymous)"
                    value={form.submitter_name}
                    onChange={(e) => setForm((f) => ({ ...f, submitter_name: e.target.value }))}
                    disabled={form.is_anonymous}
                  />
                </div>
                <div>
                  <Label>Contact Phone / Email</Label>
                  <Input
                    placeholder="How to reach you"
                    value={form.submitter_contact}
                    onChange={(e) => setForm((f) => ({ ...f, submitter_contact: e.target.value }))}
                    disabled={form.is_anonymous}
                  />
                </div>
                <div>
                  <Label>Category *</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="anonymous"
                    checked={form.is_anonymous}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        is_anonymous: e.target.checked,
                        submitter_name: e.target.checked ? "" : f.submitter_name,
                        submitter_contact: e.target.checked ? "" : f.submitter_contact,
                      }))
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="anonymous">Submit anonymously</Label>
                </div>
                <div className="md:col-span-2">
                  <Label>Description *</Label>
                  <textarea
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Describe the grievance in detail..."
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Location Description</Label>
                  <textarea
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Where did this occur? (landmark, village, etc.)"
                    value={form.location_description}
                    onChange={(e) => setForm((f) => ({ ...f, location_description: e.target.value }))}
                  />
                </div>
              </div>
              <Button
                className="mt-4"
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending || !form.description || !form.category}
              >
                {submitMutation.isPending ? "Submitting..." : "Submit Grievance"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report" className="mt-4">
          {reportData ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Total Grievances</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{reportData.total}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Anonymous Submissions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{reportData.anonymous_count}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Escalated</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-red-600">{reportData.escalated_count}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>By Category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(reportData.by_category).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data</p>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(reportData.by_category).map(([cat, count]) => (
                          <div key={cat} className="flex items-center justify-between">
                            <span className="text-sm capitalize">{cat.replace(/_/g, " ")}</span>
                            <Badge variant="outline">{count}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>By Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(reportData.by_status).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data</p>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(reportData.by_status).map(([status, count]) => (
                          <div key={status} className="flex items-center justify-between">
                            <Badge className={STATUS_COLORS[status] || "bg-gray-100"}>
                              {status.replace(/_/g, " ")}
                            </Badge>
                            <span className="text-sm font-medium">{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading quarterly report...
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
