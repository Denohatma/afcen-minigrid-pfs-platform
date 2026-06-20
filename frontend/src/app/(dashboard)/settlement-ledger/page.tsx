"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SettlementInvoice, SettlementDashboard, SettlementHistoryItem } from "@/lib/types";
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

function formatUSD(n: number) {
  return "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function formatUSD2(n: number) {
  return "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function formatNum(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

const TYPE_LABELS: Record<string, string> = {
  grid_import: "Grid Import",
  power_export: "Power Export",
  grid_lease: "Grid Lease",
  duos: "DUOS",
};

const TYPE_COLORS: Record<string, string> = {
  grid_import: "bg-blue-100 text-blue-800",
  power_export: "bg-green-100 text-green-800",
  grid_lease: "bg-purple-100 text-purple-800",
  duos: "bg-amber-100 text-amber-800",
};

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  overdue: "bg-red-100 text-red-800",
  disputed: "bg-purple-100 text-purple-800",
  partial: "bg-blue-100 text-blue-800",
  escalated: "bg-red-200 text-red-900 font-bold",
  cancelled: "bg-gray-100 text-gray-600",
};

const DIRECTION_LABELS: Record<string, string> = {
  dev_to_disco: "Dev → DisCo",
  disco_to_dev: "DisCo → Dev",
};

const HISTORY_COLORS: Record<string, string> = {
  created: "bg-blue-500",
  payment_recorded: "bg-green-500",
  partial_payment: "bg-blue-400",
  status_changed: "bg-amber-500",
  dispute_raised: "bg-purple-500",
  dispute_resolved: "bg-green-500",
  escalated: "bg-red-500",
};

type Tab = "all" | "by_site" | "disputes";

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ${STATUS_COLORS[status] || "bg-gray-100 text-gray-700"}`}>
      {status === "overdue" && <span className="mr-0.5 animate-pulse">●</span>}
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${TYPE_COLORS[type] || "bg-gray-100 text-gray-700"}`}>
      {TYPE_LABELS[type] || type}
    </span>
  );
}

