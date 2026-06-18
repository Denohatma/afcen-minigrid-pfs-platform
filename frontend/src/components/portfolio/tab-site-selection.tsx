"use client";

import { useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SettlementData } from "@/lib/types";

const SettlementMap = dynamic(
  () => import("./settlement-map").then((m) => m.SettlementMap),
  { ssr: false, loading: () => <div className="flex h-[400px] items-center justify-center rounded-lg border bg-muted/30"><p className="text-sm text-muted-foreground">Loading map...</p></div> }
);
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";

interface TabSiteSelectionProps {
  onPortfolioCreated: (id: string) => void;
}

type SortKey = keyof SettlementData;

export function TabSiteSelection({ onPortfolioCreated }: TabSiteSelectionProps) {
  const [disco, setDisco] = useState("");
  const [portfolioName, setPortfolioName] = useState("");
  const [minPop, setMinPop] = useState(200);
  const [maxGridDist, setMaxGridDist] = useState(25);
  const [securityFilter, setSecurityFilter] = useState<Record<string, boolean>>({
    low: true,
    medium: true,
    high: true,
  });
  const [requireHealth, setRequireHealth] = useState(false);
  const [requireEducation, setRequireEducation] = useState(false);
  const [selectedRanks, setSelectedRanks] = useState<Set<number>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);

  const canFetch = disco.length > 0;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["settlements", disco, minPop, maxGridDist],
    queryFn: () =>
      api.settlements.list({
        disco,
        min_pop: minPop,
        max_grid_dist: maxGridDist,
        limit: 500,
      }),
    enabled: canFetch,
  });

  const settlements = useMemo(() => {
    if (!data?.settlements) return [];
    let filtered = data.settlements.filter((s) => {
      const secOk = securityFilter[s.security_risk.toLowerCase()] !== false;
      const healthOk = !requireHealth || s.has_health;
      const eduOk = !requireEducation || s.has_education;
      return secOk && healthOk && eduOk;
    });
    filtered.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortAsc ? aVal - bVal : bVal - aVal;
      }
      return sortAsc
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    return filtered;
  }, [data, securityFilter, requireHealth, requireEducation, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const toggleSelect = (rank: number) => {
    setSelectedRanks((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) next.delete(rank);
      else next.add(rank);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedRanks(new Set(settlements.map((s) => s.rank)));
  };

  const clearSelection = () => {
    setSelectedRanks(new Set());
  };

  const createPortfolio = useMutation({
    mutationFn: () =>
      api.portfolios.create({
        name: portfolioName || `${disco} Portfolio`,
        disco_name: disco,
        filters: { min_pop: minPop, max_grid_dist: maxGridDist, security: securityFilter },
        settlement_ranks: Array.from(selectedRanks),
      }),
    onSuccess: (res) => {
      toast.success("Portfolio created");
      onPortfolioCreated(res.id);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-primary"
      onClick={() => toggleSort(field)}
    >
      {label} {sortKey === field ? (sortAsc ? "↑" : "↓") : ""}
    </TableHead>
  );

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Filters Panel */}
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <h3 className="font-heading font-semibold">Filters</h3>

        <div className="space-y-2">
          <Label>DisCo (required)</Label>
          <select
            value={disco}
            onChange={(e) => setDisco(e.target.value)}
            className="flex h-8 w-full items-center rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Select DisCo...</option>
            <option value="AEDC">AEDC</option>
            <option value="KEDCO">KEDCO</option>
            <option value="IE">IE (Ikeja Electric)</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label>Portfolio Name</Label>
          <Input
            placeholder="e.g. AEDC Batch 1"
            value={portfolioName}
            onChange={(e) => setPortfolioName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Min Population: {minPop.toLocaleString()}</Label>
          <input
            type="range"
            min={200}
            max={10000}
            step={100}
            value={minPop}
            onChange={(e) => setMinPop(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>200</span>
            <span>10,000</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Max Grid Distance: {maxGridDist} km</Label>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={maxGridDist}
            onChange={(e) => setMaxGridDist(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1 km</span>
            <span>100 km</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Security Risk</Label>
          {(["low", "medium", "high"] as const).map((level) => (
            <label key={level} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={securityFilter[level]}
                onChange={(e) =>
                  setSecurityFilter((prev) => ({ ...prev, [level]: e.target.checked }))
                }
                className="rounded"
              />
              <span className="capitalize">{level}</span>
            </label>
          ))}
        </div>

        <div className="space-y-2">
          <Label>Facilities</Label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={requireHealth}
              onChange={(e) => setRequireHealth(e.target.checked)}
              className="rounded"
            />
            Health facility
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={requireEducation}
              onChange={(e) => setRequireEducation(e.target.checked)}
              className="rounded"
            />
            Education facility
          </label>
        </div>

        <Button
          className="w-full"
          variant="outline"
          onClick={() => refetch()}
          disabled={!canFetch}
        >
          Apply Filters
        </Button>
      </div>

      {/* Results Panel */}
      <div className="space-y-4">
        {/* Settlement Map */}
        {disco ? (
          <SettlementMap
            disco={disco}
            settlements={settlements}
            selectedRanks={selectedRanks}
            onToggleSelect={toggleSelect}
          />
        ) : (
          <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed bg-muted/30">
            <p className="text-sm text-muted-foreground">Select a DisCo to show the map</p>
          </div>
        )}

        {/* Selection Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {selectedRanks.size} of {settlements.length} selected
            </span>
            <Button variant="ghost" size="sm" onClick={selectAll} disabled={settlements.length === 0}>
              Select All
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection} disabled={selectedRanks.size === 0}>
              Clear
            </Button>
          </div>
          <Button
            onClick={() => createPortfolio.mutate()}
            disabled={selectedRanks.size === 0 || createPortfolio.isPending}
          >
            {createPortfolio.isPending ? "Creating..." : `Accept & Design (${selectedRanks.size} sites)`}
          </Button>
        </div>

        {/* Settlements Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : !canFetch ? (
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">Select a DisCo to load settlements</p>
          </div>
        ) : settlements.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">No settlements match current filters</p>
          </div>
        ) : (
          <div className="max-h-[400px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedRanks.size === settlements.length && settlements.length > 0}
                      onChange={(e) => (e.target.checked ? selectAll() : clearSelection())}
                      className="rounded"
                    />
                  </TableHead>
                  <SortHeader label="Rank" field="rank" />
                  <SortHeader label="Village" field="village" />
                  <SortHeader label="State" field="state" />
                  <TableHead>LGA</TableHead>
                  <SortHeader label="Population" field="population" />
                  <SortHeader label="Buildings" field="buildings" />
                  <SortHeader label="Grid Dist" field="grid_dist_km" />
                  <SortHeader label="PV" field="pv_kwh_m2_yr" />
                  <TableHead>Security</TableHead>
                  <SortHeader label="Score" field="score" />
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements.map((s) => (
                  <TableRow
                    key={s.rank}
                    className={selectedRanks.has(s.rank) ? "bg-primary/5" : ""}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedRanks.has(s.rank)}
                        onChange={() => toggleSelect(s.rank)}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{s.rank}</TableCell>
                    <TableCell>{s.village}</TableCell>
                    <TableCell>{s.state}</TableCell>
                    <TableCell>{s.lga}</TableCell>
                    <TableCell>{s.population.toLocaleString()}</TableCell>
                    <TableCell>{s.buildings.toLocaleString()}</TableCell>
                    <TableCell>{s.grid_dist_km.toFixed(1)} km</TableCell>
                    <TableCell>{s.pv_kwh_m2_yr.toFixed(0)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          s.security_risk.toLowerCase() === "low"
                            ? "default"
                            : s.security_risk.toLowerCase() === "medium"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {s.security_risk}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">{s.score.toFixed(1)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{s.recommended_mg_type.replace(/_/g, " ")}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
