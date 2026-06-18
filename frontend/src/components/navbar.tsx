"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/sites", label: "Site Registry", shortLabel: "Sites" },
  { href: "/portfolios", label: "Portfolios" },
  { href: "/tenders", label: "Tenders" },
  { href: "/evaluations", label: "Evaluations" },
  { href: "/disbursements", label: "Disbursements" },
  { href: "/monitoring", label: "Monitoring" },
  { href: "/developers", label: "Developers" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="border-b bg-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo-icon.svg"
              alt="InvestIQ"
              width={36}
              height={36}
              className="h-9 w-9"
            />
            <span className="font-heading text-lg font-bold text-foreground">
              InvestIQ:<span className="font-semibold text-muted-foreground"> IMG Nigeria</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 text-sm lg:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 font-medium transition-colors ${
                  pathname.startsWith(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-primary hover:bg-accent"
                }`}
              >
                {item.shortLabel || item.label}
              </Link>
            ))}
          </nav>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent lg:hidden"
          aria-label="Toggle menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>
      {mobileOpen && (
        <nav className="border-t px-4 py-3 lg:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`block rounded-md px-3 py-2 text-sm ${
                pathname.startsWith(item.href)
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-primary"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
