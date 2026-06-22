"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useRole, ROLES, type RoleKey } from "@/lib/role-context";

const ALL_NAV_ITEMS = [
  { href: "/sites", label: "Sites", step: 1 },
  { href: "/system-sizing", label: "Sizing", step: 2 },
  { href: "/disco-readiness", label: "DisCo", step: 3 },
  { href: "/lots", label: "Tenders", step: 4 },
  { href: "/evaluations", label: "Eval", step: 5 },
  { href: "/agreements", label: "Agreements", step: 6 },
  { href: "/disbursements", label: "Disburse", step: 7 },
  { href: "/tickets", label: "Tickets", step: 8 },
  { href: "/settlement-ledger", label: "Settle", step: 9 },
  { href: "/performance", label: "M&E", step: 10 },
];

const ROLE_GROUPS: { label: string; keys: RoleKey[] }[] = [
  { label: "Program", keys: ["pmu"] },
  { label: "DisCo", keys: ["disco_aedc", "disco_kedco", "disco_ie"] },
  { label: "Private Sector", keys: ["bidder", "evaluator"] },
];

function getActiveStep(pathname: string): number {
  for (const item of ALL_NAV_ITEMS) {
    if (pathname.startsWith(item.href)) return item.step;
  }
  return 0;
}

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { role, setRole, canAccess } = useRole();

  const navItems = ALL_NAV_ITEMS.filter((item) => canAccess(item.step));
  const activeStep = getActiveStep(pathname);
  const visibleSteps = navItems.map((i) => i.step);
  const currentIdx = visibleSteps.indexOf(activeStep);
  const nextItem = currentIdx >= 0 && currentIdx < visibleSteps.length - 1
    ? navItems[currentIdx + 1]
    : undefined;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setRoleSwitcherOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRoleSwitch = (key: RoleKey) => {
    setRole(key);
    setRoleSwitcherOpen(false);
    queryClient.clear();
    const target = ROLES[key].homePage;
    router.push(target);
  };

  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex h-10 max-w-[1400px] items-center gap-3 px-3">
        {/* Logos + branding */}
        <Link href="/" className="flex shrink-0 items-center gap-1.5">
          <Image src="/nigeria-flag.svg" alt="Nigeria" width={28} height={20} className="h-5 w-auto" />
          <Image src="/rea-logo.jpeg" alt="REA" width={48} height={24} className="h-5 w-auto" />
          <Image src="/wb-logo.jpg" alt="World Bank" width={60} height={24} className="h-5 w-auto" />
          <Image src="/seforall-logo.png" alt="SEforALL" width={60} height={24} className="h-5 w-auto" />
          <span className="ml-1 font-heading text-[11px] font-bold tracking-tight text-foreground">
            DARES IMG
          </span>
        </Link>

        <div className="mx-1 h-4 w-px bg-border" />

        {/* Stepper nav */}
        <nav className="hidden flex-1 items-center lg:flex">
          <div className="flex items-center">
            {navItems.map((item, idx) => {
              const isActive = item.step === activeStep;

              return (
                <div key={item.href} className="flex items-center">
                  {idx > 0 && (
                    <div className={`h-px w-3 ${isActive ? "bg-primary/50" : "bg-border"}`} />
                  )}
                  <Link
                    href={item.href}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                      isActive
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                        isActive
                          ? "bg-primary text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {item.step}
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

          {/* Role switcher */}
          <div className="relative" ref={switcherRef}>
            <button
              type="button"
              onClick={() => setRoleSwitcherOpen(!roleSwitcherOpen)}
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium text-white transition-colors hover:opacity-90 ${role.color}`}
            >
              <span className="hidden sm:inline">{role.label}</span>
              <span className="sm:hidden">{role.shortLabel}</span>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {roleSwitcherOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-white py-1 shadow-lg">
                <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  Switch Role
                </div>
                {ROLE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="px-3 pt-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {group.label}
                    </div>
                    {group.keys.map((key) => {
                      const r = ROLES[key];
                      const isCurrent = role.key === key;
                      return (
                        <button
                          key={key}
                          onClick={() => handleRoleSwitch(key)}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors ${
                            isCurrent
                              ? "bg-primary/10 font-semibold text-primary"
                              : "text-foreground hover:bg-muted"
                          }`}
                        >
                          <span className={`h-2 w-2 rounded-full ${r.color}`} />
                          {r.label}
                          {isCurrent && <span className="ml-auto text-[9px] text-primary">Active</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

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
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="border-t border-border px-3 py-2 lg:hidden">
          {navItems.map((item) => {
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
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {item.step}
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
