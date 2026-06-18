"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function TenderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [inviteeForm, setInviteeForm] = useState({ company_name: "", contact_name: "", email: "" });
  const [questionForm, setQuestionForm] = useState({ asked_by: "", company_name: "", question: "" });
  const [bidForm, setBidForm] = useState({
    company_name: "", contact_name: "", email: "",
    capex_per_site: "", grant_ask_pct: "", tariff_proposed: "",
    pv_capacity: "", battery_capacity: "", pue_commitment: "",
  });

  const { data: portfolio } = useQuery({
    queryKey: ["portfolio", id],
    queryFn: () => api.portfolios.get(id),
  });

  const tender = portfolio?.tender;

  const { data: tenderDetail } = useQuery({
    queryKey: ["tender", tender?.id],
    queryFn: () => tender ? api.tenders.get(tender.id) : null,
    enabled: !!tender?.id,
  });

  const addInvitee = useMutation({
    mutationFn: () => api.tenders.addInvitee(tender!.id, inviteeForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tender", tender?.id] });
      setInviteeForm({ company_name: "", contact_name: "", email: "" });
    },
  });

  const askQuestion = useMutation({
    mutationFn: () => api.tenders.askQuestion(tender!.id, questionForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tender", tender?.id] });
      setQuestionForm({ asked_by: "", company_name: "", question: "" });
    },
  });

  const submitBid = useMutation({
    mutationFn: () => api.tenders.submitBid(tender!.id, {
      company_name: bidForm.company_name,
      contact_name: bidForm.contact_name,
      email: bidForm.email,
      proposal_data: {
        capex_per_site: parseFloat(bidForm.capex_per_site) || 0,
        grant_ask_pct: parseFloat(bidForm.grant_ask_pct) || 0,
        tariff_proposed: parseFloat(bidForm.tariff_proposed) || 0,
        pv_capacity: parseFloat(bidForm.pv_capacity) || 0,
        battery_capacity: parseFloat(bidForm.battery_capacity) || 0,
        pue_commitment: bidForm.pue_commitment,
      },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tender", tender?.id] });
      setBidForm({ company_name: "", contact_name: "", email: "", capex_per_site: "", grant_ask_pct: "", tariff_proposed: "", pv_capacity: "", battery_capacity: "", pue_commitment: "" });
    },
  });

  if (!portfolio) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">{portfolio.name} — Tender</h1>
          <p className="text-sm text-muted-foreground mt-1">
            DisCo: {portfolio.disco_name} &middot; {portfolio.sites.length} sites &middot;
            Status: <Badge className="ml-1">{tender?.status || "No tender"}</Badge>
          </p>
        </div>
      </div>

      {!tender ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No tender launched for this portfolio yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="invitees">Invitees ({(tenderDetail as Record<string, unknown[]>)?.invitees?.length || 0})</TabsTrigger>
            <TabsTrigger value="qa">Q&A ({(tenderDetail as Record<string, unknown[]>)?.questions?.length || 0})</TabsTrigger>
            <TabsTrigger value="bids">Bids ({(tenderDetail as Record<string, unknown[]>)?.submissions?.length || 0})</TabsTrigger>
            <TabsTrigger value="submit">Submit Bid</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Status</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold capitalize">{tender.status}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Launched</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{tender.launched_at ? new Date(tender.launched_at).toLocaleDateString() : "—"}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Sites in Lot</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{portfolio.sites.length}</p></CardContent>
              </Card>
            </div>

            <Card className="mt-4">
              <CardHeader><CardTitle>Sites in this Lot</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Population</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolio.sites.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.settlement_data?.village || `Rank #${s.settlement_rank}`}</TableCell>
                        <TableCell>{s.settlement_data?.state || "—"}</TableCell>
                        <TableCell>{s.settlement_data?.population?.toLocaleString() || "—"}</TableCell>
                        <TableCell><Badge variant="outline">{s.pipeline_status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invitees" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Invite Developer</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label>Company Name</Label>
                    <Input value={inviteeForm.company_name} onChange={(e) => setInviteeForm(f => ({ ...f, company_name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Contact Name</Label>
                    <Input value={inviteeForm.contact_name} onChange={(e) => setInviteeForm(f => ({ ...f, contact_name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={inviteeForm.email} onChange={(e) => setInviteeForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>
                <Button className="mt-3" onClick={() => addInvitee.mutate()} disabled={addInvitee.isPending}>
                  {addInvitee.isPending ? "Adding..." : "Add Invitee"}
                </Button>
              </CardContent>
            </Card>
            {(tenderDetail as Record<string, Array<Record<string, string>>>)?.invitees?.length > 0 && (
              <Card className="mt-4">
                <CardContent className="pt-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Email</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {((tenderDetail as Record<string, Array<Record<string, string>>>)?.invitees || []).map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{inv.company}</TableCell>
                          <TableCell>{inv.contact}</TableCell>
                          <TableCell>{inv.email}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="qa" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Ask a Question</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Your Name</Label>
                    <Input value={questionForm.asked_by} onChange={(e) => setQuestionForm(f => ({ ...f, asked_by: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Company</Label>
                    <Input value={questionForm.company_name} onChange={(e) => setQuestionForm(f => ({ ...f, company_name: e.target.value }))} />
                  </div>
                </div>
                <div className="mt-3">
                  <Label>Question</Label>
                  <textarea
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    rows={3}
                    value={questionForm.question}
                    onChange={(e) => setQuestionForm(f => ({ ...f, question: e.target.value }))}
                  />
                </div>
                <Button className="mt-3" onClick={() => askQuestion.mutate()} disabled={askQuestion.isPending}>
                  {askQuestion.isPending ? "Submitting..." : "Submit Question"}
                </Button>
              </CardContent>
            </Card>
            <div className="mt-4 space-y-3">
              {((tenderDetail as Record<string, Array<Record<string, string>>>)?.questions || []).map((q) => (
                <Card key={q.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{q.company} — {q.asked_by}</p>
                        <p className="mt-1 text-sm">{q.question}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(q.asked_at).toLocaleDateString()}</span>
                    </div>
                    {q.answer && (
                      <div className="mt-3 rounded-md bg-green-50 p-3">
                        <p className="text-xs font-medium text-green-700">Answer:</p>
                        <p className="text-sm">{q.answer}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="bids" className="mt-4">
            {((tenderDetail as Record<string, Array<Record<string, string>>>)?.submissions || []).length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No bids submitted yet
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6">
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
                      {((tenderDetail as Record<string, Array<Record<string, string>>>)?.submissions || []).map((sub) => (
                        <TableRow key={sub.id}>
                          <TableCell className="font-medium">{sub.company}</TableCell>
                          <TableCell>{sub.contact}</TableCell>
                          <TableCell>{sub.email}</TableCell>
                          <TableCell>{new Date(sub.submitted_at).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="submit" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Submit Bid</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label>Company Name</Label>
                    <Input value={bidForm.company_name} onChange={(e) => setBidForm(f => ({ ...f, company_name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Contact Name</Label>
                    <Input value={bidForm.contact_name} onChange={(e) => setBidForm(f => ({ ...f, contact_name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={bidForm.email} onChange={(e) => setBidForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <Label>CAPEX per Site (USD)</Label>
                    <Input type="number" value={bidForm.capex_per_site} onChange={(e) => setBidForm(f => ({ ...f, capex_per_site: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Grant Ask (%)</Label>
                    <Input type="number" value={bidForm.grant_ask_pct} onChange={(e) => setBidForm(f => ({ ...f, grant_ask_pct: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Proposed Tariff (USD/kWh)</Label>
                    <Input type="number" step="0.01" value={bidForm.tariff_proposed} onChange={(e) => setBidForm(f => ({ ...f, tariff_proposed: e.target.value }))} />
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <Label>PV Capacity (kWp)</Label>
                    <Input type="number" value={bidForm.pv_capacity} onChange={(e) => setBidForm(f => ({ ...f, pv_capacity: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Battery Capacity (kWh)</Label>
                    <Input type="number" value={bidForm.battery_capacity} onChange={(e) => setBidForm(f => ({ ...f, battery_capacity: e.target.value }))} />
                  </div>
                  <div>
                    <Label>PUE Commitment</Label>
                    <Input value={bidForm.pue_commitment} onChange={(e) => setBidForm(f => ({ ...f, pue_commitment: e.target.value }))} placeholder="e.g. grain mill, welding shop" />
                  </div>
                </div>
                <Button className="mt-4" onClick={() => submitBid.mutate()} disabled={submitBid.isPending}>
                  {submitBid.isPending ? "Submitting..." : "Submit Bid"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
