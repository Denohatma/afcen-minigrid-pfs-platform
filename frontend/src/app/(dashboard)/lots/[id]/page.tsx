"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const TENDER_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  issued: "bg-green-100 text-green-800",
  closed: "bg-amber-100 text-amber-800",
  awarded: "bg-primary text-white",
};

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

const STEP_LABELS = [
  "Tender Details",
  "Data Room",
  "Technical Requirements",
  "DisCo Interface",
  "Commercial Framework",
  "Grant & Eligible CAPEX",
  "Payment Milestones",
];

const DATA_ROOM_FOLDERS = [
  { id: "01", name: "Procurement Documents", contents: "IFB/RFP, Instructions to Bidders, Bid Data Sheet, addenda, Q&A log, all submission forms", purpose: "Defines procurement rules and required bid structure" },
  { id: "02", name: "Lot Summary", contents: "Lot overview, site list, GPS coordinates, connection targets, baseline supply hours, proposed system capacities", purpose: "Defines scope and lot boundaries; key inputs for bid pricing" },
  { id: "03", name: "GIS and Site Maps", contents: "GIS files (KMZ/Shapefiles), site maps, feeder route maps, POI locations, transformer locations, satellite imagery", purpose: "Supports engineering design, access routes, network routing" },
  { id: "04", name: "Technical Baseline", contents: "Feeder condition data, transformer capacity, existing meter status, network single-line diagram, grid availability log, proposed PV/BESS parameters", purpose: "Supports detailed engineering design and CAPEX pricing" },
  { id: "05", name: "Commercial Baseline", contents: "Customer count by category, estimated consumption, tariff bill analysis, supply hours log, MSME/PUE segmentation", purpose: "Supports revenue, tariff, demand, and collection assumptions" },
  { id: "06", name: "E&S Baseline", contents: "Screening report, stakeholder mapping, consultation records, land/resettlement risk flags, GRM framework", purpose: "Starting point for bidder E&S workplan" },
  { id: "07", name: "Permitting & Conditions Precedent", contents: "NERC/NEMSA pathway, DisCo POI confirmation, community consent, land status, CP checklist", purpose: "Clarifies post-award permitting and disbursement readiness" },
  { id: "08", name: "Contract & Grant Annexes", contents: "Draft project agreement, grant agreement, tripartite agreement, DisCo cooperation protocol, IVA ToR", purpose: "Defines risk allocation, contractual commitments, grant conditions" },
];

const ELIGIBLE_CAPEX_CATEGORIES = [
  { category: "Solar PV modules, mounting structures, DC cabling and BOS", eligible: true, evidence: "Supplier invoice, delivery note, serial number list, installation certificate" },
  { category: "BESS — cells, modules, and BMS", eligible: true, evidence: "Supplier invoice, OEM certificate, commissioning test report" },
  { category: "PCS / Inverters and energy management system", eligible: true, evidence: "Supplier invoice, OEM certificate, commissioning test" },
  { category: "Backup generator (if permitted)", eligible: "conditional", evidence: "Invoice, emissions specification, commissioning test" },
  { category: "Distribution network rehabilitation", eligible: true, evidence: "BoQ, work completion certificate, as-built drawings, inspection report" },
  { category: "Distribution network extension — new connections", eligible: true, evidence: "BoQ, completion certificate, as-built drawings" },
  { category: "Interconnection equipment and protection at POI", eligible: true, evidence: "POI inspection record, protection relay settings, NEMSA confirmation" },
  { category: "Customer prepaid/smart meters", eligible: true, evidence: "Meter serial list, calibration certificate, customer register" },
  { category: "Bulk meter(s) for grid energy measurement", eligible: true, evidence: "DisCo/NEMSA confirmation, calibration certificate" },
  { category: "SCADA and remote monitoring system", eligible: true, evidence: "System acceptance test, data connectivity confirmation" },
  { category: "Civil works (foundations, enclosures)", eligible: true, evidence: "Engineer completion certificate, inspection report" },
  { category: "Spare parts (first-year critical only)", eligible: "conditional", evidence: "Approved spare parts list, invoices, delivery confirmation" },
];

