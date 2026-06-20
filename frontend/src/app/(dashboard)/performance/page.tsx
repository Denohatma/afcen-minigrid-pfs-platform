"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MELSubmission, MELLearningEntry, MELTarget } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}
function fmtD(n: number, d = 1) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}
function fmtUSD(n: number) {
  return "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const STATUS_COLORS: Record<string, string> = {
  verified: "bg-green-100 text-green-800",
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-800",
  superseded: "bg-gray-100 text-gray-600",
};

const TAG_COLORS: Record<string, string> = {
  productive_use: "bg-emerald-100 text-emerald-800",
  reliability: "bg-blue-100 text-blue-800",
  gesi: "bg-purple-100 text-purple-800",
  generator_displacement: "bg-orange-100 text-orange-800",
  tariff: "bg-amber-100 text-amber-800",
  community: "bg-pink-100 text-pink-800",
  technical: "bg-cyan-100 text-cyan-800",
  commercial: "bg-indigo-100 text-indigo-800",
  financing: "bg-teal-100 text-teal-800",
  esia_es: "bg-rose-100 text-rose-800",
  interconnection: "bg-sky-100 text-sky-800",
  replication: "bg-lime-100 text-lime-800",
};

const INDICATOR_LABELS: Record<string, string> = {
  hh_connected: "Households Connected",
  msme_connected: "MSMEs Connected",
  female_hh_pct: "Female HH %",
  co2_avoided: "CO₂ Avoided (tCO₂e)",
  generators_displaced: "Generators Displaced",
  direct_jobs: "Direct Jobs",
  avg_availability: "Avg Availability %",
};

function ProgressBar({ actual, target, label }: { actual: number; target: number; label: string }) {
  const pct = target > 0 ? Math.min((actual / target) * 100, 100) : 0;
  const color = pct >= 80 ? "bg-green-600" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{fmtD(actual, 0)} / {fmtD(target, 0)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-right text-[10px] text-muted-foreground">{fmtD(pct, 1)}%</div>
    </div>
  );
}

