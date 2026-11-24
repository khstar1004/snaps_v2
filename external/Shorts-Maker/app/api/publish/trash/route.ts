import { NextRequest, NextResponse } from "next/server";
import { recordAuditLogSafely } from "@/lib/audit/server";
import { canEditCategory, canManageWorkspace, canPublishCategory, getCategoryAccessScope, isCategoryAccessible } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { toCategoryLabel } from "@/lib/publish/categories";
import {
  listDeletedPublishCategories,
  listDeletedPublishJobs,
  listDeletedVideoAssets,
  listPublishJobs,
  listVideoAssets,
  restoreDeletedPublishCategory,
  restoreDeletedPublishJob,
  restoreDeletedVideoAsset,
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

  const [deletedCategories, deletedJobs, deletedAssets, activeJobs, activeAssets] = await Promise.all([
    listDeletedPublishCategories(user.id),
    listDeletedPublishJobs(user.id, 100),
    listDeletedVideoAssets(user.id, 100),
    listPublishJobs(user.id, 5000),
    listVideoAssets(user.id, 5000),
  ]);

  const accessibleCategories = deletedCategories
    .filter((item) => isCategoryAccessible(scope, item.key))
    .map((item) => {
      const relatedJobCount =
        activeJobs.filter((job) => job.publishCategory === item.key).length +
        deletedJobs.filter((job) => job.publishCategory === item.key).length;
      const relatedAssetCount =
        activeAssets.filter((asset) => asset.publishCategory === item.key).length +
        deletedAssets.filter((asset) => asset.publishCategory === item.key).length;
      return {
        key: item.key,
        label: toCategoryLabel(item.key),
        deletedAt: item.deletedAt,
        relatedJobCount,
        relatedAssetCount,
      };
    });

  const accessibleJobs = deletedJobs.filter((job) => isCategoryAccessible(scope, job.publishCategory));
  const accessibleAssets = deletedAssets.filter((asset) => isCategoryAccessible(scope, asset.publishCategory));

  return NextResponse.json({
    ok: true,
    categories: accessibleCategories,
    jobs: accessibleJobs,
    assets: accessibleAssets,
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
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const resourceType = asString(body.resourceType);

    if (resourceType === "category") {
      const category = asString(body.category);
      if (!category) {
        return toApiErrorResponse("복구할 고객(category)이 필요합니다.", {
          status: 400,
          errorCode: "TRASH_CATEGORY_REQUIRED",
          retryable: false,
        });
      }
      if (!canManageWorkspace(scope)) {
        return toForbiddenApiResponse("관리 권한이 있는 사용자만 고객(category)을 복구할 수 있습니다.");
      }
      const restored = await restoreDeletedPublishCategory(user.id, category);
      if (!restored) {
        return toApiErrorResponse("복구할 고객(category)을 찾을 수 없습니다.", {
          status: 404,
          errorCode: "TRASH_CATEGORY_NOT_FOUND",
          retryable: false,
        });
      }
      await recordAuditLogSafely({
        user,
        request,
        action: "category.restored",
        resourceType: "category",
        resourceId: restored,
        resourceLabel: restored,
        detail: `${restored} 고객(category)를 복구했습니다.`,
      });
      return NextResponse.json({ ok: true });
    }

    if (resourceType === "job") {
      const jobId = asString(body.jobId);
      if (!jobId) {
        return toApiErrorResponse("복구할 작업 ID가 필요합니다.", {
          status: 400,
          errorCode: "TRASH_JOB_ID_REQUIRED",
          retryable: false,
        });
      }
      const deletedJob = (await listDeletedPublishJobs(user.id, 5000)).find((job) => job.id === jobId) || null;
      if (!deletedJob) {
        return toApiErrorResponse("복구할 작업을 찾을 수 없습니다.", {
          status: 404,
          errorCode: "TRASH_JOB_NOT_FOUND",
          retryable: false,
        });
      }
      if (!canPublishCategory(scope, deletedJob.publishCategory)) {
        return toForbiddenApiResponse("발행 권한이 있는 고객(category) 작업만 복구할 수 있습니다.");
      }
      const restored = await restoreDeletedPublishJob(user.id, jobId);
      if (!restored) {
        return toApiErrorResponse("복구할 작업을 찾을 수 없습니다.", {
          status: 404,
          errorCode: "TRASH_JOB_NOT_FOUND",
          retryable: false,
        });
      }
      await recordAuditLogSafely({
        user,
        request,
        action: "publish.restored",
        resourceType: "publish_job",
        resourceId: restored.id,
        resourceLabel: restored.title,
        detail: `${restored.title} 발행 작업을 복구했습니다.`,
        metadata: {
          publishCategory: restored.publishCategory || "",
        },
      });
      return NextResponse.json({ ok: true });
    }

    if (resourceType === "asset") {
      const assetId = asString(body.assetId);
      if (!assetId) {
        return toApiErrorResponse("복구할 자산 ID가 필요합니다.", {
          status: 400,
          errorCode: "TRASH_ASSET_ID_REQUIRED",
          retryable: false,
        });
      }
      const deletedAsset = (await listDeletedVideoAssets(user.id, 5000)).find((asset) => asset.id === assetId) || null;
      if (!deletedAsset) {
        return toApiErrorResponse("복구할 자산을 찾을 수 없습니다.", {
          status: 404,
          errorCode: "TRASH_ASSET_NOT_FOUND",
          retryable: false,
        });
      }
      if (!canEditCategory(scope, deletedAsset.publishCategory)) {
        return toForbiddenApiResponse("편집 권한이 있는 고객(category) 자산만 복구할 수 있습니다.");
      }
      const restored = await restoreDeletedVideoAsset(user.id, assetId);
      if (!restored) {
        return toApiErrorResponse("복구할 자산을 찾을 수 없습니다.", {
          status: 404,
          errorCode: "TRASH_ASSET_NOT_FOUND",
          retryable: false,
        });
      }
      await recordAuditLogSafely({
        user,
        request,
        action: "asset.restored",
        resourceType: "asset",
        resourceId: restored.id,
        resourceLabel: restored.title,
        detail: `${restored.title} 자산을 복구했습니다.`,
        metadata: {
          publishCategory: restored.publishCategory || "",
          videoUrl: restored.url,
        },
      });
      return NextResponse.json({ ok: true });
    }

    return toApiErrorResponse("유효한 resourceType 값이 필요합니다.", {
      status: 400,
      errorCode: "TRASH_RESOURCE_TYPE_INVALID",
      retryable: false,
    });
  } catch (error) {
    return toApiErrorResponse(error instanceof Error ? error.message : String(error), {
      status: 400,
      errorCode: "TRASH_RESTORE_INVALID",
      retryable: false,
    });
  }
}
