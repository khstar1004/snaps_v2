import { fetchAssetsCategoryMetadata, fetchAssetsCategories, fetchAssetsJobs } from "@/lib/api/assets-client";
import { fetchAssetsLatest } from "@/lib/api/assets-client";
import { fetchCategories, fetchCategoryMetadataMap, fetchPublishJobs } from "@/lib/api/publish-client";
import { normalizeAssetsLatestResponse, normalizePublishJobsResponse } from "@/lib/publish/client-normalize";
import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { AssetsLatestResponse, PublishJobsResponse, WorkspacePermissionsSummary } from "@/lib/publish/client-types";
import type { PublishCategory } from "@/lib/publish/types";

export type PublishWorkspaceCategoryOption = {
  key: PublishCategory;
  label: string;
};

export type PublishWorkspaceSnapshot = {
  accounts: NonNullable<PublishJobsResponse["accounts"]>;
  jobs: NonNullable<PublishJobsResponse["jobs"]>;
  categoryChannels: Partial<Record<PublishCategory, string>>;
  categoryMetadataMap: Record<PublishCategory, PublishMetadata>;
  categoryOptions: PublishWorkspaceCategoryOption[];
  workspacePermissions?: WorkspacePermissionsSummary;
  storageReady?: boolean;
};

export type AssetsWorkspaceSnapshot = PublishWorkspaceSnapshot & {
  assets: AssetsLatestResponse;
};

export async function fetchPublishWorkspaceSnapshot(): Promise<PublishWorkspaceSnapshot> {
  const [jobsData, metadataData, categoriesData] = await Promise.all([
    fetchPublishJobs(),
    fetchCategoryMetadataMap(),
    fetchCategories(),
  ]);
  if (!Array.isArray(jobsData.jobs)) throw new Error("발행 작업 목록 응답이 올바르지 않습니다.");
  if (!metadataData.categoryMetadata) throw new Error("카테고리 메타데이터 응답이 올바르지 않습니다.");
  if (!categoriesData.categories) throw new Error("카테고리 목록 응답이 올바르지 않습니다.");

  const jobsSnapshot = normalizePublishJobsResponse(jobsData);
  return {
    accounts: jobsSnapshot.accounts,
    jobs: jobsSnapshot.jobs,
    categoryChannels: jobsSnapshot.categoryChannels,
    categoryMetadataMap: metadataData.categoryMetadata,
    categoryOptions: categoriesData.categories,
    workspacePermissions: categoriesData.workspacePermissions,
    storageReady: categoriesData.storageReady === true,
  };
}

export async function fetchAssetsWorkspaceSnapshot(): Promise<AssetsWorkspaceSnapshot> {
  const [jobsData, metadataData, categoriesData, assetsData] = await Promise.all([
    fetchAssetsJobs(),
    fetchAssetsCategoryMetadata(),
    fetchAssetsCategories(),
    fetchAssetsLatest(),
  ]);
  if (!Array.isArray(jobsData.jobs)) throw new Error("발행 작업 목록 응답이 올바르지 않습니다.");
  if (!metadataData.categoryMetadata) throw new Error("카테고리 메타데이터 응답이 올바르지 않습니다.");
  if (!categoriesData.categories) throw new Error("카테고리 목록 응답이 올바르지 않습니다.");

  const jobsSnapshot = normalizePublishJobsResponse(jobsData);
  return {
    accounts: jobsSnapshot.accounts,
    jobs: jobsSnapshot.jobs,
    categoryChannels: jobsSnapshot.categoryChannels,
    categoryMetadataMap: metadataData.categoryMetadata,
    categoryOptions: categoriesData.categories,
    workspacePermissions: categoriesData.workspacePermissions,
    assets: normalizeAssetsLatestResponse(assetsData),
  };
}

export async function fetchPublishComposerSnapshot(): Promise<PublishWorkspaceSnapshot & { latestAsset: AssetsLatestResponse["latest"] }> {
  const [workspace, assetsData] = await Promise.all([
    fetchPublishWorkspaceSnapshot(),
    fetchAssetsLatest(),
  ]);
  const assets = normalizeAssetsLatestResponse(assetsData);
  return {
    ...workspace,
    latestAsset: assets.latest,
  };
}
