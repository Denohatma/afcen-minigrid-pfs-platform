"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useRole } from "@/lib/role-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

const DISCO_OPTIONS = [
  { value: "", label: "All DisCos" },
  { value: "AEDC", label: "AEDC" },
  { value: "KEDCO", label: "KEDCO" },
  { value: "IE", label: "IE" },
];

const DATA_FIELDS = [
  { key: "feeder_name", label: "11kV/33kV Feeder Name", placeholder: "e.g. Suleja 33kV" },
  { key: "feeder_capacity_mva", label: "Feeder Capacity (MVA)", placeholder: "e.g. 15", type: "number" },
  { key: "feeder_loading_pct", label: "Current Loading (%)", placeholder: "e.g. 65", type: "number" },
  { key: "poi_voltage_kv", label: "POI Voltage Level (kV)", placeholder: "e.g. 11", type: "number" },
  { key: "poi_coordinates", label: "POI GPS Coordinates", placeholder: "e.g. 9.0765, 7.4986" },
  { key: "protection_scheme", label: "Protection Scheme", placeholder: "e.g. Overcurrent + Earth fault relay" },
  { key: "bulk_meter_type", label: "Bulk Meter Type", placeholder: "e.g. ABB A1800 Class 0.2S" },
  { key: "bulk_meter_comms", label: "Meter Communication", placeholder: "e.g. GSM/GPRS AMI" },
  { key: "existing_customers", label: "Existing Customers in Area", placeholder: "e.g. 350", type: "number" },
  { key: "avg_consumption_kwh", label: "Avg. Monthly Consumption (kWh)", placeholder: "e.g. 45", type: "number" },
  { key: "tariff_class", label: "Tariff Class", placeholder: "e.g. R2 Residential" },
  { key: "billing_cycle", label: "Billing Cycle", placeholder: "e.g. Monthly prepaid" },
  { key: "settlement_terms", label: "Settlement Terms", placeholder: "e.g. Net metering, monthly reconciliation" },
  { key: "notes", label: "Additional Notes", placeholder: "Any other relevant information..." },
];

