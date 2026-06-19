"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TENDER_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  issued: "bg-green-100 text-green-700",
  closed: "bg-amber-100 text-amber-700",
  awarded: "bg-primary text-white",
};

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

export default function LotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [actionMsg, setActionMsg] = useState("");
  const [showTenderForm, setShowTenderForm] = useState(false);
  const [tenderTitle, setTenderTitle] = useState("");
  const [tenderDesc, setTenderDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: lot, isLoading } = useQuery({
    queryKey: ["lot", id],
    queryFn: () => api.lots.get(id),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["lot", id] });

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await api.lots.approve(id);
      setActionMsg("Lot approved for tendering");
      refresh();
    } catch (e: any) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTender = async () => {
    if (!tenderTitle.trim()) return;
    setSubmitting(true);
    try {
      await api.tenders.create(id, {
        title: tenderTitle,
        description: tenderDesc,
        procurement_method: "icb",
        currency: "USD",
        grant_ceiling_pct: lot?.grant_ceiling_pct ?? 0.4,
        bid_validity_days: 120,
      });
      setActionMsg("Tender created");
      setShowTenderForm(false);
      refresh();
    } catch (e: any) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssueTender = async (tenderId: string) => {
    setSubmitting(true);
    try {
      await api.tenders.issue(tenderId);
      setActionMsg("Tender issued — now open for bids");
      refresh();
    } catch (e: any) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading lot...
      </div>
    );
  }

  if (!lot) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-xl font-bold">Lot not found</h2>
        <Button className="mt-4" onClick={() => router.push("/lots")}>
          Back to Lots
        </Button>
      </div>
    );
  }

  const lotData = lot as Record<string, any>;
  const tender = lotData.tender as Record<string, any> | null;
  const sites = (lotData.sites ?? []) as Array<Record<string, any>>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{lotData.lot_name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lotData.disco} &middot; {lotData.state} &middot; {lotData.site_count} sites &middot; {lotData.total_connections?.toLocaleString()} connections
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/lots")}>
          Back to Lots
        </Button>
      </div>

      {actionMsg && (
        <div className={`mt-4 rounded-md p-3 text-sm ${
          actionMsg.startsWith("Error") ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-700"
        }`}>
          {actionMsg}
        </div>
      )}

      {/* Lot Summary */}
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Grant Ceiling</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUSD(lotData.grant_ceiling_usd)}</p>
            <p className="text-xs text-muted-foreground">{(lotData.grant_ceiling_pct * 100).toFixed(0)}% of eligible CAPEX</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={lotData.approval_to_tender ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
              {lotData.approval_to_tender ? "Yes" : "No"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Tender Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={TENDER_STATUS_COLORS[lotData.tender_status] ?? "bg-gray-100 text-gray-700"}>
              {lotData.tender_status?.replace(/_/g, " ")}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Data Room</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className="bg-gray-100 text-gray-700">
              {lotData.data_room_status?.replace(/_/g, " ")}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Sites in this lot */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Sites in Lot ({sites.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {sites.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No sites added to this lot yet.
            </p>
          ) : (
            <div className="space-y-2">
              {sites.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-md border">
                  <span className="font-medium">Site {s.site_id?.slice(0, 8)}...</span>
                  <span className="text-sm text-muted-foreground">Rank: {s.settlement_rank ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons — Workflow Steps */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Workflow Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1: Approve for tendering */}
          {!lotData.approval_to_tender && (
            <div className="flex items-center justify-between p-4 rounded-md border border-amber-200 bg-amber-50">
              <div>
                <p className="font-medium">Step 1: Approve for Tendering</p>
                <p className="text-sm text-muted-foreground">REA PMU must approve this lot before a tender can be created</p>
              </div>
              <Button onClick={handleApprove} disabled={submitting}>
                {submitting ? "Approving..." : "Approve Lot"}
              </Button>
            </div>
          )}

          {/* Step 2: Create tender */}
          {lotData.approval_to_tender && lotData.tender_status !== "issued" && !tender && (
            <div className="p-4 rounded-md border border-blue-200 bg-blue-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Step 2: Create Tender</p>
                  <p className="text-sm text-muted-foreground">Create a competitive tender for this lot</p>
                </div>
                <Button onClick={() => setShowTenderForm(!showTenderForm)}>
                  {showTenderForm ? "Cancel" : "Create Tender"}
                </Button>
              </div>
              {showTenderForm && (
                <div className="mt-4 space-y-3">
                  <div>
                    <Label>Tender Title</Label>
                    <Input
                      placeholder="e.g. Supply, Install & Operate Interconnected Mini-Grid Systems"
                      value={tenderTitle}
                      onChange={(e) => setTenderTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input
                      placeholder="Brief description of the tender scope..."
                      value={tenderDesc}
                      onChange={(e) => setTenderDesc(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleCreateTender} disabled={submitting}>
                    {submitting ? "Creating..." : "Confirm & Create Tender"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Issue tender */}
          {tender && tender.status === "draft" && (
            <div className="flex items-center justify-between p-4 rounded-md border border-green-200 bg-green-50">
              <div>
                <p className="font-medium">Step 3: Issue Tender</p>
                <p className="text-sm text-muted-foreground">
                  Tender ref: {tender.tender_reference} — Issue to open for bidding
                </p>
              </div>
              <Button onClick={() => handleIssueTender(tender.id)} disabled={submitting}>
                {submitting ? "Issuing..." : "Issue Tender"}
              </Button>
            </div>
          )}

          {/* Completed state */}
          {lotData.tender_status === "issued" && (
            <div className="flex items-center justify-between p-4 rounded-md border border-green-200 bg-green-50">
              <div>
                <p className="font-medium text-green-700">Tender Issued</p>
                <p className="text-sm text-muted-foreground">
                  This lot is now open for bids. Bidders can submit proposals.
                </p>
              </div>
              <Badge className="bg-green-100 text-green-700 text-sm">Live</Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
