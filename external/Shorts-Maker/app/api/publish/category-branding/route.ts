import { NextRequest, NextResponse } from "next/server";
import { recordAuditLogSafely } from "@/lib/audit/server";
import { canEditCategory, filterCategoryMapByAccess, getCategoryAccessScope, isCategoryAccessible } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { appendCategoryVersionHistory } from "@/lib/publish/category-version-history";
import { getDefaultTemplateBranding, listDefaultTemplateBrandings, type TemplateBrandingSettings } from "@/lib/publish/template-branding";
import type { PublishCategory } from "@/lib/publish/types";
import {
  getPublishCategoryBranding,
  listGlobalPublishCategoryBrandings,
  listPublishCategoryBrandings,
  resolvePublishCustomerOwnerUserId,
  setPublishCategoryBranding,
} from "@/lib/publish/publish-store";
import { normalizeCategory } from "@/lib/publish/categories";

export const runtime = "nodejs";

function asCategory(value: string | null): PublishCategory | null {
  const normalized = normalizeCategory(value);
  return normalized || null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseBranding(input: unknown): TemplateBrandingSettings | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const headerTitle = asString(row.headerTitle);
  const headerAccentText = asString(row.headerAccentText);
  const headerColor = asString(row.headerColor);
  const footerColor = asString(row.footerColor);
  const infoLineText = asString(row.infoLineText);
  const fontFamily = asString(row.fontFamily);
  const imageRounded = typeof row.imageRounded === "boolean" ? row.imageRounded : true;
  if (!headerColor || !footerColor) return null;
  return {
    headerTitle,
    headerAccentText,
    headerColor,
    footerColor,
    infoLineText,
    fontFamily,
    imageRounded,
  };
}

function mergeWithDefault(category: PublishCategory, input?: TemplateBrandingSettings | null): TemplateBrandingSettings {
  const base = getDefaultTemplateBranding(category);
  if (!input) return base;
  return {
    headerTitle: input.headerTitle,
    headerAccentText: input.headerAccentText ?? base.headerAccentText,
    headerColor: input.headerColor || base.headerColor,
    footerColor: input.footerColor || base.footerColor,
    infoLineText: input.infoLineText || base.infoLineText,
    fontFamily: input.fontFamily || base.fontFamily,
    imageRounded: typeof input.imageRounded === "boolean" ? input.imageRounded : base.imageRounded,
  };
}

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  const scope = await getCategoryAccessScope({
    actorRole: authUser.role === "admin" ? "admin" : "member",
    workspaceUserId: user.id,
  });
  const category = asCategory(request.nextUrl.searchParams.get("category"));
  if (category) {
    if (!isCategoryAccessible(scope, category)) {
      return toForbiddenApiResponse("허용된 고객(category)만 조회할 수 있습니다.");
    }
    const targetUserId =
      authUser.role === "admin" ? (await resolvePublishCustomerOwnerUserId(category, user.id)) || user.id : user.id;
    const stored = await getPublishCategoryBranding(targetUserId, category);
    return NextResponse.json({
      ok: true,
      category,
      branding: mergeWithDefault(category, stored),
      isCustom: Boolean(stored),
    });
  }

  const defaults = listDefaultTemplateBrandings();
  const custom = authUser.role === "admin" ? await listGlobalPublishCategoryBrandings() : await listPublishCategoryBrandings(user.id);
  const merged: Record<PublishCategory, TemplateBrandingSettings> = {};
  for (const [category, branding] of Object.entries(defaults)) {
    merged[category] = mergeWithDefault(category, branding);
  }
  for (const [category, branding] of Object.entries(custom)) {
    merged[category] = mergeWithDefault(category, branding);
  }

  return NextResponse.json({
    ok: true,
    categoryBranding: filterCategoryMapByAccess(merged, scope),
    customCategoryBranding: filterCategoryMapByAccess(custom, scope),
  });
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  try {
    const body = (await request.json()) as { category?: unknown; branding?: unknown; reset?: unknown };
    const category = asCategory(asString(body.category));
    const scope = await getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });
    if (!category) {
      return toApiErrorResponse("유효한 고객 값이 필요합니다.", {
        status: 400,
        errorCode: "CATEGORY_INVALID",
        retryable: false,
      });
    }
    if (!canEditCategory(scope, category)) {
      return toForbiddenApiResponse("편집 권한이 있는 고객(category)만 수정할 수 있습니다.");
    }
    const targetUserId =
      authUser.role === "admin" ? (await resolvePublishCustomerOwnerUserId(category, user.id)) || user.id : user.id;

    if (Boolean(body.reset)) {
      await setPublishCategoryBranding(targetUserId, category, null);
      await recordAuditLogSafely({
        user,
        request,
        action: "category.branding_reset",
        resourceType: "category",
        resourceId: category,
        resourceLabel: category,
        detail: `${category} 고객 브랜딩을 기본값으로 되돌렸습니다.`,
      });
    } else {
      const branding = parseBranding(body.branding);
      if (!branding) {
        return toApiErrorResponse("유효한 브랜딩 값이 필요합니다.", {
          status: 400,
          errorCode: "BRANDING_INVALID",
          retryable: false,
        });
      }
      await setPublishCategoryBranding(targetUserId, category, branding);
      await recordAuditLogSafely({
        user,
        request,
        action: "category.branding_updated",
        resourceType: "category",
        resourceId: category,
        resourceLabel: category,
        detail: `${category} 고객 브랜딩을 수정했습니다.`,
      });
    }

    const stored = await getPublishCategoryBranding(targetUserId, category);
    const mergedBranding = mergeWithDefault(category, stored);
    await appendCategoryVersionHistory({
      userId: targetUserId,
      category,
      section: "branding",
      payload: mergedBranding,
      createdBy: authUser.loginId || authUser.id,
    });
    return NextResponse.json({
      ok: true,
      category,
      branding: mergedBranding,
      isCustom: Boolean(stored),
    });
  } catch (e) {
    return toApiErrorResponse(e instanceof Error ? e.message : String(e), {
      status: 400,
      errorCode: "CATEGORY_BRANDING_REQUEST_INVALID",
      retryable: false,
    });
  }
}
