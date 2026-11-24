import { NextRequest, NextResponse } from "next/server";
import { recordAuditLogSafely } from "@/lib/audit/server";
import { canEditCategory, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { deleteVideoAsset, getVideoAsset } from "@/lib/publish/publish-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;

  try {
    const scope = await getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });
    const body = (await request.json()) as { assetId?: unknown };
    const assetId = typeof body.assetId === "string" ? body.assetId.trim() : "";
    if (!assetId) {
      return toApiErrorResponse("삭제할 자산 식별자가 필요합니다.", {
        status: 400,
        errorCode: "ASSET_ID_REQUIRED",
        retryable: false,
      });
    }

    const asset = await getVideoAsset(user.id, assetId);
    if (!asset) {
      return toApiErrorResponse("자산을 찾을 수 없습니다.", {
        status: 404,
        errorCode: "ASSET_NOT_FOUND",
        retryable: false,
      });
    }
    if (!canEditCategory(scope, asset.publishCategory)) {
      return toForbiddenApiResponse("편집 권한이 있는 고객(category) 자산만 휴지통으로 이동할 수 있습니다.");
    }

    const deleted = await deleteVideoAsset(user.id, assetId, {
      deletedBy: authUser.loginId || authUser.id,
      reason: "manual_trash",
    });
    if (deleted !== "deleted") {
      return toApiErrorResponse("자산을 찾을 수 없습니다.", {
        status: 404,
        errorCode: "ASSET_NOT_FOUND",
        retryable: false,
      });
    }
    await recordAuditLogSafely({
      user,
      request,
      action: "asset.deleted",
      resourceType: "asset",
      resourceId: asset.id,
      resourceLabel: asset.title,
      detail: `${asset.title} 자산을 휴지통으로 이동했습니다.`,
      metadata: {
        publishCategory: asset.publishCategory || "",
        videoUrl: asset.url,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toApiErrorResponse(message, {
      status: 400,
      errorCode: "ASSET_DELETE_INVALID",
      retryable: false,
    });
  }
}
