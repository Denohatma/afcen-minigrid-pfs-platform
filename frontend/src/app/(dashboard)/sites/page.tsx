"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function SitesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["sites"],
    queryFn: () => api.sites.list(),
  });

  const deleteSite = useMutation({
    mutationFn: (id: string) => api.sites.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      toast.success("Site deleted");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const cloneSite = useMutation({
    mutationFn: (id: string) => api.sites.clone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      toast.success("Site cloned");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-2xl font-bold">Sites</h1>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-lg border bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const sites = data?.sites ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Sites</h1>
        <Link href="/sites/new">
          <Button>New Site</Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          Backend not connected. Configure BACKEND_URL to enable API features.
        </div>
      )}

      {sites.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <h3 className="text-lg font-semibold">No sites yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first minigrid site to get started.
          </p>
          <Link href="/sites/new" className="mt-4">
            <Button>Create Site</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <div
              key={site.id}
              className="rounded-lg border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <Link href={`/sites/${site.id}`}>
                <h3 className="font-heading font-semibold text-foreground">
                  {site.site_data?.site_name || "Unnamed Site"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {site.site_data?.district && `${site.site_data.district} LGA, `}
                  {site.site_data?.province && `${site.site_data.province} State`}
                </p>
                {site.site_data?.disco_name && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    DisCo: {site.site_data.disco_name} | Type: {site.site_data.minigrid_type?.replace("_", " ") || "isolated"}
                  </p>
                )}
              </Link>
              <div className="mt-3 flex gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-medium ${
                  site.status === "completed" ? "bg-green-100 text-green-700" :
                  site.status === "running" ? "bg-blue-100 text-blue-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {site.status || "draft"}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.preventDefault(); cloneSite.mutate(site.id); }}
                >
                  Clone
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={(e) => {
                    e.preventDefault();
                    if (confirm("Delete this site?")) deleteSite.mutate(site.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
