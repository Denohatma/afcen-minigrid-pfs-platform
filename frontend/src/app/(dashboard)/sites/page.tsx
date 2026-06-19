"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
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
  interconnected: "bg-amber-100 text-amber-800",
  undergrid: "bg-orange-100 text-orange-800",
  isolated: "bg-red-100 text-red-800",
};

const RISK_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

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
    queryKey: ["sites"],
    queryFn: () => api.sites.list(),
  });

  const settlements = data?.settlements ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const assessedSites = sitesData?.sites ?? [];

  const toggleSelect = (rank: number) => {
    setSelectedRanks((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) next.delete(rank);
      else next.add(rank);
      return next;
    });
  };

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

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            Site Registry & Selection
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse, filter, and select candidate minigrid sites across DisCo
            franchise areas
          </p>
        </div>
        <div className="flex gap-2">
          {selectedRanks.size > 0 && (
            <Badge variant="outline" className="text-sm py-1 px-3">
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
                <p className="text-xs text-muted-foreground mt-1">
                  Pop: {formatNum(stats.by_disco?.[d]?.total_population ?? 0)} | Score:{" "}
                  {stats.by_disco?.[d]?.avg_score ?? 0}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
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

          {/* Selection Tray */}
          {selectedRanks.size > 0 && (
            <Card className="mb-4 border-primary/30 bg-primary/5">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex gap-6 text-sm">
                    <span>
                      <strong>{selectedRanks.size}</strong> sites selected
                    </span>
                    <span className="text-muted-foreground">
                      Est. connections:{" "}
                      <strong>
                        {formatNum(
                          settlements
                            .filter((s) => selectedRanks.has(s.rank))
                            .reduce((sum, s) => sum + s.connections, 0)
                        )}
                      </strong>
                    </span>
                    <span className="text-muted-foreground">
                      Est. demand:{" "}
                      <strong>
                        {formatNum(
                          Math.round(
                            settlements
                              .filter((s) => selectedRanks.has(s.rank))
                              .reduce((sum, s) => sum + s.demand_kwh, 0)
                          )
                        )}{" "}
                        kWh/day
                      </strong>
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
                    <Link href="/portfolios/new">
                      <Button size="sm">Create Portfolio</Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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
                            <div className="text-xs text-muted-foreground flex gap-2 mt-0.5">
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
                              className="text-xs font-mono"
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
                                "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {s.recommended_mg_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={`font-mono text-sm font-semibold ${
                                s.score >= 70
                                  ? "text-green-600"
                                  : s.score >= 50
                                  ? "text-amber-600"
                                  : "text-red-600"
                              }`}
                            >
                              {s.score.toFixed(1)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`text-xs ${
                                RISK_COLORS[s.security_risk] ??
                                "bg-gray-100 text-gray-700"
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
                                ? "bg-green-100 text-green-700"
                                : site.status === "running"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gray-100 text-gray-600"
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
