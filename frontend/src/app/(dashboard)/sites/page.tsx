"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

const SettlementMap = dynamic(
  () =>
    import("@/components/settlement-map").then((m) => m.SettlementMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-card text-muted-foreground">
        Loading map...
      </div>
    ),
  }
);

const DISCO_OPTIONS = [
  { value: "", label: "All DisCos" },
  { value: "AEDC", label: "AEDC (Abuja/FCT)" },
  { value: "KEDCO", label: "KEDCO (Kano/Katsina/Jigawa)" },
  { value: "IE", label: "Ikeja Electric (Lagos)" },
];

const MG_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "interconnected", label: "Interconnected" },
  { value: "undergrid", label: "Under-grid" },
  { value: "isolated", label: "Isolated" },
];

const BAND_COLORS: Record<string, string> = {
  interconnected: "bg-amber-500/20 text-amber-400",
  undergrid: "bg-orange-500/20 text-orange-400",
  isolated: "bg-red-500/20 text-red-400",
};

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-500/20 text-emerald-400",
  medium: "bg-amber-500/20 text-amber-400",
  high: "bg-red-500/20 text-red-400",
};

const SCORING_CRITERIA = [
  { name: "Population density", weight: 20, icon: "👥" },
  { name: "Grid distance", weight: 15, icon: "⚡" },
  { name: "Demand projection", weight: 15, icon: "📊" },
  { name: "Solar resource (GHI)", weight: 10, icon: "☀️" },
  { name: "Health facilities", weight: 10, icon: "🏥" },
  { name: "Education facilities", weight: 10, icon: "🏫" },
  { name: "Security risk (inverse)", weight: 10, icon: "🛡️" },
  { name: "Existing connections", weight: 5, icon: "🔌" },
  { name: "Revenue potential", weight: 5, icon: "💰" },
];

