"use client";

import { useFormContext } from "react-hook-form";
import type { SiteFormData } from "@/lib/schemas";
import { DEFAULT_SITE_DATA } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StepFinancial() {
  const {
    register,
    reset,
    getValues,
    watch,
    formState: { errors },
  } = useFormContext<SiteFormData>();

  const grantPct = watch("financing_structure.grant_pct") ?? 0;
  const debtPct = watch("financing_structure.debt_pct") ?? 0;
  const equityPct = watch("financing_structure.equity_pct") ?? 0;
  const financingTotal = grantPct + debtPct + equityPct;
  const financingValid = Math.abs(financingTotal - 1.0) <= 0.01;

  const resetDefaults = () => {
    const current = getValues();
    reset({
      ...current,
      tariff_scenarios: DEFAULT_SITE_DATA.tariff_scenarios,
      discount_rate: DEFAULT_SITE_DATA.discount_rate,
      inflation_rate: DEFAULT_SITE_DATA.inflation_rate,
      fx_rate_ngn_usd: DEFAULT_SITE_DATA.fx_rate_ngn_usd,
      financing_structure: DEFAULT_SITE_DATA.financing_structure,
      debt_interest_rate: DEFAULT_SITE_DATA.debt_interest_rate,
      debt_tenor_years: DEFAULT_SITE_DATA.debt_tenor_years,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={resetDefaults}>
          Use Defaults
        </Button>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Tariff Scenarios (USD/kWh)
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="tariff_low">Low (Floor)</Label>
            <Input
              id="tariff_low"
              type="number"
              step="0.01"
              {...register("tariff_scenarios.low", { valueAsNumber: true })}
            />
            <p className="mt-1 text-xs text-muted-foreground">Minimum viable tariff</p>
          </div>
          <div>
            <Label htmlFor="tariff_base">Base</Label>
            <Input
              id="tariff_base"
              type="number"
              step="0.01"
              {...register("tariff_scenarios.base", { valueAsNumber: true })}
            />
            <p className="mt-1 text-xs text-muted-foreground">Expected operating tariff</p>
          </div>
          <div>
            <Label htmlFor="tariff_high">High (Ceiling)</Label>
            <Input
              id="tariff_high"
              type="number"
              step="0.01"
              {...register("tariff_scenarios.high", { valueAsNumber: true })}
            />
            <p className="mt-1 text-xs text-muted-foreground">Maximum approved tariff</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Financing Structure
          {!financingValid && (
            <span className="ml-2 text-xs font-normal text-red-600">
              Must sum to 100% (currently {(financingTotal * 100).toFixed(0)}%)
            </span>
          )}
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="grant_pct">Grant %</Label>
            <Input
              id="grant_pct"
              type="number"
              step="0.01"
              min={0}
              max={1}
              {...register("financing_structure.grant_pct", { valueAsNumber: true })}
            />
          </div>
          <div>
            <Label htmlFor="debt_pct">Debt %</Label>
            <Input
              id="debt_pct"
              type="number"
              step="0.01"
              min={0}
              max={1}
              {...register("financing_structure.debt_pct", { valueAsNumber: true })}
            />
          </div>
          <div>
            <Label htmlFor="equity_pct">Equity %</Label>
            <Input
              id="equity_pct"
              type="number"
              step="0.01"
              min={0}
              max={1}
              {...register("financing_structure.equity_pct", { valueAsNumber: true })}
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Debt Terms</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="debt_interest_rate">Interest Rate</Label>
            <Input
              id="debt_interest_rate"
              type="number"
              step="0.01"
              {...register("debt_interest_rate", { valueAsNumber: true })}
            />
            {errors.debt_interest_rate && (
              <p className="mt-1 text-xs text-red-600">{errors.debt_interest_rate.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="debt_tenor_years">Tenor (years)</Label>
            <Input
              id="debt_tenor_years"
              type="number"
              min={1}
              {...register("debt_tenor_years", { valueAsNumber: true })}
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Rates</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="discount_rate">Discount Rate</Label>
            <Input
              id="discount_rate"
              type="number"
              step="0.01"
              {...register("discount_rate", { valueAsNumber: true })}
            />
          </div>
          <div>
            <Label htmlFor="inflation_rate">Inflation Rate</Label>
            <Input
              id="inflation_rate"
              type="number"
              step="0.01"
              {...register("inflation_rate", { valueAsNumber: true })}
            />
          </div>
          <div>
            <Label htmlFor="fx_rate">FX Rate (NGN/USD)</Label>
            <Input
              id="fx_rate"
              type="number"
              step="0.1"
              {...register("fx_rate_ngn_usd", { valueAsNumber: true })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
