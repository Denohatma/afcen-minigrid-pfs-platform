import Link from "next/link";
import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";

const MODULES = [
  {
    href: "/sites",
    title: "Site Registry",
    description: "Browse and select candidate minigrid sites across DisCo franchise areas",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    href: "/portfolios",
    title: "Portfolios & PFS",
    description: "14-step pre-feasibility analysis pipeline with PUE-first system sizing",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
  },
  {
    href: "/tenders",
    title: "Tender Management",
    description: "Competitive tender process — RFP issuance, Q&A, bid submission",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: "/evaluations",
    title: "Bid Evaluation",
    description: "AI-assisted bid scoring with human validation and award decision",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: "/disbursements",
    title: "RBF Disbursements",
    description: "Results-based financing milestone tracking and grant disbursement",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: "/monitoring",
    title: "Performance Monitoring",
    description: "Live operational dashboard with KPI tracking and performance alerts",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    href: "/developers",
    title: "Developer Management",
    description: "Register, qualify, and manage minigrid developer companies",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center p-8">
      <div className="flex flex-col items-center gap-6 pt-12 pb-8">
        <Image
          src="/logo-full.svg"
          alt="InvestIQ: IMG Nigeria"
          width={280}
          height={100}
          priority
        />
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            InvestIQ: IMG Nigeria
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            End-to-end minigrid program management platform for the DARES/NEP framework.
            Site selection, PFS analysis, tendering, grant disbursement, and performance monitoring
            across AEDC, KEDCO, and Ikeja Electric franchise areas.
          </p>
        </div>
        <Link
          href="/portfolios"
          className={buttonVariants({ size: "lg", className: "px-8 text-base" })}
        >
          Get Started
        </Link>
      </div>

      <div className="mt-6 grid w-full max-w-5xl gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MODULES.map((mod) => (
          <Link key={mod.href} href={mod.href} className="group">
            <div className="rounded-lg border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30 h-full">
              <div className="mb-3 inline-flex rounded-md bg-primary/10 p-2 text-primary group-hover:bg-primary/20 transition-colors">
                {mod.icon}
              </div>
              <h3 className="font-heading text-base font-semibold">{mod.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{mod.description}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-12 max-w-3xl rounded-lg bg-muted/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          <strong>Nigeria DARES Pilot</strong> — Three DisCo franchise areas: AEDC (Abuja/FCT),
          KEDCO (Kano, Katsina, Jigawa), Ikeja Electric (Northern Lagos).
          Powered by the AfCEN 14-step PFS computational pipeline with 23,806 candidate settlements.
        </p>
      </div>
    </div>
  );
}