const PAYMENT_MILESTONES = [
  {
    id: "M1",
    name: "Commissioning",
    description: "DER system energised and NEMSA certified",
    tranche_pct: 40,
    evidence: [
      "NEMSA commissioning certificate",
      "As-built drawings signed by engineer",
      "Equipment serial numbers and installation certificates",
      "Geotagged commissioning photos (PV array, BESS, POI, meters)",
      "Grid synchronisation test report",
      "Protection relay commissioning certificates",
      "Bulk meter calibration certificate",
    ],
  },
  {
    id: "M2",
    name: "Verified Connections",
    description: "Agreed customer count metered, onboarded, and receiving supply",
    tranche_pct: 40,
    evidence: [
      "Customer register with meter IDs and GPS coordinates",
      "Customer database with name, address, category, meter number",
      "First 3 months billing and collection records",
      "Community engagement completion report",
      "Tripartite agreement acknowledgement from community",
      "IVA site visit verification report",
      "Sample meter activation screenshots",
    ],
  },
  {
    id: "M3",
    name: "One-Year Utilisation / Performance",
    description: "12 months continuous operation with verified performance",
    tranche_pct: 20,
    evidence: [
      "12-month metering report (grid import, DER generation, energy sold)",
      "Capacity utilisation calculation showing system performance",
      "Customer satisfaction survey or GRM summary",
      "O&M log showing maintenance activities completed",
      "Monthly DisCo settlement records for 12 months",
      "System availability report (target: ≥95%)",
      "Revenue collection rate evidence (target: ≥85%)",
    ],
  },
];

const TECHNICAL_REQUIREMENTS = [
  { item: "PV Capacity (kWp)", detail: "Proposed capacity, module technology, tilt/azimuth, shading assumptions, degradation rate, annual yield calculation" },
  { item: "BESS Capacity (kWh/kW)", detail: "Battery chemistry, usable DoD, degradation curve, cycle life, warranty, safety standard, thermal management" },
  { item: "PCS / Inverter", detail: "Rated kVA, grid-forming or grid-following mode, protection relays, synchronisation, transfer switch specification" },
  { item: "Backup Generator", detail: "Fuel type, rated kVA, annual operating hours, fuel supply plan, emissions specification" },
  { item: "Distribution Works", detail: "Line routes, conductor sizing, pole spec, transformer requirements, service drops, meter connection schedule, voltage-drop analysis" },
  { item: "Monitoring & Data", detail: "Data logger spec, bulk meter protocol, customer meter data access, SCADA/API integration, monthly reporting format" },
  { item: "O&M Plan", detail: "Staffing, routine maintenance schedule, spares strategy, outage response time, KPIs, SLA commitments" },
  { item: "Standards Compliance", detail: "NERC grid code, NEMSA standards, IEC/IEEE equipment standards, DisCo technical requirements" },
];

const DISCO_INTERFACE = [
  { item: "Point of Interconnection", detail: "Single-line diagram showing POI location, ownership boundary, interface equipment, protection/metering" },
  { item: "Operating Modes", detail: "Normal grid-connected, grid outage (islanded), grid restoration, emergency shutdown" },
  { item: "Protection Coordination", detail: "Protection philosophy, relay types, anti-islanding or intentional islanding controls, fault detection" },
  { item: "Bulk Metering", detail: "Meter type, location, communication protocol, calibration frequency, data reconciliation" },
  { item: "DisCo Coordination", detail: "Interface team, planned/unplanned outage protocol, emergency switching, customer complaint routing" },
  { item: "Customer Data Migration", detail: "Customer database handover from DisCo, existing meter status, new customer onboarding, legacy arrears" },
  { item: "DUOS & Settlement", detail: "Assumed DUOS rate, grid energy purchase tariff, invoice cycle, payment deadline, dispute resolution" },
];

const COMMERCIAL_ITEMS = [
  { item: "Customer Tariff by Class", detail: "Residential, commercial, PUE/MSME, anchor customer tariffs (USD/kWh); affordability justification; NERC pathway" },
  { item: "Grid Energy Purchase", detail: "Grid import tariff or settlement formula payable to DisCo; sensitivity to grid supply hours" },
  { item: "DUOS / Network-Use Charge", detail: "Calculation basis (per kWh or per month), sensitivity to DisCo negotiation" },
  { item: "Billing & Collections", detail: "Metering provider, payment channel (mobile money, USSD, agent), collection rate assumption, arrears management" },
  { item: "Settlement Dispute Procedure", detail: "Disputed bulk meter readings, disputed invoices, escalation per tripartite agreement" },
  { item: "Revenue Sensitivity", detail: "Scenarios: demand ±20%, collection 75/90/95%, grid hours ±30%, tariff delay 6 months, FX +25%" },
];

