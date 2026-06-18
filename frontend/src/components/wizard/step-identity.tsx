"use client";

import { useFormContext } from "react-hook-form";
import dynamic from "next/dynamic";
import type { SiteFormData } from "@/lib/schemas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SiteBoundaryMap = dynamic(
  () =>
    import("./site-boundary-map").then((mod) => ({ default: mod.SiteBoundaryMap })),
  { ssr: false, loading: () => <div className="h-[350px] rounded-lg border bg-muted animate-pulse" /> }
);

export function StepIdentity() {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<SiteFormData>();

  const lat = watch("coordinates.0") ?? 0;
  const lon = watch("coordinates.1") ?? 0;

  const handleBoundaryChange = (boundary: [number, number][], structureCount: number) => {
    if (boundary.length >= 3) {
      setValue("mapped_structures", structureCount, { shouldDirty: true });
      const avgLat = boundary.reduce((sum, p) => sum + p[0], 0) / boundary.length;
      const avgLon = boundary.reduce((sum, p) => sum + p[1], 0) / boundary.length;
      setValue("coordinates.0", Math.round(avgLat * 1000000) / 1000000, { shouldDirty: true });
      setValue("coordinates.1", Math.round(avgLon * 1000000) / 1000000, { shouldDirty: true });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="site_name">Site Name *</Label>
          <Input
            id="site_name"
            placeholder="e.g. Toto"
            {...register("site_name")}
          />
          {errors.site_name && (
            <p className="mt-1 text-xs text-red-600">{errors.site_name.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="district">LGA</Label>
          <Input id="district" placeholder="e.g. Toto" {...register("district")} />
        </div>

        <div>
          <Label htmlFor="province">State</Label>
          <Input id="province" placeholder="e.g. Nasarawa" {...register("province")} />
        </div>

        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" placeholder="e.g. Nigeria" {...register("country")} />
        </div>

        <div>
          <Label htmlFor="developer">Developer</Label>
          <Input id="developer" placeholder="e.g. AfCEN" {...register("developer")} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="disco_name">DisCo (Distribution Company)</Label>
          <select id="disco_name" {...register("disco_name")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">Select DisCo...</option>
            {["AEDC", "BEDC", "EKEDC", "EEDC", "IBEDC", "IE", "JED", "KE", "KEDCO", "PHEDC", "YEDC"].map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="minigrid_type">Minigrid Type</Label>
          <select id="minigrid_type" {...register("minigrid_type")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="isolated">Isolated</option>
            <option value="undergrid">Undergrid</option>
            <option value="interconnected">Interconnected (IMG)</option>
          </select>
        </div>

        <div>
          <Label htmlFor="lat">Latitude *</Label>
          <Input
            id="lat"
            type="number"
            step="any"
            placeholder="8.39"
            {...register("coordinates.0", { valueAsNumber: true })}
          />
          {errors.coordinates?.[0] && (
            <p className="mt-1 text-xs text-red-600">
              {errors.coordinates[0].message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="lon">Longitude *</Label>
          <Input
            id="lon"
            type="number"
            step="any"
            placeholder="7.09"
            {...register("coordinates.1", { valueAsNumber: true })}
          />
          {errors.coordinates?.[1] && (
            <p className="mt-1 text-xs text-red-600">
              {errors.coordinates[1].message}
            </p>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Site Boundary</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Draw the project boundary on the map. Structures within will be estimated
          automatically and used by the GIS adapter.
        </p>
        <SiteBoundaryMap
          center={[lat, lon]}
          onBoundaryChange={handleBoundaryChange}
        />
      </div>
    </div>
  );
}
