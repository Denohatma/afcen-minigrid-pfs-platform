import Link from "next/link";
import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";

const MODULES = [
  {
    href: "/sites",
    title: "1. Site Registry",
    description: "Browse 23,806 candidate settlements across AEDC, KEDCO, and IE franchise areas. Create lots for tendering.",
    color: "text-blue-400 bg-blue-500/10",
  },
  {
    href: "/disco-readiness",
    title: "3. DisCo Readiness",
    description: "Track feeder data, POI, bulk metering, customer data, and tripartite agreement status per site.",
    color: "text-amber-400 bg-amber-500/10",
  },
  {
    href: "/lots",
    title: "5. Lots & Tenders",
    description: "Group sites into lots, build 8-folder data rooms, issue competitive tenders, and manage bidder NDA access.",
    color: "text-indigo-400 bg-indigo-500/10",
  },
  {
    href: "/evaluations",
    title: "6. Evaluation",
    description: "5-stage evaluation with AI compliance flags (never scoring), human acknowledgement, and WB no-objection.",
    color: "text-purple-400 bg-purple-500/10",
  },
  {
    href: "/agreements",
    title: "7–8. Agreements & CPs",
    description: "Grant agreement management, ringfencing, PBG assignment, and conditions precedent tracker with waiver workflows.",
    color: "text-teal-400 bg-teal-500/10",
  },
  {
    href: "/disbursements",
    title: "9. Milestones & Disbursement",
    description: "Eligible CAPEX grant engine, 4-role segregated approval chain, GPS verification, and IVA visit scheduling.",
    color: "text-emerald-400 bg-green-500/10",
  },
  {
    href: "/grievances",
    title: "10. E&S / SEP / GRM",
    description: "Community grievance intake (including anonymous & SEA/SH), escalation workflows, and corrective action tracking.",
    color: "text-red-400 bg-red-500/10",
  },
  {
    href: "/settlement-ledger",
    title: "11. DisCo Settlement",
    description: "Monthly settlement ledger: bulk meter readings, DUoS charges, grid energy charges, dispute resolution.",
    color: "text-orange-400 bg-orange-500/10",
  },
  {
    href: "/performance",
    title: "12. Performance & M&E",
    description: "Operational KPIs, GESI metrics, carbon credit tracking, and ESG impact reporting across the portfolio.",
    color: "text-cyan-400 bg-cyan-500/10",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center p-8">
      <div className="flex flex-col items-center gap-6 pt-12 pb-8">
        <Image
          src="/logo-full.svg"
          alt="InvestIQ: DARES IMG"
          width={280}
          height={100}
          priority
        />
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            DARES Interconnected Mini-Grids
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            12-module programme operating system for the REA/DARES interconnected mini-grid
            CAPEX grant scheme. End-to-end: site selection through to performance monitoring
            across AEDC, KEDCO, and Ikeja Electric franchise areas.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/sites"
            className={buttonVariants({ size: "lg", className: "px-8 text-base" })}
          >
            Open Site Registry
          </Link>
          <Link
            href="/lots"
            className={buttonVariants({ variant: "outline", size: "lg", className: "px-8 text-base" })}
          >
            Manage Tenders
          </Link>
        </div>
      </div>

      <div className="mt-6 grid w-full max-w-5xl gap-4 md:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((mod) => (
          <Link key={mod.href} href={mod.href} className="group">
            <div className="rounded-lg border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30 h-full">
              <h3 className="font-heading text-base font-semibold">{mod.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{mod.description}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-12 max-w-3xl rounded-lg bg-muted/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          <strong>DARES/IDA Pilot</strong> — Three DisCo franchise areas: AEDC (Abuja/FCT),
          KEDCO (Kano, Katsina, Jigawa), Ikeja Electric (Northern Lagos).
          23,806 candidate settlements ranked by IMG suitability score.
          Non-discretionary grant disbursement with 4-role segregated approval.
        </p>
      </div>
    </div>
  );
}
