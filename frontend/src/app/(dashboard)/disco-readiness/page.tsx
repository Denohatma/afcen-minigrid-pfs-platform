"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DiscoReadinessPage() {
  const queryClient = useQueryClient();

  const { data: lotsData, isLoading } = useQuery({
    queryKey: ["lots"],
    queryFn: () => api.lots.list({}),
  });

  const lots: Array<Record<string, any>> = ((lotsData as any)?.lots ?? []) as any;

  const pendingLots = lots.filter((l) => !l.approval_to_tender);
  const approvedLots = lots.filter((l) => l.approval_to_tender);

  const approveMutation = useMutation({
    mutationFn: (lotId: string) => api.lots.approve(lotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lots"] });
    },
  });

  return (
    <div className="text-[13px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-base font-bold">DisCo Interconnection Approval</h1>
          <p className="text-[11px] text-muted-foreground">
            {lots.length} lots &middot; {pendingLots.length} pending approval &middot; {approvedLots.length} approved for tender
          </p>
        </div>
      </div>

      {/* Flow indicator */}
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">Step 1</span>
        <span>Sites selected</span>
        <span className="text-border">→</span>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">Step 2</span>
        <span>DisCo approves interconnection</span>
        <span className="text-border">→</span>
        <span className="rounded bg-muted px-1.5 py-0.5">Step 3</span>
        <span>Package for tender</span>
      </div>

      {/* Pending Approval */}
      <div className="mt-3 rounded border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="text-[11px] font-semibold">Pending DisCo Approval ({pendingLots.length})</span>
          <span className="text-[10px] text-muted-foreground">DisCo must approve sites for grid interconnection before tender</span>
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>
        ) : pendingLots.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No lots pending approval. <Link href="/sites" className="text-primary underline">Select sites</Link> to create a lot.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead className="py-1.5">Lot Name</TableHead>
                <TableHead className="py-1.5">DisCo</TableHead>
                <TableHead className="py-1.5 text-right">Sites</TableHead>
                <TableHead className="py-1.5 text-right">Connections (Est.)</TableHead>
                <TableHead className="py-1.5">Status</TableHead>
                <TableHead className="py-1.5">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingLots.map((lot) => (
                <TableRow key={lot.id} className="text-[12px]">
                  <TableCell className="py-1 font-medium">{lot.lot_name}</TableCell>
                  <TableCell className="py-1">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{lot.disco}</span>
                  </TableCell>
                  <TableCell className="py-1 text-right font-mono text-[11px]">{fmt(lot.site_count)}</TableCell>
                  <TableCell className="py-1 text-right font-mono text-[11px]">{fmt(lot.total_connections)}</TableCell>
                  <TableCell className="py-1">
                    <span className="inline-block rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-800">
                      Pending Approval
                    </span>
                  </TableCell>
                  <TableCell className="py-1">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/lots/${lot.id}`}>
                        <Button variant="outline" size="sm" className="h-5 px-2 text-[10px]">View Sites</Button>
                      </Link>
                      <Button
                        size="sm"
                        className="h-5 px-2 text-[10px]"
                        onClick={() => approveMutation.mutate(lot.id)}
                        disabled={approveMutation.isPending}
                      >
                        Approve for Interconnection ✓
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Approved Lots */}
      <div className="mt-3 rounded border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="text-[11px] font-semibold">Approved for Tender ({approvedLots.length})</span>
          <span className="text-[10px] text-muted-foreground">
            These lots have DisCo approval and can proceed to <Link href="/lots" className="text-primary underline">Tenders</Link>
          </span>
        </div>
        {approvedLots.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No lots approved yet. Approve pending lots above.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead className="py-1.5">Lot Name</TableHead>
                <TableHead className="py-1.5">DisCo</TableHead>
                <TableHead className="py-1.5 text-right">Sites</TableHead>
                <TableHead className="py-1.5 text-right">Connections</TableHead>
                <TableHead className="py-1.5">Tender Status</TableHead>
                <TableHead className="py-1.5">Approved</TableHead>
                <TableHead className="py-1.5">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedLots.map((lot) => (
                <TableRow key={lot.id} className="text-[12px]">
                  <TableCell className="py-1 font-medium">{lot.lot_name}</TableCell>
                  <TableCell className="py-1">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{lot.disco}</span>
                  </TableCell>
                  <TableCell className="py-1 text-right font-mono text-[11px]">{fmt(lot.site_count)}</TableCell>
                  <TableCell className="py-1 text-right font-mono text-[11px]">{fmt(lot.total_connections)}</TableCell>
                  <TableCell className="py-1">
                    <span className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${
                      lot.tender_status === "issued" ? "bg-blue-100 text-blue-800"
                      : lot.tender_status === "draft" ? "bg-gray-100 text-gray-700"
                      : lot.tender_status === "closed" ? "bg-amber-100 text-amber-800"
                      : lot.tender_status === "awarded" ? "bg-green-100 text-green-800"
                      : "bg-green-100 text-green-800"
                    }`}>
                      {lot.tender_status === "approved" ? "Ready for Tender" : formatLabel(lot.tender_status)}
                    </span>
                  </TableCell>
                  <TableCell className="py-1 text-[10px] text-muted-foreground">
                    {lot.approved_at ? new Date(lot.approved_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}
                  </TableCell>
                  <TableCell className="py-1">
                    <Link href={lot.tender_status === "approved" || lot.tender_status === "none" ? "/lots" : `/lots/${lot.id}`}>
                      <Button variant="outline" size="sm" className="h-5 px-2 text-[10px]">
                        {lot.tender_status === "approved" ? "Go to Tenders →" : "View"}
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
