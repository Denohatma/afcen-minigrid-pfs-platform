"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DISCO_OPTIONS = [
  { value: "", label: "All DisCos" },
  { value: "AEDC", label: "AEDC" },
  { value: "KEDCO", label: "KEDCO" },
  { value: "IE", label: "IE" },
];

const DATA_ROOM_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  in_progress: "bg-amber-100 text-amber-800",
  complete: "bg-green-100 text-green-700",
};

const TENDER_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  issued: "bg-blue-100 text-blue-700",
  closed: "bg-amber-100 text-amber-800",
  awarded: "bg-green-100 text-green-700",
};

const QUALIFICATION_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const KYC_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  verified: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

function formatNum(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function LotsPage() {
  const [disco, setDisco] = useState("");

  const params: Record<string, string> = {};
  if (disco) params.disco = disco;

  const { data: lotsData, isLoading: lotsLoading } = useQuery({
    queryKey: ["lots", disco],
    queryFn: () => api.lots.list(params),
  });

  const { data: biddersData, isLoading: biddersLoading } = useQuery({
    queryKey: ["bidders"],
    queryFn: () => api.bidders.list(),
  });

  const lots = lotsData?.lots ?? [];
  const bidders = biddersData?.bidders ?? [];

  // Compute stats from lots data
  const totalLots = lots.length;
  const totalSites = lots.reduce((sum, l) => sum + l.site_count, 0);
  const tendersIssued = lots.filter(
    (l) => l.tender_status === "issued" || l.tender_status === "closed" || l.tender_status === "awarded"
  ).length;
  const bidsReceived = lots.filter(
    (l) => l.tender_status === "closed" || l.tender_status === "awarded"
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            Lots & Tenders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage lot composition, data rooms, tender issuance, and bidder
            qualification
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/lots/new">
            <Button>Create Lot</Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="lots" className="mt-6">
        <TabsList>
          <TabsTrigger value="lots">
            Lots & Tenders ({totalLots})
          </TabsTrigger>
          <TabsTrigger value="bidders">
            Bidders ({bidders.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Lots & Tenders ─────────────────────────────────── */}
        <TabsContent value="lots" className="mt-4">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Total Lots
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatNum(totalLots)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Sites in Lots
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatNum(totalSites)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Tenders Issued
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatNum(tendersIssued)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Bids Received
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatNum(bidsReceived)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Filter */}
          <Card className="mt-4 mb-4">
            <CardContent className="pt-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <Label className="text-xs">DisCo</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={disco}
                    onChange={(e) => setDisco(e.target.value)}
                  >
                    {DISCO_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lots Table */}
          <Card>
            <CardContent className="p-0">
              {lotsLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  Loading lots...
                </div>
              ) : lots.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No lots found.{" "}
                  {disco && (
                    <button
                      className="text-primary underline"
                      onClick={() => setDisco("")}
                    >
                      Clear filter
                    </button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lot Name</TableHead>
                      <TableHead>DisCo</TableHead>
                      <TableHead className="text-right">Sites</TableHead>
                      <TableHead className="text-right">Connections</TableHead>
                      <TableHead className="text-right">Grant Ceiling</TableHead>
                      <TableHead>Data Room</TableHead>
                      <TableHead>Tender Status</TableHead>
                      <TableHead>Approved</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lots.map((lot) => (
                      <TableRow key={lot.id}>
                        <TableCell>
                          <div className="font-medium">{lot.lot_name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {lot.state}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-mono">
                            {lot.disco}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNum(lot.site_count)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNum(lot.total_connections)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <div>{formatUSD(lot.grant_ceiling_usd)}</div>
                          <div className="text-xs text-muted-foreground">
                            {(lot.grant_ceiling_pct * 100).toFixed(0)}%
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-xs ${
                              DATA_ROOM_COLORS[lot.data_room_status] ??
                              "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {formatLabel(lot.data_room_status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-xs ${
                              TENDER_STATUS_COLORS[lot.tender_status] ??
                              "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {formatLabel(lot.tender_status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {lot.approval_to_tender ? (
                            <Badge className="text-xs bg-green-100 text-green-700">
                              Yes
                            </Badge>
                          ) : (
                            <Badge className="text-xs bg-gray-100 text-gray-600">
                              No
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link href={`/lots/${lot.id}`}>
                            <Button variant="outline" size="sm">
                              View
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Bidders ────────────────────────────────────────── */}
        <TabsContent value="bidders" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {biddersLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  Loading bidders...
                </div>
              ) : bidders.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No registered bidders yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead className="text-right">Experience (yrs)</TableHead>
                      <TableHead className="text-right">Sites Completed</TableHead>
                      <TableHead className="text-right">Capacity (kWp)</TableHead>
                      <TableHead>KYC Status</TableHead>
                      <TableHead>Qualification</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bidders.map((bidder) => (
                      <TableRow key={bidder.id}>
                        <TableCell>
                          <div className="font-medium">
                            {bidder.company_name}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {bidder.registration_number}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{bidder.contact_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {bidder.contact_email}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {bidder.country}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {bidder.years_experience}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNum(bidder.completed_sites)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNum(bidder.total_capacity_kwp)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-xs ${
                              KYC_COLORS[bidder.kyc_status] ??
                              "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {formatLabel(bidder.kyc_status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-xs ${
                              QUALIFICATION_COLORS[bidder.qualification_status] ??
                              "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {formatLabel(bidder.qualification_status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
