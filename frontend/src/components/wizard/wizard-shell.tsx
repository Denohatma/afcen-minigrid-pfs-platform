"use client";

import { useState, useCallback } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  siteDataSchema,
  stepSchemas,
  STEP_LABELS,
  DEFAULT_SITE_DATA,
  type SiteFormData,
} from "@/lib/schemas";
import type { SiteData } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { StepIdentity } from "./step-identity";
import { StepSettlement } from "./step-settlement";
import { StepCustomers } from "./step-customers";
import { StepAnchors } from "./step-anchors";
import { StepGridES } from "./step-grid-es";
import { StepFinancial } from "./step-financial";
import { StepReview } from "./step-review";

const STEP_COMPONENTS = [
  StepIdentity,
  StepSettlement,
  StepCustomers,
  StepAnchors,
  StepGridES,
  StepFinancial,
  StepReview,
];

interface WizardShellProps {
  initialData?: SiteFormData;
  siteId?: string;
  mode: "create" | "edit";
}

export function WizardShell({ initialData, siteId, mode }: WizardShellProps) {
  const [step, setStep] = useState(0);
  const router = useRouter();
  const queryClient = useQueryClient();

  const methods = useForm<SiteFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(siteDataSchema) as any,
    defaultValues: initialData ?? DEFAULT_SITE_DATA,
    mode: "onChange",
  });

  const createSite = useMutation({
    mutationFn: (data: SiteFormData) => api.sites.create(data as unknown as SiteData),
    onSuccess: (site) => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      toast.success("Site created successfully");
      router.push(`/sites/${site.id}`);
    },
    onError: (err) => toast.error(`Failed to create site: ${(err as Error).message}`),
  });

  const updateSite = useMutation({
    mutationFn: (data: SiteFormData) =>
      api.sites.update(siteId!, data as unknown as SiteData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      queryClient.invalidateQueries({ queryKey: ["site", siteId] });
      toast.success("Site saved successfully");
      router.push(`/sites/${siteId}`);
    },
    onError: (err) => toast.error(`Failed to save: ${(err as Error).message}`),
  });

  const autoSave = useCallback(async () => {
    if (mode === "edit" && siteId) {
      const data = methods.getValues();
      try {
        await api.sites.update(siteId, data as unknown as SiteData);
      } catch {
        // Silent fail for auto-save
      }
    }
  }, [mode, siteId, methods]);

  const validateCurrentStep = async (): Promise<boolean> => {
    if (step === 6) return true; // Review step has no validation
    const schema = stepSchemas[step];
    const values = methods.getValues();
    const result = schema.safeParse(values);
    if (!result.success) {
      // Trigger validation display on relevant fields
      const fieldNames = Object.keys(schema.shape) as Array<keyof SiteFormData>;
      await methods.trigger(fieldNames);
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    const valid = await validateCurrentStep();
    if (!valid) return;
    await autoSave();
    setStep((s) => Math.min(s + 1, 6));
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = methods.handleSubmit((data) => {
    if (mode === "create") {
      createSite.mutate(data);
    } else {
      updateSite.mutate(data);
    }
  });

  const StepComponent = STEP_COMPONENTS[step];
  const isSubmitting = createSite.isPending || updateSite.isPending;
  const error = createSite.error || updateSite.error;

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center gap-1">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-1 flex-1">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors w-full",
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                  ? "bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer"
                  : "bg-muted text-muted-foreground"
              )}
              disabled={i > step}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0",
                  i === step
                    ? "bg-primary-foreground text-primary"
                    : i < step
                    ? "bg-primary/30 text-primary-foreground"
                    : "bg-muted-foreground/20 text-muted-foreground"
                )}
              >
                {i < step ? "\u2713" : i + 1}
              </span>
              <span className="hidden lg:inline truncate">{label}</span>
            </button>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-muted">
        <div
          className="h-1 rounded-full bg-primary transition-all duration-300"
          style={{ width: `${((step + 1) / 7) * 100}%` }}
        />
      </div>

      {/* Form Content */}
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit}>
          <div className="min-h-[400px]">
            <h2 className="mb-4 text-lg font-semibold font-heading text-foreground">
              Step {step + 1}: {STEP_LABELS[step]}
            </h2>
            <StepComponent />
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-600">
              {(error as Error).message}
            </p>
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={step === 0}
            >
              Back
            </Button>
            <div className="flex gap-2">
              {step < 6 ? (
                <Button type="button" onClick={handleNext}>
                  Next
                </Button>
              ) : (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? "Saving..."
                    : mode === "create"
                    ? "Create Site"
                    : "Save Changes"}
                </Button>
              )}
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
