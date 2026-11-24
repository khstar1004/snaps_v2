import { NextRequest, NextResponse } from "next/server";
import { canEditCategory, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import {
  getRequestOriginForLocalStorage,
  rebaseLocalStorageUrlsInJson,
  rebaseLocalStorageUrlToRequestOrigin,
} from "@/lib/local/asset-url-origin";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { getVideoAsset, getVideoAssetStudioSnapshot } from "@/lib/publish/publish-store";

export const runtime = "nodejs";

type AssetSnapshotRouteDependencies = {
  requireSessionUser: typeof requireSessionUser;
  requireAuthenticatedSessionUser: typeof requireAuthenticatedSessionUser;
  toUnauthorizedApiResponse: typeof toUnauthorizedApiResponse;
  toForbiddenApiResponse: typeof toForbiddenApiResponse;
  toApiErrorResponse: typeof toApiErrorResponse;
  getCategoryAccessScope: typeof getCategoryAccessScope;
  canEditCategory: typeof canEditCategory;
  getVideoAsset: typeof getVideoAsset;
  getVideoAssetStudioSnapshot: typeof getVideoAssetStudioSnapshot;
};

export const defaultAssetSnapshotRouteDependencies: AssetSnapshotRouteDependencies = {
  requireSessionUser,
  requireAuthenticatedSessionUser,
  toUnauthorizedApiResponse,
  toForbiddenApiResponse,
  toApiErrorResponse,
  getCategoryAccessScope,
  canEditCategory,
  getVideoAsset,
  getVideoAssetStudioSnapshot,
};

export async function handleAssetSnapshotGet(
  request: NextRequest,
  deps: AssetSnapshotRouteDependencies = defaultAssetSnapshotRouteDependencies
) {
  const user = deps.requireSessionUser(request);
  if (!user) return deps.toUnauthorizedApiResponse();
  const authUser = deps.requireAuthenticatedSessionUser(request) || user;
  try {
    const scope = await deps.getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });
    const { searchParams } = new URL(request.url);
    const assetId = (searchParams.get("assetId") || "").trim();
    if (!assetId) {
      return deps.toApiErrorResponse("assetId가 필요합니다.", {
        status: 400,
        errorCode: "ASSET_ID_REQUIRED",
        retryable: false,
      });
    }
    const asset = await deps.getVideoAsset(user.id, assetId);
    if (!asset) {
      return deps.toApiErrorResponse("자산을 찾을 수 없습니다.", {
        status: 404,
        errorCode: "ASSET_NOT_FOUND",
        retryable: false,
      });
    }
    if (!deps.canEditCategory(scope, asset.publishCategory)) {
      return deps.toForbiddenApiResponse("편집 권한이 있는 콘텐츠 프로필의 제작 상태만 열 수 있습니다.");
    }
    const snapshot = await deps.getVideoAssetStudioSnapshot(user.id, assetId);
    const requestOrigin = getRequestOriginForLocalStorage(request);
    return NextResponse.json({
      ok: true,
      asset: {
        id: asset.id,
        title: asset.title,
        url: rebaseLocalStorageUrlToRequestOrigin(asset.url, requestOrigin),
        publishCategory: asset.publishCategory,
      },
      snapshot: snapshot ? rebaseLocalStorageUrlsInJson(snapshot, requestOrigin) : null,
    });
  } catch (error) {
    return deps.toApiErrorResponse(error instanceof Error ? error.message : String(error), {
      status: 400,
      errorCode: "ASSET_SNAPSHOT_INVALID",
      retryable: false,
    });
  }
}

export async function GET(request: NextRequest) {
  return handleAssetSnapshotGet(request);
}