function InvoiceDetailPanel({
  invoice,
  onClose,
}: {
  invoice: SettlementInvoice;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: detail } = useQuery({
    queryKey: ["settlement-invoice", invoice.id],
    queryFn: () => api.settlement.get(invoice.id),
  });

  const [payAmount, setPayAmount] = useState("");
  const [payRef, setPayRef] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [resolveNote, setResolveNote] = useState("");
  const [showResolve, setShowResolve] = useState(false);

  const payMut = useMutation({
    mutationFn: () => api.settlement.pay(invoice.id, {
      amount_paid_usd: parseFloat(payAmount),
      payment_reference: payRef,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settlement"] });
      queryClient.invalidateQueries({ queryKey: ["settlement-invoice"] });
      setShowPay(false);
      setPayAmount("");
      setPayRef("");
    },
  });

  const disputeMut = useMutation({
    mutationFn: () => api.settlement.dispute(invoice.id, {
      dispute_reason: disputeReason,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settlement"] });
      queryClient.invalidateQueries({ queryKey: ["settlement-invoice"] });
      setShowDispute(false);
      setDisputeReason("");
    },
  });

  const resolveMut = useMutation({
    mutationFn: () => api.settlement.resolveDispute(invoice.id, {
      resolution_note: resolveNote,
      new_status: "pending",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settlement"] });
      queryClient.invalidateQueries({ queryKey: ["settlement-invoice"] });
      setShowResolve(false);
      setResolveNote("");
    },
  });

  const inv = detail || invoice;
  const history = (inv as SettlementInvoice).history || [];
  const netPos = (inv as SettlementInvoice).net_position;

  return (
    <tr>
      <td colSpan={10} className="p-0 border-t-2 border-primary/20">
        <div className="bg-muted/30 p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-heading text-sm font-bold">{inv.invoice_ref}</h3>
              <p className="text-[11px] text-muted-foreground">
                {inv.site_name} &middot; {inv.developer_name} ↔ {inv.disco_name}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={inv.status} />
              <TypeBadge type={inv.invoice_type} />
              <button onClick={onClose} className="ml-2 rounded p-1 text-muted-foreground hover:bg-accent text-xs">✕</button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            {/* Net Position */}
            {netPos && (
              <Card className="col-span-1">
                <CardContent className="p-3">
                  <p className="text-[10px] font-medium text-muted-foreground mb-2">Net Position — {inv.billing_period}</p>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span>Dev owes DisCo</span>
                      <span className="font-mono text-red-700">{formatUSD2(netPos.total_dev_owes_usd)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>DisCo owes Dev</span>
                      <span className="font-mono text-green-700">{formatUSD2(netPos.total_disco_owes_usd)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 font-semibold">
                      <span>Net</span>
                      <span className={`font-mono ${netPos.net_position_usd >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {formatUSD2(netPos.net_position_usd)}
                      </span>
                    </div>
                    {netPos.has_arrears && (
                      <span className="inline-block mt-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">Arrears</span>
                    )}
                    {netPos.milestone_3_risk && (
                      <span className="inline-block mt-1 ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-800">M3 at risk</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Invoice Detail */}
            <Card className={netPos ? "col-span-2" : "col-span-3"}>
              <CardContent className="p-3">
                <p className="text-[10px] font-medium text-muted-foreground mb-2">Invoice Detail</p>
                <div className="grid grid-cols-4 gap-x-4 gap-y-1 text-[11px]">
                  <div><span className="text-muted-foreground">Direction:</span> {DIRECTION_LABELS[inv.direction] || inv.direction}</div>
                  <div><span className="text-muted-foreground">Amount:</span> <span className="font-mono font-semibold">{formatUSD2(inv.amount_usd)}</span></div>
                  <div><span className="text-muted-foreground">kWh:</span> {inv.kwh_quantity ? formatNum(inv.kwh_quantity) : "—"}</div>
                  <div><span className="text-muted-foreground">Rate/kWh:</span> {inv.rate_per_kwh ? `$${inv.rate_per_kwh.toFixed(4)}` : "—"}</div>
                  <div><span className="text-muted-foreground">Period:</span> {inv.billing_period}</div>
                  <div><span className="text-muted-foreground">Issued:</span> {inv.issued_date ? new Date(inv.issued_date).toLocaleDateString() : "—"}</div>
                  <div><span className="text-muted-foreground">Due:</span> <span className={inv.days_overdue > 0 ? "text-red-700 font-semibold" : ""}>{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}</span></div>
                  <div><span className="text-muted-foreground">Paid:</span> {inv.paid_date ? new Date(inv.paid_date).toLocaleDateString() : "—"}</div>
                  <div><span className="text-muted-foreground">Paid amount:</span> <span className="font-mono">{formatUSD2(inv.amount_paid_usd || 0)}</span></div>
                  <div><span className="text-muted-foreground">Outstanding:</span> <span className="font-mono text-red-700">{formatUSD2(inv.amount_outstanding_usd)}</span></div>
                  <div><span className="text-muted-foreground">Ref:</span> {inv.payment_reference || "—"}</div>
                  <div><span className="text-muted-foreground">Meter:</span> {inv.bulk_meter_id || "—"}</div>
                </div>
                {inv.notes && <p className="mt-2 text-[11px] text-muted-foreground italic">{inv.notes}</p>}
              </CardContent>
            </Card>
          </div>

          {/* Activity Timeline */}
          {history.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-medium text-muted-foreground mb-2">Activity</p>
              <div className="space-y-1.5">
                {history.map((h: SettlementHistoryItem) => (
                  <div key={h.id} className="flex items-start gap-2 text-[11px]">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${HISTORY_COLORS[h.action] || "bg-gray-400"}`} />
                    <span className="text-muted-foreground">{h.created_at ? new Date(h.created_at).toLocaleDateString() : ""}</span>
                    <span className="font-medium">{h.action.replace(/_/g, " ")}</span>
                    {h.old_status && h.new_status && (
                      <span className="text-muted-foreground">{h.old_status} → {h.new_status}</span>
                    )}
                    {h.note && <span className="text-muted-foreground truncate max-w-[300px]">{h.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            {["pending", "overdue", "partial"].includes(inv.status) && (
              <button
                onClick={() => setShowPay(!showPay)}
                className="rounded bg-green-700 px-3 py-1 text-[11px] font-semibold text-white hover:bg-green-800"
              >
                {showPay ? "Cancel" : "Record Payment"}
              </button>
            )}
            {["pending", "overdue", "partial"].includes(inv.status) && (
              <button
                onClick={() => setShowDispute(!showDispute)}
                className="rounded bg-purple-700 px-3 py-1 text-[11px] font-semibold text-white hover:bg-purple-800"
              >
                {showDispute ? "Cancel" : "Raise Dispute"}
              </button>
            )}
            {inv.status === "disputed" && (
              <button
                onClick={() => setShowResolve(!showResolve)}
                className="rounded bg-green-700 px-3 py-1 text-[11px] font-semibold text-white hover:bg-green-800"
              >
                {showResolve ? "Cancel" : "Resolve Dispute"}
              </button>
            )}
          </div>

          {/* Inline forms */}
          {showPay && (
            <div className="mt-3 rounded border bg-white p-3 max-w-md">
              <p className="text-[11px] font-semibold mb-2">Record Payment</p>
              <div className="space-y-2">
                <input type="number" placeholder="Amount (USD)" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="w-full rounded border px-2 py-1 text-[11px]" />
                <input type="text" placeholder="Payment reference" value={payRef} onChange={e => setPayRef(e.target.value)}
                  className="w-full rounded border px-2 py-1 text-[11px]" />
                <button onClick={() => payMut.mutate()} disabled={!payAmount || payMut.isPending}
                  className="rounded bg-green-700 px-3 py-1 text-[11px] font-semibold text-white hover:bg-green-800 disabled:opacity-50">
                  {payMut.isPending ? "Processing…" : "Confirm Payment"}
                </button>
              </div>
            </div>
          )}

          {showDispute && (
            <div className="mt-3 rounded border bg-white p-3 max-w-md">
              <p className="text-[11px] font-semibold mb-2">Raise Dispute</p>
              <textarea placeholder="Dispute reason" value={disputeReason} onChange={e => setDisputeReason(e.target.value)}
                className="w-full rounded border px-2 py-1 text-[11px] min-h-[60px]" />
              <button onClick={() => disputeMut.mutate()} disabled={!disputeReason || disputeMut.isPending}
                className="mt-2 rounded bg-purple-700 px-3 py-1 text-[11px] font-semibold text-white hover:bg-purple-800 disabled:opacity-50">
                {disputeMut.isPending ? "Submitting…" : "Submit Dispute"}
              </button>
            </div>
          )}

          {showResolve && (
            <div className="mt-3 rounded border bg-white p-3 max-w-md">
              <p className="text-[11px] font-semibold mb-2">Resolve Dispute</p>
              <textarea placeholder="Resolution note" value={resolveNote} onChange={e => setResolveNote(e.target.value)}
                className="w-full rounded border px-2 py-1 text-[11px] min-h-[60px]" />
              <button onClick={() => resolveMut.mutate()} disabled={!resolveNote || resolveMut.isPending}
                className="mt-2 rounded bg-green-700 px-3 py-1 text-[11px] font-semibold text-white hover:bg-green-800 disabled:opacity-50">
                {resolveMut.isPending ? "Resolving…" : "Resolve"}
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function RecordInvoiceModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    site_name: "",
    disco_name: "KEDCO",
    developer_name: "",
    invoice_type: "grid_import",
    billing_period: "",
    amount_usd: "",
    kwh_quantity: "",
    due_date: "",
    issued_date: "",
    notes: "",
  });

  const createMut = useMutation({
    mutationFn: () => api.settlement.create({
      ...form,
      amount_usd: parseFloat(form.amount_usd),
      kwh_quantity: form.kwh_quantity ? parseFloat(form.kwh_quantity) : undefined,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString(),
      issued_date: form.issued_date ? new Date(form.issued_date).toISOString() : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settlement"] });
      onClose();
    },
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-sm font-bold">Record Invoice</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Site</label>
            <input value={form.site_name} onChange={e => set("site_name", e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-[11px]" placeholder="e.g. Zawaciki" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">DisCo</label>
            <select value={form.disco_name} onChange={e => set("disco_name", e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-[11px] bg-white">
              <option value="KEDCO">KEDCO</option>
              <option value="AEDC">AEDC</option>
              <option value="Ikeja Electric">Ikeja Electric</option>
              <option value="BEDC">BEDC</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Invoice Type</label>
            <select value={form.invoice_type} onChange={e => set("invoice_type", e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-[11px] bg-white">
              <option value="grid_import">Grid Import (Dev → DisCo)</option>
              <option value="power_export">Power Export (DisCo → Dev)</option>
              <option value="grid_lease">Grid Lease (Dev → DisCo)</option>
              <option value="duos">DUOS (Dev → DisCo)</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Developer</label>
            <input value={form.developer_name} onChange={e => set("developer_name", e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-[11px]" placeholder="e.g. Havenhill Energy" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Billing Period</label>
            <input type="month" value={form.billing_period} onChange={e => set("billing_period", e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-[11px]" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Amount (USD)</label>
            <input type="number" value={form.amount_usd} onChange={e => set("amount_usd", e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-[11px]" placeholder="0.00" />
          </div>
          {["grid_import", "power_export", "duos"].includes(form.invoice_type) && (
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">kWh Quantity</label>
              <input type="number" value={form.kwh_quantity} onChange={e => set("kwh_quantity", e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-[11px]" placeholder="0" />
            </div>
          )}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Due Date</label>
            <input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-[11px]" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-medium text-muted-foreground">Notes</label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-[11px] min-h-[40px]" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-[11px]">Cancel</button>
          <button onClick={() => createMut.mutate()}
            disabled={!form.site_name || !form.amount_usd || !form.billing_period || createMut.isPending}
            className="rounded bg-primary px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
            {createMut.isPending ? "Creating…" : "Record Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettlementLedgerPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filters, setFilters] = useState({
    status: "",
    invoice_type: "",
    disco_name: "",
    period: "",
  });

  const queryParams: Record<string, string> = {};
  if (filters.status) queryParams.status = filters.status;
  if (filters.invoice_type) queryParams.invoice_type = filters.invoice_type;
  if (filters.disco_name) queryParams.disco_name = filters.disco_name;
  if (filters.period) queryParams.period = filters.period;

  const { data, isLoading } = useQuery({
    queryKey: ["settlement-invoices", queryParams],
    queryFn: () => api.settlement.list(queryParams),
  });

  const { data: dashboard } = useQuery({
    queryKey: ["settlement-dashboard"],
    queryFn: () => api.settlement.dashboard(),
  });

  const invoices = data?.invoices ?? [];
  const stats = dashboard as SettlementDashboard | undefined;

  const overdueCount = invoices.filter(i => i.status === "overdue").length;
  const disputedCount = invoices.filter(i => i.status === "disputed").length;

  const siteGroups: Record<string, SettlementInvoice[]> = {};
  for (const inv of invoices) {
    const key = inv.site_name || "Unknown";
    if (!siteGroups[key]) siteGroups[key] = [];
    siteGroups[key].push(inv);
  }

  const disputeInvoices = invoices.filter(
    i => ["overdue", "disputed", "partial", "escalated"].includes(i.status)
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-lg font-bold flex items-center gap-2">
            <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
            DisCo Settlement Ledger
          </h1>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="rounded bg-primary px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-primary/90">
          + Record Invoice
        </button>
      </div>

      {/* Alert Strip */}
      {(overdueCount > 0 || disputedCount > 0) && (
        <div className="mt-3 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-900">
          ⚠ {overdueCount > 0 && `${overdueCount} overdue invoice${overdueCount > 1 ? "s" : ""}`}
          {overdueCount > 0 && disputedCount > 0 && " · "}
          {disputedCount > 0 && `${disputedCount} disputed invoice${disputedCount > 1 ? "s" : ""}`}
        </div>
      )}

      {/* KPI Cards */}
      {stats && (
        <div className="mt-3 grid gap-3 grid-cols-6">
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">Total Invoiced</p>
              <p className="font-mono text-lg font-bold">{formatUSD(stats.total_invoiced_usd)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">Paid</p>
              <p className="font-mono text-lg font-bold text-green-700">{formatUSD(stats.total_paid_usd)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">Pending</p>
              <p className="font-mono text-lg font-bold text-amber-700">{formatUSD(stats.total_pending_usd)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">Overdue</p>
              <p className={`font-mono text-lg font-bold ${stats.total_overdue_usd > 0 ? "text-red-700" : ""}`}>{formatUSD(stats.total_overdue_usd)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">In Dispute</p>
              <p className={`font-mono text-lg font-bold ${stats.total_disputed_count > 0 ? "text-red-700" : ""}`}>{stats.total_disputed_count}</p>
              <p className="text-[10px] text-muted-foreground">{formatUSD(stats.total_disputed_usd)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">Net Position</p>
              <p className={`font-mono text-lg font-bold ${stats.net_position_usd >= 0 ? "text-green-700" : "text-red-700"}`}>
                {formatUSD(stats.net_position_usd)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs + Filters */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-1">
          {(["all", "by_site", "disputes"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded px-3 py-1 text-[11px] font-medium transition-colors ${tab === t ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
              {t === "all" ? "All Invoices" : t === "by_site" ? "By Site" : "Disputes"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            className="rounded border px-2 py-1 text-[11px] bg-white">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="disputed">Disputed</option>
            <option value="partial">Partial</option>
            <option value="escalated">Escalated</option>
          </select>
          <select value={filters.invoice_type} onChange={e => setFilters(f => ({ ...f, invoice_type: e.target.value }))}
            className="rounded border px-2 py-1 text-[11px] bg-white">
            <option value="">All types</option>
            <option value="grid_import">Grid Import</option>
            <option value="power_export">Power Export</option>
            <option value="grid_lease">Grid Lease</option>
            <option value="duos">DUOS</option>
          </select>
          <select value={filters.disco_name} onChange={e => setFilters(f => ({ ...f, disco_name: e.target.value }))}
            className="rounded border px-2 py-1 text-[11px] bg-white">
            <option value="">All DisCos</option>
            <option value="KEDCO">KEDCO</option>
            <option value="AEDC">AEDC</option>
            <option value="Ikeja Electric">Ikeja Electric</option>
          </select>
        </div>
      </div>

      {/* Tab Content */}
      {tab === "all" && (
        <Card className="mt-3">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading invoices…</div>
            ) : invoices.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No invoices found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Invoice Ref</TableHead>
                    <TableHead className="text-[11px]">Site / Developer</TableHead>
                    <TableHead className="text-[11px]">Type</TableHead>
                    <TableHead className="text-[11px]">Direction</TableHead>
                    <TableHead className="text-[11px] text-right">Amount</TableHead>
                    <TableHead className="text-[11px] text-right">kWh</TableHead>
                    <TableHead className="text-[11px]">Period</TableHead>
                    <TableHead className="text-[11px]">Due</TableHead>
                    <TableHead className="text-[11px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map(inv => (
                    <>
                      <TableRow
                        key={inv.id}
                        className={`cursor-pointer hover:bg-accent/50 ${
                          inv.status === "overdue" ? "bg-red-50/50" :
                          inv.status === "disputed" ? "bg-purple-50/50" : ""
                        }`}
                        onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)}
                      >
                        <TableCell className="text-[11px] font-mono font-medium">{inv.invoice_ref}</TableCell>
                        <TableCell className="text-[11px]">
                          <div>{inv.site_name}</div>
                          <div className="text-[10px] text-muted-foreground">{inv.developer_name}</div>
                        </TableCell>
                        <TableCell><TypeBadge type={inv.invoice_type} /></TableCell>
                        <TableCell className="text-[11px]">{DIRECTION_LABELS[inv.direction] || inv.direction}</TableCell>
                        <TableCell className="text-[11px] text-right font-mono font-semibold">{formatUSD2(inv.amount_usd)}</TableCell>
                        <TableCell className="text-[11px] text-right font-mono">{inv.kwh_quantity ? formatNum(inv.kwh_quantity) : "—"}</TableCell>
                        <TableCell className="text-[11px] font-mono">{inv.billing_period}</TableCell>
                        <TableCell className="text-[11px]">
                          <span className={inv.days_overdue > 0 ? "text-red-700 font-semibold" : ""}>
                            {inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}
                          </span>
                        </TableCell>
                        <TableCell><StatusBadge status={inv.status} /></TableCell>
                      </TableRow>
                      {expandedId === inv.id && (
                        <InvoiceDetailPanel
                          key={`detail-${inv.id}`}
                          invoice={inv}
                          onClose={() => setExpandedId(null)}
                        />
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "by_site" && (
        <div className="mt-3 space-y-3">
          {Object.entries(siteGroups).map(([siteName, siteInvs]) => {
            const hasOverdue = siteInvs.some(i => i.status === "overdue");
            const hasDisputed = siteInvs.some(i => i.status === "disputed");
            const totalDev = siteInvs.filter(i => i.direction === "dev_to_disco").reduce((s, i) => s + i.amount_usd, 0);
            const totalDisco = siteInvs.filter(i => i.direction === "disco_to_dev").reduce((s, i) => s + i.amount_usd, 0);
            const net = totalDisco - totalDev;

            return (
              <SiteCard
                key={siteName}
                siteName={siteName}
                invoices={siteInvs}
                hasOverdue={hasOverdue}
                hasDisputed={hasDisputed}
                totalDev={totalDev}
                totalDisco={totalDisco}
                net={net}
              />
            );
          })}
        </div>
      )}

      {tab === "disputes" && (
        <div className="mt-3 space-y-2">
          {disputeInvoices.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No active disputes or overdue invoices.</div>
          ) : disputeInvoices.map(inv => (
            <Card key={inv.id} className={`border-l-[3px] ${
              inv.status === "overdue" || inv.status === "escalated" ? "border-l-red-500" :
              inv.status === "disputed" ? "border-l-purple-500" : "border-l-blue-500"
            }`}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-medium">{inv.invoice_ref}</span>
                      <StatusBadge status={inv.status} />
                      <TypeBadge type={inv.invoice_type} />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {inv.site_name} · {inv.developer_name} ↔ {inv.disco_name}
                    </p>
                    <p className="text-[11px] font-mono font-semibold mt-1">{formatUSD2(inv.amount_usd)}</p>
                    {inv.notes && <p className="text-[10px] text-muted-foreground mt-1 italic max-w-lg truncate">{inv.notes}</p>}
                    {inv.dispute_reason && <p className="text-[10px] text-purple-700 mt-1 max-w-lg truncate">{inv.dispute_reason}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setExpandedId(inv.id)}
                      className="rounded border px-2 py-1 text-[10px] hover:bg-accent">View</button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* By DisCo table */}
      {stats && stats.by_disco.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-[11px] font-semibold text-muted-foreground">By DisCo</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">DisCo</TableHead>
                  <TableHead className="text-[11px] text-right">Total Invoiced</TableHead>
                  <TableHead className="text-[11px] text-right">Overdue</TableHead>
                  <TableHead className="text-[11px] text-right">Disputed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.by_disco.map(d => (
                  <TableRow key={d.disco_name}>
                    <TableCell className="text-[11px] font-medium">{d.disco_name}</TableCell>
                    <TableCell className="text-[11px] text-right font-mono">{formatUSD(d.total_usd)}</TableCell>
                    <TableCell className={`text-[11px] text-right font-mono ${d.overdue_usd > 0 ? "text-red-700" : ""}`}>{formatUSD(d.overdue_usd)}</TableCell>
                    <TableCell className={`text-[11px] text-right ${d.disputed_count > 0 ? "text-purple-700 font-semibold" : ""}`}>{d.disputed_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {showCreate && <RecordInvoiceModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function SiteCard({
  siteName, invoices, hasOverdue, hasDisputed, totalDev, totalDisco, net,
}: {
  siteName: string;
  invoices: SettlementInvoice[];
  hasOverdue: boolean;
  hasDisputed: boolean;
  totalDev: number;
  totalDisco: number;
  net: number;
}) {
  const [open, setOpen] = useState(false);
  const disco = invoices[0]?.disco_name || "";
  const developer = invoices[0]?.developer_name || "";

  return (
    <Card>
      <div className="cursor-pointer" onClick={() => setOpen(!open)}>
        {(hasOverdue || hasDisputed) && (
          <div className={`px-3 py-1 text-[10px] font-semibold ${hasOverdue ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
            {hasOverdue && "⚠ Overdue invoices"}
            {hasOverdue && hasDisputed && " · "}
            {hasDisputed && "⚠ Active disputes"}
          </div>
        )}
        <CardContent className="p-3 flex items-center justify-between">
          <div>
            <p className="text-[12px] font-semibold">{siteName}</p>
            <p className="text-[10px] text-muted-foreground">{developer} ↔ {disco} · {invoices.length} invoices</p>
          </div>
          <span className="text-[11px] text-muted-foreground">{open ? "▲" : "▼"}</span>
        </CardContent>
      </div>
      {open && (
        <CardContent className="px-3 pb-3 pt-0">
          <div className="rounded border bg-muted/30 p-2 mb-3 grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <span className="text-muted-foreground">Dev owes DisCo</span>
              <p className="font-mono font-semibold text-red-700">{formatUSD2(totalDev)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">DisCo owes Dev</span>
              <p className="font-mono font-semibold text-green-700">{formatUSD2(totalDisco)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Net Position</span>
              <p className={`font-mono font-semibold ${net >= 0 ? "text-green-700" : "text-red-700"}`}>{formatUSD2(net)}</p>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">Ref</TableHead>
                <TableHead className="text-[10px]">Type</TableHead>
                <TableHead className="text-[10px] text-right">Amount</TableHead>
                <TableHead className="text-[10px]">Period</TableHead>
                <TableHead className="text-[10px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map(inv => (
                <TableRow key={inv.id} className={
                  inv.status === "overdue" ? "bg-red-50/50" :
                  inv.status === "disputed" ? "bg-purple-50/50" : ""
                }>
                  <TableCell className="text-[10px] font-mono">{inv.invoice_ref}</TableCell>
                  <TableCell><TypeBadge type={inv.invoice_type} /></TableCell>
                  <TableCell className="text-[10px] text-right font-mono">{formatUSD2(inv.amount_usd)}</TableCell>
                  <TableCell className="text-[10px]">{inv.billing_period}</TableCell>
                  <TableCell><StatusBadge status={inv.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}
