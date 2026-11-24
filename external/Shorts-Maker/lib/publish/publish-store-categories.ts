import { PUBLISH_CATEGORIES } from "@/lib/publish/category-metadata";
import type { PublishCategory } from "@/lib/publish/types";
import {
  deleteSupabaseRows,
  selectSupabaseRows,
  updateSupabaseRows,
  upsertSupabaseRows,
} from "@/lib/supabase/server";
import { listVideoAssets, type VideoAssetRow } from "@/lib/publish/publish-store-assets";
import {
  buildPublishCategoryRow,
  normalizeDeletedAt,
  normalizeUserScope,
  safeTrim,
  toSoftDeleteFilter,
  type SoftDeleteMode,
  type PublishCategoryRow,
} from "@/lib/publish/publish-store-category-settings";
import { movePublishCategoryScopedCacheEntries } from "@/lib/publish/publish-store-category-cache";
import { listPublishJobs, type PublishJobRow } from "@/lib/publish/publish-store-jobs";
export {
  DEFAULT_STUDIO_PROMPT_TEMPLATE_ID,
  getPublishAnalyticsInsightsCache,
  getPublishCategoryBranding,
  getPublishCategoryChannel,
  getPublishCategoryMetadata,
  listGlobalPublishCategoryBrandings,
  listGlobalPublishCategoryChannels,
  listGlobalPublishCategoryMetadata,
  listPublishCategoryBrandings,
  listPublishCategoryChannels,
  listPublishCategoryMetadata,
  publishCategorySettingsService,
  publishCategorySettingsService as defaultPublishCategorySettingsService,
  setPublishAnalyticsInsightsCache,
  setPublishCategoryBranding,
  setPublishCategoryChannel,
  setPublishCategoryMetadata,
  type PublishAnalyticsInsightsCacheRecord,
  type PublishCategoryMetadataRecord,
  createPublishCategorySettingsService,
} from "@/lib/publish/publish-store-category-settings";
export {
  backfillVideoAssetCategoriesFromJobs,
  createVideoAsset,
  deleteVideoAsset,
  getLatestVideoAsset,
  getVideoAsset,
  getVideoAssetStudioSnapshot,
  listDeletedVideoAssets,
  listVideoAssets,
  restoreDeletedVideoAsset,
  setVideoAssetStudioSnapshot,
} from "@/lib/publish/publish-store-assets";
export type { DeletedVideoAssetRecord } from "@/lib/publish/publish-store-assets";
export {
  getYoutubeAccount,
  listYoutubeAccounts,
  refreshYoutubeAccountToken,
  upsertYoutubeAccount,
} from "@/lib/publish/publish-store-oauth";
export {
  acquirePublishJobExecutionLock,
  cancelPublishJob,
  createPublishJob,
  deleteFailedPublishJob,
  getPublishJob,
  getPublishJobExecutionLock,
  listDeletedPublishJobs,
  listPublishJobs,
  releasePublishJobExecutionLock,
  restoreDeletedPublishJob,
  runPublishJobNow,
  updatePublishJobStatus,
} from "@/lib/publish/publish-store-jobs";
export {
  listGlobalPublishCustomers,
  listGlobalPublishCustomerOwners,
  resolvePublishCustomerOwnerUserId,
} from "@/lib/publish/publish-store-owners";
export type { PublishCustomerOwnerRecord } from "@/lib/publish/publish-store-owners";
export {
  createWorkflowTelemetryEvent,
  listWorkflowTelemetryEvents,
} from "@/lib/publish/publish-store-telemetry";
export type { WorkflowTelemetryRecord } from "@/lib/publish/publish-store-telemetry";

const PUBLISH_CATEGORY_DISCOVERY_CACHE_SCOPES = [
  "publish_category_template_notes",
  "publish_category_prompt_templates",
  "publish_category_template_presets",
] as const;

export type DeletedPublishCategoryRecord = {
  key: PublishCategory;
  deletedAt: number;
};

