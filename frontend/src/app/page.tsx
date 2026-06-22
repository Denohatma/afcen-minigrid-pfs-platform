import Link from "next/link";
import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";

const MODULES = [
  {
    href: "/sites",
    title: "1. Site Registry",
    desc: "23,806 candidate settlements across AEDC, KEDCO & IE.",
    icon: "1",
  },
  {
    href: "/system-sizing",
    title: "2. System Sizing",
    desc: "PV, BESS & distribution sizing per settlement cluster.",
    icon: "2",
  },
  {
    href: "/disco-readiness",
    title: "3. DisCo Readiness",
    desc: "Feeder data, POI, bulk metering & tripartite status.",
    icon: "3",
  },
  {
    href: "/lots",
    title: "4–5. Lots & Tenders",
    desc: "Lot packaging, data rooms & competitive tendering.",
    icon: "4",
  },
  {
    href: "/evaluations",
    title: "6. Evaluation",
    desc: "4-stage blind scoring with threshold gates & ranking.",
    icon: "5",
  },
  {
    href: "/agreements",
    title: "7–8. Agreements",
    desc: "Grant agreements, CPs & ringfenced disbursement.",
    icon: "6",
  },
  {
    href: "/disbursements",
    title: "9. Disbursement",
    desc: "Milestone-based CAPEX grants with 4-role approval.",
    icon: "7",
  },
  {
    href: "/tickets",
    title: "10. Tickets & GRM",
    desc: "Issue tracking, grievances & corrective actions.",
    icon: "8",
  },
  {
    href: "/settlement-ledger",
    title: "11. Settlement",
    desc: "Monthly DisCo settlement ledger & dispute resolution.",
    icon: "9",
  },
  {
    href: "/performance",
    title: "12. M&E",
    desc: "KPIs, GESI, carbon credits & ESG reporting.",
    icon: "10",
  },
];

const HERO_IMAGES = [
  { src: "/hero-site-1.jpeg", alt: "Solar mini-grid installation — rural Nigeria" },
  { src: "/hero-site-2.jpeg", alt: "Solar PV array — interconnected mini-grid" },
  { src: "/hero-site-3.jpeg", alt: "Large-scale solar mini-grid near community" },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero section */}
      <div className="relative overflow-hidden bg-gradient-to-b from-slate-900 to-slate-800">
        {/* Background image mosaic */}
        <div className="absolute inset-0 grid grid-cols-3 opacity-30">
          {HERO_IMAGES.map((img) => (
            <div key={img.src} className="relative">
              <Image
                src={img.src}
                alt={img.alt}
                fill
                className="object-cover"
                priority
              />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/60 via-slate-900/40 to-slate-900/80" />

        <div className="relative mx-auto max-w-5xl px-6 py-14 text-center">
          {/* Partner logos */}
          <div className="flex items-center justify-center gap-6 mb-8">
            <Image src="/nigeria-flag.svg" alt="Nigeria" width={48} height={34} className="h-9 w-auto drop-shadow-md" priority />
            <Image src="/rea-logo.jpeg" alt="Nigeria REA" width={72} height={36} className="h-9 w-auto rounded drop-shadow-md" priority />
            <Image src="/wb-logo.jpg" alt="World Bank" width={90} height={36} className="h-9 w-auto drop-shadow-md" priority />
            <Image src="/seforall-logo.png" alt="SEforALL" width={90} height={36} className="h-9 w-auto drop-shadow-md" priority />
            <Image src="/logo-icon.svg" alt="AfCEN" width={40} height={40} className="h-10 w-auto drop-shadow-md" priority />
          </div>

          <h1 className="font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
            DARES Interconnected Mini-Grids
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
            Programme operating system for the REA/World Bank DARES interconnected mini-grid
            CAPEX grant scheme. End-to-end management from site selection through to
            performance monitoring across AEDC, KEDCO & Ikeja Electric.
          </p>

          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/sites"
              className={buttonVariants({ size: "default", className: "px-6 text-sm bg-white text-slate-900 hover:bg-slate-100" })}
            >
              Open Site Registry
            </Link>
            <Link
              href="/lots"
              className={buttonVariants({ variant: "outline", size: "default", className: "px-6 text-sm border-white/30 text-white hover:bg-white/10" })}
            >
              Manage Tenders
            </Link>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-center divide-x divide-border px-6 py-3">
          {[
            { value: "23,806", label: "Settlements" },
            { value: "3", label: "DisCo Areas" },
            { value: "12", label: "Modules" },
            { value: "4-Stage", label: "Evaluation" },
          ].map((s) => (
            <div key={s.label} className="px-6 text-center">
              <div className="font-heading text-lg font-bold text-foreground">{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Module grid */}
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {MODULES.map((mod) => (
            <Link key={mod.href} href={mod.href} className="group">
              <div className="flex h-full flex-col rounded-lg border border-border bg-white px-3 py-2.5 shadow-sm transition-all hover:shadow-md hover:border-primary/30">
                <div className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                    {mod.icon}
                  </span>
                  <h3 className="text-[11px] font-semibold leading-tight text-foreground">{mod.title}</h3>
                </div>
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{mod.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Site photos strip */}
      <div className="mx-auto w-full max-w-5xl px-6 pb-8">
        <div className="grid grid-cols-3 gap-3">
          {HERO_IMAGES.map((img) => (
            <div key={img.src} className="relative aspect-[16/9] overflow-hidden rounded-lg">
              <Image
                src={img.src}
                alt={img.alt}
                fill
                className="object-cover transition-transform duration-300 hover:scale-105"
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Solar-hybrid interconnected mini-grid installations across Nigeria
        </p>
      </div>

      {/* Footer info */}
      <div className="mt-auto border-t border-border bg-muted/30 px-6 py-4">
        <p className="mx-auto max-w-3xl text-center text-[11px] text-muted-foreground">
          <strong>DARES Sub-Component 1.1</strong> — Three DisCo franchise areas: AEDC (Abuja/FCT),
          KEDCO (Kano, Katsina, Jigawa), Ikeja Electric (Northern Lagos).
          Non-discretionary minimum-subsidy tender with 4-role segregated grant disbursement.
        </p>
      </div>
    </div>
  );
}
