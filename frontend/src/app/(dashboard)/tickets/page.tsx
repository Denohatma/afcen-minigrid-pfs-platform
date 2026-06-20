"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CATEGORY_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "Grievance", label: "Grievance" },
  { value: "Technical", label: "Technical" },
  { value: "Commercial", label: "Commercial" },
  { value: "E&S", label: "E&S" },
  { value: "Milestone", label: "Milestone" },
  { value: "Regulatory", label: "Regulatory" },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "All Priorities" },
  { value: "Critical", label: "Critical" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review", label: "In Review" },
  { value: "escalated", label: "Escalated" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  in_review: "bg-purple-100 text-purple-800",
  escalated: "bg-red-100 text-red-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-red-100 text-red-800",
  High: "bg-orange-100 text-orange-800",
  Medium: "bg-amber-100 text-amber-800",
  Low: "bg-gray-100 text-gray-700",
};

const CATEGORY_COLORS: Record<string, string> = {
  Grievance: "bg-red-50 text-red-700",
  Technical: "bg-blue-50 text-blue-700",
  Commercial: "bg-emerald-50 text-emerald-700",
  "E&S": "bg-purple-50 text-purple-700",
  Milestone: "bg-amber-50 text-amber-700",
  Regulatory: "bg-indigo-50 text-indigo-700",
};

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function SLABar({ slaHours, createdAt, breached }: { slaHours: number; createdAt: string; breached: boolean }) {
  const elapsed = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  const pct = Math.min((elapsed / slaHours) * 100, 100);
  const color = breached || pct >= 100 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500";

  return (
    <div className="flex flex-col items-start gap-0.5">
      <div className="w-[70px] h-[5px] rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-muted-foreground font-mono">
        {Math.round(elapsed)}h / {slaHours}h
      </span>
    </div>
  );
}

function DaysRemaining({ dueDate, status }: { dueDate: string | null; status: string }) {
  if (!dueDate || status === "resolved" || status === "closed") return <span className="text-muted-foreground">—</span>;
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return <span className="text-red-700 font-semibold">{Math.abs(days)}d overdue</span>;
  if (days <= 1) return <span className="text-red-700 font-semibold">{days}d left</span>;
  if (days <= 3) return <span className="text-amber-700">{days}d left</span>;
  return <span className="text-muted-foreground">{days}d left</span>;
}

export default function TicketsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const queryClient = useQueryClient();

  const { data: dashboardRaw } = useQuery({
    queryKey: ["tickets-dashboard"],
    queryFn: () => api.tickets.dashboard(),
  });
  const dashboard = dashboardRaw as Record<string, number> | undefined;

  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ["tickets", statusFilter, categoryFilter, priorityFilter],
    queryFn: () =>
      api.tickets.list({
        ...(statusFilter && { status: statusFilter }),
        ...(categoryFilter && { category: categoryFilter }),
        ...(priorityFilter && { priority: priorityFilter }),
      }),
  });

  const tickets = ticketsData?.tickets ?? [];

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.tickets.create(data as Partial<import("@/lib/types").Ticket>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["tickets-dashboard"] });
      setShowCreateModal(false);
    },
  });

  return (
    <div className="text-[13px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-base font-bold">
            Tickets & Grievances
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {tickets.length} tickets &middot; {dashboard?.sla_breached ?? 0} SLA
            breached &middot; {dashboard?.escalated ?? 0} escalated
          </p>
        </div>
        <Button
          size="sm"
          className="h-6 px-3 text-[11px]"
          onClick={() => setShowCreateModal(true)}
        >
          + New Ticket
        </Button>
      </div>

      <div className="mt-1.5 grid grid-cols-5 gap-2">
        {[
          { label: "Total", value: dashboard?.total ?? 0, color: "" },
          { label: "Open", value: dashboard?.open ?? 0, color: "text-blue-700" },
          {
            label: "SLA Breached",
            value: dashboard?.sla_breached ?? 0,
            color: (dashboard?.sla_breached ?? 0) > 0 ? "text-red-700" : "",
          },
          {
            label: "Critical",
            value: (dashboard?.by_priority as Record<string, number> | undefined)?.Critical ?? 0,
            color: "text-red-700",
          },
          {
            label: "Resolved",
            value: dashboard?.resolved ?? 0,
            color: "text-green-700",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded border border-border bg-white px-3 py-1"
          >
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
            <div
              className={`font-heading text-lg font-bold leading-tight ${s.color}`}
            >
              {typeof s.value === "object" ? 0 : s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        {[
          { options: STATUS_OPTIONS, value: statusFilter, set: setStatusFilter },
          { options: CATEGORY_OPTIONS, value: categoryFilter, set: setCategoryFilter },
          { options: PRIORITY_OPTIONS, value: priorityFilter, set: setPriorityFilter },
        ].map((f, idx) => (
          <select
            key={idx}
            className="h-6 rounded border border-border bg-white px-2 text-[11px]"
            value={f.value}
            onChange={(e) => f.set(e.target.value)}
          >
            {f.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ))}
      </div>

      <div className="mt-2 rounded border border-border bg-white">
        <div className="border-b border-border px-3 py-1.5">
          <span className="text-[11px] font-semibold">Ticket Pipeline</span>
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Loading...
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No tickets found. Click &quot;+ New Ticket&quot; to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead className="py-1.5">Ticket ID</TableHead>
                  <TableHead className="py-1.5">Title</TableHead>
                  <TableHead className="py-1.5">Category</TableHead>
                  <TableHead className="py-1.5">Priority</TableHead>
                  <TableHead className="py-1.5">Status</TableHead>
                  <TableHead className="py-1.5">SLA</TableHead>
                  <TableHead className="py-1.5">Due</TableHead>
                  <TableHead className="py-1.5">Assignee</TableHead>
                  <TableHead className="py-1.5">Site</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow
                    key={t.id}
                    className={`text-[12px] cursor-pointer hover:bg-accent/50 ${
                      t.status === "escalated" ? "border-l-[3px] border-l-red-500" : ""
                    } ${t.sla_breached ? "bg-red-50/50" : ""}`}
                  >
                    <TableCell className="py-1">
                      <Link
                        href={`/tickets/${t.id}`}
                        className="font-mono text-[10px] text-primary hover:underline"
                      >
                        {t.ticket_ref}
                      </Link>
                    </TableCell>
                    <TableCell className="py-1 max-w-[220px]">
                      <Link href={`/tickets/${t.id}`} className="hover:underline">
                        <div className="font-medium truncate">{t.title}</div>
                        {t.description && (
                          <div className="text-[10px] text-muted-foreground truncate">
                            {t.description.slice(0, 80)}
                          </div>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="py-1">
                      <Badge
                        className={`text-[9px] px-1 py-0 ${
                          CATEGORY_COLORS[t.category] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {t.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1">
                      <Badge
                        className={`text-[9px] px-1 py-0 ${
                          PRIORITY_COLORS[t.priority] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {t.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1">
                      <Badge
                        className={`text-[9px] px-1 py-0 ${
                          STATUS_COLORS[t.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {formatLabel(t.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1">
                      <SLABar
                        slaHours={t.sla_hours}
                        createdAt={t.created_at}
                        breached={t.sla_breached}
                      />
                    </TableCell>
                    <TableCell className="py-1 text-[10px]">
                      <DaysRemaining dueDate={t.due_date} status={t.status} />
                    </TableCell>
                    <TableCell className="py-1 text-[10px]">
                      {t.assignee_id ? (
                        <span className="text-muted-foreground">Assigned</span>
                      ) : (
                        <span className="text-amber-700">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1 text-[10px] text-muted-foreground truncate max-w-[100px]">
                      {t.site_name || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <CreateTicketModal
          onClose={() => setShowCreateModal(false)}
          onCreate={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      )}
    </div>
  );
}

function CreateTicketModal({
  onClose,
  onCreate,
  isLoading,
}: {
  onClose: () => void;
  onCreate: (data: Record<string, unknown>) => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Grievance");
  const [priority, setPriority] = useState("Medium");
  const [siteName, setSiteName] = useState("");
  const [tags, setTags] = useState("");

  const SLA_LABELS: Record<string, string> = {
    Critical: "24h SLA",
    High: "72h SLA",
    Medium: "7-day SLA",
    Low: "14-day SLA",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg border border-border bg-white p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-sm font-bold">New Ticket</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">
              Title *
              <span className="ml-1 text-[9px]">
                ({title.length}/120)
              </span>
            </label>
            <input
              className="w-full h-7 rounded border border-border px-2 text-[12px]"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 120))}
              placeholder="Brief title describing the issue"
            />
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">
              Description
            </label>
            <textarea
              className="w-full h-16 rounded border border-border px-2 py-1 text-[12px] resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description of the issue..."
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">
                Category *
              </label>
              <select
                className="w-full h-7 rounded border border-border px-2 text-[12px]"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORY_OPTIONS.slice(1).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">
                Priority *
              </label>
              <select
                className="w-full h-7 rounded border border-border px-2 text-[12px]"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {PRIORITY_OPTIONS.slice(1).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} — {SLA_LABELS[opt.value]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">
              Site Name
            </label>
            <input
              className="w-full h-7 rounded border border-border px-2 text-[12px]"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="e.g. Karshi, Zaria..."
            />
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">
              Tags (comma-separated)
            </label>
            <input
              className="w-full h-7 rounded border border-border px-2 text-[12px]"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. nemsa, interconnection, Q2-2026"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[11px]"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-6 text-[11px]"
            disabled={!title || isLoading}
            onClick={() =>
              onCreate({
                title,
                description,
                category,
                priority,
                site_name: siteName,
                tags: tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          >
            {isLoading ? "Creating..." : "Create Ticket"}
          </Button>
        </div>
      </div>
    </div>
  );
}
