"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/sites", label: "Sites", step: 1 },
  { href: "/disco-readiness", label: "DisCo", step: 2 },
  { href: "/lots", label: "Tenders", step: 3 },
  { href: "/evaluations", label: "Eval", step: 4 },
  { href: "/agreements", label: "Agreements", step: 5 },
  { href: "/disbursements", label: "Disburse", step: 6 },
  { href: "/grievances", label: "GRM", step: 7 },
  { href: "/settlement-ledger", label: "Settle", step: 8 },
  { href: "/performance", label: "M&E", step: 9 },
];

function getActiveStep(pathname: string): number {
  for (const item of NAV_ITEMS) {
    if (pathname.startsWith(item.href)) return item.step;
  }
  return 0;
}

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const activeStep = getActiveStep(pathname);
  const nextItem = NAV_ITEMS.find((item) => item.step === activeStep + 1);

  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex h-10 max-w-[1400px] items-center gap-3 px-3">
        {/* Logos + branding */}
        <Link href="/" className="flex shrink-0 items-center gap-1.5">
          <Image src="/nigeria-flag.svg" alt="Nigeria" width={28} height={20} className="h-5 w-auto" />
          <Image src="/rea-logo.jpeg" alt="REA" width={48} height={24} className="h-5 w-auto" />
          <Image src="/wb-logo.jpg" alt="World Bank" width={60} height={24} className="h-5 w-auto" />
          <span className="ml-1 font-heading text-[11px] font-bold tracking-tight text-foreground">
            DARES IMG
          </span>
        </Link>

        <div className="mx-1 h-4 w-px bg-border" />

        {/* Stepper nav */}
        <nav className="hidden flex-1 items-center lg:flex">
          <div className="flex items-center">
            {NAV_ITEMS.map((item, idx) => {
              const isCompleted = activeStep > 0 && item.step < activeStep;
              const isActive = item.step === activeStep;

              return (
                <div key={item.href} className="flex items-center">
                  {idx > 0 && (
                    <div
                      className={`h-px w-3 ${
                        isCompleted || isActive
                          ? "bg-primary/50"
                          : "bg-border"
                      }`}
                    />
                  )}
                  <Link
                    href={item.href}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                      isActive
                        ? "bg-primary/10 font-semibold text-primary"
                        : isCompleted
                          ? "font-medium text-primary/70 hover:text-primary"
                          : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                        isActive
                          ? "bg-primary text-white"
                          : isCompleted
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? "✓" : item.step}
                    </span>
                    {item.label}
                  </Link>
                </div>
              );
            })}
          </div>
        </nav>

        {/* Right side */}
        <div className="flex shrink-0 items-center gap-2">
          {nextItem && (
            <button
              type="button"
              onClick={() => router.push(nextItem.href)}
              className="hidden items-center gap-1 rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-primary/90 lg:flex"
            >
              Next →
            </button>
          )}
          {!nextItem && activeStep === 9 && (
            <span className="hidden items-center gap-1 rounded bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary lg:flex">
              ✓ Complete
            </span>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded p-1 text-muted-foreground hover:bg-accent lg:hidden"
            aria-label="Toggle menu"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          <span className="hidden text-[8px] leading-tight text-muted-foreground/60 xl:block">
            Powered by <span className="font-semibold">AfCEN</span>
          </span>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="border-t border-border px-3 py-2 lg:hidden">
          {NAV_ITEMS.map((item) => {
            const isCompleted = activeStep > 0 && item.step < activeStep;
            const isActive = item.step === activeStep;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${
                  isActive
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                    isActive
                      ? "bg-primary text-white"
                      : isCompleted
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? "✓" : item.step}
                </span>
                {item.label}
              </Link>
            );
          })}
          {nextItem && (
            <button
              type="button"
              onClick={() => { setMobileOpen(false); router.push(nextItem.href); }}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white"
            >
              Next →
            </button>
          )}
        </nav>
      )}
    </header>
  );
}
