import assert from "node:assert/strict";
import test from "node:test";
import { createPublishCategorySettingsService, type PublishCategorySettingsServiceDeps } from "./publish-store-category-settings";
import type { AppCacheEntry } from "@/lib/supabase/app-cache";

type StoreRow = Record<string, unknown>;

function createInMemoryDeps() {
  const publishCustomers: StoreRow[] = [];
  const appCache = new Map<string, AppCacheEntry>();

  const deps: PublishCategorySettingsServiceDeps = {
    async getAppCacheEntry(scope: string, userScope: string | undefined, key: string) {
      return appCache.get(`${scope}:${userScope || ""}:${key}`) || null;
    },
    async setAppCacheEntry(input: {
      scope: string;
      userScope?: string;
      key: string;
      value: unknown;
      ttlSec?: number;
      }) {
      const now = Date.now();
      const entry: AppCacheEntry = {
        scope: input.scope,
        userScope: input.userScope || "",
        key: input.key,
        createdAtMs: now,
        updatedAtMs: now,
        expiresAtMs: typeof input.ttlSec === "number" ? now + input.ttlSec * 1000 : null,
        valueJson: typeof input.value === "string" ? null : input.value,
        valueText: typeof input.value === "string" ? input.value : null,
      };
      appCache.set(`${input.scope}:${input.userScope || ""}:${input.key}`, entry);
      return entry;
    },
    async selectSupabaseRows<T>(table: string, options?: { filters?: Record<string, unknown> }) {
      if (table !== "publish_customers") {
        return [] as T[];
      }
      const rows = publishCustomers.filter((row) => {
        const filters = options?.filters || {};
        for (const [key, value] of Object.entries(filters)) {
          if (key === "deleted_at_ms") {
            if (value === null && row.deleted_at_ms != null) return false;
            if (value && typeof value === "object" && "op" in value) {
              const filter = value as { op: unknown; value?: unknown };
              const target = row.deleted_at_ms;
              if (filter.op === "gt" && !(typeof target === "number" && typeof filter.value === "number" && target > filter.value)) return false;
            }
            continue;
          }
          if (row[key] !== value) return false;
        }
        return true;
      });
      return rows as T[];
    },
    async upsertSupabaseRows<T>(table: string, rows: Record<string, unknown>[], options: { onConflict: string | string[]; returning?: boolean }) {
      if (table !== "publish_customers") {
        return rows as T[];
      }
      for (const row of rows as StoreRow[]) {
        const index = publishCustomers.findIndex((item) =>
          (Array.isArray(options.onConflict) ? options.onConflict : [options.onConflict]).every((key) => item[key] === row[key])
        );
        if (index >= 0) {
          publishCustomers[index] = { ...publishCustomers[index], ...row };
        } else {
          publishCustomers.push({ ...row });
        }
      }
      return rows as T[];
    },
  };

  return {
    publishCustomers,
    appCache,
    deps,
  };
}

test("publish category settings service stores and reads channels and analytics cache", async () => {
  const fake = createInMemoryDeps();
  const service = createPublishCategorySettingsService(fake.deps);

  await service.setPublishCategoryChannel("user-1", "news", "channel-123");
  assert.equal(await service.getPublishCategoryChannel("user-1", "news"), "channel-123");
  assert.deepEqual(await service.listPublishCategoryChannels("user-1"), { news: "channel-123" });

  const cached = await service.setPublishAnalyticsInsightsCache({
    userId: "user-1",
    key: "strategy",
    value: { confidence: 0.8 },
    ttlSec: 120,
  });
  assert.equal(cached.value.confidence, 0.8);

  const roundTrip = await service.getPublishAnalyticsInsightsCache<{ confidence: number }>("user-1", "strategy");
  assert.equal(roundTrip?.value.confidence, 0.8);
});
