import { NextRequest, NextResponse } from "next/server";
import { recordAuditLogSafely } from "@/lib/audit/server";
import { canEditCategory, getCategoryAccessScope, isCategoryAccessible } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { appendCategoryVersionHistory, getCategoryVersionHistoryEntry, listCategoryVersionHistory } from "@/lib/publish/category-version-history";
import type { PublishMetadata } from "@/lib/publish/category-metadata";
import { setPublishCategoryMetadata, setPublishCategoryBranding } from "@/lib/publish/publish-store";
import type { TemplateBrandingSettings } from "@/lib/publish/template-branding";
import type { PublishCategory } from "@/lib/publish/types";
import { normalizeCategory } from "@/lib/publish/categories";
import { normalizeStudioTemplateId, type StudioTemplateId } from "@/types/studio-template";

export const runtime = "nodejs";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asCategory(value: unknown): PublishCategory | null {
  const normalized = normalizeCategory(asString(value));
  return normalized || null;
}

function asTemplateId(value: unknown): StudioTemplateId {
  return normalizeStudioTemplateId(value);
}

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  const category = asCategory(request.nextUrl.searchParams.get("category"));
  const templateId = asTemplateId(request.nextUrl.searchParams.get("templateId"));
  if (!category) {
    return toApiErrorResponse("유효한 카테고리 값이 필요합니다.", {
      status: 400,
      errorCode: "CATEGORY_INVALID",
      retryable: false,
    });
  }

  const scope = await getCategoryAccessScope({
    actorRole: authUser.role === "admin" ? "admin" : "member",
    workspaceUserId: user.id,
  });
  if (!isCategoryAccessible(scope, category)) {
    return toForbiddenApiResponse("허용된 고객(category)만 조회할 수 있습니다.");
  }

  const [metadataHistory, brandingHistory] = await Promise.all([
    listCategoryVersionHistory({
      userId: user.id,
      category,
      section: "metadata",
      templateId,
      limit: 30,
    }),
    listCategoryVersionHistory({
      userId: user.id,
      category,
      section: "branding",
      limit: 30,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    category,
    templateId,
    metadataHistory,
    brandingHistory,
  });
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;

  try {
    const body = (await request.json()) as {
      category?: unknown;
      section?: unknown;
      versionId?: unknown;
    };
    const category = asCategory(body.category);
    const section = asString(body.section);
    const versionId = asString(body.versionId);
    if (!category) {
      return toApiErrorResponse("유효한 카테고리 값이 필요합니다.", {
        status: 400,
        errorCode: "CATEGORY_INVALID",
        retryable: false,
      });
    }
    if (section !== "metadata" && section !== "branding") {
      return toApiErrorResponse("유효한 section 값이 필요합니다.", {
        status: 400,
        errorCode: "CATEGORY_HISTORY_SECTION_INVALID",
        retryable: false,
      });
    }
    if (!versionId) {
      return toApiErrorResponse("복구할 versionId가 필요합니다.", {
        status: 400,
        errorCode: "CATEGORY_HISTORY_VERSION_ID_REQUIRED",
        retryable: false,
      });
    }

    const scope = await getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });
    if (!canEditCategory(scope, category)) {
      return toForbiddenApiResponse("편집 권한이 있는 고객(category)만 복구할 수 있습니다.");
    }

    const version = await getCategoryVersionHistoryEntry({
      userId: user.id,
      category,
      section,
      versionId,
    });
    if (!version) {
      return toApiErrorResponse("복구할 버전을 찾을 수 없습니다.", {
        status: 404,
        errorCode: "CATEGORY_HISTORY_VERSION_NOT_FOUND",
        retryable: false,
      });
    }

    if (section === "metadata") {
      const payload = version.payload as PublishMetadata;
      const templateId = normalizeStudioTemplateId(version.templateId);
      await setPublishCategoryMetadata(user.id, category, payload, templateId);
      await appendCategoryVersionHistory({
        userId: user.id,
        category,
        section: "metadata",
        templateId,
        payload,
        createdBy: authUser.loginId || authUser.id,
      });
      await recordAuditLogSafely({
        user,
        request,
        action: "category.metadata_restored",
        resourceType: "category",
        resourceId: category,
        resourceLabel: category,
        detail: `${category} 고객 메타데이터를 버전 이력으로 복구했습니다.`,
        metadata: {
          versionId,
          templateId,
        },
      });
      return NextResponse.json({ ok: true });
    }

    const payload = version.payload as TemplateBrandingSettings;
    await setPublishCategoryBranding(user.id, category, payload);
    await appendCategoryVersionHistory({
      userId: user.id,
      category,
      section: "branding",
      payload,
      createdBy: authUser.loginId || authUser.id,
    });
    await recordAuditLogSafely({
      user,
      request,
      action: "category.branding_restored",
      resourceType: "category",
      resourceId: category,
      resourceLabel: category,
      detail: `${category} 고객 브랜딩을 버전 이력으로 복구했습니다.`,
      metadata: {
        versionId,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error instanceof Error ? error.message : String(error), {
      status: 400,
      errorCode: "CATEGORY_HISTORY_RESTORE_INVALID",
      retryable: false,
    });
  }
}
