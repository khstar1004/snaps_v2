import {
  deleteSupabaseRows,
  hasSupabaseServiceConfig,
  selectSupabaseRows,
  upsertSupabaseRows,
} from "@/lib/supabase/server";

type AppCacheEntryRow = {
  scope: string;
  user_scope: string;
  cache_key: string;
  value_text?: string | null;
  value_json?: unknown | null;
  expires_at_ms?: number | null;
  created_at_ms: number;
  updated_at_ms: number;
};

export type AppCacheEntry = {
  scope: string;
  userScope: string;
  key: string;
  valueText: string | null;
  valueJson: unknown | null;
  expiresAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
};

export type SupabaseKeyValueStore = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { ex?: number }): Promise<"OK">;
  del(key: string): Promise<number>;
};

function normalizeScope(value: string): string {
  const safe = value.trim();
  if (!safe) {
    throw new Error("cache scope is required");
  }
  return safe;
}

export function normalizeAppCacheUserScope(value?: string): string {
  const safe = (value || "").trim();
  return safe || "_global";
}

function toAppCacheEntry(row: AppCacheEntryRow): AppCacheEntry {
  return {
    scope: row.scope,
    userScope: row.user_scope,
    key: row.cache_key,
    valueText: typeof row.value_text === "string" ? row.value_text : null,
    valueJson: typeof row.value_text === "string" ? null : row.value_json ?? null,
    expiresAtMs: typeof row.expires_at_ms === "number" ? row.expires_at_ms : null,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

export async function getAppCacheEntry(scope: string, userScope: string | undefined, key: string): Promise<AppCacheEntry | null> {
  const safeScope = normalizeScope(scope);
  const safeUserScope = normalizeAppCacheUserScope(userScope);
  const safeKey = key.trim();
  if (!safeKey) return null;
  const rows = await selectSupabaseRows<AppCacheEntryRow>("app_cache_entries", {
    filters: {
      scope: safeScope,
      user_scope: safeUserScope,
      cache_key: safeKey,
    },
    limit: 1,
  });
  const row = rows[0];
  if (!row) return null;
  const entry = toAppCacheEntry(row);
  if (typeof entry.expiresAtMs === "number" && entry.expiresAtMs <= Date.now()) {
    await deleteSupabaseRows("app_cache_entries", {
      scope: safeScope,
      user_scope: safeUserScope,
      cache_key: safeKey,
    }).catch(() => undefined);
    return null;
  }
  return entry;
}

export async function setAppCacheEntry(input: {
  scope: string;
  userScope?: string;
  key: string;
  value: unknown;
  ttlSec?: number;
}): Promise<AppCacheEntry> {
  const safeScope = normalizeScope(input.scope);
  const safeUserScope = normalizeAppCacheUserScope(input.userScope);
  const safeKey = input.key.trim();
  if (!safeKey) {
    throw new Error("cache key is required");
  }
  const now = Date.now();
  const expiresAtMs =
    typeof input.ttlSec === "number" && Number.isFinite(input.ttlSec)
      ? now + Math.max(1, Math.floor(input.ttlSec)) * 1000
      : null;
  const isTextValue = typeof input.value === "string";
  const rows = await upsertSupabaseRows<AppCacheEntryRow>(
    "app_cache_entries",
    [
      {
        scope: safeScope,
        user_scope: safeUserScope,
        cache_key: safeKey,
        value_text: isTextValue ? input.value : null,
        value_json: isTextValue ? null : input.value ?? null,
        expires_at_ms: expiresAtMs,
        created_at_ms: now,
        updated_at_ms: now,
      },
    ],
    {
      onConflict: ["scope", "user_scope", "cache_key"],
    }
  );
  const row = rows[0];
  if (!row) {
    throw new Error("failed to write cache entry");
  }
  return toAppCacheEntry(row);
}

export async function deleteAppCacheEntry(scope: string, userScope: string | undefined, key: string): Promise<void> {
  const safeScope = normalizeScope(scope);
  const safeUserScope = normalizeAppCacheUserScope(userScope);
  const safeKey = key.trim();
  if (!safeKey) return;
  await deleteSupabaseRows("app_cache_entries", {
    scope: safeScope,
    user_scope: safeUserScope,
    cache_key: safeKey,
  });
}

export function getSupabaseKeyValueStoreOrNull(scope: string, userScope?: string): SupabaseKeyValueStore | null {
  if (!hasSupabaseServiceConfig()) return null;
  const safeScope = normalizeScope(scope);
  const safeUserScope = normalizeAppCacheUserScope(userScope);
  return {
    async get<T>(key: string): Promise<T | null> {
      const entry = await getAppCacheEntry(safeScope, safeUserScope, key);
      if (!entry) return null;
      if (entry.valueText !== null) {
        return entry.valueText as T;
      }
      return (entry.valueJson ?? null) as T | null;
    },
    async set(key: string, value: unknown, options?: { ex?: number }): Promise<"OK"> {
      await setAppCacheEntry({
        scope: safeScope,
        userScope: safeUserScope,
        key,
        value,
        ttlSec: typeof options?.ex === "number" ? options.ex : undefined,
      });
      return "OK";
    },
    async del(key: string): Promise<number> {
      await deleteAppCacheEntry(safeScope, safeUserScope, key);
      return 1;
    },
  };
}
