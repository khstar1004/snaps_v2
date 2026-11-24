import type { WorkspacePermissionLevel, WorkspacePermissionsSummary } from "@/lib/publish/client-types";

const LEVEL_RANK: Record<WorkspacePermissionLevel | "none", number> = {
  none: 0,
  view: 1,
  edit: 2,
  publish: 3,
  manage: 4,
};

const DEFAULT_SUMMARY: WorkspacePermissionsSummary = {
  accessMode: "all",
  allAccessLevel: "manage",
  hasRestrictions: false,
  categoryLevels: {},
  canManageWorkspace: true,
};

function normalizeCategoryKey(category?: string | null): string {
  return typeof category === "string" ? category.trim() : "";
}

export function resolveWorkspacePermissionsSummary(
  summary?: WorkspacePermissionsSummary | null
): WorkspacePermissionsSummary {
  if (!summary) return DEFAULT_SUMMARY;
  return {
    accessMode: summary.accessMode || "all",
    allAccessLevel: summary.allAccessLevel || "manage",
    hasRestrictions: Boolean(summary.hasRestrictions),
    categoryLevels: summary.categoryLevels || {},
    canManageWorkspace:
      Boolean(summary.canManageWorkspace) ||
      (summary.accessMode === "all" && summary.allAccessLevel === "manage"),
  };
}

export function getWorkspaceCategoryPermissionLevel(
  summary: WorkspacePermissionsSummary | null | undefined,
  category?: string | null
): WorkspacePermissionLevel | "none" {
  const resolved = resolveWorkspacePermissionsSummary(summary);
  if (resolved.accessMode === "none") return "none";
  if (resolved.accessMode === "all") return resolved.allAccessLevel;
  const safeCategory = normalizeCategoryKey(category);
  if (!safeCategory) return "none";
  return resolved.categoryLevels[safeCategory] || "none";
}

export function hasWorkspaceCategoryCapability(
  summary: WorkspacePermissionsSummary | null | undefined,
  category: string | null | undefined,
  requiredLevel: WorkspacePermissionLevel
): boolean {
  return LEVEL_RANK[getWorkspaceCategoryPermissionLevel(summary, category)] >= LEVEL_RANK[requiredLevel];
}

export function canViewWorkspaceCategory(
  summary: WorkspacePermissionsSummary | null | undefined,
  category?: string | null
): boolean {
  return hasWorkspaceCategoryCapability(summary, category, "view");
}

export function canEditWorkspaceCategory(
  summary: WorkspacePermissionsSummary | null | undefined,
  category?: string | null
): boolean {
  return hasWorkspaceCategoryCapability(summary, category, "edit");
}

export function canPublishWorkspaceCategory(
  summary: WorkspacePermissionsSummary | null | undefined,
  category?: string | null
): boolean {
  return hasWorkspaceCategoryCapability(summary, category, "publish");
}

export function canManageWorkspaceSummary(summary: WorkspacePermissionsSummary | null | undefined): boolean {
  return resolveWorkspacePermissionsSummary(summary).canManageWorkspace;
}

export function toWorkspacePermissionLevelLabel(level: WorkspacePermissionLevel | "none"): string {
  if (level === "manage") return "관리";
  if (level === "publish") return "발행";
  if (level === "edit") return "편집";
  if (level === "view") return "조회";
  return "없음";
}
