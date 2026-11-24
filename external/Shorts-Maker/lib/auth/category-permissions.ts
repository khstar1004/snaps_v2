import { deleteSupabaseRows, selectSupabaseRows, upsertSupabaseRows } from "@/lib/supabase/server";

type UserCategoryPermissionRow = {
  user_id: string;
  category_key: string;
  access_level?: string | null;
  created_at_ms: number;
  updated_at_ms: number;
};

type UserCategoryAccessPolicyRow = {
  user_id: string;
  access_mode?: string | null;
  all_access_level?: string | null;
  updated_at_ms: number;
};

export type CategoryPermissionLevel = "view" | "edit" | "publish" | "manage";
export type CategoryAccessMode = "all" | "selected" | "none";

export type CategoryPermissionAssignment = {
  category: string;
  accessLevel: CategoryPermissionLevel;
};

export type CategoryAccessScope = {
  accessMode: CategoryAccessMode;
  allAccessLevel: CategoryPermissionLevel;
  hasRestrictions: boolean;
  allowedCategories: string[] | null;
  allowedCategorySet: Set<string> | null;
  categoryPermissions: Map<string, CategoryPermissionLevel>;
};

export type WorkspacePermissionsSummary = {
  accessMode: CategoryAccessMode;
  allAccessLevel: CategoryPermissionLevel;
  hasRestrictions: boolean;
  categoryLevels: Record<string, CategoryPermissionLevel>;
  canManageWorkspace: boolean;
};

const CATEGORY_PERMISSION_LEVELS: CategoryPermissionLevel[] = ["view", "edit", "publish", "manage"];
const CATEGORY_PERMISSION_RANK: Record<CategoryPermissionLevel | "none", number> = {
  none: 0,
  view: 1,
  edit: 2,
  publish: 3,
  manage: 4,
};

function normalizeCategoryKey(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUserId(userId: string): string {
  return userId.trim();
}

function normalizeAccessMode(value: unknown): CategoryAccessMode {
  return value === "selected" || value === "none" ? value : "all";
}

function normalizeAccessLevel(value: unknown): CategoryPermissionLevel {
  return CATEGORY_PERMISSION_LEVELS.includes(value as CategoryPermissionLevel) ? (value as CategoryPermissionLevel) : "manage";
}

function isMissingCategoryPermissionsTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('relation "public.app_user_category_permissions" does not exist') ||
    message.includes('relation "app_user_category_permissions" does not exist')
  );
}

function isMissingCategoryAccessPoliciesTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('relation "public.app_user_category_access_policies" does not exist') ||
    message.includes('relation "app_user_category_access_policies" does not exist')
  );
}

async function listUserCategoryPermissionRows(userId: string): Promise<UserCategoryPermissionRow[]> {
  try {
    return await selectSupabaseRows<UserCategoryPermissionRow>("app_user_category_permissions", {
      filters: {
        user_id: normalizeUserId(userId),
      },
      orderBy: {
        column: "created_at_ms",
        ascending: true,
      },
      limit: 5000,
    });
  } catch (error) {
    if (isMissingCategoryPermissionsTableError(error)) return [];
    throw error;
  }
}

async function getUserCategoryAccessPolicyRow(userId: string): Promise<UserCategoryAccessPolicyRow | null> {
  try {
    const rows = await selectSupabaseRows<UserCategoryAccessPolicyRow>("app_user_category_access_policies", {
      filters: {
        user_id: normalizeUserId(userId),
      },
      limit: 1,
    });
    return rows[0] || null;
  } catch (error) {
    if (isMissingCategoryAccessPoliciesTableError(error)) return null;
    throw error;
  }
}

export async function listUserCategoryPermissions(userId: string): Promise<string[]> {
  const rows = await listUserCategoryPermissionRows(userId);
  return Array.from(new Set(rows.map((row) => normalizeCategoryKey(row.category_key)).filter(Boolean)));
}

