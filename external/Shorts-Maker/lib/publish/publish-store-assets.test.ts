import assert from "node:assert/strict";
import test from "node:test";
import { createPublishStoreAssetsService, type VideoAssetRow } from "./publish-store-assets";

type StoredSnapshotRow = {
  asset_id: string;
  user_id: string;
  snapshot: unknown;
  updated_at_ms: number;
};

function createFakeDeps() {
  const videoAssets: VideoAssetRow[] = [];
  const snapshots: StoredSnapshotRow[] = [];
  let tick = 0;
  const nextTs = () => (tick += 1000);

  const matchesFilter = (row: Record<string, unknown>, key: string, value: unknown): boolean => {
    if (value === null) return row[key] == null;
    if (value && typeof value === "object" && "op" in value) {
      const filter = value as { op?: string; value?: number };
      if (filter.op === "gt") {
        return Number(row[key] || 0) > Number(filter.value || 0);
      }
    }
    return row[key] === value;
  };

  const selectRows = <T>(rows: T[], query: any): T[] => {
    const filters = query?.filters || {};
    let out = rows.filter((row) =>
      Object.entries(filters).every(([key, value]) => matchesFilter(row as Record<string, unknown>, key, value))
    );
    const orderBy = query?.orderBy;
    if (orderBy?.column) {
      const column = orderBy.column as keyof T;
      out = [...out].sort((left, right) => {
        const leftValue = (left as Record<string, unknown>)[column as string];
        const rightValue = (right as Record<string, unknown>)[column as string];
        if (typeof leftValue === "number" && typeof rightValue === "number") {
          return orderBy.ascending ? leftValue - rightValue : rightValue - leftValue;
        }
        const leftText = String(leftValue || "");
        const rightText = String(rightValue || "");
        return orderBy.ascending ? leftText.localeCompare(rightText) : rightText.localeCompare(leftText);
      });
    }
    if (typeof query?.limit === "number") {
      out = out.slice(0, query.limit);
    }
    return out.map((row) => ({ ...(row as Record<string, unknown>) } as T));
  };

  return {
    videoAssets,
    snapshots,
    deps: {
      listPublishJobs: async (userId: string) =>
        [
          { userId, publishCategory: "news", videoUrl: "https://example.com/one" },
          { userId, publishCategory: "sports", videoUrl: "https://example.com/two" },
        ] as any,
      selectSupabaseRows: async <T>(table: string, query: any): Promise<T[]> => {
        if (table === "video_assets") return selectRows(videoAssets, query) as T[];
        if (table === "video_asset_snapshots") return selectRows(snapshots, query) as T[];
        throw new Error(`unexpected table: ${table}`);
      },
      upsertSupabaseRows: async <T>(
        table: string,
        rows: Array<Record<string, unknown>>,
        options?: { onConflict?: string | string[] }
      ): Promise<T[]> => {
        const keyFields = Array.isArray(options?.onConflict)
          ? options?.onConflict
          : options?.onConflict
            ? [options.onConflict]
            : [];
        const inserted: T[] = [];
        if (table === "video_assets") {
          for (const row of rows) {
            const normalized = { ...row } as VideoAssetRow;
            const next = {
              ...normalized,
              created_at_ms: nextTs(),
            } as VideoAssetRow;
            const conflictIndex = keyFields.length
              ? videoAssets.findIndex((existing) =>
                  keyFields.every(
                    (field) =>
                      String((existing as Record<string, unknown>)[field]) === String((next as Record<string, unknown>)[field])
                  )
                )
              : -1;
            if (conflictIndex >= 0) {
              videoAssets[conflictIndex] = { ...videoAssets[conflictIndex], ...next };
              inserted.push({ ...videoAssets[conflictIndex] } as T);
              continue;
            }
            videoAssets.push(next);
            inserted.push({ ...next } as T);
          }
          return inserted;
        }
        if (table === "video_asset_snapshots") {
          for (const row of rows) {
            const next = { ...row, updated_at_ms: nextTs() } as StoredSnapshotRow;
            const conflictIndex = keyFields.length
              ? snapshots.findIndex((existing) =>
                  keyFields.every(
                    (field) =>
                      String((existing as Record<string, unknown>)[field]) === String((next as Record<string, unknown>)[field])
                  )
                )
              : -1;
            if (conflictIndex >= 0) {
              snapshots[conflictIndex] = { ...snapshots[conflictIndex], ...next };
              inserted.push({ ...snapshots[conflictIndex] } as T);
              continue;
            }
            snapshots.push(next);
            inserted.push({ ...next } as T);
          }
          return inserted;
        }
        throw new Error(`unexpected table: ${table}`);
      },
      updateSupabaseRows: async <T>(
        table: string,
        filters: Record<string, unknown>,
        patch: Record<string, unknown>,
        options?: { returning?: boolean }
      ): Promise<T[]> => {
        if (table !== "video_assets") throw new Error(`unexpected table: ${table}`);
        const updated: T[] = [];
        for (const row of videoAssets) {
          if (!Object.entries(filters).every(([key, value]) => matchesFilter(row as Record<string, unknown>, key, value))) {
            continue;
          }
          Object.assign(row as Record<string, unknown>, patch);
          updated.push({ ...(row as Record<string, unknown>) } as T);
        }
        return options?.returning === false ? [] : updated;
      },
    },
  };
}

test("publish store asset service stores, snapshots, deletes, restores, and backfills categories", async () => {
  const fake = createFakeDeps();
  const service = createPublishStoreAssetsService(fake.deps);

  const first = await service.createVideoAsset({
    userId: "user-a",
    id: "asset-1",
    title: "First",
    url: "https://example.com/one",
    sizeBytes: 123,
    mimeType: "video/mp4",
  });
  await service.createVideoAsset({
    userId: "user-a",
    id: "asset-2",
    title: "Second",
    url: "https://example.com/two",
    publishCategory: "sports",
    sizeBytes: 456,
    mimeType: "video/mp4",
  });

  assert.equal(first.publishCategory, undefined);
  assert.deepEqual(
    (await service.listVideoAssets("user-a")).map((asset) => asset.id),
    ["asset-2", "asset-1"]
  );
  assert.equal((await service.getVideoAsset("user-a", "asset-1"))?.title, "First");

  await service.setVideoAssetStudioSnapshot({
    userId: "user-a",
    assetId: "asset-1",
    snapshot: { scene: "intro" } as never,
  });
  assert.deepEqual(await service.getVideoAssetStudioSnapshot("user-a", "asset-1"), { scene: "intro" });

  assert.equal(await service.deleteVideoAsset("user-a", "asset-1", { deletedBy: "admin", reason: "cleanup" }), "deleted");
  assert.equal(await service.getVideoAsset("user-a", "asset-1"), null);
  assert.equal((await service.listDeletedVideoAssets("user-a"))[0]?.id, "asset-1");

  const restored = await service.restoreDeletedVideoAsset("user-a", "asset-1");
  assert.equal(restored?.id, "asset-1");
  assert.equal(restored?.deletedAt, null);

  const backfill = await service.backfillVideoAssetCategoriesFromJobs({
    userId: "user-a",
    assetLimit: 10,
    jobLimit: 10,
  });
  assert.equal(backfill.scanned, 2);
  assert.equal(backfill.updated, 1);
  assert.equal((await service.getVideoAsset("user-a", "asset-1"))?.publishCategory, "news");
  assert.equal(await service.getLatestVideoAsset("user-a").then((asset) => asset?.id), "asset-2");
});
