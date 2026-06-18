"use client";

import { useFormContext } from "react-hook-form";
import type { SiteFormData } from "@/lib/schemas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TERRAIN_OPTIONS = [
  { value: "flat", label: "Flat" },
  { value: "rolling", label: "Rolling" },
  { value: "hilly", label: "Hilly" },
  { value: "mountainous", label: "Mountainous" },
];

export function StepSettlement() {
  const {
    register,
    formState: { errors },
  } = useFormContext<SiteFormData>();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="population">Population</Label>
        <Input
          id="population"
          type="number"
          min={0}
          {...register("population", { valueAsNumber: true })}
        />
        {errors.population && (
          <p className="mt-1 text-xs text-red-600">{errors.population.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="mapped_structures">Mapped Structures</Label>
        <Input
          id="mapped_structures"
          type="number"
          min={0}
          {...register("mapped_structures", { valueAsNumber: true })}
        />
      </div>

      <div>
        <Label htmlFor="settlement_radius_m">Settlement Radius (m)</Label>
        <Input
          id="settlement_radius_m"
          type="number"
          min={100}
          max={50000}
          {...register("settlement_radius_m", { valueAsNumber: true })}
        />
        {errors.settlement_radius_m && (
          <p className="mt-1 text-xs text-red-600">
            {errors.settlement_radius_m.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="terrain">Terrain</Label>
        <select
          id="terrain"
          className="flex h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          {...register("terrain")}
        >
          {TERRAIN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <Label htmlFor="access_description">Access Description</Label>
        <textarea
          id="access_description"
          rows={3}
          className="flex w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="Describe road access, nearest town, etc."
          {...register("access_description")}
        />
      </div>
    </div>
  );
}
