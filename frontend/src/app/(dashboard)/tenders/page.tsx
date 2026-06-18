"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  open: "bg-green-100 text-green-700",
  closed: "bg-amber-100 text-amber-700",
  under_evaluation: "bg-blue-100 text-blue-700",
  awarded: "bg-primary text-white",
};

export default function TendersPage() {
  const { data: portfolioData } = useQuery({
    queryKey: ["portfolios"],
    queryFn: () => api.portfolios.list(),
  });

  const tenderedPortfolios = portfolioData?.portfolios.filter(
    (p) => ["tendered", "awarded"].includes(p.status)
  ) || [];

  const allPortfolios = portfolioData?.portfolios || [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Tender Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage competitive tender processes for minigrid lots
          </p>
        </div>
      </div>

      {tenderedPortfolios.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <svg className="h-12 w-12 text-muted-foreground/50 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="font-semibold text-lg">No active tenders</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Launch a tender from a portfolio to start the bidding process
            </p>
            <Link href="/portfolios">
              <Button className="mt-4">Go to Portfolios</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tenderedPortfolios.map((p) => (
            <Link key={p.id} href={`/tenders/${p.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{p.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">DisCo: {p.disco_name}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge className={STATUS_COLORS[p.status] || "bg-gray-100 text-gray-700"}>
                      {p.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {allPortfolios.filter(p => !["tendered", "awarded"].includes(p.status) && ["designed", "reviewed", "approved"].includes(p.status)).length > 0 && (
        <div className="mt-8">
          <h2 className="font-heading text-lg font-semibold mb-3">Ready for Tender</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {allPortfolios
              .filter(p => ["designed", "reviewed", "approved"].includes(p.status))
              .map((p) => (
                <Link key={p.id} href={`/portfolios/${p.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer border-dashed">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">{p.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">DisCo: {p.disco_name}</p>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{p.status}</Badge>
                        <span className="text-xs text-muted-foreground">
                          Launch tender from portfolio
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
