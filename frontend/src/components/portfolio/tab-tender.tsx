"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";

interface TabTenderProps {
  portfolioId: string;
}

export function TabTender({ portfolioId }: TabTenderProps) {
  const queryClient = useQueryClient();

  const { data: portfolio, isLoading } = useQuery({
    queryKey: ["portfolio", portfolioId],
    queryFn: () => api.portfolios.get(portfolioId),
  });

  const tenderId = portfolio?.tender?.id;

  const { data: tenderData } = useQuery({
    queryKey: ["tender", tenderId],
    queryFn: () => api.tenders.get(tenderId!),
    enabled: !!tenderId,
  });

  // Launch tender
  const launchTender = useMutation({
    mutationFn: () => api.portfolios.launchTender(portfolioId),
    onSuccess: () => {
      toast.success("Tender launched successfully");
      queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // Invitee form
  const [inviteeForm, setInviteeForm] = useState({ company_name: "", contact_name: "", email: "" });
  const addInvitee = useMutation({
    mutationFn: () => api.tenders.addInvitee(tenderId!, inviteeForm),
    onSuccess: () => {
      toast.success("Invitee added");
      setInviteeForm({ company_name: "", contact_name: "", email: "" });
      queryClient.invalidateQueries({ queryKey: ["tender", tenderId] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (isLoading) {
    return (
      <div className="mt-4 space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg border bg-muted" />
        ))}
      </div>
    );
  }

  const tender = portfolio?.tender;
  const invitees = (tenderData?.invitees ?? []) as Array<{ id: string; company_name: string; contact_name: string; email: string }>;
  const questions = (tenderData?.questions ?? []) as Array<{ id: string; asked_by: string; company_name: string; question: string; answer?: string; created_at: string }>;
  const submissions = (tenderData?.submissions ?? []) as Array<{ id: string; company_name: string; contact_name: string; email: string; submitted_at: string }>;

  return (
    <div className="mt-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-lg font-semibold">Competitive Tender</h3>
          <p className="text-sm text-muted-foreground">
            Launch a tender process and manage bidders.
          </p>
        </div>
        {!tender && (
          <Button onClick={() => launchTender.mutate()} disabled={launchTender.isPending}>
            {launchTender.isPending ? "Launching..." : "Launch Tender"}
          </Button>
        )}
      </div>

      {/* Tender Status */}
      {tender && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Tender Status
              <Badge>{tender.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="font-medium">ID:</span> {tender.id}</p>
            {tender.launched_at && (
              <p><span className="font-medium">Launched:</span> {new Date(tender.launched_at).toLocaleString()}</p>
            )}
            {tender.deadline && (
              <p><span className="font-medium">Deadline:</span> {new Date(tender.deadline).toLocaleString()}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Invitee */}
      {tender && (
        <Card>
          <CardHeader>
            <CardTitle>Add Invitee</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Company Name</Label>
                <Input
                  value={inviteeForm.company_name}
                  onChange={(e) => setInviteeForm((f) => ({ ...f, company_name: e.target.value }))}
                  placeholder="Company Ltd."
                />
              </div>
              <div className="space-y-1">
                <Label>Contact Name</Label>
                <Input
                  value={inviteeForm.contact_name}
                  onChange={(e) => setInviteeForm((f) => ({ ...f, contact_name: e.target.value }))}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={inviteeForm.email}
                  onChange={(e) => setInviteeForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="john@company.com"
                />
              </div>
            </div>
            <Button
              className="mt-4"
              onClick={() => addInvitee.mutate()}
              disabled={!inviteeForm.company_name || !inviteeForm.email || addInvitee.isPending}
            >
              {addInvitee.isPending ? "Adding..." : "Add Invitee"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Invitees List */}
      {invitees.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-heading font-semibold">Invitees ({invitees.length})</h4>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitees.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.company_name}</TableCell>
                    <TableCell>{inv.contact_name}</TableCell>
                    <TableCell>{inv.email}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Questions */}
      {questions.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-heading font-semibold">Questions ({questions.length})</h4>
          <div className="space-y-2">
            {questions.map((q) => (
              <Card key={q.id} size="sm">
                <CardContent className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{q.company_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(q.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm">{q.question}</p>
                  {q.answer && (
                    <div className="mt-1 rounded bg-muted p-2 text-sm">
                      <span className="font-medium">Answer: </span>{q.answer}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Submissions */}
      {submissions.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-heading font-semibold">Submissions ({submissions.length})</h4>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">{sub.company_name}</TableCell>
                    <TableCell>{sub.contact_name}</TableCell>
                    <TableCell>{sub.email}</TableCell>
                    <TableCell>{new Date(sub.submitted_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Empty state when tender exists but no activity */}
      {tender && invitees.length === 0 && questions.length === 0 && submissions.length === 0 && (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">
            Tender is active. Add invitees to begin the bidding process.
          </p>
        </div>
      )}
    </div>
  );
}
