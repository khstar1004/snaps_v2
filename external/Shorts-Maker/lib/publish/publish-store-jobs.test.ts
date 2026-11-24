import assert from "node:assert/strict";
import test from "node:test";
import { createPublishJobService, type PublishJobRow } from "./publish-store-jobs";

type AppCacheRow = {
  scope: string;
  user_scope: string;
  cache_key: string;
  value_text?: string | null;
  value_json?: unknown | null;
  expires_at_ms?: number | null;
  created_at_ms: number;
  updated_at_ms: number;
};

function createFakeDeps() {
  const publishJobs: PublishJobRow[] = [];
  const appCacheEntries: AppCacheRow[] = [];

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
    publishJobs,
    appCacheEntries,
    deps: {
      deleteSupabaseRows: async (table: string, filters: Record<string, unknown>) => {
        if (table === "publish_jobs") {
          const remaining = publishJobs.filter(
            (row) => !Object.entries(filters).every(([key, value]) => matchesFilter(row as Record<string, unknown>, key, value))
          );
          publishJobs.splice(0, publishJobs.length, ...remaining);
          return;
        }
        if (table === "app_cache_entries") {
          const remaining = appCacheEntries.filter(
            (row) => !Object.entries(filters).every(([key, value]) => matchesFilter(row as Record<string, unknown>, key, value))
          );
          appCacheEntries.splice(0, appCacheEntries.length, ...remaining);
          return;
        }
        throw new Error(`unexpected table: ${table}`);
      },
      selectSupabaseRows: async <T>(table: string, query: any): Promise<T[]> => {
        if (table === "publish_jobs") return selectRows(publishJobs, query) as T[];
        if (table === "app_cache_entries") return selectRows(appCacheEntries, query) as T[];
        throw new Error(`unexpected table: ${table}`);
      },
      tryInsertSupabaseRows: async <T>(
        table: string,
        rows: Array<Record<string, unknown>>,
        options?: { onConflict?: string | string[] }
      ): Promise<T[] | null> => {
        const keyFields = Array.isArray(options?.onConflict)
          ? options?.onConflict
          : options?.onConflict
            ? [options.onConflict]
            : [];
        const target = table === "publish_jobs" ? publishJobs : table === "app_cache_entries" ? appCacheEntries : null;
        if (!target) throw new Error(`unexpected table: ${table}`);
        for (const row of rows) {
          const conflict = keyFields.length
            ? target.some((existing) =>
                keyFields.every(
                  (field) =>
                    String((existing as Record<string, unknown>)[field]) === String((row as Record<string, unknown>)[field])
                )
              )
            : false;
          if (conflict) return null;
          target.push({ ...row } as never);
        }
        return rows.map((row) => ({ ...row } as T)) as T[];
      },
      updateSupabaseRows: async <T>(
        table: string,
        filters: Record<string, unknown>,
        patch: Record<string, unknown>,
        options?: { returning?: boolean }
      ): Promise<T[]> => {
        const target = table === "publish_jobs" ? publishJobs : table === "app_cache_entries" ? appCacheEntries : null;
        if (!target) throw new Error(`unexpected table: ${table}`);
        const updated: T[] = [];
        for (const row of target) {
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

test("publish job service stores, updates, and restores jobs", async () => {
  const fake = createFakeDeps();
  const service = createPublishJobService(fake.deps);

  await service.createPublishJob({
    userId: "user-a",
    id: "job-1",
    channelId: "channel-1",
    publishCategory: "news",
    videoUrl: "https://example.com/one",
    title: "Title 1",
    description: "Description 1",
    tags: ["tag-1", "tag-2"],
    visibility: "private",
  });
  await service.createPublishJob({
    userId: "user-a",
    id: "job-2",
    channelId: "channel-2",
    publishCategory: "news",
    videoUrl: "https://example.com/two",
    title: "Title 2",
    description: "Description 2",
    tags: ["tag-3"],
    visibility: "unlisted",
  });
  fake.publishJobs.find((row) => row.id === "job-2")!.created_at_ms += 1;
  fake.publishJobs.find((row) => row.id === "job-2")!.updated_at_ms += 1;

  assert.deepEqual((await service.listPublishJobs("user-a")).map((job) => job.id), ["job-2", "job-1"]);
  assert.equal((await service.getPublishJob("user-a", "job-1"))?.publishCategory, "news");

  const updated = await service.updatePublishJobStatus({
    userId: "user-a",
    id: "job-1",
    status: "processing",
    attempts: 2,
    lastError: "rendering",
  });
  assert.equal(updated?.status, "processing");
  assert.equal(updated?.attempts, 2);
  assert.equal(updated?.lastError, "rendering");

  fake.publishJobs.find((row) => row.id === "job-1")!.updated_at_ms = Date.now() - 4 * 60_000;
  assert.equal(await service.runPublishJobNow("user-a", "job-1"), "queued");
  assert.equal((await service.getPublishJob("user-a", "job-1"))?.status, "pending");

  assert.equal(await service.cancelPublishJob("user-a", "job-2"), "canceled");
  assert.equal((await service.getPublishJob("user-a", "job-2"))?.status, "canceled");

  assert.equal(await service.deleteFailedPublishJob("user-a", "job-2", { deletedBy: "admin", reason: "cleanup" }), "deleted");
  const deletedJobs = await service.listDeletedPublishJobs("user-a");
  assert.equal(deletedJobs.length, 1);
  assert.equal(deletedJobs[0]?.id, "job-2");
  assert.equal(deletedJobs[0]?.deletedAt > 0, true);

  const restored = await service.restoreDeletedPublishJob("user-a", "job-2");
  assert.equal(restored?.status, "canceled");
  assert.equal(restored?.deletedAt, null);
});

test("publish job execution lock service reuses, expires, and clears locks", async () => {
  const fake = createFakeDeps();
  const service = createPublishJobService(fake.deps);
  const expiredAt = Date.now() - 10_000;
  fake.appCacheEntries.push({
    scope: "publish_job_execution_lock",
    user_scope: "user-a",
    cache_key: "job-stale",
    value_text: "stale-token",
    value_json: { token: "stale-token" },
    expires_at_ms: expiredAt,
    created_at_ms: expiredAt,
    updated_at_ms: expiredAt,
  });

  assert.equal(await service.acquirePublishJobExecutionLock("user-a", "job-1", "token-1"), true);
  assert.equal(await service.getPublishJobExecutionLock("user-a", "job-1"), "token-1");
  assert.equal(await service.acquirePublishJobExecutionLock("user-a", "job-1", "token-1"), true);
  assert.equal(await service.acquirePublishJobExecutionLock("user-a", "job-1", "token-2"), false);

  await service.releasePublishJobExecutionLock("user-a", "job-1", "wrong-token");
  assert.equal(await service.getPublishJobExecutionLock("user-a", "job-1"), "token-1");

  await service.releasePublishJobExecutionLock("user-a", "job-1", "token-1");
  assert.equal(await service.getPublishJobExecutionLock("user-a", "job-1"), null);

  assert.equal(await service.acquirePublishJobExecutionLock("user-a", "job-stale", "fresh-token"), true);
  assert.equal(await service.getPublishJobExecutionLock("user-a", "job-stale"), "fresh-token");
});
