"use client";

import { useFormContext, useFieldArray } from "react-hook-form";
import type { SiteFormData } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CATEGORY_OPTIONS = [
  "residential",
  "commercial",
  "institutional",
  "productive_use",
];

const SUB_TYPE_OPTIONS: Record<string, string[]> = {
  residential: ["household", "improved_household"],
  commercial: ["shop", "market_stall", "restaurant", "bar", "salon"],
  institutional: ["school", "hospital", "clinic", "church", "mosque", "administration"],
  productive_use: ["grain_mill", "welding", "irrigation", "cold_storage", "workshop"],
};

const TIER_OPTIONS = ["basic", "improved", "anchor"];

const PRESETS: Record<string, Array<{ category: string; sub_type: string; count: number; tier: string }>> = {
  "Typical Rural": [
    { category: "residential", sub_type: "household", count: 200, tier: "basic" },
    { category: "commercial", sub_type: "shop", count: 20, tier: "basic" },
    { category: "institutional", sub_type: "school", count: 2, tier: "improved" },
    { category: "institutional", sub_type: "clinic", count: 1, tier: "improved" },
  ],
  "Peri-urban": [
    { category: "residential", sub_type: "household", count: 500, tier: "basic" },
    { category: "residential", sub_type: "improved_household", count: 100, tier: "improved" },
    { category: "commercial", sub_type: "shop", count: 50, tier: "basic" },
    { category: "commercial", sub_type: "restaurant", count: 10, tier: "basic" },
    { category: "institutional", sub_type: "school", count: 3, tier: "improved" },
    { category: "institutional", sub_type: "hospital", count: 1, tier: "anchor" },
  ],
};

export function StepCustomers() {
  const {
    register,
    control,
    watch,
    formState: { errors },
  } = useFormContext<SiteFormData>();

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "customers",
  });

  const customers = watch("customers");
  const totalCount = customers?.reduce((sum, c) => sum + (c.count || 0), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Total customers: <span className="font-semibold text-foreground">{totalCount}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {Object.keys(PRESETS).map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                replace(
                  PRESETS[preset].map((p) => ({
                    ...p,
                    estimated_load_kw: null,
                    operating_hours: "",
                  }))
                )
              }
            >
              {preset}
            </Button>
          ))}
        </div>
      </div>

      {fields.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No customer segments added. Use a preset or add manually.
        </p>
      )}

      {fields.map((field, index) => (
        <div
          key={field.id}
          className="grid grid-cols-[1fr_1fr_80px_100px_40px] items-end gap-2 rounded-lg border bg-card p-3"
        >
          <div>
            <Label className="text-xs">Category</Label>
            <select
              className="flex h-8 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:border-ring"
              {...register(`customers.${index}.category`)}
            >
              <option value="">Select...</option>
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.replace("_", " ")}
                </option>
              ))}
            </select>
            {errors.customers?.[index]?.category && (
              <p className="text-xs text-red-600">Required</p>
            )}
          </div>

          <div>
            <Label className="text-xs">Sub-type</Label>
            <select
              className="flex h-8 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:border-ring"
              {...register(`customers.${index}.sub_type`)}
            >
              <option value="">Select...</option>
              {(
                SUB_TYPE_OPTIONS[customers?.[index]?.category] ??
                Object.values(SUB_TYPE_OPTIONS).flat()
              ).map((st) => (
                <option key={st} value={st}>
                  {st.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs">Count</Label>
            <Input
              type="number"
              min={1}
              className="h-8"
              {...register(`customers.${index}.count`, { valueAsNumber: true })}
            />
          </div>

          <div>
            <Label className="text-xs">Tier</Label>
            <select
              className="flex h-8 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:border-ring"
              {...register(`customers.${index}.tier`)}
            >
              {TIER_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => remove(index)}
            className="text-red-500 hover:text-red-700"
          >
            X
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() =>
          append({
            category: "",
            sub_type: "",
            count: 1,
            tier: "basic",
            estimated_load_kw: null,
            operating_hours: "",
          })
        }
      >
        + Add Customer Segment
      </Button>
    </div>
  );
}
