"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabEnergyDesign } from "@/components/portfolio/tab-energy-design";
import { TabPueAnchors } from "@/components/portfolio/tab-pue-anchors";
import { TabEsgRisk } from "@/components/portfolio/tab-esg-risk";
import { TabFinancials } from "@/components/portfolio/tab-financials";
import { TabSummary } from "@/components/portfolio/tab-summary";
import { TabTender } from "@/components/portfolio/tab-tender";
import { Badge } from "@/components/ui/badge";

export default function PortfolioDetailPage() {
  const params = useParams();
  const portfolioId = params.id as string;
  const [activeTab, setActiveTab] = useState<string | number>("design");

  const { data: portfolio, isLoading } = useQuery({
    queryKey: ["portfolio", portfolioId],
    queryFn: () => api.portfolios.get(portfolioId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded-lg border bg-muted" />
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">Portfolio not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-heading text-2xl font-bold">{portfolio.name}</h1>
        <Badge>{portfolio.status}</Badge>
        <span className="text-sm text-muted-foreground">DisCo: {portfolio.disco_name}</span>
      </div>

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val)}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="design">Energy Design</TabsTrigger>
          <TabsTrigger value="pue">PUE &amp; Anchors</TabsTrigger>
          <TabsTrigger value="esg">ESG &amp; Risk</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="tender">Tender</TabsTrigger>
        </TabsList>
        <TabsContent value="design">
          <TabEnergyDesign portfolioId={portfolioId} />
        </TabsContent>
        <TabsContent value="pue">
          <TabPueAnchors portfolioId={portfolioId} />
        </TabsContent>
        <TabsContent value="esg">
          <TabEsgRisk portfolioId={portfolioId} />
        </TabsContent>
        <TabsContent value="financials">
          <TabFinancials portfolioId={portfolioId} />
        </TabsContent>
        <TabsContent value="summary">
          <TabSummary portfolioId={portfolioId} />
        </TabsContent>
        <TabsContent value="tender">
          <TabTender portfolioId={portfolioId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
