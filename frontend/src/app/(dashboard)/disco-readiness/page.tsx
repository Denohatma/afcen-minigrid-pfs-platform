"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export default function DiscoReadinessPage() {
  const queryClient = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [notesId, setNotesId] = useState<string | null>(null);

  const { data: lotsData, isLoading } = useQuery({
    queryKey: ["lots"],
    queryFn: () => api.lots.list({}),
  });

  const lots = lotsData?.lots ?? [];

  const pendingLots = lots.filter((l) => (l.disco_status || "pending") === "pending");
  const approvedLots = lots.filter((l) => l.disco_status === "approved");
  const rejectedLots = lots.filter((l) => l.disco_status === "rejected");

  const approveMutation = useMutation({
    mutationFn: (lotId: string) => api.lots.approve(lotId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lots"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ lotId, reason }: { lotId: string; reason: string }) =>
      api.lots.reject(lotId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lots"] });
      setRejectId(null);
      setRejectReason("");
    },
  });

  const STATUS_COLORS: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };

  function renderSection(
    title: string,
    sectionLots: typeof lots,
    status: string,
    hint: string,
  ) {
    return (
      <div className="mt-2.5 rounded border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="text-[11px] font-semibold">
            {title} ({sectionLots.length})
          </span>
          <span className="text-[10px] text-muted-foreground">{hint}</span>
        </div>
        {isLoading ? (
          <div className="p-3 text-center text-xs text-muted-foreground">Loading...</div>
        ) : sectionLots.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {status === "pending"
              ? <>No lots pending review. <Link href="/sites" className="text-primary underline">Select sites</Link> to create a lot.</>
              : status === "approved"
              ? "No lots approved yet."
              : "No lots rejected."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead className="py-1.5">Lot Name</TableHead>
                <TableHead className="py-1.5">Sites</TableHead>
                <TableHead className="py-1.5">DisCo</TableHead>
                <TableHead className="py-1.5 text-right">Potential Connections</TableHead>
                <TableHead className="py-1.5">Status</TableHead>
                <TableHead className="py-1.5 text-center">Data Pack Availed?</TableHead>
                <TableHead className="py-1.5">Reason / Notes</TableHead>
                {status === "pending" && <TableHead className="py-1.5">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sectionLots.map((lot) => (
                <TableRow key={lot.id} className="text-[12px]">
                  <TableCell className="py-1 font-medium">{lot.lot_name}</TableCell>
                  <TableCell className="py-1 font-mono text-[11px]">{fmt(lot.site_count)}</TableCell>
                  <TableCell className="py-1">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{lot.disco}</span>
                  </TableCell>
                  <TableCell className="py-1 text-right font-mono text-[11px]">{fmt(lot.total_connections)}</TableCell>
                  <TableCell className="py-1">
                    <span className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${STATUS_COLORS[status]}`}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                  </TableCell>
                  <TableCell className="py-1 text-center text-[11px]">
                    {lot.data_pack_availed ? (
                      <span className="text-green-700 font-medium">Yes</span>
                    ) : (
                      <span className="text-muted-foreground">No</span>
                    )}
                  </TableCell>
                  <TableCell className="py-1 text-[11px]">
                    {lot.disco_notes ? (
                      <button
                        className="text-primary underline text-[10px]"
                        onClick={() => setNotesId(notesId === lot.id ? null : lot.id)}
                      >
                        View Notes
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-[10px]">—</span>
                    )}
                    {notesId === lot.id && lot.disco_notes && (
                      <div className="mt-1 rounded bg-muted p-1.5 text-[10px] text-foreground max-w-[240px]">
                        {lot.disco_notes}
                      </div>
                    )}
                  </TableCell>
                  {status === "pending" && (
                    <TableCell className="py-1">
                      {rejectId === lot.id ? (
                        <div className="flex flex-col gap-1 min-w-[180px]">
                          <input
                            type="text"
                            placeholder="Reason for rejection..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="h-5 w-full rounded border border-input bg-background px-1.5 text-[10px]"
                          />
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-5 px-2 text-[10px]"
                              onClick={() => rejectMutation.mutate({ lotId: lot.id, reason: rejectReason })}
                              disabled={rejectMutation.isPending}
                            >
                              Confirm Reject
                            </Button>
                            <button className="text-[10px] text-muted-foreground underline" onClick={() => { setRejectId(null); setRejectReason(""); }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            className="h-5 px-2 text-[10px]"
                            onClick={() => approveMutation.mutate(lot.id)}
                            disabled={approveMutation.isPending}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-5 px-2 text-[10px] text-red-700 border-red-200 hover:bg-red-50"
                            onClick={() => setRejectId(lot.id)}
                          >
                            Reject
                          </Button>
                          <Link href={`/lots/${lot.id}`}>
                            <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]">View</Button>
                          </Link>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    );
  }

  return (
    <div className="text-[13px]">
      <div>
        <h1 className="font-heading text-base font-bold">DisCo Interconnection Approval</h1>
        <p className="text-[11px] text-muted-foreground">
          {lots.length} lots &middot; {pendingLots.length} pending &middot; {approvedLots.length} approved &middot; {rejectedLots.length} rejected
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
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">3</span>
        <span>DisCo Approval</span>
        <span className="text-border">→</span>
        <span className="rounded bg-muted px-1.5 py-0.5">4</span>
        <span>Tenders</span>
      </div>

      {renderSection("Pending DisCo Approval", pendingLots, "pending", "DisCo reviews interconnection feasibility")}
      {renderSection("Approved for Tender", approvedLots, "approved", "Proceed to Tenders")}
      {renderSection("Rejected", rejectedLots, "rejected", "Interconnection not feasible")}
    </div>
  );
}
