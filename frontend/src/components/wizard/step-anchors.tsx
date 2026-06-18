"use client";

import { useFormContext, useFieldArray } from "react-hook-form";
import type { SiteFormData } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LOAD_TYPE_OPTIONS = [
  "hospital",
  "school",
  "administration",
  "fish_chilling",
  "grain_mill",
  "water_pump",
  "telecom_tower",
  "cold_storage",
  "cold_room",
  "water_packaging",
  "market_stall",
  "polytechnic",
  "welding_shop",
  "other",
];

const COMMON_ANCHORS = [
  { load_type: "hospital", name: "District Hospital", count: 1, estimated_load_kw: 15, operating_hours: "", load_shape: "institutional" },
  { load_type: "school", name: "Primary School", count: 1, estimated_load_kw: 5, operating_hours: "", load_shape: "institutional" },
  { load_type: "administration", name: "Admin Building", count: 1, estimated_load_kw: 3, operating_hours: "", load_shape: "institutional" },
];

export function StepAnchors() {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<SiteFormData>();

  const { fields, append, remove } = useFieldArray({
    control,
    name: "anchors",
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Anchor loads are large institutional or productive use loads.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            COMMON_ANCHORS.forEach((a) =>
              append({ ...a, estimated_load_kw: a.estimated_load_kw })
            );
          }}
        >
          Add Common Anchors
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No anchor loads added. These are optional but improve PFS accuracy.
        </p>
      )}

      {fields.map((field, index) => (
        <div
          key={field.id}
          className="grid grid-cols-[1fr_1fr_80px_100px_40px] items-end gap-2 rounded-lg border bg-card p-3"
        >
          <div>
            <Label className="text-xs">Load Type</Label>
            <select
              className="flex h-8 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:border-ring"
              {...register(`anchors.${index}.load_type`)}
            >
              <option value="">Select...</option>
              {LOAD_TYPE_OPTIONS.map((lt) => (
                <option key={lt} value={lt}>
                  {lt.replace("_", " ")}
                </option>
              ))}
            </select>
            {errors.anchors?.[index]?.load_type && (
              <p className="text-xs text-red-600">Required</p>
            )}
          </div>

          <div>
            <Label className="text-xs">Name</Label>
            <Input
              className="h-8"
              placeholder="e.g. District Hospital"
              {...register(`anchors.${index}.name`)}
            />
          </div>

          <div>
            <Label className="text-xs">Count</Label>
            <Input
              type="number"
              min={1}
              className="h-8"
              {...register(`anchors.${index}.count`, { valueAsNumber: true })}
            />
          </div>

          <div>
            <Label className="text-xs">Load (kW)</Label>
            <Input
              type="number"
              step="any"
              className="h-8"
              placeholder="Optional"
              {...register(`anchors.${index}.estimated_load_kw`, {
                setValueAs: (v: string) => (v === "" ? null : Number(v)),
              })}
            />
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
            load_type: "",
            name: "",
            count: 1,
            estimated_load_kw: null,
            operating_hours: "",
            load_shape: "institutional",
          })
        }
      >
        + Add Anchor Load
      </Button>
    </div>
  );
}