async function getPublishCategoryRow(
  userId: string,
  category: PublishCategory,
  options?: { softDeleteMode?: SoftDeleteMode }
): Promise<PublishCategoryRow | null> {
  const safeCategory = category.trim();
  if (!safeCategory) return null;
  const rows = await selectSupabaseRows<PublishCategoryRow>("publish_customers", {
    filters: {
      user_id: normalizeUserScope(userId),
      customer_key: safeCategory,
      deleted_at_ms: toSoftDeleteFilter(options?.softDeleteMode),
    },
    limit: 1,
  });
  return rows[0] || null;
}

async function listPublishCategoryRows(userId: string, options?: { softDeleteMode?: SoftDeleteMode }): Promise<PublishCategoryRow[]> {
  return selectSupabaseRows<PublishCategoryRow>("publish_customers", {
    filters: {
      user_id: normalizeUserScope(userId),
      deleted_at_ms: toSoftDeleteFilter(options?.softDeleteMode),
    },
    orderBy: {
      column: options?.softDeleteMode === "deleted" ? "deleted_at_ms" : "created_at_ms",
      ascending: options?.softDeleteMode === "deleted" ? false : true,
    },
    limit: 5000,
  });
}

async function ensurePublishCategoryRow(userId: string, category: PublishCategory): Promise<PublishCategoryRow> {
  const existing = await getPublishCategoryRow(userId, category, { softDeleteMode: "all" });
  if (existing && !normalizeDeletedAt(existing.deleted_at_ms)) return existing;
  const row = buildPublishCategoryRow({
    userId,
    category,
    existing,
  });
  const upserted = await upsertSupabaseRows<PublishCategoryRow>("publish_customers", [row], {
    onConflict: ["user_id", "customer_key"],
  });
  return upserted[0] || row;
}

async function listKnownPublishCategories(userId: string): Promise<PublishCategory[]> {
  const userScope = normalizeUserScope(userId);
  const [rows, jobRows, assetRows, cacheRowsByScope] = await Promise.all([
    listPublishCategoryRows(userId),
    selectSupabaseRows<Pick<PublishJobRow, "publish_category">>("publish_jobs", {
      select: "publish_category",
      filters: {
        user_id: userScope,
        deleted_at_ms: toSoftDeleteFilter(),
      },
      limit: 5000,
    }),
    selectSupabaseRows<Pick<VideoAssetRow, "publish_category">>("video_assets", {
      select: "publish_category",
      filters: {
        user_id: userScope,
        deleted_at_ms: toSoftDeleteFilter(),
      },
      limit: 5000,
    }),
    Promise.all(
      PUBLISH_CATEGORY_DISCOVERY_CACHE_SCOPES.map((scope) =>
        selectSupabaseRows<{ cache_key: string }>("app_cache_entries", {
          select: "cache_key",
          filters: {
            scope,
            user_scope: userScope,
          },
          limit: 5000,
        })
      )
    ),
  ]);
  const cacheRows = cacheRowsByScope.flat();
  const discovered = [
    ...rows.map((row) => row.customer_key.trim()),
    ...jobRows.map((row) => safeTrim(row.publish_category)),
    ...assetRows.map((row) => safeTrim(row.publish_category)),
    ...cacheRows.map((row) => safeTrim(row.cache_key)),
  ].filter(Boolean);
  return Array.from(new Set([...PUBLISH_CATEGORIES, ...discovered]));
}

async function listAllActivePublishCategoryRows(): Promise<PublishCategoryRow[]> {
  return selectSupabaseRows<PublishCategoryRow>("publish_customers", {
    filters: {
      deleted_at_ms: toSoftDeleteFilter(),
    },
    orderBy: {
      column: "updated_at_ms",
      ascending: false,
    },
    limit: 5000,
  });
}

async function touchPublishCategory(userId: string, category: PublishCategory): Promise<void> {
  const safeCategory = category.trim();
  if (!safeCategory) return;
  await ensurePublishCategoryRow(userId, safeCategory);
}

