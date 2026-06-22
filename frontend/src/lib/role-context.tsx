"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

export type RoleKey = "pmu" | "disco_aedc" | "disco_kedco" | "disco_ie" | "bidder" | "evaluator";

export interface RoleProfile {
  key: RoleKey;
  label: string;
  shortLabel: string;
  backendRole: string;
  disco?: string;
  color: string;
  navSteps: number[];
  homePage: string;
}

export const ROLES: Record<RoleKey, RoleProfile> = {
  pmu: {
    key: "pmu",
    label: "PMU Program Manager",
    shortLabel: "PMU",
    backendRole: "rea_pmu_officer",
    color: "bg-indigo-600",
    navSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    homePage: "/sites",
  },
  disco_aedc: {
    key: "disco_aedc",
    label: "DisCo Manager (AEDC)",
    shortLabel: "AEDC",
    backendRole: "disco_officer",
    disco: "AEDC",
    color: "bg-emerald-600",
    navSteps: [1, 2, 3, 9],
    homePage: "/disco-readiness",
  },
  disco_kedco: {
    key: "disco_kedco",
    label: "DisCo Manager (KEDCO)",
    shortLabel: "KEDCO",
    backendRole: "disco_officer",
    disco: "KEDCO",
    color: "bg-emerald-600",
    navSteps: [1, 2, 3, 9],
    homePage: "/disco-readiness",
  },
  disco_ie: {
    key: "disco_ie",
    label: "DisCo Manager (IE)",
    shortLabel: "IE",
    backendRole: "disco_officer",
    disco: "IE",
    color: "bg-emerald-600",
    navSteps: [1, 2, 3, 9],
    homePage: "/disco-readiness",
  },
  bidder: {
    key: "bidder",
    label: "Bidder",
    shortLabel: "Bidder",
    backendRole: "developer",
    color: "bg-amber-600",
    navSteps: [4, 6, 7, 8],
    homePage: "/lots",
  },
  evaluator: {
    key: "evaluator",
    label: "Bid Evaluator",
    shortLabel: "Evaluator",
    backendRole: "afcen_analyst",
    color: "bg-purple-600",
    navSteps: [1, 2, 4, 5, 10],
    homePage: "/evaluations",
  },
};

interface RoleContextValue {
  role: RoleProfile;
  setRole: (key: RoleKey) => void;
  canAccess: (step: number) => boolean;
  isReadOnly: (module: string) => boolean;
}

const RoleContext = createContext<RoleContextValue | null>(null);

const WRITE_ACCESS: Record<string, Set<string>> = {
  rea_pmu_officer: new Set(["sites", "sizing", "disco", "tenders", "eval", "agreements", "disburse", "tickets", "settle", "mel"]),
  disco_officer: new Set(["disco", "settle"]),
  developer: new Set(["tenders", "tickets"]),
  afcen_analyst: new Set(["eval"]),
};

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [roleKey, setRoleKey] = useState<RoleKey>("pmu");

  useEffect(() => {
    const stored = localStorage.getItem("dares-role") as RoleKey | null;
    if (stored && ROLES[stored]) setRoleKey(stored);
  }, []);

  const setRole = useCallback((key: RoleKey) => {
    setRoleKey(key);
    localStorage.setItem("dares-role", key);
  }, []);

  const role = ROLES[roleKey];

  const canAccess = useCallback(
    (step: number) => role.navSteps.includes(step),
    [role]
  );

  const isReadOnly = useCallback(
    (module: string) => {
      const writes = WRITE_ACCESS[role.backendRole];
      return !writes || !writes.has(module);
    },
    [role]
  );

  return (
    <RoleContext.Provider value={{ role, setRole, canAccess, isReadOnly }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be inside RoleProvider");
  return ctx;
}
