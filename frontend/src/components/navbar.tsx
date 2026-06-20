"use client";

import { useState } from "react";
import Link from "next/link";
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
    </svg>
  );
}

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const activeStep = getActiveStep(pathname);

  const nextItem = NAV_ITEMS.find((item) => item.step === activeStep + 1);

  return (
    <header className="border-b border-border bg-card shadow-sm">
      {/* Top bar: branding + stepper + done button */}
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        {/* Branding */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="text-2xl leading-none">🇳🇬</span>
          <span className="font-heading text-base font-bold text-foreground">
            DARES IMG Platform
          </span>
        </Link>

        {/* Stepper nav — desktop */}
        <nav className="hidden flex-1 items-center justify-center lg:flex">
          <div className="flex items-center gap-0">
            {NAV_ITEMS.map((item, idx) => {
              const isCompleted = activeStep > 0 && item.step < activeStep;
              const isActive = item.step === activeStep;
              const isUpcoming = item.step > activeStep || activeStep === 0;

              return (
                <div key={item.href} className="flex items-center">
                  {/* Connector line (before each step except the first) */}
                  {idx > 0 && (
                    <div
                      className={`h-[2px] w-4 transition-colors ${
                        isCompleted || isActive
                          ? "bg-primary/60"
                          : "bg-muted-foreground/20"
                      }`}
                    />
                  )}

                  {/* Step circle + label */}
                  <Link
                    href={item.href}
                    className="group flex flex-col items-center gap-0.5"
                    title={item.label}
                  >
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all ${
                        isActive
                          ? "border-primary bg-primary text-primary-foreground shadow-[0_0_8px_rgba(100,200,100,0.3)]"
                          : isCompleted
                            ? "border-primary/50 bg-primary/15 text-primary"
                            : "border-muted-foreground/30 bg-transparent text-muted-foreground/60 group-hover:border-muted-foreground/50 group-hover:text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckIcon className="h-3.5 w-3.5" />
                      ) : (
                        item.step
                      )}
                    </div>
                    <span
                      className={`text-[10px] leading-tight transition-colors ${
                        isActive
                          ? "font-semibold text-primary"
                          : isCompleted
                            ? "font-medium text-primary/70"
                            : "text-muted-foreground/50 group-hover:text-muted-foreground/80"
                      }`}
                    >
                      {item.label}
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        </nav>

        {/* Right side: Done button + mobile toggle */}
        <div className="flex shrink-0 items-center gap-3">
          {/* Done / Next step button — desktop */}
          {nextItem && (
            <button
              type="button"
              onClick={() => router.push(nextItem.href)}
              className="hidden items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md lg:flex"
            >
              Done
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                />
              </svg>
            </button>
          )}
          {!nextItem && activeStep === 9 && (
            <span className="hidden items-center gap-1.5 rounded-md bg-primary/20 px-3.5 py-1.5 text-sm font-semibold text-primary lg:flex">
              <CheckIcon className="h-3.5 w-3.5" />
              Complete
            </span>
          )}

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent lg:hidden"
            aria-label="Toggle menu"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {mobileOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>

          {/* Powered by AfCEN — desktop */}
          <span className="hidden text-[9px] leading-tight text-muted-foreground/50 xl:block">
            Powered by
            <br />
            <span className="font-semibold text-muted-foreground/70">
              AfCEN
            </span>
          </span>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <nav className="border-t border-border px-4 py-3 lg:hidden">
          {NAV_ITEMS.map((item) => {
            const isCompleted = activeStep > 0 && item.step < activeStep;
            const isActive = item.step === activeStep;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-primary"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold ${
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : isCompleted
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-muted-foreground/30 text-muted-foreground/60"
                  }`}
                >
                  {isCompleted ? (
                    <CheckIcon className="h-3 w-3" />
                  ) : (
                    item.step
                  )}
                </span>
                {item.label}
              </Link>
            );
          })}

          {/* Mobile: Done button */}
          {nextItem && (
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                router.push(nextItem.href);
              }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Done
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                />
              </svg>
            </button>
          )}

          {/* Mobile: Powered by AfCEN */}
          <p className="mt-3 text-center text-[10px] text-muted-foreground/50">
            Powered by{" "}
            <span className="font-semibold text-muted-foreground/70">
              AfCEN
            </span>
          </p>
        </nav>
      )}
    </header>
  );
}
