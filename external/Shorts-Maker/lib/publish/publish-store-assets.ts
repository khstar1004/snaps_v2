import type { PublishCategory, VideoAssetRecord } from "@/lib/publish/types";
import type { StudioAssetSnapshot } from "@/types/studio-snapshot";
import {
  selectSupabaseRows,
  updateSupabaseRows,
  upsertSupabaseRows,
} from "@/lib/supabase/server";
import { listPublishJobs } from "@/lib/publish/publish-store-jobs";

export type VideoAssetRow = {
  id: string;
  user_id: string;
  title: string;
  url: string;
  publish_category?: string | null;
  size_bytes: number;
  mime_type: string;
  storage_bucket?: string | null;
  storage_path?: string | null;
  created_at_ms: number;
  deleted_at_ms?: number | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
};

type VideoAssetSnapshotRow = {
  asset_id: string;
  user_id: string;
  snapshot: StudioAssetSnapshot;
  updated_at_ms: number;
};

export type DeletedVideoAssetRecord = VideoAssetRecord & {
  deletedAt: number;
};

type SoftDeleteMode = "active" | "deleted" | "all";

type PublishStoreAssetsServiceDeps = {
  listPublishJobs: typeof listPublishJobs;
  selectSupabaseRows: typeof selectSupabaseRows;
  updateSupabaseRows: typeof updateSupabaseRows;
  upsertSupabaseRows: typeof upsertSupabaseRows;
};