export async function listUserCategoryPermissionAssignments(userId: string): Promise<CategoryPermissionAssignment[]> {
  const rows = await listUserCategoryPermissionRows(userId);
  return rows
    .map((row) => ({
      category: normalizeCategoryKey(row.category_key),
      accessLevel: normalizeAccessLevel(row.access_level),
    }))
    .filter((row) => row.category);
}

export async function listUserCategoryPermissionMap(userIds: string[]): Promise<Map<string, CategoryPermissionAssignment[]>> {
  const safeIds = Array.from(new Set(userIds.map(normalizeUserId).filter(Boolean)));
  const result = new Map<string, CategoryPermissionAssignment[]>();
  for (const userId of safeIds) {
    result.set(userId, await listUserCategoryPermissionAssignments(userId));
  }
  return result;
}

export async function getUserCategoryAccessPolicy(userId: string): Promise<{
  accessMode: CategoryAccessMode;
  allAccessLevel: CategoryPermissionLevel;
}> {
  const row = await getUserCategoryAccessPolicyRow(userId);
  return {
    accessMode: normalizeAccessMode(row?.access_mode),
    allAccessLevel: normalizeAccessLevel(row?.all_access_level),
  };
}

export async function setUserCategoryPermissions(input: {
  userId: string;
  accessMode: CategoryAccessMode;
  allAccessLevel?: CategoryPermissionLevel;
  categories: Array<string | CategoryPermissionAssignment>;
}): Promise<{
  accessMode: CategoryAccessMode;
  allAccessLevel: CategoryPermissionLevel;
  categories: CategoryPermissionAssignment[];
}> {
  const safeUserId = normalizeUserId(input.userId);
  if (!safeUserId) {
    throw new Error("userId is required");
  }

  const accessMode = normalizeAccessMode(input.accessMode);
  const allAccessLevel = normalizeAccessLevel(input.allAccessLevel);
  const nextCategories = Array.from(
    new Map(
      input.categories
        .map((item) =>
          typeof item === "string"
            ? { category: normalizeCategoryKey(item), accessLevel: "manage" as CategoryPermissionLevel }
            : { category: normalizeCategoryKey(item.category), accessLevel: normalizeAccessLevel(item.accessLevel) }
        )
        .filter((item) => item.category)
        .sort((left, right) => left.category.localeCompare(right.category, "ko-KR"))
        .map((item) => [item.category, item] as const)
    ).values()
  );

  try {
    await deleteSupabaseRows("app_user_category_permissions", {
      user_id: safeUserId,
    });

    const now = Date.now();
    try {
      await upsertSupabaseRows<UserCategoryAccessPolicyRow>(
        "app_user_category_access_policies",
        [
          {
            user_id: safeUserId,
            access_mode: accessMode,
            all_access_level: allAccessLevel,
            updated_at_ms: now,
          },
        ],
        {
          onConflict: "user_id",
          returning: false,
        }
      );
    } catch (error) {
      if (!isMissingCategoryAccessPoliciesTableError(error)) throw error;
    }

    if (nextCategories.length > 0) {
      await upsertSupabaseRows<UserCategoryPermissionRow>(
        "app_user_category_permissions",
        nextCategories.map((item) => ({
          user_id: safeUserId,
          category_key: item.category,
          access_level: item.accessLevel,
          created_at_ms: now,
          updated_at_ms: now,
        })),
        {
          onConflict: ["user_id", "category_key"],
          returning: false,
        }
      );
    }

    return {
      accessMode,
      allAccessLevel,
      categories: nextCategories,
    };
  } catch (error) {
    if (isMissingCategoryPermissionsTableError(error) || isMissingCategoryAccessPoliciesTableError(error)) {
      return {
        accessMode,
        allAccessLevel,
        categories: nextCategories,
      };
    }
    throw error;
  }
}

