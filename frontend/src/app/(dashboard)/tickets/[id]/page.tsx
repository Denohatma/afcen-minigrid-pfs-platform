"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

const STATUS_FLOW = ["open", "in_progress", "in_review", "resolved", "closed"];

const HISTORY_COLORS: Record<string, string> = {
  created: "bg-gray-400",
  commented: "bg-blue-500",
  status_changed: "bg-amber-500",
  assigned: "bg-purple-500",
  reassigned: "bg-purple-500",
  escalated: "bg-red-500",
  resolved: "bg-green-500",
  closed: "bg-gray-500",
  priority_changed: "bg-orange-500",
  sla_breached: "bg-red-600",
};

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function relativeTime(dt: string) {
  const diff = Date.now() - new Date(dt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function SLABar({ slaHours, createdAt, breached }: { slaHours: number; createdAt: string; breached: boolean }) {
  const elapsed = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  const pct = Math.min((elapsed / slaHours) * 100, 100);
  const color = breached || pct >= 100 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500";

  return (
    <div className="space-y-1">
      <div className="w-full h-[6px] rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
        <span>{Math.round(elapsed)}h / {slaHours}h</span>
        {breached && (
          <Badge className="bg-red-100 text-red-800 text-[8px] px-1 py-0">BREACHED</Badge>
        )}
      </div>
    </div>
  );
}

export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = params.id as string;
  const queryClient = useQueryClient();

  const [commentBody, setCommentBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [escalationReason, setEscalationReason] = useState("");

  const { data: ticket } = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => api.tickets.get(ticketId),
  });

  const commentMutation = useMutation({
    mutationFn: (data: { body: string; is_internal: boolean }) =>
      api.tickets.addComment(ticketId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
      setCommentBody("");
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (data: { resolution_summary: string }) =>
      api.tickets.resolve(ticketId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
      setShowResolveModal(false);
    },
  });

  const escalateMutation = useMutation({
    mutationFn: (data: { escalation_reason: string }) =>
      api.tickets.escalate(ticketId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
      setShowEscalateModal(false);
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => api.tickets.close(ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      api.tickets.update(ticketId, { status } as Partial<import("@/lib/types").Ticket>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
    },
  });

  if (!ticket) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        Loading ticket...
      </div>
    );
  }

  const comments = ticket.comments ?? [];
  const history = ticket.history ?? [];

  const activity = [
    ...comments.map((c) => ({
      type: "comment" as const,
      id: c.id,
      actor: c.author_name,
      action: c.is_internal ? "Internal note" : "Comment",
      content: c.body,
      isInternal: c.is_internal,
      createdAt: c.created_at,
    })),
    ...history.map((h) => ({
      type: "history" as const,
      id: h.id,
      actor: h.actor_name,
      action: formatLabel(h.action),
      content: h.note ?? (h.field_changed ? `${h.field_changed}: ${h.old_value} → ${h.new_value}` : ""),
      isInternal: false,
      createdAt: h.created_at,
    })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div className="text-[13px]">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
        <Link href="/tickets" className="hover:text-primary underline">
          Tickets
        </Link>
        <span>/</span>
        <span>{ticket.ticket_ref}</span>
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-3">
        {/* Left column */}
        <div className="space-y-3">
          <div className="rounded border border-border bg-white p-3">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="font-heading text-base font-bold">{ticket.title}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {ticket.ticket_ref}
                  </span>
                  <Badge className={`text-[9px] px-1 py-0 ${CATEGORY_COLORS[ticket.category] ?? "bg-gray-100 text-gray-700"}`}>
                    {ticket.category}
                  </Badge>
                  <Badge className={`text-[9px] px-1 py-0 ${PRIORITY_COLORS[ticket.priority] ?? "bg-gray-100 text-gray-700"}`}>
                    {ticket.priority}
                  </Badge>
                </div>
              </div>
              <Badge className={`text-[10px] ${STATUS_COLORS[ticket.status] ?? "bg-gray-100 text-gray-700"}`}>
                {formatLabel(ticket.status)}
              </Badge>
            </div>

            {ticket.description && (
              <p className="mt-2 text-[12px] text-muted-foreground whitespace-pre-wrap">
                {ticket.description}
              </p>
            )}
          </div>

          {/* Status breadcrumb */}
          <div className="flex items-center gap-1">
            {STATUS_FLOW.map((s, idx) => {
              const isCurrent = ticket.status === s;
              const isPast = STATUS_FLOW.indexOf(ticket.status) > idx;
              const isEscalated = ticket.status === "escalated" && s === "in_review";
              return (
                <div key={s} className="flex items-center gap-1">
                  {idx > 0 && <div className={`h-px w-4 ${isPast ? "bg-primary" : "bg-border"}`} />}
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded ${
                      isCurrent
                        ? "bg-primary text-white font-semibold"
                        : isPast
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {formatLabel(s)}
                  </span>
                </div>
              );
            })}
            {ticket.status === "escalated" && (
              <>
                <div className="h-px w-4 bg-red-300" />
                <span className="text-[10px] px-2 py-0.5 rounded bg-red-500 text-white font-semibold">
                  Escalated
                </span>
              </>
            )}
          </div>

          {/* Activity timeline */}
          <div className="rounded border border-border bg-white">
            <div className="border-b border-border px-3 py-1.5">
              <span className="text-[11px] font-semibold">Activity</span>
            </div>
            <div className="px-3 py-2 space-y-3">
              {activity.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">
                  No activity yet.
                </div>
              ) : (
                activity.map((item) => (
                  <div key={item.id} className="flex gap-2">
                    <div
                      className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                        item.type === "comment"
                          ? item.isInternal
                            ? "bg-gray-400"
                            : "bg-blue-500"
                          : HISTORY_COLORS[history.find((h) => h.id === item.id)?.action ?? ""] ?? "bg-gray-400"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="font-semibold">{item.actor || "System"}</span>
                        <span className="text-muted-foreground">{item.action}</span>
                        {item.isInternal && (
                          <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                            🔒 Internal
                          </span>
                        )}
                        <span className="text-muted-foreground ml-auto" title={item.createdAt}>
                          {relativeTime(item.createdAt)}
                        </span>
                      </div>
                      {item.content && (
                        <p className="text-[11px] mt-0.5 text-muted-foreground whitespace-pre-wrap">
                          {item.content}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Comment box */}
            <div className="border-t border-border p-3">
              <textarea
                className="w-full h-14 rounded border border-border px-2 py-1 text-[12px] resize-none"
                placeholder="Add a comment..."
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
              />
              <div className="flex items-center justify-between mt-1">
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="h-3 w-3"
                  />
                  Internal note
                </label>
                <Button
                  size="sm"
                  className="h-5 px-3 text-[10px]"
                  disabled={!commentBody.trim() || commentMutation.isPending}
                  onClick={() =>
                    commentMutation.mutate({
                      body: commentBody,
                      is_internal: isInternal,
                    })
                  }
                >
                  {commentMutation.isPending ? "Posting..." : "Post"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-2">
          <div className="rounded border border-border bg-white p-3 space-y-2">
            <div className="text-[11px] font-semibold border-b border-border pb-1">
              Metadata
            </div>

            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <select
                  className="h-5 rounded border border-border px-1 text-[10px]"
                  value={ticket.status}
                  onChange={(e) => statusMutation.mutate(e.target.value)}
                >
                  {["open", "in_progress", "in_review", "escalated", "resolved", "closed"].map((s) => (
                    <option key={s} value={s}>{formatLabel(s)}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Priority</span>
                <Badge className={`text-[9px] px-1 py-0 ${PRIORITY_COLORS[ticket.priority] ?? "bg-gray-100 text-gray-700"}`}>
                  {ticket.priority}
                </Badge>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Category</span>
                <Badge className={`text-[9px] px-1 py-0 ${CATEGORY_COLORS[ticket.category] ?? "bg-gray-100 text-gray-700"}`}>
                  {ticket.category}
                </Badge>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Reporter</span>
                <span>{ticket.anonymous ? "Anonymous" : ticket.reporter_name || "—"}</span>
              </div>

              {ticket.reporter_org && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Organisation</span>
                  <span>{ticket.reporter_org}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-muted-foreground">Site</span>
                <span>{ticket.site_name || "—"}</span>
              </div>

              {ticket.tags && ticket.tags.length > 0 && (
                <div>
                  <span className="text-muted-foreground block mb-0.5">Tags</span>
                  <div className="flex flex-wrap gap-1">
                    {ticket.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[9px] px-1.5 py-0 rounded bg-muted text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-mono text-[10px]">
                  {new Date(ticket.created_at).toLocaleDateString()}
                </span>
              </div>

              {ticket.resolved_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Resolved</span>
                  <span className="font-mono text-[10px] text-green-700">
                    {new Date(ticket.resolved_at).toLocaleDateString()}
                  </span>
                </div>
              )}

              {ticket.closed_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Closed</span>
                  <span className="font-mono text-[10px]">
                    {new Date(ticket.closed_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* SLA */}
          <div className="rounded border border-border bg-white p-3">
            <div className="text-[11px] font-semibold mb-2">SLA Tracking</div>
            <SLABar
              slaHours={ticket.sla_hours}
              createdAt={ticket.created_at}
              breached={ticket.sla_breached}
            />
            {ticket.due_date && (
              <div className="mt-1 text-[10px] text-muted-foreground">
                Due: {new Date(ticket.due_date).toLocaleString()}
              </div>
            )}
          </div>

          {/* Resolution */}
          {ticket.resolution_summary && (
            <div className="rounded border border-green-200 bg-green-50 p-3">
              <div className="text-[11px] font-semibold text-green-700 mb-1">Resolution</div>
              <p className="text-[11px] text-green-800">{ticket.resolution_summary}</p>
            </div>
          )}

          {/* Escalation */}
          {ticket.escalation_reason && (
            <div className="rounded border border-red-200 bg-red-50 p-3">
              <div className="text-[11px] font-semibold text-red-700 mb-1">Escalation</div>
              <p className="text-[11px] text-red-800">{ticket.escalation_reason}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-1">
            {ticket.status !== "resolved" && ticket.status !== "closed" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-6 text-[10px] text-red-700 border-red-200 hover:bg-red-50"
                  onClick={() => setShowEscalateModal(true)}
                >
                  Escalate
                </Button>
                <Button
                  size="sm"
                  className="w-full h-6 text-[10px] bg-green-600 hover:bg-green-700"
                  onClick={() => setShowResolveModal(true)}
                >
                  Resolve
                </Button>
              </>
            )}
            {ticket.status === "resolved" && (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-6 text-[10px]"
                onClick={() => closeMutation.mutate()}
                disabled={closeMutation.isPending}
              >
                Close Ticket
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Resolve modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-border bg-white p-4 shadow-lg">
            <h3 className="font-heading text-sm font-bold mb-2">Resolve Ticket</h3>
            <textarea
              className="w-full h-24 rounded border border-border px-2 py-1 text-[12px] resize-none"
              placeholder="Resolution summary (min 50 characters)..."
              value={resolutionSummary}
              onChange={(e) => setResolutionSummary(e.target.value)}
            />
            <div className="text-[9px] text-muted-foreground mt-0.5">
              {resolutionSummary.length}/50 min characters
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setShowResolveModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-6 text-[10px] bg-green-600 hover:bg-green-700"
                disabled={resolutionSummary.length < 50 || resolveMutation.isPending}
                onClick={() => resolveMutation.mutate({ resolution_summary: resolutionSummary })}
              >
                {resolveMutation.isPending ? "Resolving..." : "Resolve"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Escalate modal */}
      {showEscalateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-border bg-white p-4 shadow-lg">
            <h3 className="font-heading text-sm font-bold mb-2">Escalate Ticket</h3>
            <textarea
              className="w-full h-20 rounded border border-border px-2 py-1 text-[12px] resize-none"
              placeholder="Reason for escalation..."
              value={escalationReason}
              onChange={(e) => setEscalationReason(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setShowEscalateModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-6 text-[10px] bg-red-600 hover:bg-red-700"
                disabled={!escalationReason.trim() || escalateMutation.isPending}
                onClick={() => escalateMutation.mutate({ escalation_reason: escalationReason })}
              >
                {escalateMutation.isPending ? "Escalating..." : "Escalate"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