export type PublishStoreAssetsService = {
  createVideoAsset(input: {
    userId: string;
    id: string;
    title: string;
    url: string;
    publishCategory?: PublishCategory;
    sizeBytes: number;
    mimeType: string;
    storageBucket?: string;
    storagePath?: string;
  }): Promise<VideoAssetRecord>;
  listVideoAssets(userId: string, limit?: number): Promise<VideoAssetRecord[]>;
  getVideoAsset(userId: string, id: string): Promise<VideoAssetRecord | null>;
  setVideoAssetStudioSnapshot(input: {
    userId: string;
    assetId: string;
    snapshot: StudioAssetSnapshot;
  }): Promise<void>;
  getVideoAssetStudioSnapshot(userId: string, assetId: string): Promise<StudioAssetSnapshot | null>;
  deleteVideoAsset(
    userId: string,
    id: string,
    options?: {
      deletedBy?: string | null;
      reason?: string | null;
    }
  ): Promise<"not_found" | "deleted">;
  listDeletedVideoAssets(userId: string, limit?: number): Promise<DeletedVideoAssetRecord[]>;
  restoreDeletedVideoAsset(userId: string, id: string): Promise<VideoAssetRecord | null>;
  backfillVideoAssetCategoriesFromJobs(options: {
    userId: string;
    assetLimit?: number;
    jobLimit?: number;
  }): Promise<{ scanned: number; updated: number }>;
  getLatestVideoAsset(userId: string): Promise<VideoAssetRecord | null>;
};

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUserScope(userId: string): string {
  const safe = userId.trim();
  if (!safe) {
    throw new Error("userId is required");
  }
  return safe.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizeDeletedAt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function toSoftDeleteFilter(mode: SoftDeleteMode = "active") {
  if (mode === "all") return undefined;
  if (mode === "deleted") {
    return {
      op: "gt" as const,
      value: 0,
    };
  }
  return null;
}

function toVideoAssetRecord(row: VideoAssetRow): VideoAssetRecord {
  return {
    userId: row.user_id,
    id: row.id,
    title: row.title,
    url: row.url,
    publishCategory: typeof row.publish_category === "string" && row.publish_category.trim() ? row.publish_category.trim() : undefined,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
    storageBucket: typeof row.storage_bucket === "string" && row.storage_bucket.trim() ? row.storage_bucket.trim() : undefined,
    storagePath: typeof row.storage_path === "string" && row.storage_path.trim() ? row.storage_path.trim() : undefined,
    createdAt: row.created_at_ms,
    deletedAt: normalizeDeletedAt(row.deleted_at_ms),
  };
}

function createPublishStoreAssetsService(deps: Partial<PublishStoreAssetsServiceDeps> = {}): PublishStoreAssetsService {
  const assetDeps: PublishStoreAssetsServiceDeps = {
    listPublishJobs: deps.listPublishJobs || listPublishJobs,
    selectSupabaseRows: deps.selectSupabaseRows || selectSupabaseRows,
    updateSupabaseRows: deps.updateSupabaseRows || updateSupabaseRows,
    upsertSupabaseRows: deps.upsertSupabaseRows || upsertSupabaseRows,
  };

  async function getVideoAssetRowByMode(
    userId: string,
    id: string,
    softDeleteMode: SoftDeleteMode
  ): Promise<VideoAssetRow | null> {
    const safeId = id.trim();
    if (!safeId) return null;
    const rows = await assetDeps.selectSupabaseRows<VideoAssetRow>("video_assets", {
      filters: {
        user_id: normalizeUserScope(userId),
        id: safeId,
        deleted_at_ms: toSoftDeleteFilter(softDeleteMode),
      },
      limit: 1,
    });
    return rows[0] || null;
  }

  async function listVideoAssetRows(userId: string, limit = 20): Promise<VideoAssetRow[]> {
    return assetDeps.selectSupabaseRows<VideoAssetRow>("video_assets", {
      filters: {
        user_id: normalizeUserScope(userId),
        deleted_at_ms: toSoftDeleteFilter(),
      },
      orderBy: {
        column: "created_at_ms",
        ascending: false,
      },
      limit: Math.max(1, Math.min(5000, Math.floor(limit))),
    });
  }

  async function createVideoAsset(input: {
    userId: string;
    id: string;
    title: string;
    url: string;
    publishCategory?: PublishCategory;
    sizeBytes: number;
    mimeType: string;
    storageBucket?: string;
    storagePath?: string;
  }): Promise<VideoAssetRecord> {
    const row: VideoAssetRow = {
      user_id: normalizeUserScope(input.userId),
      id: input.id,
      title: input.title,
      url: input.url,
      publish_category: input.publishCategory?.trim() || null,
      size_bytes: input.sizeBytes,
      mime_type: input.mimeType,
      storage_bucket: input.storageBucket?.trim() || null,
      storage_path: input.storagePath?.trim() || null,
      created_at_ms: Date.now(),
      deleted_at_ms: null,
      deleted_by: null,
      delete_reason: null,
    };
    const inserted = await assetDeps.upsertSupabaseRows<VideoAssetRow>("video_assets", [row], {
      onConflict: "id",
    });
    return toVideoAssetRecord(inserted[0] || row);
  }

  async function listVideoAssets(userId: string, limit = 20): Promise<VideoAssetRecord[]> {
    const rows = await listVideoAssetRows(userId, limit);
    return rows.map(toVideoAssetRecord);
  }

  async function getVideoAsset(userId: string, id: string): Promise<VideoAssetRecord | null> {
    const row = await getVideoAssetRowByMode(userId, id, "active");
    return row ? toVideoAssetRecord(row) : null;
  }

  async function setVideoAssetStudioSnapshot(input: {
    userId: string;
    assetId: string;
    snapshot: StudioAssetSnapshot;
  }): Promise<void> {
    const safeId = input.assetId.trim();
    if (!safeId) {
      throw new Error("assetId is required");
    }
    await assetDeps.upsertSupabaseRows<VideoAssetSnapshotRow>(
      "video_asset_snapshots",
      [
        {
          asset_id: safeId,
          user_id: normalizeUserScope(input.userId),
          snapshot: input.snapshot,
          updated_at_ms: Date.now(),
        },
      ],
      {
        onConflict: "asset_id",
      }
    );
  }

  async function getVideoAssetStudioSnapshot(userId: string, assetId: string): Promise<StudioAssetSnapshot | null> {
    const safeId = assetId.trim();
    if (!safeId) return null;
    const rows = await assetDeps.selectSupabaseRows<VideoAssetSnapshotRow>("video_asset_snapshots", {
      filters: {
        asset_id: safeId,
        user_id: normalizeUserScope(userId),
      },
      limit: 1,
    });
    return rows[0]?.snapshot || null;
  }

  async function deleteVideoAsset(
    userId: string,
    id: string,
    options?: {
      deletedBy?: string | null;
      reason?: string | null;
    }
  ): Promise<"not_found" | "deleted"> {
    const current = await getVideoAsset(userId, id);
    if (!current) return "not_found";
    await assetDeps.updateSupabaseRows<VideoAssetRow>(
      "video_assets",
      {
        user_id: normalizeUserScope(userId),
        id: id.trim(),
        deleted_at_ms: toSoftDeleteFilter(),
      },
      {
        deleted_at_ms: Date.now(),
        deleted_by: safeTrim(options?.deletedBy) || null,
        delete_reason: safeTrim(options?.reason) || null,
      },
      {
        returning: false,
      }
    );
    return "deleted";
  }

  async function listDeletedVideoAssets(userId: string, limit = 100): Promise<DeletedVideoAssetRecord[]> {
    const rows = await assetDeps.selectSupabaseRows<VideoAssetRow>("video_assets", {
      filters: {
        user_id: normalizeUserScope(userId),
        deleted_at_ms: toSoftDeleteFilter("deleted"),
      },
      orderBy: {
        column: "deleted_at_ms",
        ascending: false,
      },
      limit: Math.max(1, Math.min(5000, Math.floor(limit))),
    });
    return rows
      .map((row) => {
        const deletedAt = normalizeDeletedAt(row.deleted_at_ms);
        if (!deletedAt) return null;
        return {
          ...toVideoAssetRecord(row),
          deletedAt,
        };
      })
      .filter((row): row is DeletedVideoAssetRecord => Boolean(row));
  }

  async function restoreDeletedVideoAsset(userId: string, id: string): Promise<VideoAssetRecord | null> {
    const current = await getVideoAssetRowByMode(userId, id, "deleted");
    if (!current) return null;
    const updated = await assetDeps.updateSupabaseRows<VideoAssetRow>(
      "video_assets",
      {
        user_id: normalizeUserScope(userId),
        id: id.trim(),
        deleted_at_ms: {
          op: "gt",
          value: 0,
        },
      },
      {
        deleted_at_ms: null,
        deleted_by: null,
        delete_reason: null,
      }
    );
    return updated[0]
      ? toVideoAssetRecord(updated[0])
      : toVideoAssetRecord({ ...current, deleted_at_ms: null, deleted_by: null, delete_reason: null });
  }

  async function backfillVideoAssetCategoriesFromJobs(options: {
    userId: string;
    assetLimit?: number;
    jobLimit?: number;
  }): Promise<{ scanned: number; updated: number }> {
    const userId = options.userId;
    const assetLimit = Math.max(1, Math.min(2000, Math.floor(options.assetLimit ?? 500)));
    const jobLimit = Math.max(1, Math.min(5000, Math.floor(options.jobLimit ?? 2000)));
    const assets = await listVideoAssets(userId, assetLimit);
    if (assets.length === 0) {
      return { scanned: 0, updated: 0 };
    }
    const jobs = await assetDeps.listPublishJobs(userId, jobLimit);
    const latestCategoryByVideoUrl = new Map<string, PublishCategory>();
    for (const job of jobs) {
      const category = job.publishCategory?.trim();
      const videoUrl = job.videoUrl?.trim();
      if (!category || !videoUrl || latestCategoryByVideoUrl.has(videoUrl)) continue;
      latestCategoryByVideoUrl.set(videoUrl, category);
    }

    let updated = 0;
    for (const asset of assets) {
      if (asset.publishCategory?.trim()) continue;
      const category = latestCategoryByVideoUrl.get(asset.url?.trim() || "");
      if (!category) continue;
      await assetDeps.updateSupabaseRows<VideoAssetRow>(
        "video_assets",
        {
          user_id: normalizeUserScope(userId),
          id: asset.id,
        },
        {
          publish_category: category,
        }
      );
      updated += 1;
    }

    return { scanned: assets.length, updated };
  }

  async function getLatestVideoAsset(userId: string): Promise<VideoAssetRecord | null> {
    const items = await listVideoAssets(userId, 1);
    return items[0] || null;
  }

  return {
    createVideoAsset,
    listVideoAssets,
    getVideoAsset,
    setVideoAssetStudioSnapshot,
    getVideoAssetStudioSnapshot,
    deleteVideoAsset,
    listDeletedVideoAssets,
    restoreDeletedVideoAsset,
    backfillVideoAssetCategoriesFromJobs,
    getLatestVideoAsset,
  };
}

const publishStoreAssetsService = createPublishStoreAssetsService();

export {
  createPublishStoreAssetsService,
  publishStoreAssetsService,
  publishStoreAssetsService as defaultPublishStoreAssetsService,
};

export const createVideoAsset = publishStoreAssetsService.createVideoAsset;
export const listVideoAssets = publishStoreAssetsService.listVideoAssets;
export const getVideoAsset = publishStoreAssetsService.getVideoAsset;
export const setVideoAssetStudioSnapshot = publishStoreAssetsService.setVideoAssetStudioSnapshot;
export const getVideoAssetStudioSnapshot = publishStoreAssetsService.getVideoAssetStudioSnapshot;
export const deleteVideoAsset = publishStoreAssetsService.deleteVideoAsset;
export const listDeletedVideoAssets = publishStoreAssetsService.listDeletedVideoAssets;
export const restoreDeletedVideoAsset = publishStoreAssetsService.restoreDeletedVideoAsset;
export const backfillVideoAssetCategoriesFromJobs = publishStoreAssetsService.backfillVideoAssetCategoriesFromJobs;
export const getLatestVideoAsset = publishStoreAssetsService.getLatestVideoAsset;
