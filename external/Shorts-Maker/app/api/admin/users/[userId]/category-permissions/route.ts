import { NextRequest, NextResponse } from "next/server";
import { recordAuditLogSafely } from "@/lib/audit/server";
import { isAdminSessionUser, requireAuthenticatedSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import {
  getUserCategoryAccessPolicy,
  listUserCategoryPermissionAssignments,
  setUserCategoryPermissions,
  type CategoryAccessMode,
  type CategoryPermissionAssignment,
  type CategoryPermissionLevel,
} from "@/lib/auth/category-permissions";
import { getAuthUserById } from "@/lib/auth/store";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { selectSupabaseRows } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PublishCategoryRow = {
  customer_key: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function asAccessMode(value: unknown): CategoryAccessMode {
  return value === "selected" || value === "none" ? value : "all";
}

function asAccessLevel(value: unknown): CategoryPermissionLevel {
  return value === "view" || value === "edit" || value === "publish" ? value : "manage";
}

function asCategoryAssignments(value: unknown): CategoryPermissionAssignment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const category = asString(row.category);
      if (!category) return null;
      return {
        category,
        accessLevel: asAccessLevel(row.accessLevel),
      };
    })
    .filter((item): item is CategoryPermissionAssignment => Boolean(item));
}

async function listOwnedCategories(userId: string): Promise<string[]> {
  const rows = await selectSupabaseRows<PublishCategoryRow>("publish_customers", {
    filters: {
      user_id: userId.trim(),
      deleted_at_ms: null,
    },
    orderBy: {
      column: "created_at_ms",
      ascending: true,
    },
    limit: 5000,
  });
  return Array.from(new Set(rows.map((row) => asString(row.customer_key)).filter(Boolean)));
}

export async function GET(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const user = requireAuthenticatedSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  if (!isAdminSessionUser(user)) return toForbiddenApiResponse("관리자만 카테고리 권한을 볼 수 있습니다.");

  const { userId } = await context.params;
  const targetUser = await getAuthUserById(asString(userId));
  if (!targetUser || targetUser.role === "system") {
    return toApiErrorResponse("대상 사용자를 찾을 수 없습니다.", {
      status: 404,
      errorCode: "AUTH_USER_NOT_FOUND",
      retryable: false,
    });
  }

  const ownedCategories = await listOwnedCategories(targetUser.id);
  const [policy, grantedCategoryPermissions] = await Promise.all([
    getUserCategoryAccessPolicy(targetUser.id),
    listUserCategoryPermissionAssignments(targetUser.id),
  ]);
  return NextResponse.json({
    ok: true,
    user: {
      id: targetUser.id,
      loginId: targetUser.loginId,
      displayName: targetUser.displayName,
    },
    categories: ownedCategories,
    accessMode: grantedCategoryPermissions.length > 0 && policy.accessMode === "all" ? "selected" : policy.accessMode,
    allAccessLevel: policy.allAccessLevel,
    grantedCategoryPermissions: grantedCategoryPermissions.filter((entry) => ownedCategories.includes(entry.category)),
    grantedCategories: grantedCategoryPermissions.map((entry) => entry.category).filter((category) => ownedCategories.includes(category)),
    hasCategoryRestrictions: policy.accessMode !== "all" || grantedCategoryPermissions.length > 0,
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const user = requireAuthenticatedSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  if (!isAdminSessionUser(user)) return toForbiddenApiResponse("관리자만 카테고리 권한을 수정할 수 있습니다.");

  try {
    const { userId } = await context.params;
    const targetUser = await getAuthUserById(asString(userId));
    if (!targetUser || targetUser.role === "system") {
      return toApiErrorResponse("대상 사용자를 찾을 수 없습니다.", {
        status: 404,
        errorCode: "AUTH_USER_NOT_FOUND",
        retryable: false,
      });
    }
    if (targetUser.role === "admin") {
      return toApiErrorResponse("관리자 계정에는 카테고리 제한을 적용할 수 없습니다.", {
        status: 400,
        errorCode: "AUTH_CATEGORY_PERMISSIONS_ADMIN_NOT_ALLOWED",
        retryable: false,
      });
    }

    const body = await request.json().catch(() => ({}));
    const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const accessMode = asAccessMode(row.accessMode);
    const allAccessLevel = asAccessLevel(row.allAccessLevel);
    const requestedAssignments = asCategoryAssignments(row.categories);
    const fallbackRequestedCategories = asStringArray(row.categories).map((category) => ({
      category,
      accessLevel: "manage" as CategoryPermissionLevel,
    }));
    const ownedCategories = await listOwnedCategories(targetUser.id);
    const allowedSet = new Set(ownedCategories);
    const nextAssignments = (requestedAssignments.length > 0 ? requestedAssignments : fallbackRequestedCategories).filter((entry) =>
      allowedSet.has(entry.category)
    );
    const saved = await setUserCategoryPermissions({
      userId: targetUser.id,
      accessMode,
      allAccessLevel,
      categories: nextAssignments,
    });

    await recordAuditLogSafely({
      user,
      request,
      action: "admin.category_permissions_updated",
      resourceType: "user",
      resourceId: targetUser.id,
      resourceLabel: targetUser.displayName,
      detail:
        saved.accessMode === "none"
          ? `${targetUser.displayName} 사용자를 모든 고객(category) 차단 상태로 변경했습니다.`
          : saved.accessMode === "all"
            ? `${targetUser.displayName} 사용자를 전체 고객(category) ${saved.allAccessLevel} 권한으로 변경했습니다.`
            : `${targetUser.displayName} 사용자에게 ${saved.categories.length}개 고객(category) 권한을 저장했습니다.`,
      metadata: {
        targetLoginId: targetUser.loginId,
        accessMode: saved.accessMode,
        allAccessLevel: saved.allAccessLevel,
        grantedCategoryPermissions: saved.categories,
      },
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: targetUser.id,
        loginId: targetUser.loginId,
        displayName: targetUser.displayName,
      },
      categories: ownedCategories,
      accessMode: saved.accessMode,
      allAccessLevel: saved.allAccessLevel,
      grantedCategoryPermissions: saved.categories,
      grantedCategories: saved.categories.map((entry) => entry.category),
      hasCategoryRestrictions: saved.accessMode !== "all",
    });
  } catch (error) {
    return toApiErrorResponse(error instanceof Error ? error.message : String(error), {
      status: 400,
      errorCode: "AUTH_CATEGORY_PERMISSIONS_UPDATE_FAILED",
      retryable: false,
    });
  }
}