export default function DiscoReadinessPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { role } = useRole();
  const isDisco = role.backendRole === "disco_officer";
  const isPmu = role.backendRole === "rea_pmu_officer";
  const [disco, setDisco] = useState(role.disco ?? "");
  const [search, setSearch] = useState("");
  const [lotFilter, setLotFilter] = useState("");
  const [approving, setApproving] = useState(false);
  const [loadDataLotId, setLoadDataLotId] = useState<string | null>(null);

  const { data: lotsData, isLoading: lotsLoading } = useQuery({
    queryKey: ["lots"],
    queryFn: () => api.lots.list(),
  });

  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ["lot-site-assignments"],
    queryFn: () => api.lots.siteAssignments(),
  });

  const params: Record<string, string | number> = { limit: 25000, offset: 0 };
  if (disco) params.disco = disco;

  const { data: settlementsData } = useQuery({
    queryKey: ["settlements-disco-all", disco],
    queryFn: () => api.settlements.list(params),
  });

  const allLots = lotsData?.lots ?? [];
  const assignments = assignmentsData?.assignments ?? [];
  const allSettlements = settlementsData?.settlements ?? [];

  const submittedLots = useMemo(
    () => allLots.filter((l) => {
      if (!l.disco_status || l.disco_status === "pending") return false;
      if (role.disco && l.disco !== role.disco) return false;
      return true;
    }),
    [allLots, role.disco]
  );

  const submittedLotIds = useMemo(
    () => new Set(submittedLots.map((l) => l.id)),
    [submittedLots]
  );

  const lotMap = useMemo(() => {
    const m = new Map<string, typeof allLots[0]>();
    for (const l of submittedLots) m.set(l.id, l);
    return m;
  }, [submittedLots]);

  const rankToLot = useMemo(() => {
    const m = new Map<number, { lotId: string; lotName: string; disco: string }>();
    for (const a of assignments) {
      if (a.settlement_rank != null && submittedLotIds.has(a.lot_id)) {
        m.set(a.settlement_rank, { lotId: a.lot_id, lotName: a.lot_name, disco: a.disco });
      }
    }
    return m;
  }, [assignments, submittedLotIds]);

  const lotNames = useMemo(() => {
    const names = new Set<string>();
    for (const [, v] of rankToLot) names.add(v.lotName);
    return Array.from(names).sort();
  }, [rankToLot]);

  const assignedRanks = useMemo(() => new Set(rankToLot.keys()), [rankToLot]);

  const rows = useMemo(() => {
    let filtered = allSettlements.filter((s: any) => assignedRanks.has(s.rank));

    if (lotFilter) {
      const lotRanks = new Set<number>();
      for (const [rank, info] of rankToLot) {
        if (info.lotName === lotFilter) lotRanks.add(rank);
      }
      filtered = filtered.filter((s: any) => lotRanks.has(s.rank));
    }

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((s: any) =>
        s.village.toLowerCase().includes(q) || s.lga.toLowerCase().includes(q)
      );
    }

    return filtered.map((s: any) => {
      const lot = rankToLot.get(s.rank);
      const lotObj = lot ? lotMap.get(lot.lotId) : null;
      return {
        ...s,
        lotName: lot?.lotName ?? "",
        lotId: lot?.lotId ?? "",
        lotDiscoStatus: lotObj?.disco_status ?? "submitted",
        dataPack: lotObj?.data_pack_availed ?? false,
      };
    });
  }, [allSettlements, assignedRanks, rankToLot, lotFilter, search, lotMap]);

  const byLot = useMemo(() => {
    const groups: Record<string, { lotId: string; lotName: string; disco: string; discoStatus: string; dataPack: boolean; sites: typeof rows }> = {};
    for (const r of rows) {
      if (!groups[r.lotId]) {
        groups[r.lotId] = {
          lotId: r.lotId,
          lotName: r.lotName,
          disco: r.disco,
          discoStatus: r.lotDiscoStatus,
          dataPack: r.dataPack,
          sites: [],
        };
      }
      groups[r.lotId].sites.push(r);
    }
    return Object.values(groups);
  }, [rows]);

  const totals = useMemo(() => ({
    sites: rows.length,
    lots: byLot.length,
    connections: rows.reduce((a, r) => a + r.connections, 0),
    population: rows.reduce((a, r) => a + r.population, 0),
    approved: byLot.filter((g) => g.discoStatus === "approved").length,
    submitted: byLot.filter((g) => g.discoStatus === "submitted").length,
  }), [rows, byLot]);

  const noData = !lotsLoading && !assignmentsLoading && submittedLots.length === 0;

  const handleApproveLot = async (lotId: string) => {
    setApproving(true);
    try {
      await api.lots.update(lotId, { disco_status: "approved" } as any);
      await queryClient.invalidateQueries({ queryKey: ["lots"] });
    } catch {
      alert("Failed to approve lot.");
    } finally {
      setApproving(false);
    }
  };

  const handleRejectLot = async (lotId: string, reason: string) => {
    try {
      await api.lots.update(lotId, { disco_status: "rejected", disco_notes: reason } as any);
      await queryClient.invalidateQueries({ queryKey: ["lots"] });
    } catch {
      alert("Failed to reject lot.");
    }
  };

  const approvedLotIds = useMemo(
    () => byLot.filter((g) => g.discoStatus === "approved").map((g) => g.lotId),
    [byLot]
  );

  return (
    <div className="text-[13px]">
      <div>
        <h1 className="font-heading text-base font-bold">DisCo Interconnection Approval</h1>
        <p className="text-[11px] text-muted-foreground">
          Review sizing-approved lots for DisCo interconnection &middot; {totals.lots} lot(s) &middot; {fmt(totals.sites)} sites &middot; {fmt(totals.connections)} connections
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

      {noData ? (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-sm font-medium text-amber-800">No lots submitted for DisCo review</p>
          <p className="mt-1 text-[11px] text-amber-700">
            {isDisco
              ? "The PMU has not yet submitted any lots for your DisCo. Check back after sizing approval."
              : <>Go to <Link href="/system-sizing" className="underline font-semibold">Sizing</Link> to review and approve lot sizing first. Only sizing-approved lots appear here.</>
            }
          </p>
        </div>
      ) : (
        <>
          {/* Summary boxes */}
          <div className="mt-2 grid grid-cols-3 md:grid-cols-6 gap-2">
            {[
              { label: "Total Lots", value: `${totals.lots}` },
              { label: "Total Sites", value: fmt(totals.sites) },
              { label: "Total Connections", value: fmt(totals.connections) },
              { label: "Total Population", value: fmt(totals.population) },
              { label: "Pending Review", value: `${totals.submitted}` },
              { label: "DisCo Approved", value: `${totals.approved}` },
            ].map((s) => (
              <div key={s.label} className="rounded border border-border bg-white px-2 py-1.5">
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
                <div className="font-heading text-sm font-bold leading-tight">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="mt-2 flex items-center gap-2">
            <select className="h-6 rounded border border-input bg-background px-1.5 text-[11px]" value={disco} onChange={(e) => setDisco(e.target.value)} disabled={!!role.disco}>
              {DISCO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="h-6 rounded border border-input bg-background px-1.5 text-[11px]" value={lotFilter} onChange={(e) => setLotFilter(e.target.value)}>
              <option value="">All Lots</option>
              {lotNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <Input placeholder="Search settlement..." value={search} className="h-6 w-36 text-[11px] px-1.5" onChange={(e) => setSearch(e.target.value)} />
          </div>

          {/* Lot groups */}
          <div className="mt-2 space-y-3">
            {byLot.map((group) => {
              const statusColor = group.discoStatus === "approved"
                ? "border-green-200 bg-green-50/50"
                : group.discoStatus === "rejected"
                  ? "border-red-200 bg-red-50/50"
                  : "border-blue-200 bg-blue-50/50";
              const statusBadge = group.discoStatus === "approved"
                ? "bg-green-100 text-green-800"
                : group.discoStatus === "rejected"
                  ? "bg-red-100 text-red-800"
                  : "bg-blue-100 text-blue-800";
              const statusLabel = group.discoStatus === "submitted" ? "Pending Review" : group.discoStatus.charAt(0).toUpperCase() + group.discoStatus.slice(1);

              return (
                <div key={group.lotId} className={`rounded border ${statusColor}`}>
                  {/* Lot header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="font-heading text-[12px] font-bold">{group.lotName}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{group.disco}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusBadge}`}>{statusLabel}</span>
                      {group.dataPack && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">Data Loaded</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {group.sites.length} sites &middot; {fmt(group.sites.reduce((a, s) => a + s.connections, 0))} connections
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Load Data — DisCo manager only */}
                      {isDisco && group.discoStatus === "submitted" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setLoadDataLotId(group.lotId)}
                        >
                          {group.dataPack ? "Update Data" : "Load Data"}
                        </Button>
                      )}

                      {/* Approve / Reject — DisCo manager only */}
                      {group.discoStatus === "submitted" && isDisco && (
                        <>
                          <Button
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            disabled={approving}
                            onClick={() => handleApproveLot(group.lotId)}
                          >
                            Approve Lot
                          </Button>
                          <RejectButton lotId={group.lotId} onReject={handleRejectLot} />
                        </>
                      )}
                      {group.discoStatus === "submitted" && !isDisco && (
                        <span className="text-[10px] font-medium text-blue-700">Pending DisCo Review</span>
                      )}
                      {group.discoStatus === "approved" && (
                        <span className="text-[10px] font-medium text-green-700">DisCo Approved</span>
                      )}
                      {group.discoStatus === "rejected" && (
                        <span className="text-[10px] font-medium text-red-700">Rejected</span>
                      )}
                    </div>
                  </div>

                  {/* Sites table */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[10px]">
                          <TableHead className="py-1.5 w-8">#</TableHead>
                          <TableHead className="py-1.5">Settlement</TableHead>
                          <TableHead className="py-1.5">LGA</TableHead>
                          <TableHead className="py-1.5">State</TableHead>
                          <TableHead className="py-1.5 text-right">Pop.</TableHead>
                          <TableHead className="py-1.5 text-right">Connections</TableHead>
                          <TableHead className="py-1.5 text-right">kWh/yr</TableHead>
                          <TableHead className="py-1.5 text-right">Grid km</TableHead>
                          <TableHead className="py-1.5 text-right">Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.sites.map((s) => (
                          <TableRow key={s.rank} className="text-[11px]">
                            <TableCell className="py-0.5 font-mono text-[10px] text-muted-foreground">{s.rank}</TableCell>
                            <TableCell className="py-0.5 font-medium">{s.village}</TableCell>
                            <TableCell className="py-0.5 text-[10px]">{s.lga}</TableCell>
                            <TableCell className="py-0.5 text-[10px]">{s.state}</TableCell>
                            <TableCell className="py-0.5 text-right font-mono text-[10px]">{fmt(s.population)}</TableCell>
                            <TableCell className="py-0.5 text-right font-mono text-[10px]">{fmt(s.connections)}</TableCell>
                            <TableCell className="py-0.5 text-right font-mono text-[10px]">{fmt(Math.round(s.demand_kwh * 1000))}</TableCell>
                            <TableCell className="py-0.5 text-right font-mono text-[10px]">{s.grid_dist_km.toFixed(1)}</TableCell>
                            <TableCell className="py-0.5 text-right">
                              <span className={`font-mono text-[10px] font-semibold ${s.score >= 70 ? "text-green-700" : s.score >= 50 ? "text-amber-700" : "text-red-700"}`}>
                                {s.score.toFixed(1)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Proceed to Tender — PMU only */}
          {isPmu && (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {approvedLotIds.length > 0
                  ? `${approvedLotIds.length} lot(s) approved — proceed to tender preparation`
                  : "Waiting for DisCo manager to approve lots"}
              </span>
              <Button
                size="sm"
                className="h-7 px-3 text-[11px]"
                disabled={approvedLotIds.length === 0}
                onClick={() => router.push("/lots")}
              >
                Proceed to Tender Preparation →
              </Button>
            </div>
          )}
        </>
      )}

      {/* Load Data Modal */}
      {loadDataLotId && (
        <LoadDataModal
          lotId={loadDataLotId}
          lotName={byLot.find((g) => g.lotId === loadDataLotId)?.lotName ?? ""}
          disco={byLot.find((g) => g.lotId === loadDataLotId)?.disco ?? ""}
          onClose={() => setLoadDataLotId(null)}
          onSaved={() => {
            setLoadDataLotId(null);
            queryClient.invalidateQueries({ queryKey: ["lots"] });
          }}
        />
      )}
    </div>
  );
}

function LoadDataModal({
  lotId,
  lotName,
  disco,
  onClose,
  onSaved,
}: {
  lotId: string;
  lotName: string;
  disco: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = (key: string, val: string) => setValues((prev) => ({ ...prev, [key]: val }));
  const filledCount = DATA_FIELDS.filter((f) => (values[f.key] ?? "").trim()).length;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.lots.updateDiscoNotes(lotId, {
        disco_notes: JSON.stringify(values),
        data_pack_availed: true,
      });
      onSaved();
    } catch {
      alert("Failed to save data. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative mx-4 max-h-[85vh] w-full max-w-[600px] overflow-y-auto rounded-lg bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-3">
          <div>
            <h2 className="font-heading text-sm font-bold">Load Interconnection Data</h2>
            <p className="text-[11px] text-muted-foreground">
              {lotName} &middot; {disco} &middot; Data for bidder design packs
            </p>
          </div>
          <button onClick={onClose} className="rounded px-2 py-1 text-xs hover:bg-muted">Close</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
            Enter feeder, POI, metering, and tariff data for this lot. This data will be included in the tender data room so bidders can design their interconnected mini grids.
          </div>

          {/* Feeder & Grid section */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Feeder & Grid Data</h3>
            <div className="grid grid-cols-2 gap-2">
              {DATA_FIELDS.slice(0, 3).map((f) => (
                <div key={f.key}>
                  <label className="text-[10px] font-medium text-muted-foreground">{f.label}</label>
                  <Input
                    value={values[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    type={f.type ?? "text"}
                    className="h-7 text-[11px] px-2 mt-0.5"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* POI & Protection */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Point of Interconnection</h3>
            <div className="grid grid-cols-2 gap-2">
              {DATA_FIELDS.slice(3, 6).map((f) => (
                <div key={f.key} className={f.key === "protection_scheme" ? "col-span-2" : ""}>
                  <label className="text-[10px] font-medium text-muted-foreground">{f.label}</label>
                  <Input
                    value={values[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    type={f.type ?? "text"}
                    className="h-7 text-[11px] px-2 mt-0.5"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Metering */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Bulk Metering</h3>
            <div className="grid grid-cols-2 gap-2">
              {DATA_FIELDS.slice(6, 8).map((f) => (
                <div key={f.key}>
                  <label className="text-[10px] font-medium text-muted-foreground">{f.label}</label>
                  <Input
                    value={values[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    type={f.type ?? "text"}
                    className="h-7 text-[11px] px-2 mt-0.5"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Customer & Tariff */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Customer & Tariff Data</h3>
            <div className="grid grid-cols-2 gap-2">
              {DATA_FIELDS.slice(8, 13).map((f) => (
                <div key={f.key}>
                  <label className="text-[10px] font-medium text-muted-foreground">{f.label}</label>
                  <Input
                    value={values[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    type={f.type ?? "text"}
                    className="h-7 text-[11px] px-2 mt-0.5"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">{DATA_FIELDS[13].label}</label>
            <textarea
              value={values[DATA_FIELDS[13].key] ?? ""}
              onChange={(e) => set(DATA_FIELDS[13].key, e.target.value)}
              placeholder={DATA_FIELDS[13].placeholder}
              className="mt-0.5 w-full rounded border border-input bg-background px-2 py-1.5 text-[11px] resize-none h-16"
            />
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between border-t bg-white px-5 py-3">
          <span className="text-[10px] text-muted-foreground">
            {filledCount}/{DATA_FIELDS.length} fields completed
          </span>
          <div className="flex items-center gap-2">
            <button className="text-[11px] text-muted-foreground underline" onClick={onClose}>Cancel</button>
            <Button
              size="sm"
              className="h-7 px-4 text-[11px]"
              disabled={saving || filledCount === 0}
              onClick={handleSave}
            >
              {saving ? "Saving..." : "Save Data Pack"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RejectButton({ lotId, onReject }: { lotId: string; onReject: (id: string, reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-[10px] text-red-700 border-red-200 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        Reject
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Rejection reason..."
        className="h-6 w-40 text-[10px] px-1.5"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && reason.trim()) {
            onReject(lotId, reason);
            setOpen(false);
            setReason("");
          }
        }}
      />
      <Button
        size="sm"
        variant="destructive"
        className="h-6 px-2 text-[10px]"
        disabled={!reason.trim()}
        onClick={() => { onReject(lotId, reason); setOpen(false); setReason(""); }}
      >
        Confirm
      </Button>
      <button className="text-[10px] text-muted-foreground underline" onClick={() => { setOpen(false); setReason(""); }}>
        cancel
      </button>
    </div>
  );
}