export async function getCategoryAccessScope(input: {
  actorRole: "admin" | "member";
  workspaceUserId: string;
}): Promise<CategoryAccessScope> {
  if (input.actorRole === "admin") {
    return {
      accessMode: "all",
      allAccessLevel: "manage",
      hasRestrictions: false,
      allowedCategories: null,
      allowedCategorySet: null,
      categoryPermissions: new Map<string, CategoryPermissionLevel>(),
    };
  }

  const [policy, assignments] = await Promise.all([
    getUserCategoryAccessPolicy(input.workspaceUserId),
    listUserCategoryPermissionAssignments(input.workspaceUserId),
  ]);

  const inferredAccessMode = policy.accessMode === "all" && assignments.length > 0 ? "selected" : policy.accessMode;
  const categoryPermissions = new Map<string, CategoryPermissionLevel>(
    assignments.map((item) => [item.category, item.accessLevel] as const)
  );

  if (inferredAccessMode === "all") {
    return {
      accessMode: "all",
      allAccessLevel: policy.allAccessLevel,
      hasRestrictions: false,
      allowedCategories: null,
      allowedCategorySet: null,
      categoryPermissions,
    };
  }

  if (inferredAccessMode === "none") {
    return {
      accessMode: "none",
      allAccessLevel: policy.allAccessLevel,
      hasRestrictions: true,
      allowedCategories: [],
      allowedCategorySet: new Set<string>(),
      categoryPermissions,
    };
  }

  const allowedCategories = Array.from(categoryPermissions.keys());
  return {
    accessMode: "selected",
    allAccessLevel: policy.allAccessLevel,
    hasRestrictions: true,
    allowedCategories,
    allowedCategorySet: new Set(allowedCategories),
    categoryPermissions,
  };
}

export function getCategoryPermissionLevel(
  scope: CategoryAccessScope,
  category?: string | null
): CategoryPermissionLevel | "none" {
  if (scope.accessMode === "none") return "none";
  if (scope.accessMode === "all") return scope.allAccessLevel;
  const safeCategory = normalizeCategoryKey(category);
  if (!safeCategory) return "none";
  return scope.categoryPermissions.get(safeCategory) || "none";
}

export function hasCategoryCapability(
  scope: CategoryAccessScope,
  category: string | null | undefined,
  requiredLevel: CategoryPermissionLevel
): boolean {
  return CATEGORY_PERMISSION_RANK[getCategoryPermissionLevel(scope, category)] >= CATEGORY_PERMISSION_RANK[requiredLevel];
}

export function canViewCategory(scope: CategoryAccessScope, category?: string | null): boolean {
  return hasCategoryCapability(scope, category, "view");
}

export function canEditCategory(scope: CategoryAccessScope, category?: string | null): boolean {
  return hasCategoryCapability(scope, category, "edit");
}

export function canPublishCategory(scope: CategoryAccessScope, category?: string | null): boolean {
  return hasCategoryCapability(scope, category, "publish");
}

export function canManageCategory(scope: CategoryAccessScope, category?: string | null): boolean {
  return hasCategoryCapability(scope, category, "manage");
}

export function canManageWorkspace(scope: CategoryAccessScope): boolean {
  return scope.accessMode === "all" && scope.allAccessLevel === "manage";
}

export function toWorkspacePermissionsSummary(scope: CategoryAccessScope): WorkspacePermissionsSummary {
  return {
    accessMode: scope.accessMode,
    allAccessLevel: scope.allAccessLevel,
    hasRestrictions: scope.hasRestrictions,
    categoryLevels: Object.fromEntries(scope.categoryPermissions.entries()),
    canManageWorkspace: canManageWorkspace(scope),
  };
}

export function isCategoryAccessible(scope: CategoryAccessScope, category?: string | null): boolean {
  return canViewCategory(scope, category);
}

export function filterCategoriesByAccess<T>(
  rows: T[],
  scope: CategoryAccessScope,
  getCategory: (row: T) => string | null | undefined
): T[] {
  if (!scope.hasRestrictions) return rows;
  return rows.filter((row) => isCategoryAccessible(scope, getCategory(row)));
}

export function filterCategoryMapByAccess<T>(map: Record<string, T>, scope: CategoryAccessScope): Record<string, T> {
  if (!scope.hasRestrictions) return map;
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(map)) {
    if (!isCategoryAccessible(scope, key)) continue;
    next[key] = value;
  }
  return next;
}
