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
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function DevelopersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    company_name: "", registration_number: "", contact_name: "",
    contact_email: "", contact_phone: "", years_experience: "",
    completed_sites: "", total_capacity_kwp: "",
  });

  const { data } = useQuery({
    queryKey: ["developers"],
    queryFn: () => api.developers.list(),
  });

  const registerMutation = useMutation({
    mutationFn: () => api.developers.register({
      company_name: form.company_name,
      registration_number: form.registration_number,
      contact_name: form.contact_name,
      contact_email: form.contact_email,
      contact_phone: form.contact_phone,
      years_experience: parseInt(form.years_experience) || 0,
      completed_sites: parseInt(form.completed_sites) || 0,
      total_capacity_kwp: parseFloat(form.total_capacity_kwp) || 0,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developers"] });
      setForm({ company_name: "", registration_number: "", contact_name: "", contact_email: "", contact_phone: "", years_experience: "", completed_sites: "", total_capacity_kwp: "" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.developers.approve(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["developers"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.developers.reject(id, "Does not meet qualification criteria"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["developers"] }),
  });

  const developers = data?.developers || [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Developer Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Register, qualify, and manage minigrid developers
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Registered</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{developers.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Approved</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{developers.filter(d => d.approval_status === "approved").length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pending Review</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-600">{developers.filter(d => d.approval_status === "pending").length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Capacity (MWp)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{(developers.reduce((s, d) => s + d.total_capacity_kwp, 0) / 1000).toFixed(1)}</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="list" className="mt-6">
        <TabsList>
          <TabsTrigger value="list">All Developers ({developers.length})</TabsTrigger>
          <TabsTrigger value="register">Register New</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {developers.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No developers registered yet
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Experience (yrs)</TableHead>
                      <TableHead className="text-right">Completed Sites</TableHead>
                      <TableHead className="text-right">Capacity (kWp)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {developers.map((dev) => (
                      <TableRow key={dev.id}>
                        <TableCell className="font-medium">{dev.company_name}</TableCell>
                        <TableCell>{dev.contact_name}</TableCell>
                        <TableCell>{dev.contact_email}</TableCell>
                        <TableCell className="text-right">{dev.years_experience}</TableCell>
                        <TableCell className="text-right">{dev.completed_sites}</TableCell>
                        <TableCell className="text-right">{dev.total_capacity_kwp.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[dev.approval_status] || "bg-gray-100"}>
                            {dev.approval_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {dev.approval_status === "pending" && (
                              <>
                                <Button size="sm" onClick={() => approveMutation.mutate(dev.id)} disabled={approveMutation.isPending}>
                                  Approve
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => rejectMutation.mutate(dev.id)} disabled={rejectMutation.isPending}>
                                  Reject
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

        <TabsContent value="register" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Register Developer Company</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Company Name *</Label>
                  <Input value={form.company_name} onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))} />
                </div>
                <div>
                  <Label>Registration Number</Label>
                  <Input value={form.registration_number} onChange={(e) => setForm(f => ({ ...f, registration_number: e.target.value }))} />
                </div>
                <div>
                  <Label>Contact Name *</Label>
                  <Input value={form.contact_name} onChange={(e) => setForm(f => ({ ...f, contact_name: e.target.value }))} />
                </div>
                <div>
                  <Label>Contact Email *</Label>
                  <Input type="email" value={form.contact_email} onChange={(e) => setForm(f => ({ ...f, contact_email: e.target.value }))} />
                </div>
                <div>
                  <Label>Contact Phone</Label>
                  <Input value={form.contact_phone} onChange={(e) => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
                </div>
                <div>
                  <Label>Years of Experience</Label>
                  <Input type="number" value={form.years_experience} onChange={(e) => setForm(f => ({ ...f, years_experience: e.target.value }))} />
                </div>
                <div>
                  <Label>Completed Minigrid Sites</Label>
                  <Input type="number" value={form.completed_sites} onChange={(e) => setForm(f => ({ ...f, completed_sites: e.target.value }))} />
                </div>
                <div>
                  <Label>Total Installed Capacity (kWp)</Label>
                  <Input type="number" value={form.total_capacity_kwp} onChange={(e) => setForm(f => ({ ...f, total_capacity_kwp: e.target.value }))} />
                </div>
              </div>
              <Button
                className="mt-4"
                onClick={() => registerMutation.mutate()}
                disabled={registerMutation.isPending || !form.company_name || !form.contact_name || !form.contact_email}
              >
                {registerMutation.isPending ? "Registering..." : "Register Developer"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
