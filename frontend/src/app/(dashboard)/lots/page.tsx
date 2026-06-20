"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const DISCO_OPTIONS = [
  { value: "", label: "All DisCos" },
  { value: "AEDC", label: "AEDC" },
  { value: "KEDCO", label: "KEDCO" },
  { value: "IE", label: "IE" },
];

const TENDER_STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-100 text-green-800",
  draft: "bg-gray-100 text-gray-700",
  issued: "bg-blue-100 text-blue-800",
  closed: "bg-amber-100 text-amber-800",
  awarded: "bg-emerald-100 text-emerald-800",
  none: "bg-gray-100 text-gray-500",
};

const DATA_ROOM_COLORS: Record<string, string> = {
  complete: "bg-green-100 text-green-800",
  in_progress: "bg-blue-100 text-blue-800",
  not_started: "bg-gray-100 text-gray-500",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function LotsPage() {
  const [disco, setDisco] = useState("");

  const params: Record<string, string> = {};
  if (disco) params.disco = disco;

  const { data: lotsData, isLoading } = useQuery({
    queryKey: ["lots", disco],
    queryFn: () => api.lots.list(params),
  });

  const { data: biddersData } = useQuery({
    queryKey: ["bidders"],
    queryFn: () => api.bidders.list(),
  });

  const allLots = lotsData?.lots ?? [];
  const bidders = biddersData?.bidders ?? [];

  const approvedLots = allLots.filter((l) => l.disco_status === "approved");
  const pendingLots = allLots.filter((l) => (l.disco_status || "pending") === "pending");

  const readyForTender = approvedLots.filter((l) => l.tender_status === "approved" || l.tender_status === "none" || l.tender_status === "draft");
  const tendersIssued = approvedLots.filter((l) => l.tender_status === "issued");
  const tendersClosed = approvedLots.filter((l) => l.tender_status === "closed" || l.tender_status === "awarded");
  const totalConnections = approvedLots.reduce((s, l) => s + l.total_connections, 0);

  return (
    <div className="text-[13px]">
      <div>
        <h1 className="font-heading text-base font-bold">Lot & Tender Management</h1>
        <p className="text-[11px] text-muted-foreground">
          Program manager dashboard for tender lifecycle
          {pendingLots.length > 0 && (
            <> &middot; <Link href="/disco-readiness" className="text-amber-700 underline">{pendingLots.length} pending DisCo</Link></>
          )}
        </p>
      </div>

      {/* Flow indicator */}
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">1</span>
        <span>Sites</span>
        <span className="text-border">→</span>
        <span className="rounded bg-muted px-1.5 py-0.5">2</span>
        <span>System Sizing</span>
        <span className="text-border">→</span>
        <span className="rounded bg-muted px-1.5 py-0.5">3</span>
        <span>DisCo Approval</span>
        <span className="text-border">→</span>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">4</span>
        <span>Tenders</span>
      </div>

      {/* Stat boxes — half height */}
      <div className="mt-2 grid grid-cols-4 gap-2">
        {[
          { label: "DisCo-Approved Lots", value: approvedLots.length },
          { label: "Ready for Tender", value: readyForTender.length },
          { label: "Tenders Issued", value: tendersIssued.length },
          { label: "Total Connections", value: fmt(totalConnections) },
        ].map((s) => (
          <div key={s.label} className="rounded border border-border bg-white px-3 py-1.5">
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
            <div className="font-heading text-lg font-bold leading-tight">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Compact filter */}
      <div className="mt-2 flex items-center gap-1.5">
        <select className="h-5 rounded border border-input bg-background px-1.5 text-[10px]" value={disco} onChange={(e) => setDisco(e.target.value)}>
          {DISCO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {disco && <button className="text-[10px] text-muted-foreground underline" onClick={() => setDisco("")}>clear</button>}
      </div>

      {/* Main lots table */}
      <div className="mt-2 rounded border border-border bg-white">
        <div className="border-b border-border px-3 py-1.5">
          <span className="text-[11px] font-semibold">Tender Pipeline ({approvedLots.length})</span>
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>
        ) : approvedLots.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No DisCo-approved lots available.{" "}
            <Link href="/disco-readiness" className="text-primary underline">Go to DisCo Approval</Link>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead className="py-1.5">Lot Name</TableHead>
                <TableHead className="py-1.5">DisCo</TableHead>
                <TableHead className="py-1.5 text-right">Potential Connections</TableHead>
                <TableHead className="py-1.5">Data Room</TableHead>
                <TableHead className="py-1.5">Tender Docs</TableHead>
                <TableHead className="py-1.5">Tender Status</TableHead>
                <TableHead className="py-1.5 text-center">EOIs</TableHead>
                <TableHead className="py-1.5 text-center">Bids Downloaded</TableHead>
                <TableHead className="py-1.5">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedLots.map((lot) => {
                const drStatus = lot.data_room_status || "not_started";
                const hasTender = lot.tender_status === "issued" || lot.tender_status === "closed" || lot.tender_status === "awarded";
                const tenderDocsStatus = hasTender ? "published" : lot.tender_status === "draft" ? "draft" : "not_started";
                return (
                  <TableRow key={lot.id} className="text-[12px]">
                    <TableCell className="py-1">
                      <div className="font-medium">{lot.lot_name}</div>
                      {lot.state && <div className="text-[10px] text-muted-foreground">{lot.state}</div>}
                    </TableCell>
                    <TableCell className="py-1">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{lot.disco}</span>
                    </TableCell>
                    <TableCell className="py-1 text-right font-mono text-[11px]">{fmt(lot.total_connections)}</TableCell>
                    <TableCell className="py-1">
                      <span className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${DATA_ROOM_COLORS[drStatus] || "bg-gray-100 text-gray-500"}`}>
                        {formatLabel(drStatus)}
                      </span>
                    </TableCell>
                    <TableCell className="py-1">
                      <span className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${
                        tenderDocsStatus === "published" ? "bg-green-100 text-green-800"
                        : tenderDocsStatus === "draft" ? "bg-amber-100 text-amber-800"
                        : "bg-gray-100 text-gray-500"
                      }`}>
                        {formatLabel(tenderDocsStatus)}
                      </span>
                    </TableCell>
                    <TableCell className="py-1">
                      <span className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${TENDER_STATUS_COLORS[lot.tender_status] || "bg-gray-100 text-gray-500"}`}>
                        {lot.tender_status === "approved" ? "Ready" : formatLabel(lot.tender_status)}
                      </span>
                    </TableCell>
                    <TableCell className="py-1 text-center font-mono text-[11px]">
                      {hasTender ? (bidders.length || "—") : "—"}
                    </TableCell>
                    <TableCell className="py-1 text-center font-mono text-[11px]">—</TableCell>
                    <TableCell className="py-1">
                      <div className="flex items-center gap-1">
                        <Link href={`/lots/${lot.id}`}>
                          <Button variant="outline" size="sm" className="h-5 px-1.5 text-[10px]">Data Room</Button>
                        </Link>
                        <Link href={`/lots/${lot.id}`}>
                          <Button variant="outline" size="sm" className="h-5 px-1.5 text-[10px]">Bid Docs</Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Bidders section */}
      {bidders.length > 0 && (
        <div className="mt-2.5 rounded border border-border bg-white">
          <div className="border-b border-border px-3 py-1.5">
            <span className="text-[11px] font-semibold">Registered Bidders ({bidders.length})</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead className="py-1.5">Company</TableHead>
                <TableHead className="py-1.5">Contact</TableHead>
                <TableHead className="py-1.5">Country</TableHead>
                <TableHead className="py-1.5 text-right">Experience</TableHead>
                <TableHead className="py-1.5 text-right">Sites Done</TableHead>
                <TableHead className="py-1.5">KYC</TableHead>
                <TableHead className="py-1.5">Qualification</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bidders.map((bidder) => (
                <TableRow key={bidder.id} className="text-[12px]">
                  <TableCell className="py-1">
                    <div className="font-medium">{bidder.company_name}</div>
                    <div className="text-[10px] text-muted-foreground">{bidder.registration_number}</div>
                  </TableCell>
                  <TableCell className="py-1 text-[11px]">
                    {bidder.contact_name}
                    <div className="text-[10px] text-muted-foreground">{bidder.contact_email}</div>
                  </TableCell>
                  <TableCell className="py-1 text-[11px]">{bidder.country}</TableCell>
                  <TableCell className="py-1 text-right font-mono text-[11px]">{bidder.years_experience} yrs</TableCell>
                  <TableCell className="py-1 text-right font-mono text-[11px]">{fmt(bidder.completed_sites)}</TableCell>
                  <TableCell className="py-1">
                    <span className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${
                      bidder.kyc_status === "verified" ? "bg-green-100 text-green-800"
                      : bidder.kyc_status === "failed" ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800"
                    }`}>{formatLabel(bidder.kyc_status)}</span>
                  </TableCell>
                  <TableCell className="py-1">
                    <span className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${
                      bidder.qualification_status === "approved" ? "bg-green-100 text-green-800"
                      : bidder.qualification_status === "rejected" ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800"
                    }`}>{formatLabel(bidder.qualification_status)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