function SubmissionDetailPanel({ sub }: { sub: MELSubmission }) {
  return (
    <div className="bg-muted/30 border-t px-4 py-3 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
        <div>
          <span className="text-muted-foreground">Type:</span>{" "}
          <span className="font-medium">{sub.submission_type.replace(/_/g, " ")}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Completeness:</span>{" "}
          <span className="font-mono font-medium">{fmtD(sub.data_completeness_pct ?? 0)}%</span>
        </div>
        <div>
          <span className="text-muted-foreground">Created:</span>{" "}
          <span className="font-medium">{sub.created_at ? new Date(sub.created_at).toLocaleDateString() : "—"}</span>
        </div>
        {sub.verified_at && (
          <div>
            <span className="text-muted-foreground">Verified:</span>{" "}
            <span className="font-medium">{new Date(sub.verified_at).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded border bg-white p-2 space-y-1">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Access</h4>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <div>HH: <span className="font-mono">{fmt(sub.hh_connected ?? 0)}</span></div>
            <div>MSME: <span className="font-mono">{fmt(sub.msme_connected ?? 0)}</span></div>
            <div>Anchors: <span className="font-mono">{fmt(sub.anchor_connected ?? 0)}</span></div>
            <div>New: <span className="font-mono">{fmt(sub.new_connections_this_period ?? 0)}</span></div>
          </div>
        </div>
        <div className="rounded border bg-white p-2 space-y-1">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground">GESI</h4>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <div>Female HH: <span className="font-mono">{fmt(sub.female_hh_connected ?? 0)}</span></div>
            <div>Female %: <span className="font-mono">{fmtD(sub.female_hh_pct ?? 0)}%</span></div>
            <div>Women MSME: <span className="font-mono">{fmt(sub.women_led_msme ?? 0)}</span></div>
            <div>Vulnerable: <span className="font-mono">{fmt(sub.vulnerable_hh ?? 0)}</span></div>
          </div>
        </div>
        <div className="rounded border bg-white p-2 space-y-1">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Reliability</h4>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <div>Supply: <span className="font-mono">{fmtD(sub.supply_hours_per_day ?? 0)}h</span></div>
            <div>Avail: <span className="font-mono">{fmtD(sub.system_availability_pct ?? 0)}%</span></div>
            <div>SAIDI: <span className="font-mono">{fmtD(sub.saidi_minutes ?? 0)} min</span></div>
            <div>SAIFI: <span className="font-mono">{fmt(sub.saifi_events ?? 0)}</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded border bg-white p-2 space-y-1">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Energy & Environment</h4>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <div>Generated: <span className="font-mono">{fmt(sub.kwh_generated ?? 0)} kWh</span></div>
            <div>Sold: <span className="font-mono">{fmt(sub.kwh_sold ?? 0)} kWh</span></div>
            <div>CO₂: <span className="font-mono">{fmtD(sub.co2_avoided_tco2e ?? 0)} tCO₂e</span></div>
            <div>Gen displaced: <span className="font-mono">{fmt(sub.diesel_generators_decommissioned ?? 0)}</span></div>
          </div>
        </div>
        <div className="rounded border bg-white p-2 space-y-1">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Economic</h4>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <div>ARPU: <span className="font-mono">{fmtUSD(sub.arpu_usd ?? 0)}</span></div>
            <div>Revenue: <span className="font-mono">{fmtUSD(sub.total_revenue_usd ?? 0)}</span></div>
            <div>Collection: <span className="font-mono">{fmtD(sub.collection_rate_pct ?? 0)}%</span></div>
            <div>Jobs: <span className="font-mono">{fmt(sub.direct_jobs_created ?? 0)}</span></div>
          </div>
        </div>
        <div className="rounded border bg-white p-2 space-y-1">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Productive Use</h4>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <div>PUE anchors: <span className="font-mono">{fmt(sub.pue_anchors_operational ?? 0)}</span></div>
            <div>PUE kWh: <span className="font-mono">{fmt(sub.productive_use_kwh ?? 0)}</span></div>
          </div>
          {sub.pue_categories && sub.pue_categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {sub.pue_categories.map((c) => (
                <span key={c} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] text-emerald-700 font-medium">{c}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {(sub.key_observation || sub.challenges_faced) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sub.key_observation && (
            <div className="rounded border bg-white p-2">
              <h4 className="text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Key Observation</h4>
              <p className="text-[11px] text-foreground">{sub.key_observation}</p>
            </div>
          )}
          {sub.challenges_faced && (
            <div className="rounded border bg-white p-2">
              <h4 className="text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Challenges</h4>
              <p className="text-[11px] text-foreground">{sub.challenges_faced}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PerformancePage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const queryClient = useQueryClient();

  const { data: dashData, isLoading: dashLoading } = useQuery({
    queryKey: ["mel-dashboard"],
    queryFn: () => api.mel.dashboard(),
  });

  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ["mel-submissions", statusFilter],
    queryFn: () => api.mel.submissions(statusFilter ? { status: statusFilter } : {}),
  });

  const { data: logData } = useQuery({
    queryKey: ["mel-learning-log"],
    queryFn: () => api.mel.learningLog(),
  });

  const { data: targetData } = useQuery({
    queryKey: ["mel-targets"],
    queryFn: () => api.mel.targets(),
  });

  const verifyMut = useMutation({
    mutationFn: (id: string) => api.mel.verify(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mel-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["mel-dashboard"] });
    },
  });

  const dash = dashData;
  const submissions = subData?.submissions ?? [];
  const learningEntries = logData?.entries ?? [];
  const targets = targetData?.targets ?? [];
  const indicators = dash?.indicators ?? {};

  return (
    <div>
      <div>
        <h1 className="font-heading text-lg font-bold">Monitoring, Evaluation & Learning</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          DARES PDO indicator tracking &middot; Smart meter data &middot; Developer declarations &middot; IVA verification
        </p>
      </div>

      {/* KPI Cards */}
      {dash && (
        <div className="mt-3 grid gap-2 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
          <Card className="p-2">
            <p className="text-[10px] text-muted-foreground uppercase">HH Connected</p>
            <p className="text-lg font-bold font-heading text-primary">{fmt(dash.total_hh_connected)}</p>
          </Card>
          <Card className="p-2">
            <p className="text-[10px] text-muted-foreground uppercase">MSMEs</p>
            <p className="text-lg font-bold font-heading text-primary">{fmt(dash.total_msme_connected)}</p>
          </Card>
          <Card className="p-2">
            <p className="text-[10px] text-muted-foreground uppercase">Female HH</p>
            <p className="text-lg font-bold font-heading text-purple-700">{fmt(dash.total_female_hh)}</p>
          </Card>
          <Card className="p-2">
            <p className="text-[10px] text-muted-foreground uppercase">CO₂ Avoided</p>
            <p className="text-lg font-bold font-heading text-emerald-700">{fmtD(dash.total_co2_avoided)} <span className="text-[10px] font-normal">tCO₂e</span></p>
          </Card>
          <Card className="p-2">
            <p className="text-[10px] text-muted-foreground uppercase">Gen Displaced</p>
            <p className="text-lg font-bold font-heading text-orange-700">{fmt(dash.total_generators_displaced)}</p>
          </Card>
          <Card className="p-2">
            <p className="text-[10px] text-muted-foreground uppercase">Direct Jobs</p>
            <p className="text-lg font-bold font-heading text-blue-700">{fmt(dash.total_direct_jobs)}</p>
          </Card>
          <Card className="p-2">
            <p className="text-[10px] text-muted-foreground uppercase">Avg Avail.</p>
            <p className={`text-lg font-bold font-heading ${dash.avg_availability_pct >= 95 ? "text-green-700" : "text-amber-600"}`}>{fmtD(dash.avg_availability_pct)}%</p>
          </Card>
          <Card className="p-2">
            <p className="text-[10px] text-muted-foreground uppercase">Collection</p>
            <p className={`text-lg font-bold font-heading ${dash.avg_collection_rate >= 85 ? "text-green-700" : "text-amber-600"}`}>{fmtD(dash.avg_collection_rate)}%</p>
          </Card>
        </div>
      )}

      {/* Submission status strip */}
      {dash && (
        <div className="mt-2 flex items-center gap-3 text-[11px]">
          <span className="text-muted-foreground">{dash.total_submissions} submissions</span>
          <span className="text-green-700">{dash.verified_submissions} verified</span>
          <span className="text-amber-700">{dash.pending_review} pending review</span>
          <span className="text-muted-foreground">{dash.unique_sites} sites</span>
        </div>
      )}

      <Tabs defaultValue="indicators" className="mt-4">
        <TabsList>
          <TabsTrigger value="indicators">PDO Indicators</TabsTrigger>
          <TabsTrigger value="submissions">Submissions ({submissions.length})</TabsTrigger>
          <TabsTrigger value="learning">Learning Log ({learningEntries.length})</TabsTrigger>
          <TabsTrigger value="targets">Targets ({targets.length})</TabsTrigger>
        </TabsList>

        {/* PDO Indicators */}
        <TabsContent value="indicators" className="mt-3">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">DARES PDO Indicator Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.keys(indicators).length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No verified data yet. Submit and verify MEL data to see indicator progress.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(indicators).map(([key, val]) => (
                    <ProgressBar
                      key={key}
                      label={INDICATOR_LABELS[key] ?? key}
                      actual={val.actual}
                      target={val.target}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Portfolio summary cards */}
          {dash && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="p-3 space-y-1">
                <h3 className="text-[10px] font-bold uppercase text-muted-foreground">Energy</h3>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <div>Total kWh Sold: <span className="font-mono font-medium">{fmt(dash.total_kwh_sold)}</span></div>
                  <div>Revenue: <span className="font-mono font-medium">{fmtUSD(dash.total_revenue_usd)}</span></div>
                  <div>Avg Supply: <span className="font-mono font-medium">{fmtD(dash.avg_supply_hours)}h/day</span></div>
                  <div>Avg ARPU: <span className="font-mono font-medium">{fmtUSD(dash.avg_arpu_usd)}</span></div>
                </div>
              </Card>
              <Card className="p-3 space-y-1">
                <h3 className="text-[10px] font-bold uppercase text-muted-foreground">Employment</h3>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <div>Direct Jobs: <span className="font-mono font-medium">{fmt(dash.total_direct_jobs)}</span></div>
                  <div>Indirect Jobs: <span className="font-mono font-medium">{fmt(dash.total_indirect_jobs)}</span></div>
                </div>
              </Card>
              <Card className="p-3 space-y-1">
                <h3 className="text-[10px] font-bold uppercase text-muted-foreground">Periods Covered</h3>
                <div className="flex flex-wrap gap-1">
                  {(dash.periods_covered ?? []).map((p) => (
                    <span key={p} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{p}</span>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Submissions */}
        <TabsContent value="submissions" className="mt-3">
          <div className="flex items-center gap-2 mb-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded border px-2 py-1 text-[11px]"
            >
              <option value="">All statuses</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under Review</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <Card>
            <CardContent className="p-0">
              {subLoading ? (
                <div className="p-6 text-center text-muted-foreground text-sm">Loading submissions...</div>
              ) : submissions.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No submissions found.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">HH</TableHead>
                      <TableHead className="text-right">MSME</TableHead>
                      <TableHead className="text-right">kWh Sold</TableHead>
                      <TableHead className="text-right">Avail %</TableHead>
                      <TableHead className="text-right">Complete</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submissions.map((sub) => (
                      <>
                        <TableRow key={sub.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}>
                          <TableCell className="text-[11px]">{expandedId === sub.id ? "▾" : "▸"}</TableCell>
                          <TableCell className="font-medium text-[12px]">{sub.site_name}</TableCell>
                          <TableCell className="text-[11px]">{sub.period_label || sub.reporting_period}</TableCell>
                          <TableCell className="text-[11px]">{sub.submission_type.replace(/_/g, " ")}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmt(sub.hh_connected ?? 0)}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmt(sub.msme_connected ?? 0)}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmt(sub.kwh_sold ?? 0)}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">
                            <span className={(sub.system_availability_pct ?? 0) >= 95 ? "text-green-700" : (sub.system_availability_pct ?? 0) >= 90 ? "text-amber-600" : "text-red-600"}>
                              {fmtD(sub.system_availability_pct ?? 0)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{fmtD(sub.data_completeness_pct ?? 0)}%</TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${STATUS_COLORS[sub.status] ?? "bg-gray-100 text-gray-700"}`}>{sub.status.replace(/_/g, " ")}</Badge>
                          </TableCell>
                          <TableCell>
                            {(sub.status === "submitted" || sub.status === "under_review") && (
                              <button
                                onClick={(e) => { e.stopPropagation(); verifyMut.mutate(sub.id); }}
                                className="rounded bg-green-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-green-700"
                              >
                                Verify
                              </button>
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedId === sub.id && (
                          <TableRow key={`${sub.id}-detail`}>
                            <TableCell colSpan={11} className="p-0">
                              <SubmissionDetailPanel sub={sub} />
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Learning Log */}
        <TabsContent value="learning" className="mt-3">
          <div className="space-y-2">
            {learningEntries.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground text-sm">
                  No learning entries yet.
                </CardContent>
              </Card>
            ) : (
              learningEntries.map((entry) => (
                <Card key={entry.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`text-[10px] ${TAG_COLORS[entry.tag] ?? "bg-gray-100 text-gray-700"}`}>
                          {entry.tag.replace(/_/g, " ")}
                        </Badge>
                        {entry.is_portfolio_wide && (
                          <Badge className="text-[10px] bg-indigo-100 text-indigo-800">Portfolio-wide</Badge>
                        )}
                        {entry.site_name && (
                          <span className="text-[10px] text-muted-foreground">{entry.site_name}</span>
                        )}
                      </div>
                      <h3 className="text-[13px] font-semibold">{entry.title}</h3>
                      <p className="text-[11px] text-foreground/80 mt-1 leading-relaxed">{entry.body}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        {entry.author_name && <span>By {entry.author_name}</span>}
                        {entry.reporting_period && <span>{entry.reporting_period}</span>}
                        <span>{entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ""}</span>
                        {entry.upvotes > 0 && <span className="font-medium text-primary">▲ {entry.upvotes}</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Targets */}
        <TabsContent value="targets" className="mt-3">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">PDO & Programme Targets</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {targets.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No targets defined.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Indicator</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead className="text-right">Year</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {targets.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium text-[12px]">{t.indicator_key.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-right font-mono text-[12px]">{fmtD(t.target_value, 0)}</TableCell>
                        <TableCell className="text-right text-[12px]">{t.target_year}</TableCell>
                        <TableCell>
                          <Badge className="text-[10px] bg-blue-50 text-blue-700">{t.source.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground max-w-[300px] truncate">{t.notes ?? "—"}</TableCell>
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