function formatNum(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export default function SitesPage() {
  const [disco, setDisco] = useState("");
  const [mgType, setMgType] = useState("");
  const [search, setSearch] = useState("");
  const [minPop, setMinPop] = useState("");
  const [maxGridDist, setMaxGridDist] = useState("");
  const [page, setPage] = useState(0);
  const [selectedRanks, setSelectedRanks] = useState<Set<number>>(new Set());
  const [discoRequest, setDiscoRequest] = useState<string | null>(null);
  const pageSize = 50;

  const params: Record<string, string | number> = {
    limit: pageSize,
    offset: page * pageSize,
  };
  if (disco) params.disco = disco;
  if (mgType) params.mg_type = mgType;
  if (search) params.search = search;
  if (minPop) params.min_pop = parseInt(minPop) || 0;
  if (maxGridDist) params.max_grid_dist = parseFloat(maxGridDist) || 100;

  const { data, isLoading } = useQuery({
    queryKey: ["settlements", disco, mgType, search, minPop, maxGridDist, page],
    queryFn: () => api.settlements.list(params),
  });

  const { data: stats } = useQuery({
    queryKey: ["settlement-stats"],
    queryFn: () => api.settlements.stats(),
  });

  const { data: sitesData } = useQuery({
    queryKey: ["site-registry"],
    queryFn: () => api.siteRegistry.list({ limit: 100 }),
  });

  const settlements = data?.settlements ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const assessedSites: Array<Record<string, any>> = (sitesData?.items ??
    []) as any;

  const toggleSelect = useCallback((rank: number) => {
    setSelectedRanks((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) next.delete(rank);
      else next.add(rank);
      return next;
    });
  }, []);

  const selectAll = () => {
    if (selectedRanks.size === settlements.length) {
      setSelectedRanks(new Set());
    } else {
      setSelectedRanks(new Set(settlements.map((s) => s.rank)));
    }
  };

  const resetFilters = () => {
    setDisco("");
    setMgType("");
    setSearch("");
    setMinPop("");
    setMaxGridDist("");
    setPage(0);
  };

  const selectedSummary = useMemo(() => {
    const selected = settlements.filter((s) => selectedRanks.has(s.rank));
    return {
      count: selectedRanks.size,
      connections: selected.reduce((sum, s) => sum + s.connections, 0),
      demand: Math.round(selected.reduce((sum, s) => sum + s.demand_kwh, 0)),
      population: selected.reduce((sum, s) => sum + s.population, 0),
    };
  }, [settlements, selectedRanks]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            Site Registry & Selection
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse, filter, and select candidate minigrid sites across DisCo
            franchise areas
          </p>
        </div>
        <div className="flex gap-2">
          {selectedRanks.size > 0 && (
            <Badge variant="outline" className="px-3 py-1 text-sm">
              {selectedRanks.size} selected
            </Badge>
          )}
          <Link href="/sites/new">
            <Button>New Manual Site</Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Total Settlements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatNum(stats.total_settlements)}
              </p>
            </CardContent>
          </Card>
          {(["AEDC", "KEDCO", "IE"] as const).map((d) => (
            <Card
              key={d}
              className={`cursor-pointer transition-all ${
                disco === d
                  ? "ring-2 ring-primary border-primary"
                  : "hover:border-primary/30"
              }`}
              onClick={() => {
                setDisco(disco === d ? "" : d);
                setPage(0);
              }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  {d}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatNum(stats.by_disco?.[d]?.total ?? 0)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pop: {formatNum(stats.by_disco?.[d]?.total_population ?? 0)} |
                  Score: {stats.by_disco?.[d]?.avg_score ?? 0}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Map + Scoring Criteria Side-by-Side */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Map */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                DisCo Coverage Map
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Click markers to select sites for lot creation
                </span>
              </CardTitle>
              {selectedRanks.size > 0 && (
                <Badge className="bg-emerald-500/20 text-emerald-400">
                  {selectedRanks.size} selected on map
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[420px]">
              <SettlementMap
                settlements={settlements}
                selectedRanks={selectedRanks}
                onToggleSelect={toggleSelect}
                activeDisco={disco}
              />
            </div>
          </CardContent>
        </Card>

        {/* Scoring Criteria Sidebar */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">PFS Scoring Criteria</CardTitle>
              <p className="text-xs text-muted-foreground">
                Weighted composite score (max 100)
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {SCORING_CRITERIA.map((c) => (
                <div key={c.name} className="flex items-center gap-2">
                  <span className="w-5 text-center text-xs">{c.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs">{c.name}</span>
                      <span className="text-xs font-semibold text-primary">
                        {c.weight}%
                      </span>
                    </div>
                    <div className="mt-0.5 h-1.5 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${c.weight * 5}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* DisCo Data Request */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">DisCo Data Request</CardTitle>
              <p className="text-xs text-muted-foreground">
                Request site approval & data sharing
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {discoRequest ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="text-xs font-medium text-emerald-400">
                    Request sent to {discoRequest}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Awaiting approval for {selectedRanks.size} sites. Data will
                    be shared with bidders upon approval.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={() => setDiscoRequest(null)}
                  >
                    Reset
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Select sites on the map, then request the DisCo to approve
                    and share network data with bidders.
                  </p>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={selectedRanks.size === 0}
                    onClick={() => {
                      const targetDisco =
                        disco ||
                        settlements.find((s) => selectedRanks.has(s.rank))
                          ?.disco ||
                        "DisCo";
                      setDiscoRequest(targetDisco);
                    }}
                  >
                    {selectedRanks.size > 0
                      ? `Request ${disco || "DisCo"} Approval`
                      : "Select sites first"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Selection Tray */}
      {selectedRanks.size > 0 && (
        <Card className="mt-4 border-primary/30 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-6 text-sm">
                <span>
                  <strong>{selectedSummary.count}</strong> sites selected
                </span>
                <span className="text-muted-foreground">
                  Pop:{" "}
                  <strong>{formatNum(selectedSummary.population)}</strong>
                </span>
                <span className="text-muted-foreground">
                  Connections:{" "}
                  <strong>{formatNum(selectedSummary.connections)}</strong>
                </span>
                <span className="text-muted-foreground">
                  Demand:{" "}
                  <strong>{formatNum(selectedSummary.demand)} kWh/day</strong>
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedRanks(new Set())}
                >
                  Clear
                </Button>
                <Link href="/lots">
                  <Button size="sm">Create Lot →</Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="registry" className="mt-6">
        <TabsList>
          <TabsTrigger value="registry">
            Settlement Registry ({formatNum(total)})
          </TabsTrigger>
          <TabsTrigger value="assessed">
            Assessed Sites ({assessedSites.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="registry" className="mt-4">
          {/* Filters */}
          <Card className="mb-4">
            <CardContent className="pt-4">
              <div className="grid gap-3 md:grid-cols-5">
                <div>
                  <Label className="text-xs">DisCo</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={disco}
                    onChange={(e) => {
                      setDisco(e.target.value);
                      setPage(0);
                    }}
                  >
                    {DISCO_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Minigrid Type</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={mgType}
                    onChange={(e) => {
                      setMgType(e.target.value);
                      setPage(0);
                    }}
                  >
                    {MG_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Search</Label>
                  <Input
                    placeholder="Village or LGA name..."
                    value={search}
                    className="h-9"
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">Min Population</Label>
                  <Input
                    placeholder="e.g. 1000"
                    value={minPop}
                    className="h-9"
                    type="number"
                    onChange={(e) => {
                      setMinPop(e.target.value);
                      setPage(0);
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">Max Grid Dist (km)</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. 20"
                      value={maxGridDist}
                      className="h-9"
                      type="number"
                      onChange={(e) => {
                        setMaxGridDist(e.target.value);
                        setPage(0);
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 text-xs"
                      onClick={resetFilters}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  Loading settlements...
                </div>
              ) : settlements.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No settlements match your filters.{" "}
                  <button
                    className="text-primary underline"
                    onClick={resetFilters}
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <input
                            type="checkbox"
                            checked={
                              settlements.length > 0 &&
                              selectedRanks.size === settlements.length
                            }
                            onChange={selectAll}
                            className="rounded"
                          />
                        </TableHead>
                        <TableHead className="w-12">Rank</TableHead>
                        <TableHead>Settlement</TableHead>
                        <TableHead>State / LGA</TableHead>
                        <TableHead>DisCo</TableHead>
                        <TableHead className="text-right">Population</TableHead>
                        <TableHead className="text-right">
                          Connections
                        </TableHead>
                        <TableHead className="text-right">
                          Demand (kWh)
                        </TableHead>
                        <TableHead className="text-right">
                          Grid Dist (km)
                        </TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead>Risk</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {settlements.map((s) => (
                        <TableRow
                          key={s.rank}
                          className={
                            selectedRanks.has(s.rank) ? "bg-primary/5" : ""
                          }
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedRanks.has(s.rank)}
                              onChange={() => toggleSelect(s.rank)}
                              className="rounded"
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            #{s.rank}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{s.village}</div>
                            <div className="mt-0.5 flex gap-2 text-xs text-muted-foreground">
                              {s.has_health && (
                                <span title="Health facility">🏥</span>
                              )}
                              {s.has_education && (
                                <span title="Education facility">🏫</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {s.state}
                            <span className="text-muted-foreground">
                              {" "}
                              / {s.lga}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="font-mono text-xs"
                            >
                              {s.disco}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatNum(s.population)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatNum(s.connections)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatNum(Math.round(s.demand_kwh))}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {s.grid_dist_km.toFixed(1)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`text-xs ${
                                BAND_COLORS[s.recommended_mg_type] ??
                                "bg-gray-500/20 text-gray-300"
                              }`}
                            >
                              {s.recommended_mg_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={`font-mono text-sm font-semibold ${
                                s.score >= 70
                                  ? "text-emerald-400"
                                  : s.score >= 50
                                    ? "text-amber-400"
                                    : "text-red-400"
                              }`}
                            >
                              {s.score.toFixed(1)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`text-xs ${
                                RISK_COLORS[s.security_risk] ??
                                "bg-gray-500/20 text-gray-300"
                              }`}
                            >
                              {s.security_risk}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  <div className="flex items-center justify-between border-t px-4 py-3">
                    <p className="text-sm text-muted-foreground">
                      Showing {page * pageSize + 1}–
                      {Math.min((page + 1) * pageSize, total)} of{" "}
                      {formatNum(total)} settlements
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                      >
                        Previous
                      </Button>
                      <span className="flex items-center px-3 text-sm text-muted-foreground">
                        Page {page + 1} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assessed" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {assessedSites.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No sites have been assessed yet. Select settlements from the
                  registry and create a portfolio to run the 14-step PFS
                  pipeline.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site Name</TableHead>
                      <TableHead>District / State</TableHead>
                      <TableHead>DisCo</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assessedSites.map((site) => (
                      <TableRow key={site.id}>
                        <TableCell>
                          <Link
                            href={`/sites/${site.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {site.site_data?.site_name || site.site_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          {site.site_data?.district || site.district}
                          {site.site_data?.province &&
                            `, ${site.site_data.province}`}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {site.site_data?.disco_name || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {site.site_data?.minigrid_type?.replace("_", " ") ||
                            "isolated"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-xs ${
                              site.status === "completed"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : site.status === "running"
                                  ? "bg-blue-500/20 text-blue-400"
                                  : "bg-gray-500/20 text-gray-400"
                            }`}
                          >
                            {site.status || "draft"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(site.created_at).toLocaleDateString()}
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