function buildCategoryInverseMap(rows: PublishCategoryRow[]): Map<string, PublishCategory[]> {
  const categoriesByChannel = new Map<string, PublishCategory[]>();
  for (const row of rows) {
    const channelId = typeof row.channel_id === "string" ? row.channel_id.trim() : "";
    const category = row.customer_key.trim();
    if (!channelId || !category) continue;
    const current = categoriesByChannel.get(channelId) || [];
    current.push(category);
    categoriesByChannel.set(channelId, current);
  }
  return categoriesByChannel;
}

function resolveRepairCategory(
  categoriesByChannel: Map<string, PublishCategory[]>,
  channelId: string,
  currentCategory?: PublishCategory
): PublishCategory | null {
  const candidates = categoriesByChannel.get(channelId.trim()) || [];
  if (candidates.length <= 0) return null;
  const safeCurrent = currentCategory?.trim() || "";
  if (safeCurrent && candidates.includes(safeCurrent)) {
    return safeCurrent;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  return null;
}

export async function listPublishCategories(userId: string): Promise<PublishCategory[]> {
  return listKnownPublishCategories(userId);
}

export async function addPublishCategory(userId: string, category: PublishCategory): Promise<PublishCategory[]> {
  const safeCategory = category.trim();
  if (!safeCategory) {
    throw new Error("카테고리 값이 필요합니다.");
  }
  await ensurePublishCategoryRow(userId, safeCategory);
  return listKnownPublishCategories(userId);
}

export async function renamePublishCategory(
  userId: string,
  currentCategory: PublishCategory,
  nextCategory: PublishCategory
): Promise<PublishCategory[]> {
  const safeCurrent = currentCategory.trim();
  const safeNext = nextCategory.trim();
  if (!safeCurrent || !safeNext) {
    throw new Error("현재 카테고리와 변경할 카테고리 값이 필요합니다.");
  }
  if (safeCurrent === safeNext) {
    return listKnownPublishCategories(userId);
  }
  if (PUBLISH_CATEGORIES.includes(safeCurrent)) {
    throw new Error("기본 카테고리는 이름을 변경할 수 없습니다.");
  }

  const currentRow = await getPublishCategoryRow(userId, safeCurrent, { softDeleteMode: "all" });
  const nextRow = await getPublishCategoryRow(userId, safeNext, { softDeleteMode: "all" });
  const nextRowDeleted = Boolean(normalizeDeletedAt(nextRow?.deleted_at_ms));

  if (currentRow && (!nextRow || nextRowDeleted)) {
    const renamedRow: PublishCategoryRow = {
      ...currentRow,
      customer_key: safeNext,
      is_default: PUBLISH_CATEGORIES.includes(safeNext),
      updated_at_ms: Date.now(),
      deleted_at_ms: null,
      deleted_by: null,
      delete_reason: null,
    };
    await upsertSupabaseRows<PublishCategoryRow>("publish_customers", [renamedRow], {
      onConflict: ["user_id", "customer_key"],
    });
  } else if (!nextRow) {
    await ensurePublishCategoryRow(userId, safeNext);
  }

  await Promise.all([
    updateSupabaseRows<PublishJobRow>(
      "publish_jobs",
      {
        user_id: normalizeUserScope(userId),
        publish_category: safeCurrent,
      },
      {
        publish_category: safeNext,
      },
      {
        returning: false,
      }
    ),
    updateSupabaseRows<VideoAssetRow>(
      "video_assets",
      {
        user_id: normalizeUserScope(userId),
        publish_category: safeCurrent,
      },
      {
        publish_category: safeNext,
      },
      {
        returning: false,
      }
    ),
  ]);

  await movePublishCategoryScopedCacheEntries(userId, safeCurrent, safeNext);

  if (currentRow) {
    await deleteSupabaseRows("publish_customers", {
      user_id: normalizeUserScope(userId),
      customer_key: safeCurrent,
    });
  }

  return listKnownPublishCategories(userId);
}

export async function deletePublishCategory(
  userId: string,
  category: PublishCategory,
  options?: {
    deletedBy?: string | null;
    reason?: string | null;
  }
): Promise<PublishCategory[]> {
  const safeCategory = category.trim();
  if (!safeCategory) {
    throw new Error("카테고리 값이 필요합니다.");
  }
  if (PUBLISH_CATEGORIES.includes(safeCategory)) {
    throw new Error("기본 카테고리는 삭제할 수 없습니다.");
  }

  await updateSupabaseRows<PublishCategoryRow>(
    "publish_customers",
    {
      user_id: normalizeUserScope(userId),
      customer_key: safeCategory,
      deleted_at_ms: toSoftDeleteFilter(),
    },
    {
      deleted_at_ms: Date.now(),
      deleted_by: safeTrim(options?.deletedBy) || null,
      delete_reason: safeTrim(options?.reason) || null,
      updated_at_ms: Date.now(),
    },
    {
      returning: false,
    }
  );

  return listKnownPublishCategories(userId);
}

export async function listDeletedPublishCategories(userId: string): Promise<DeletedPublishCategoryRecord[]> {
  const rows = await listPublishCategoryRows(userId, { softDeleteMode: "deleted" });
  return rows
    .map((row) => {
      const deletedAt = normalizeDeletedAt(row.deleted_at_ms);
      if (!deletedAt) return null;
      return {
        key: row.customer_key.trim(),
        deletedAt,
      };
    })
    .filter((row): row is DeletedPublishCategoryRecord => Boolean(row && row.key));
}

export async function restoreDeletedPublishCategory(userId: string, category: PublishCategory): Promise<PublishCategory | null> {
  const safeCategory = category.trim();
  if (!safeCategory) return null;
  const current = await getPublishCategoryRow(userId, safeCategory, { softDeleteMode: "deleted" });
  if (!current) return null;
  await updateSupabaseRows<PublishCategoryRow>(
    "publish_customers",
    {
      user_id: normalizeUserScope(userId),
      customer_key: safeCategory,
      deleted_at_ms: {
        op: "gt",
        value: 0,
      },
    },
    {
      deleted_at_ms: null,
      deleted_by: null,
      delete_reason: null,
      updated_at_ms: Date.now(),
    },
    {
      returning: false,
    }
  );
  return safeCategory;
}

export async function repairPublishCategoriesFromChannels(
  userId: string,
  options?: { force?: boolean }
): Promise<{ jobsUpdated: number; assetsUpdated: number }> {
  const rows = await listPublishCategoryRows(userId);
  const categoriesByChannel = buildCategoryInverseMap(rows);
  const jobs = await listPublishJobs(userId, 5000);

  let jobsUpdated = 0;
  const categoryByVideoUrl = new Map<string, PublishCategory>();

  for (const job of jobs) {
    const expected = resolveRepairCategory(categoriesByChannel, job.channelId, job.publishCategory);
    const current = job.publishCategory?.trim() || "";
    const shouldUpdate =
      Boolean(expected) &&
      (options?.force ? current !== expected : !current);

    if (expected && shouldUpdate) {
      await updateSupabaseRows<PublishJobRow>(
        "publish_jobs",
        {
          user_id: normalizeUserScope(userId),
          id: job.id,
        },
        {
          publish_category: expected,
          updated_at_ms: Date.now(),
        },
        {
          returning: false,
        }
      );
      jobsUpdated += 1;
      categoryByVideoUrl.set(job.videoUrl.trim(), expected);
      continue;
    }

    const effectiveCategory = current || expected || "";
    if (effectiveCategory && job.videoUrl.trim()) {
      categoryByVideoUrl.set(job.videoUrl.trim(), effectiveCategory);
    }
  }

  const assets = await listVideoAssets(userId, 5000);
  let assetsUpdated = 0;
  for (const asset of assets) {
    const expected = categoryByVideoUrl.get(asset.url.trim()) || "";
    const current = asset.publishCategory?.trim() || "";
    const shouldUpdate =
      Boolean(expected) &&
      (options?.force ? current !== expected : !current);

    if (!shouldUpdate) continue;
    await updateSupabaseRows<VideoAssetRow>(
      "video_assets",
      {
        user_id: normalizeUserScope(userId),
        id: asset.id,
      },
      {
        publish_category: expected,
      },
      {
        returning: false,
      }
    );
    assetsUpdated += 1;
  }

  return {
    jobsUpdated,
    assetsUpdated,
  };
}

