import assert from "node:assert/strict";
import test from "node:test";
import { createPublishCategoryCacheService } from "./publish-store-category-cache";
import type { PublishCategoryTemplatePreset } from "@/types/publish-template-preset";

type StoredEntry = {
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
  const entries = new Map<string, StoredEntry>();
  const normalizeUserScope = (value?: string) => (value || "").trim() || "_global";
  const keyOf = (scope: string, userScope: string | undefined, cacheKey: string) =>
    `${scope}|${normalizeUserScope(userScope)}|${cacheKey}`;
  const toCacheEntry = (row: StoredEntry) => ({
    scope: row.scope,
    userScope: row.user_scope,
    key: row.cache_key,
    valueText: typeof row.value_text === "string" ? row.value_text : null,
    valueJson: typeof row.value_text === "string" ? null : row.value_json ?? null,
    expiresAtMs: typeof row.expires_at_ms === "number" ? row.expires_at_ms : null,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  });

  return {
    entries,
    deps: {
      getAppCacheEntry: async (scope: string, userScope: string | undefined, key: string) => {
        const row = entries.get(keyOf(scope, userScope, key.trim()));
        return row ? toCacheEntry(row) : null;
      },
      setAppCacheEntry: async (input: {
        scope: string;
        userScope?: string;
        key: string;
        value: unknown;
        ttlSec?: number;
      }) => {
        const now = Date.now();
        const userScope = normalizeUserScope(input.userScope);
        const row: StoredEntry = {
          scope: input.scope,
          user_scope: userScope,
          cache_key: input.key.trim(),
          value_text: typeof input.value === "string" ? input.value : null,
          value_json: typeof input.value === "string" ? null : input.value ?? null,
          expires_at_ms:
            typeof input.ttlSec === "number" && Number.isFinite(input.ttlSec)
              ? now + Math.max(1, Math.floor(input.ttlSec)) * 1000
              : null,
          created_at_ms: now,
          updated_at_ms: now,
        };
        entries.set(keyOf(row.scope, row.user_scope, row.cache_key), row);
        return toCacheEntry(row);
      },
      deleteAppCacheEntry: async (scope: string, userScope: string | undefined, key: string) => {
        entries.delete(keyOf(scope, userScope, key.trim()));
      },
      selectSupabaseRows: async <T>(table: string, query: any): Promise<T[]> => {
        assert.equal(table, "app_cache_entries");
        const filters = query?.filters || {};
        let rows = [...entries.values()];
        if (typeof filters.scope === "string") rows = rows.filter((row) => row.scope === filters.scope);
        if (typeof filters.user_scope === "string") rows = rows.filter((row) => row.user_scope === filters.user_scope);
        if (typeof filters.cache_key === "string") rows = rows.filter((row) => row.cache_key === filters.cache_key);
        const orderBy = query?.orderBy;
        if (orderBy?.column === "updated_at_ms") {
          rows.sort((left, right) =>
            orderBy.ascending ? left.updated_at_ms - right.updated_at_ms : right.updated_at_ms - left.updated_at_ms
          );
        }
        if (typeof query?.limit === "number") {
          rows = rows.slice(0, query.limit);
        }
        return rows.map((row) => ({ ...row })) as T[];
      },
      normalizeAppCacheUserScope: normalizeUserScope,
    },
  };
}

test("publish category cache service stores and reads category-scoped metadata", async () => {
  const fake = createFakeDeps();
  const service = createPublishCategoryCacheService(fake.deps);

  await service.setPublishCategoryTemplateNotes(" user-a ", "news", "  note text  ");
  await service.setPublishCategoryPromptTemplates("user-a", "news", {
    topicToScriptPrompt: " topic ",
    scriptToJsonPrompt: " json ",
  });
  await service.setPublishCategoryTemplatePreset("user-a", "news", {
    templateId: "black",
    templateImageEnabled: true,
    templateImageUrl: "https://example.com/image.png",
    templateLayoutJson: "{\"ok\":true}",
    templateData: {},
    templateImageLayout: {},
    templateLayoutApply: {},
  } as PublishCategoryTemplatePreset);
  await service.setPublishCategoryMascotProfile("user-a", "news", {
    mascotPrompt: " soft watercolor ",
    fixedCharacterProfiles: [
      {
        characterId: " lead 1 ",
        displayName: " 주인공 ",
        identityPrompt: " 검은 머리\n남색 재킷 ",
      },
    ],
  });

  assert.equal(await service.getPublishCategoryTemplateNotes("user-a", "news"), "note text");
  assert.deepEqual(await service.getPublishCategoryPromptTemplates("user-a", "news"), {
    topicToScriptPrompt: "topic",
    scriptToJsonPrompt: "json",
  });
  assert.equal((await service.getPublishCategoryTemplatePreset("user-a", "news"))?.templateImageEnabled, true);
  assert.equal((await service.getPublishCategoryTemplatePreset("user-a", "news"))?.templateId, "black");
  assert.deepEqual(await service.getPublishCategoryMascotProfile("user-a", "news"), {
    mascotPrompt: "soft watercolor",
    fixedCharacterProfiles: [
      {
        characterId: "lead_1",
        displayName: "주인공",
        identityPrompt: "검은 머리 남색 재킷",
        anchorImageUrl: undefined,
        anchorAssetId: undefined,
      },
    ],
  });
  assert.deepEqual(await service.listPublishCategoryTemplateNotes("user-a"), {
    news: "note text",
  });
  assert.deepEqual(Object.keys(await service.listPublishCategoryPromptTemplates("user-a")), ["news"]);
  assert.deepEqual(Object.keys(await service.listPublishCategoryTemplatePresets("user-a")), ["news"]);
});

test("publish category cache service moves and deletes scoped cache entries", async () => {
  const fake = createFakeDeps();
  const service = createPublishCategoryCacheService(fake.deps);

  await service.setPublishCategoryTemplateNotes("user-a", "old", "note");
  await service.setPublishCategoryPromptTemplates("user-a", "old", {
    topicToScriptPrompt: "topic",
  });
  await service.setPublishCategoryTemplatePreset("user-a", "old", {
    templateId: "default",
    templateImageEnabled: true,
    templateImageUrl: "https://example.com/image.png",
    templateLayoutJson: "{\"ok\":true}",
    templateData: {},
    templateImageLayout: {},
    templateLayoutApply: {},
  } as PublishCategoryTemplatePreset);
  await service.setPublishCategoryTemplateNotes("user-a", "new", "existing");

  await service.movePublishCategoryScopedCacheEntries("user-a", "old", "new");

  assert.equal(await service.getPublishCategoryTemplateNotes("user-a", "old"), "");
  assert.equal(await service.getPublishCategoryPromptTemplates("user-a", "old").then((value) => Object.keys(value).length), 0);
  assert.equal((await service.getPublishCategoryTemplatePreset("user-a", "old")), null);
  assert.equal(await service.getPublishCategoryTemplateNotes("user-a", "new"), "existing");

  await service.deletePublishCategoryScopedCacheEntry(
    "publish_category_prompt_templates",
    "user-a",
    "new"
  );
  assert.equal(await service.getPublishCategoryPromptTemplates("user-a", "new").then((value) => Object.keys(value).length), 0);
});
