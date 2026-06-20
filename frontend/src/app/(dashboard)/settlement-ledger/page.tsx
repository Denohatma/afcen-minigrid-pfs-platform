"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
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

function formatNum(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatUSD(n: number) {
  return "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function SettlementLedgerPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["settlement-ledger"],
    queryFn: () => api.settlementLedger.list(),
  });

  const { data: dashboard } = useQuery({
    queryKey: ["settlement-ledger-dashboard"],
    queryFn: () => api.settlementLedger.dashboard(),
  });

  const items = data?.items ?? [];
  const stats = dashboard as Record<string, any> | undefined;

  return (
    <div>
      <div>
        <h1 className="font-heading text-2xl font-bold">
          DisCo Settlement Ledger
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track bulk-meter energy flows, DUoS charges, and payment settlements
          across interconnected minigrid sites
        </p>
      </div>

      {/* Dashboard Stats */}
      {stats && (
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Total Billed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatUSD(stats.total_billed ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Total Paid
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-700">
                {formatUSD(stats.total_paid ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Outstanding
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-700">
                {formatUSD(stats.outstanding ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Disputes Open
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-700">
                {formatNum(stats.disputes_open ?? 0)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Ledger Table */}
      <Card className="mt-6">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading settlement ledger...
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No settlement ledger entries found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead className="text-right">Bulk Meter (kWh)</TableHead>
                  <TableHead className="text-right">Grid Import</TableHead>
                  <TableHead className="text-right">DER Gen</TableHead>
                  <TableHead className="text-right">DUoS ($)</TableHead>
                  <TableHead className="text-right">Grid Energy ($)</TableHead>
                  <TableHead className="text-right">Total ($)</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Dispute</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium text-sm">
                      {entry.month}
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.site_id}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatNum(entry.bulk_meter_kwh)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatNum(entry.grid_import_kwh)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatNum(entry.der_generation_kwh)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatUSD(entry.duos_charge_usd)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatUSD(entry.grid_energy_charge_usd)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      {formatUSD(entry.total_settlement_usd)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-xs ${
                          entry.payment_status === "confirmed"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {entry.payment_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {entry.dispute_status ? (
                        <Badge
                          className={`text-xs ${
                            entry.dispute_status === "resolved"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {entry.dispute_status}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
