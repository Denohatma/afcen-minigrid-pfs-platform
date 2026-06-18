export type OrgRole = "admin" | "analyst" | "viewer";

export function useRole() {
  return {
    role: "admin" as OrgRole,
    isLoaded: true,
    canEdit: true,
    canRun: true,
    canManageOrg: true,
  };
}
