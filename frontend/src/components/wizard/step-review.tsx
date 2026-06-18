"use client";

import { useFormContext } from "react-hook-form";
import type { SiteFormData } from "@/lib/schemas";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  const display = value === null || value === undefined || value === ""
    ? "\u2014"
    : typeof value === "boolean"
    ? value ? "Yes" : "No"
    : String(value);

  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{display}</span>
    </div>
  );
}

export function StepReview() {
  const { getValues, formState: { isValid } } = useFormContext<SiteFormData>();
  const data = getValues();
  const totalCustomers = data.customers.reduce((sum, c) => sum + (c.count || 0), 0);

  return (
    <div className="space-y-4">
      {!isValid && (
        <div className="rounded-lg border-red-200 bg-red-50 p-3 text-sm text-red-700">
          There are validation errors. Go back and fix them before creating the site.
        </div>
      )}

      <Section title="Site Identity">
        <Field label="Site Name" value={data.site_name} />
        <Field label="Location" value={`${data.district}, ${data.province}, ${data.country}`} />
        <Field label="Coordinates" value={`${data.coordinates[0]}, ${data.coordinates[1]}`} />
        <Field label="Developer" value={data.developer} />
        <Field label="DisCo" value={data.disco_name} />
        <Field label="Minigrid Type" value={data.minigrid_type} />
        <Field label="DisCo Supply Hours" value={data.disco_supply_hours ? `${data.disco_supply_hours} hrs/day` : undefined} />
      </Section>

      <Section title="Settlement">
        <Field label="Population" value={data.population} />
        <Field label="Mapped Structures" value={data.mapped_structures} />
        <Field label="Settlement Radius" value={`${data.settlement_radius_m} m`} />
        <Field label="Terrain" value={data.terrain} />
      </Section>

      <Section title="Customers">
        <Field label="Total Customers" value={totalCustomers} />
        {data.customers.map((c, i) => (
          <Field
            key={i}
            label={`${c.category} / ${c.sub_type}`}
            value={`${c.count} (${c.tier})`}
          />
        ))}
        {data.customers.length === 0 && (
          <p className="text-xs text-amber-600">No customers added</p>
        )}
      </Section>

      <Section title="Anchor Loads">
        {data.anchors.map((a, i) => (
          <Field
            key={i}
            label={a.name || a.load_type}
            value={a.estimated_load_kw ? `${a.estimated_load_kw} kW` : `${a.count} unit(s)`}
          />
        ))}
        {data.anchors.length === 0 && (
          <p className="text-xs text-muted-foreground">No anchor loads</p>
        )}
      </Section>

      <Section title="Grid & Environmental">
        <Field label="Grid Status" value={data.grid_status.replace("_", " ")} />
        <Field label="Protected Area" value={data.protected_area_overlap} />
        <Field label="Flood Risk" value={data.flood_risk} />
        <Field label="Biodiversity Risk" value={data.biodiversity_risk} />
        <Field label="IFC Category" value={data.ifc_category} />
      </Section>

      <Section title="Financial Assumptions">
        <Field label="Tariff (Floor)" value={`$${data.tariff_scenarios.low}/kWh`} />
        <Field label="Tariff (Base)" value={`$${data.tariff_scenarios.base}/kWh`} />
        <Field label="Tariff (Ceiling)" value={`$${data.tariff_scenarios.high}/kWh`} />
        <Field
          label="Financing"
          value={`Grant ${(data.financing_structure.grant_pct * 100).toFixed(0)}% / Debt ${(data.financing_structure.debt_pct * 100).toFixed(0)}% / Equity ${(data.financing_structure.equity_pct * 100).toFixed(0)}%`}
        />
        <Field label="Discount Rate" value={`${(data.discount_rate * 100).toFixed(0)}%`} />
        <Field label="Debt Terms" value={`${(data.debt_interest_rate * 100).toFixed(0)}% over ${data.debt_tenor_years} years`} />
      </Section>
    </div>
  );
}
