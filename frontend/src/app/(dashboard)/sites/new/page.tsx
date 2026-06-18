"use client";

import { WizardShell } from "@/components/wizard/wizard-shell";

export default function NewSitePage() {
  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl font-bold">Create New Site</h1>
      <WizardShell mode="create" />
    </div>
  );
}
