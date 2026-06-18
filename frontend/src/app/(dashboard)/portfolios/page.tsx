"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function PortfoliosPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["portfolios"],
    queryFn: () => api.portfolios.list(),
  });

  const portfolios = data?.portfolios ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-2xl font-bold">Portfolios</h1>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-lg border bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Portfolios</h1>
        <Link href="/portfolios/new"><Button>New Portfolio</Button></Link>
      </div>
      {portfolios.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <h3 className="text-lg font-semibold">No portfolios yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create a portfolio to screen and design minigrid sites.</p>
          <Link href="/portfolios/new" className="mt-4"><Button>Create Portfolio</Button></Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((p) => (
            <Link key={p.id} href={`/portfolios/${p.id}`}>
              <div className="rounded-lg border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="font-heading font-semibold">{p.name}</h3>
                <p className="text-sm text-muted-foreground">DisCo: {p.disco_name}</p>
                <div className="mt-2 flex items-center justify-between">
                  <Badge>{p.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
