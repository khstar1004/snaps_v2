import { NextRequest, NextResponse } from "next/server";
import { canManageWorkspace, filterCategoriesByAccess, getCategoryAccessScope, toWorkspacePermissionsSummary } from "@/lib/auth/category-permissions";
import { recordAuditLogSafely } from "@/lib/audit/server";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { DEFAULT_PUBLISH_CATEGORIES, normalizeCategory, toCategoryLabel } from "@/lib/publish/categories";
import { hasAssetStorageConfig } from "@/lib/supabase/storage";
import {
  addPublishCategory,
  deletePublishCategory,
  listGlobalPublishCustomers,
  listPublishCategories,
  repairPublishCategoriesFromChannels,
  renamePublishCategory,
  resolvePublishCustomerOwnerUserId,
} from "@/lib/publish/publish-store";

export const runtime = "nodejs";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  const scope = await getCategoryAccessScope({
    actorRole: authUser.role === "admin" ? "admin" : "member",
    workspaceUserId: user.id,
  });
  if (authUser.role !== "admin" && canManageWorkspace(scope)) {
    await repairPublishCategoriesFromChannels(user.id);
  }
  const categories = filterCategoriesByAccess(
    authUser.role === "admin" ? await listGlobalPublishCustomers() : await listPublishCategories(user.id),
    scope,
    (category) => category
  );
  return NextResponse.json({
    ok: true,
    categories: categories.map((category) => ({
      key: category,
      label: toCategoryLabel(category),
    })),
    workspacePermissions: toWorkspacePermissionsSummary(scope),
    storageReady: hasAssetStorageConfig(),
  });
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  const scope = await getCategoryAccessScope({
    actorRole: authUser.role === "admin" ? "admin" : "member",
    workspaceUserId: user.id,
  });
  try {
    const body = (await request.json()) as {
      action?: unknown;
      category?: unknown;
      currentCategory?: unknown;
      nextCategory?: unknown;
    };

    const action = asString(body.action);
    if (!canManageWorkspace(scope) && authUser.role !== "admin") {
      return toForbiddenApiResponse("고객 추가/변경/삭제는 전체 권한 사용자만 가능합니다.");
    }
    if (action === "add") {
      const category = normalizeCategory(body.category);
      if (!category) {
        return toApiErrorResponse("고객 값이 필요합니다.", {
          status: 400,
          errorCode: "CATEGORY_REQUIRED",
          retryable: false,
        });
      }
      await addPublishCategory(user.id, category);
      await recordAuditLogSafely({
        user,
        request,
        action: "category.added",
        resourceType: "category",
        resourceId: category,
        resourceLabel: category,
        detail: `${category} 고객(category)를 추가했습니다.`,
      });
      const categories = authUser.role === "admin" ? await listGlobalPublishCustomers() : await listPublishCategories(user.id);
      return NextResponse.json({ ok: true, categories: categories.map((key) => ({ key, label: toCategoryLabel(key) })) });
    }

    if (action === "rename") {
      const currentCategory = normalizeCategory(body.currentCategory);
      const nextCategory = normalizeCategory(body.nextCategory);
      if (!currentCategory || !nextCategory) {
        return toApiErrorResponse("현재 고객명과 변경할 고객명이 필요합니다.", {
          status: 400,
          errorCode: "CATEGORY_RENAME_FIELDS_REQUIRED",
          retryable: false,
        });
      }
      const targetUserId =
        authUser.role === "admin" ? (await resolvePublishCustomerOwnerUserId(currentCategory, user.id)) || user.id : user.id;
      await renamePublishCategory(targetUserId, currentCategory, nextCategory);
      await recordAuditLogSafely({
        user,
        request,
        action: "category.renamed",
        resourceType: "category",
        resourceId: nextCategory,
        resourceLabel: nextCategory,
        detail: `${currentCategory} 고객명을 ${nextCategory}(으)로 변경했습니다.`,
        metadata: {
          previousCategory: currentCategory,
        },
      });
      const nextCategories = authUser.role === "admin" ? await listGlobalPublishCustomers() : await listPublishCategories(user.id);
      return NextResponse.json({ ok: true, categories: nextCategories.map((key) => ({ key, label: toCategoryLabel(key) })) });
    }

    if (action === "delete") {
      const category = normalizeCategory(body.category);
      if (!category) {
        return toApiErrorResponse("고객 값이 필요합니다.", {
          status: 400,
          errorCode: "CATEGORY_REQUIRED",
          retryable: false,
        });
      }
      if (DEFAULT_PUBLISH_CATEGORIES.includes(category)) {
        return toApiErrorResponse("기본 고객은 삭제할 수 없습니다.", {
          status: 400,
          errorCode: "CATEGORY_DEFAULT_CANNOT_DELETE",
          retryable: false,
        });
      }
      const targetUserId =
        authUser.role === "admin" ? (await resolvePublishCustomerOwnerUserId(category, user.id)) || user.id : user.id;
      await deletePublishCategory(targetUserId, category, {
        deletedBy: authUser.loginId || authUser.id,
        reason: "manual_trash",
      });
      await recordAuditLogSafely({
        user,
        request,
        action: "category.deleted",
        resourceType: "category",
        resourceId: category,
        resourceLabel: category,
        detail: `${category} 고객(category)를 휴지통으로 이동했습니다.`,
      });
      const categories = authUser.role === "admin" ? await listGlobalPublishCustomers() : await listPublishCategories(user.id);
      return NextResponse.json({ ok: true, categories: categories.map((key) => ({ key, label: toCategoryLabel(key) })) });
    }

    return toApiErrorResponse("유효한 action 값이 필요합니다.", {
      status: 400,
      errorCode: "CATEGORY_ACTION_INVALID",
      retryable: false,
    });
  } catch (e) {
    return toApiErrorResponse(e instanceof Error ? e.message : String(e), {
      status: 400,
      errorCode: "CATEGORY_REQUEST_INVALID",
      retryable: false,
    });
  }
}