export default function LotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [actionMsg, setActionMsg] = useState("");
  const [showTenderWizard, setShowTenderWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [tenderTitle, setTenderTitle] = useState("");
  const [tenderDesc, setTenderDesc] = useState("");
  const [tenderRef, setTenderRef] = useState("");
  const [procMethod, setProcMethod] = useState("open_competitive");
  const [bidValidityDays, setBidValidityDays] = useState("120");
  const [currency, setCurrency] = useState("USD");
  const [submitting, setSubmitting] = useState(false);
  const [dataRoomStatus, setDataRoomStatus] = useState<Record<string, string>>({});

  const { data: lot, isLoading } = useQuery({
    queryKey: ["lot", id],
    queryFn: () => api.lots.get(id),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["lot", id] });

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await api.lots.approve(id);
      setActionMsg("Lot approved for tendering");
      refresh();
    } catch (e: any) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTender = async () => {
    if (!tenderTitle.trim()) return;
    setSubmitting(true);
    try {
      await api.tenders.create(id, {
        title: tenderTitle,
        description: tenderDesc,
        procurement_method: procMethod,
        currency,
        grant_ceiling_pct: lot?.grant_ceiling_pct ?? 0.4,
        bid_validity_days: parseInt(bidValidityDays) || 120,
      });
      setActionMsg("Tender created with full bidder pack and data room");
      setShowTenderWizard(false);
      setWizardStep(0);
      refresh();
    } catch (e: any) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssueTender = async (tenderId: string) => {
    setSubmitting(true);
    try {
      await api.tenders.issue(tenderId);
      setActionMsg("Tender issued — now open for bids");
      refresh();
    } catch (e: any) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const openWizard = () => {
    const lotData = lot as Record<string, any>;
    setTenderTitle(`Supply, Install & Operate Interconnected Mini-Grid — ${lotData.lot_name}`);
    setTenderRef(`DARES-IMG-${lotData.disco}-${String(Date.now()).slice(-6)}`);
    setTenderDesc(`DARES Performance-Based Grant tender for the development, financing, design, supply, installation, commissioning, operation and maintenance of utility-enabled interconnected mini-grid lot ${lotData.lot_name} in ${lotData.disco} franchise area under the DARES programme.`);
    setShowTenderWizard(true);
    setWizardStep(0);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-xs">
        Loading lot...
      </div>
    );
  }

  if (!lot) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-base font-bold">Lot not found</h2>
        <Button className="mt-4 h-7 text-xs" onClick={() => router.push("/lots")}>
          Back to Lots
        </Button>
      </div>
    );
  }

  const lotData = lot as Record<string, any>;
  const tender = lotData.tender as Record<string, any> | null;
  const sites = (lotData.sites ?? []) as Array<Record<string, any>>;
  const grantCeiling = lotData.grant_ceiling_pct ?? 0.4;

  if (showTenderWizard) {
    return (
      <div className="text-[13px]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-base font-bold">Create Tender — {lotData.lot_name}</h1>
            <p className="text-[11px] text-muted-foreground">
              {lotData.disco} &middot; {sites.length} sites &middot; {fmt(lotData.total_connections || 0)} connections &middot; Grant ceiling: {(grantCeiling * 100).toFixed(0)}%
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-6 px-3 text-[11px]" onClick={() => setShowTenderWizard(false)}>
            Cancel
          </Button>
        </div>

        {/* Step indicator */}
        <div className="mt-3 flex items-center gap-0.5 overflow-x-auto">
          {STEP_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => setWizardStep(i)}
              className={`flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                wizardStep === i
                  ? "bg-primary text-white"
                  : i < wizardStep
                  ? "bg-green-100 text-green-800"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[9px] font-bold">
                {i < wizardStep ? "✓" : i + 1}
              </span>
              {label}
            </button>
          ))}
        </div>

        {/* Step content */}
        <div className="mt-3 rounded border border-border bg-white">
          {/* STEP 1: Tender Details */}
          {wizardStep === 0 && (
            <div className="p-4">
              <h2 className="font-heading text-sm font-bold">Step 1 — Tender Details & Bid Data Sheet</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Based on DARES IMG Bidder Tender Document Template v3 — Part A
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px]">Tender Title</Label>
                  <Input className="h-7 text-[11px]" value={tenderTitle} onChange={(e) => setTenderTitle(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[11px]">Tender Reference</Label>
                  <Input className="h-7 text-[11px]" value={tenderRef} onChange={(e) => setTenderRef(e.target.value)} />
                </div>
              </div>

              <div className="mt-2">
                <Label className="text-[11px]">Description / Scope</Label>
                <textarea
                  className="mt-0.5 w-full rounded border border-input bg-background px-2 py-1.5 text-[11px] h-16 resize-none"
                  value={tenderDesc}
                  onChange={(e) => setTenderDesc(e.target.value)}
                />
              </div>

              <div className="mt-2 grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-[11px]">Procurement Method</Label>
                  <select className="flex h-7 w-full rounded border border-input bg-background px-2 text-[11px]" value={procMethod} onChange={(e) => setProcMethod(e.target.value)}>
                    <option value="open_competitive">Open Competitive Bidding</option>
                    <option value="minimum_subsidy">Minimum Subsidy Tender (MST)</option>
                    <option value="rfp">Request for Proposals (RFP)</option>
                  </select>
                </div>
                <div>
                  <Label className="text-[11px]">Bid Validity (days)</Label>
                  <Input className="h-7 text-[11px]" type="number" value={bidValidityDays} onChange={(e) => setBidValidityDays(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[11px]">Currency</Label>
                  <select className="flex h-7 w-full rounded border border-input bg-background px-2 text-[11px]" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    <option value="USD">USD</option>
                    <option value="NGN">NGN</option>
                    <option value="dual">Dual Currency</option>
                  </select>
                </div>
              </div>

              {/* Bid Data Sheet preview */}
              <div className="mt-3 rounded border border-border bg-muted/30 p-3">
                <h3 className="text-[11px] font-semibold">Document Control (auto-populated)</h3>
                <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Procuring entity</span><span>Rural Electrification Agency (REA) / DARES PMU</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Programme</span><span>DARES — $750M IDA (P179687)</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Lot</span><span>{lotData.lot_name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">DisCo</span><span>{lotData.disco}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Grant ceiling</span><span>{(grantCeiling * 100).toFixed(0)}% of eligible CAPEX</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Contract structure</span><span>Design-finance-build-operate-maintain</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Grant instrument</span><span>Performance-Based Grant (% of eligible CAPEX)</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Governing rules</span><span>World Bank Procurement Regulations for IPF Borrowers</span></div>
                </div>
              </div>

              {/* IMG Commercial Model actors */}
              <div className="mt-3 rounded border border-border bg-muted/30 p-3">
                <h3 className="text-[11px] font-semibold">IMG Commercial Model — Actor Roles (Part B)</h3>
                <div className="mt-1.5 space-y-1 text-[10px]">
                  <div className="flex gap-2"><span className="font-semibold w-24 shrink-0">Developer</span><span>Finance, design, build, commission, operate DER assets, distribution upgrades, meters, billing, customer service. Settle with DisCo.</span></div>
                  <div className="flex gap-2"><span className="font-semibold w-24 shrink-0">DisCo</span><span>Provide feeder/customer data, grid supply, interconnection approvals, bulk metering, settlement terms, operational coordination.</span></div>
                  <div className="flex gap-2"><span className="font-semibold w-24 shrink-0">REA/DARES</span><span>Run procurement, execute grant agreement, verify milestones, manage public funding, monitor performance.</span></div>
                  <div className="flex gap-2"><span className="font-semibold w-24 shrink-0">Community</span><span>Accept service terms, tariffs, metering, complaint channels through tripartite arrangements.</span></div>
                  <div className="flex gap-2"><span className="font-semibold w-24 shrink-0">NERC/NEMSA</span><span>Regulatory approvals, tariff/permit pathways, technical inspection and certification.</span></div>
                  <div className="flex gap-2"><span className="font-semibold w-24 shrink-0">IVA</span><span>Verify commissioning, connections, eligible CAPEX, utilisation before grant disbursement.</span></div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Data Room */}
          {wizardStep === 1 && (
            <div className="p-4">
              <h2 className="font-heading text-sm font-bold">Step 2 — 8-Folder Data Room Structure</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Part C of tender document — bidder-facing evidence base for site selection, design, pricing, and planning
              </p>

              <div className="mt-3 space-y-1.5">
                {DATA_ROOM_FOLDERS.map((folder) => (
                  <div key={folder.id} className="rounded border border-border p-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-[9px] font-bold text-primary">{folder.id}</span>
                        <span className="text-[11px] font-semibold">{folder.name}</span>
                      </div>
                      <select
                        className="h-5 rounded border border-input bg-background px-1.5 text-[9px]"
                        value={dataRoomStatus[folder.id] || "provided"}
                        onChange={(e) => setDataRoomStatus((prev) => ({ ...prev, [folder.id]: e.target.value }))}
                      >
                        <option value="provided">Provided</option>
                        <option value="partial">Partial</option>
                        <option value="not_available">Not Available</option>
                      </select>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{folder.contents}</p>
                    <p className="text-[9px] text-primary/70 mt-0.5">Purpose: {folder.purpose}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2.5">
                <h3 className="text-[11px] font-semibold text-amber-800">Bidder Assumptions Register</h3>
                <p className="text-[10px] text-amber-700 mt-0.5">
                  Where data is marked Partial or Not Available, bidders must complete assumptions. Undisclosed assumptions cannot be used post-award for price increases or schedule extensions.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Technical Requirements */}
          {wizardStep === 2 && (
            <div className="p-4">
              <h2 className="font-heading text-sm font-bold">Step 3 — Technical Requirements (Form 5)</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Part D — bidders submit a structured technical proposal covering all subsystems
              </p>

              <Table>
                <TableHeader>
                  <TableRow className="text-[10px]">
                    <TableHead className="py-1.5 w-40">Technical Item</TableHead>
                    <TableHead className="py-1.5">Bidder Submission Required</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TECHNICAL_REQUIREMENTS.map((req) => (
                    <TableRow key={req.item} className="text-[11px]">
                      <TableCell className="py-1.5 font-medium">{req.item}</TableCell>
                      <TableCell className="py-1.5 text-[10px] text-muted-foreground">{req.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-3 rounded border border-border bg-muted/30 p-3">
                <h3 className="text-[11px] font-semibold">Required Milestone Dates (Programme of Works)</h3>
                <div className="mt-1.5 space-y-1 text-[10px]">
                  {[
                    "Financial close — Equity, debt, grant agreement readiness",
                    "Design finalisation — Final system design, interconnection study, NEMSA submission",
                    "Procurement — Major equipment POs, shipping, local procurement",
                    "Construction start — Civil works, site establishment",
                    "NEMSA 50–75% inspection — Mid-construction milestone",
                    "Commissioning — Testing, NEMSA certificate, POI energisation",
                    "First connections — First metered customers receiving supply",
                    "Full connection target — All committed customers connected",
                    "One-year utilisation — 12-month operational data submitted",
                  ].map((m, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-bold text-primary shrink-0">{i + 1}</span>
                      <span>{m}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: DisCo Interface */}
          {wizardStep === 3 && (
            <div className="p-4">
              <h2 className="font-heading text-sm font-bold">Step 4 — DisCo Interconnection & Interface</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Part E — bidders must model both customer revenues and DisCo settlement obligations
              </p>

              <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-2.5 text-[10px] text-blue-800">
                A low customer tariff without a credible DisCo settlement and collections plan is not a bankable bid.
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="text-[10px]">
                    <TableHead className="py-1.5 w-44">Interface Item</TableHead>
                    <TableHead className="py-1.5">Bidder Shall Provide</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DISCO_INTERFACE.map((item) => (
                    <TableRow key={item.item} className="text-[11px]">
                      <TableCell className="py-1.5 font-medium">{item.item}</TableCell>
                      <TableCell className="py-1.5 text-[10px] text-muted-foreground">{item.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-3 rounded border border-border bg-muted/30 p-3">
                <h3 className="text-[11px] font-semibold">Conditions Precedent (Part H)</h3>
                <div className="mt-1.5 space-y-1 text-[10px]">
                  {[
                    "Grant agreement executed — Signed between developer and REA",
                    "Tripartite agreement — Developer, DisCo, and community all signed",
                    "NERC permit/tariff pathway confirmed",
                    "NEMSA design/inspection pathway confirmed",
                    "Equity contribution evidenced",
                    "Debt/lender commitment signed",
                    "Project account opened",
                    "Land/site access secured",
                    "E&S instruments approved (ESMP/ESIA/RAP/SEP)",
                    "DisCo POI and data confirmed",
                  ].map((cp, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded border border-primary/30 shrink-0" />
                      <span>{cp}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Commercial Framework */}
          {wizardStep === 4 && (
            <div className="p-4">
              <h2 className="font-heading text-sm font-bold">Step 5 — Commercial, Tariff & Settlement Framework</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Part F — Form 6 financial proposal structure (11-tab Excel workbook)
              </p>

              <Table>
                <TableHeader>
                  <TableRow className="text-[10px]">
                    <TableHead className="py-1.5 w-44">Commercial Item</TableHead>
                    <TableHead className="py-1.5">Bidder Submission Required</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {COMMERCIAL_ITEMS.map((item) => (
                    <TableRow key={item.item} className="text-[11px]">
                      <TableCell className="py-1.5 font-medium">{item.item}</TableCell>
                      <TableCell className="py-1.5 text-[10px] text-muted-foreground">{item.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-3 rounded border border-border bg-muted/30 p-3">
                <h3 className="text-[11px] font-semibold">Form 6 — Financial Proposal Workbook (11 Tabs)</h3>
                <div className="mt-1.5 grid grid-cols-2 gap-1 text-[10px]">
                  {[
                    "Tab 1 — Bid Summary",
                    "Tab 2 — Eligible CAPEX",
                    "Tab 3 — Ineligible CAPEX",
                    "Tab 4 — Grant Request",
                    "Tab 5 — Capital Stack",
                    "Tab 6 — Tariffs & Settlement",
                    "Tab 7 — Revenue Forecast (10-yr)",
                    "Tab 8 — OPEX",
                    "Tab 9 — Cash Flow & DSCR",
                    "Tab 10 — Sensitivities (7 scenarios)",
                    "Tab 11 — Milestone Schedule",
                  ].map((tab, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded bg-white px-2 py-1 border border-border">
                      <span className="w-4 h-4 rounded bg-green-100 flex items-center justify-center text-[8px] font-bold text-green-700 shrink-0">{i + 1}</span>
                      <span>{tab}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Grant & Eligible CAPEX */}
          {wizardStep === 5 && (
            <div className="p-4">
              <h2 className="font-heading text-sm font-bold">Step 6 — Grant & Eligible CAPEX Rules</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Part G — Grant modelled as percentage of eligible CAPEX. Grant ceiling: {(grantCeiling * 100).toFixed(0)}%
              </p>

              <Table>
                <TableHeader>
                  <TableRow className="text-[10px]">
                    <TableHead className="py-1.5">CAPEX Category</TableHead>
                    <TableHead className="py-1.5 w-20 text-center">Eligible?</TableHead>
                    <TableHead className="py-1.5">Post-Award Evidence Required</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ELIGIBLE_CAPEX_CATEGORIES.map((cat) => (
                    <TableRow key={cat.category} className="text-[11px]">
                      <TableCell className="py-1 font-medium text-[10px]">{cat.category}</TableCell>
                      <TableCell className="py-1 text-center">
                        <span className={`inline-block rounded px-1.5 py-px text-[9px] font-medium ${
                          cat.eligible === true ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                        }`}>
                          {cat.eligible === true ? "Yes" : "Conditional"}
                        </span>
                      </TableCell>
                      <TableCell className="py-1 text-[9px] text-muted-foreground">{cat.evidence}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-3 rounded border border-red-200 bg-red-50 p-2.5 text-[10px] text-red-800">
                <span className="font-semibold">Not Eligible:</span> Land acquisition, developer profit, overheads, taxes, feasibility studies, financing costs, penalties, working capital — unless expressly permitted in Bid Data Sheet.
              </div>

              {/* Worked example */}
              <div className="mt-3 rounded border border-border bg-muted/30 p-3">
                <h3 className="text-[11px] font-semibold">Worked Example — Grant Calculation</h3>
                <div className="mt-1.5 space-y-0.5 text-[10px]">
                  <div className="flex justify-between"><span>PV modules, mounting, DC cabling, BOS</span><span className="font-mono">$1,200,000</span></div>
                  <div className="flex justify-between"><span>BESS, PCS/inverters, EMS</span><span className="font-mono">$800,000</span></div>
                  <div className="flex justify-between"><span>Distribution rehabilitation & meters</span><span className="font-mono">$450,000</span></div>
                  <div className="flex justify-between"><span>Interconnection & protection works</span><span className="font-mono">$150,000</span></div>
                  <div className="flex justify-between"><span>SCADA/remote monitoring</span><span className="font-mono">$100,000</span></div>
                  <div className="flex justify-between border-t border-border pt-1 mt-1 font-semibold"><span>Total Eligible CAPEX</span><span className="font-mono">$2,700,000</span></div>
                  <div className="flex justify-between"><span>Grant % (≤ {(grantCeiling * 100).toFixed(0)}% ceiling)</span><span className="font-mono">30%</span></div>
                  <div className="flex justify-between font-semibold text-primary"><span>Grant Ask</span><span className="font-mono">$810,000</span></div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 7: Payment Milestones */}
          {wizardStep === 6 && (
            <div className="p-4">
              <h2 className="font-heading text-sm font-bold">Step 7 — Payment Milestones & Disbursement Schedule</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Form 6 Tab 11 — Grant tranche schedule aligned to IVA-verified milestones. No single user completes the full disbursement chain.
              </p>

              <div className="mt-3 space-y-3">
                {PAYMENT_MILESTONES.map((ms) => (
                  <div key={ms.id} className="rounded border border-border overflow-hidden">
                    <div className="flex items-center justify-between bg-primary/5 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold">{ms.id}</span>
                        <div>
                          <h3 className="text-[12px] font-bold">{ms.name}</h3>
                          <p className="text-[10px] text-muted-foreground">{ms.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-primary">{ms.tranche_pct}%</div>
                        <div className="text-[9px] text-muted-foreground">of total grant</div>
                      </div>
                    </div>
                    <div className="px-3 py-2">
                      <div className="text-[10px] font-semibold text-muted-foreground mb-1">Evidence Required for IVA Verification:</div>
                      <div className="grid grid-cols-2 gap-0.5">
                        {ms.evidence.map((ev, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[10px]">
                            <span className="w-3 h-3 rounded border border-green-300 bg-green-50 flex items-center justify-center text-[7px] text-green-700 shrink-0 mt-0.5">✓</span>
                            <span>{ev}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Disbursement flow */}
              <div className="mt-3 rounded border border-border bg-muted/30 p-3">
                <h3 className="text-[11px] font-semibold">Disbursement Approval Chain (Segregated)</h3>
                <div className="mt-1.5 flex items-center gap-1.5 text-[10px] flex-wrap">
                  {[
                    { role: "Developer", action: "Submits evidence" },
                    { role: "IVA", action: "Verifies milestone" },
                    { role: "REA PMU", action: "Approves disbursement" },
                    { role: "Grant Admin", action: "Authorises payment" },
                    { role: "Bank", action: "Executes transfer" },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-border">→</span>}
                      <div className="rounded border border-border bg-white px-2 py-1">
                        <div className="font-semibold">{step.role}</div>
                        <div className="text-[9px] text-muted-foreground">{step.action}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Visual milestone bar */}
              <div className="mt-3 rounded border border-border p-3">
                <h3 className="text-[11px] font-semibold mb-2">Grant Disbursement Timeline</h3>
                <div className="flex h-8 rounded overflow-hidden">
                  <div className="bg-primary flex items-center justify-center text-white text-[10px] font-bold" style={{ width: "40%" }}>
                    M1 — 40%
                  </div>
                  <div className="bg-primary/70 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: "40%" }}>
                    M2 — 40%
                  </div>
                  <div className="bg-primary/40 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: "20%" }}>
                    M3 — 20%
                  </div>
                </div>
                <div className="flex mt-1 text-[9px] text-muted-foreground">
                  <div style={{ width: "40%" }}>Commissioning + NEMSA cert</div>
                  <div style={{ width: "40%" }}>Connections verified by IVA</div>
                  <div style={{ width: "20%" }}>12-month performance</div>
                </div>
              </div>

              <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2.5 text-[10px] text-amber-800">
                <span className="font-semibold">Note:</span> Final grant disbursement is subject to IVA verification of eligible CAPEX. Contingency is eligible only if expressly permitted in the Bid Data Sheet. Tranche percentages must match the grant agreement.
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-3 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-[11px]"
            disabled={wizardStep === 0}
            onClick={() => setWizardStep((s) => s - 1)}
          >
            ← Previous
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Step {wizardStep + 1} of {STEP_LABELS.length}
          </span>
          {wizardStep < STEP_LABELS.length - 1 ? (
            <Button
              size="sm"
              className="h-7 px-3 text-[11px]"
              onClick={() => setWizardStep((s) => s + 1)}
            >
              Next →
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7 px-4 text-[11px]"
              onClick={handleCreateTender}
              disabled={submitting || !tenderTitle.trim()}
            >
              {submitting ? "Creating..." : "Create Tender & Generate Bidder Pack"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="text-[13px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-base font-bold">{lotData.lot_name}</h1>
          <p className="text-[11px] text-muted-foreground">
            {lotData.disco} &middot; {lotData.state} &middot; {sites.length} sites &middot; {fmt(lotData.total_connections || 0)} connections
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-6 px-3 text-[11px]" onClick={() => router.push("/lots")}>
          ← Back to Lots
        </Button>
      </div>

      {actionMsg && (
        <div className={`mt-2 rounded p-2.5 text-[11px] ${
          actionMsg.startsWith("Error") ? "bg-red-500/10 border border-red-500/30 text-red-700" : "bg-green-500/10 border border-green-500/30 text-green-700"
        }`}>
          {actionMsg}
        </div>
      )}

      {/* Lot Summary */}
      <div className="mt-3 grid gap-2 grid-cols-4">
        {[
          { label: "Grant Ceiling", value: formatUSD(lotData.grant_ceiling_usd || 0), sub: `${(grantCeiling * 100).toFixed(0)}% of eligible CAPEX` },
          { label: "Approval", value: lotData.approval_to_tender ? "Approved" : "Pending", sub: lotData.approval_to_tender ? "Ready for tender" : "Awaiting REA PMU" },
          { label: "Tender Status", value: (lotData.tender_status || "none").replace(/_/g, " "), sub: tender ? `Ref: ${tender.tender_reference || "—"}` : "Not created" },
          { label: "Data Room", value: (lotData.data_room_status || "not_started").replace(/_/g, " "), sub: "8-folder structure" },
        ].map((s) => (
          <div key={s.label} className="rounded border border-border bg-white px-3 py-1.5">
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
            <div className="font-heading text-sm font-bold leading-tight capitalize">{s.value}</div>
            <div className="text-[9px] text-muted-foreground">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Sites in lot */}
      {sites.length > 0 && (
        <div className="mt-3 rounded border border-border bg-white">
          <div className="border-b border-border px-3 py-1.5">
            <span className="text-[11px] font-semibold">Sites in Lot ({sites.length})</span>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {sites.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-1 border-b border-border last:border-b-0 text-[11px]">
                <span className="font-medium">{s.community || `Site ${s.site_id?.slice(0, 8)}...`}</span>
                <span className="text-[10px] text-muted-foreground">Rank: {s.settlement_rank ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workflow Actions */}
      <div className="mt-3 rounded border border-border bg-white">
        <div className="border-b border-border px-3 py-1.5">
          <span className="text-[11px] font-semibold">Workflow Actions</span>
        </div>
        <div className="p-3 space-y-2">
          {/* Step 1: Approve */}
          {!lotData.approval_to_tender && (
            <div className="flex items-center justify-between p-2.5 rounded border border-amber-200 bg-amber-50">
              <div>
                <p className="text-[11px] font-semibold">Step 1: Approve for Tendering</p>
                <p className="text-[10px] text-muted-foreground">REA PMU must approve this lot before tender creation</p>
              </div>
              <Button size="sm" className="h-6 px-3 text-[11px]" onClick={handleApprove} disabled={submitting}>
                {submitting ? "..." : "Approve Lot"}
              </Button>
            </div>
          )}

          {/* Step 2: Create tender with full wizard */}
          {lotData.approval_to_tender && !tender && (
            <div className="flex items-center justify-between p-2.5 rounded border border-blue-200 bg-blue-50">
              <div>
                <p className="text-[11px] font-semibold">Step 2: Create Tender</p>
                <p className="text-[10px] text-muted-foreground">
                  Generate bidder pack, 8-folder data room, tender document, and Form 6 financial template
                </p>
              </div>
              <Button size="sm" className="h-6 px-3 text-[11px]" onClick={openWizard}>
                Create Tender
              </Button>
            </div>
          )}

          {/* Step 3: Issue tender */}
          {tender && tender.status === "draft" && (
            <div className="flex items-center justify-between p-2.5 rounded border border-green-200 bg-green-50">
              <div>
                <p className="text-[11px] font-semibold">Step 3: Issue Tender</p>
                <p className="text-[10px] text-muted-foreground">
                  Ref: {tender.tender_reference || "—"} — publish to open for bids
                </p>
              </div>
              <Button size="sm" className="h-6 px-3 text-[11px]" onClick={() => handleIssueTender(tender.id)} disabled={submitting}>
                {submitting ? "..." : "Issue Tender"}
              </Button>
            </div>
          )}

          {lotData.tender_status === "issued" && (
            <div className="flex items-center justify-between p-2.5 rounded border border-green-200 bg-green-50">
              <div>
                <p className="text-[11px] font-semibold text-green-700">Tender Live</p>
                <p className="text-[10px] text-muted-foreground">This lot is open for bids</p>
              </div>
              <Badge className="bg-green-100 text-green-800 text-[10px]">Live</Badge>
            </div>
          )}
        </div>
      </div>

      {/* If tender exists, show bidder pack summary */}
      {tender && (
        <div className="mt-3 space-y-2">
          <div className="rounded border border-border bg-white">
            <div className="border-b border-border px-3 py-1.5">
              <span className="text-[11px] font-semibold">Bidder Pack — Tender Document</span>
            </div>
            <div className="p-3 grid grid-cols-3 gap-2 text-[10px]">
              {[
                "Part A — Invitation & Bid Data",
                "Part B — IMG Commercial Model",
                "Part C — Data Room (8 folders)",
                "Part D — Technical Requirements",
                "Part E — DisCo Interface",
                "Part F — Commercial Framework",
                "Part G — Grant & CAPEX Rules",
                "Part H — Conditions Precedent",
                "Part I — E&S Requirements",
              ].map((part) => (
                <div key={part} className="flex items-center gap-1.5 rounded bg-green-50 border border-green-200 px-2 py-1">
                  <span className="text-green-700">✓</span>
                  <span>{part}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Payment milestones summary */}
          <div className="rounded border border-border bg-white">
            <div className="border-b border-border px-3 py-1.5">
              <span className="text-[11px] font-semibold">Payment Milestones (Form 6 Tab 11)</span>
            </div>
            <div className="p-3">
              <div className="flex h-6 rounded overflow-hidden text-[10px]">
                <div className="bg-primary flex items-center justify-center text-white font-bold" style={{ width: "40%" }}>M1 — 40%</div>
                <div className="bg-primary/70 flex items-center justify-center text-white font-bold" style={{ width: "40%" }}>M2 — 40%</div>
                <div className="bg-primary/40 flex items-center justify-center text-white font-bold" style={{ width: "20%" }}>M3 — 20%</div>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2 text-[10px]">
                <div><span className="font-semibold">M1:</span> Commissioning + NEMSA</div>
                <div><span className="font-semibold">M2:</span> Connections verified</div>
                <div><span className="font-semibold">M3:</span> 12-month performance</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
