"use client";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabSiteSelection } from "@/components/portfolio/tab-site-selection";
import { TabEnergyDesign } from "@/components/portfolio/tab-energy-design";
import { TabPueAnchors } from "@/components/portfolio/tab-pue-anchors";
import { TabEsgRisk } from "@/components/portfolio/tab-esg-risk";
import { TabFinancials } from "@/components/portfolio/tab-financials";
import { TabSummary } from "@/components/portfolio/tab-summary";
import { TabTender } from "@/components/portfolio/tab-tender";

export default function NewPortfolioPage() {
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | number>("selection");

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl font-bold">New Portfolio</h1>
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val)}>
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="selection">1. Site Selection</TabsTrigger>
          <TabsTrigger value="design" disabled={!portfolioId}>2. Energy Design</TabsTrigger>
          <TabsTrigger value="pue" disabled={!portfolioId}>3. PUE &amp; Anchors</TabsTrigger>
          <TabsTrigger value="esg" disabled={!portfolioId}>4. ESG &amp; Risk</TabsTrigger>
          <TabsTrigger value="financials" disabled={!portfolioId}>5. Financials</TabsTrigger>
          <TabsTrigger value="summary" disabled={!portfolioId}>6. Summary</TabsTrigger>
          <TabsTrigger value="tender" disabled={!portfolioId}>7. Tender</TabsTrigger>
        </TabsList>
        <TabsContent value="selection">
          <TabSiteSelection onPortfolioCreated={(id) => { setPortfolioId(id); setActiveTab("design"); }} />
        </TabsContent>
        <TabsContent value="design">
          {portfolioId && <TabEnergyDesign portfolioId={portfolioId} />}
        </TabsContent>
        <TabsContent value="pue">
          {portfolioId && <TabPueAnchors portfolioId={portfolioId} />}
        </TabsContent>
        <TabsContent value="esg">
          {portfolioId && <TabEsgRisk portfolioId={portfolioId} />}
        </TabsContent>
        <TabsContent value="financials">
          {portfolioId && <TabFinancials portfolioId={portfolioId} />}
        </TabsContent>
        <TabsContent value="summary">
          {portfolioId && <TabSummary portfolioId={portfolioId} />}
        </TabsContent>
        <TabsContent value="tender">
          {portfolioId && <TabTender portfolioId={portfolioId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
