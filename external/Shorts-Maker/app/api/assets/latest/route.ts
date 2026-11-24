import { NextRequest, NextResponse } from "next/server";
import { canManageWorkspace, filterCategoriesByAccess, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toUnauthorizedApiResponse } from "@/lib/auth/api";
import {
  getRequestOriginForLocalStorage,
  rebaseVideoAssetRecordLocalStorageUrls,
} from "@/lib/local/asset-url-origin";
import { backfillVideoAssetCategoriesFromJobs, getLatestVideoAsset, listVideoAssets } from "@/lib/publish/publish-store";

export const runtime = "nodejs";

type AssetsLatestRouteDependencies = {
  requireSessionUser: typeof requireSessionUser;
  requireAuthenticatedSessionUser: typeof requireAuthenticatedSessionUser;
  toUnauthorizedApiResponse: typeof toUnauthorizedApiResponse;
  getCategoryAccessScope: typeof getCategoryAccessScope;
  canManageWorkspace: typeof canManageWorkspace;
  filterCategoriesByAccess: typeof filterCategoriesByAccess;
  backfillVideoAssetCategoriesFromJobs: typeof backfillVideoAssetCategoriesFromJobs;
  getLatestVideoAsset: typeof getLatestVideoAsset;
  listVideoAssets: typeof listVideoAssets;
};

export const defaultAssetsLatestRouteDependencies: AssetsLatestRouteDependencies = {
  requireSessionUser,
  requireAuthenticatedSessionUser,
  toUnauthorizedApiResponse,
  getCategoryAccessScope,
  canManageWorkspace,
  filterCategoriesByAccess,
  backfillVideoAssetCategoriesFromJobs,
  getLatestVideoAsset,
  listVideoAssets,
};

export async function handleAssetsLatestGet(
  request: NextRequest,
  deps: AssetsLatestRouteDependencies = defaultAssetsLatestRouteDependencies
) {
  const user = deps.requireSessionUser(request);
  if (!user) return deps.toUnauthorizedApiResponse();
  const authUser = deps.requireAuthenticatedSessionUser(request) || user;
  const scope = await deps.getCategoryAccessScope({
    actorRole: authUser.role === "admin" ? "admin" : "member",
    workspaceUserId: user.id,
  });
  if (deps.canManageWorkspace(scope)) {
    await deps.backfillVideoAssetCategoriesFromJobs({ userId: user.id, assetLimit: 1000, jobLimit: 3000 });
  }
  const latest =
    deps.filterCategoriesByAccess([await deps.getLatestVideoAsset(user.id)].filter(Boolean), scope, (item) => item?.publishCategory)[0] ||
    null;
  const items = deps.filterCategoriesByAccess(await deps.listVideoAssets(user.id, 20), scope, (item) => item.publishCategory);
  const requestOrigin = getRequestOriginForLocalStorage(request);
  return NextResponse.json({
    ok: true,
    latest: rebaseVideoAssetRecordLocalStorageUrls(latest, requestOrigin),
    items: items.map((item) => rebaseVideoAssetRecordLocalStorageUrls(item, requestOrigin)),
  });
}

export async function GET(request: NextRequest) {
  return handleAssetsLatestGet(request);
}
