import type { PublishCategoryTemplatePreset } from "@/types/publish-template-preset";
import {
  deleteAppCacheEntry,
  getAppCacheEntry,
  normalizeAppCacheUserScope,
  setAppCacheEntry,
} from "@/lib/supabase/app-cache";
import { selectSupabaseRows } from "@/lib/supabase/server";
import type { StudioPromptTemplates } from "@/lib/studio/prompt-templates";
import type { StudioTemplateId } from "@/types/studio-template";
import {
  compactStoredCategoryTemplatePresetMap,
  compactStoredTemplatePromptMap,
  sanitizeStoredCategoryTemplatePreset,
  sanitizeStoredCategoryTemplatePresetMap,
  sanitizeStoredPromptTemplatePayload,
  sanitizeStoredTemplatePromptMap,
  type StoredCategoryTemplatePresetMap,
  type StoredTemplatePromptMap,
} from "@/lib/publish/publish-store-cache";
import { sanitizeStoredStudioPromptTemplates } from "@/lib/studio/prompt-templates";
import {
  hasStudioCharacterIdentity,
  normalizeStudioCharacterProfiles,
} from "@/lib/studio/character-profiles";
import type { CharacterProfile } from "@/types/character-profile";

const DEFAULT_STUDIO_PROMPT_TEMPLATE_ID: StudioTemplateId = "default";
const PUBLISH_CATEGORY_TEMPLATE_NOTES_SCOPE = "publish_category_template_notes";
const PUBLISH_CATEGORY_PROMPT_TEMPLATES_SCOPE = "publish_category_prompt_templates";
const PUBLISH_CATEGORY_TEMPLATE_PRESETS_SCOPE = "publish_category_template_presets";
const PUBLISH_CATEGORY_MASCOT_PROFILE_SCOPE = "publish_category_mascot_profile";

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

type PublishCategoryCacheDeps = {
  getAppCacheEntry: typeof getAppCacheEntry;
  setAppCacheEntry: typeof setAppCacheEntry;
  deleteAppCacheEntry: typeof deleteAppCacheEntry;
  selectSupabaseRows: typeof selectSupabaseRows;
  normalizeAppCacheUserScope: typeof normalizeAppCacheUserScope;
};

type StoredMascotProfile = {
  mascotPrompt?: string;
  mascotName?: string;
  mascotDescription?: string;
  mascotStyle?: string;
  mascotTone?: string;
  mascotNegativePrompt?: string;
  mascotAnchorImageUrl?: string;
  mascotAnchorAssetId?: string;
  fixedCharacterProfiles?: CharacterProfile[];
};

export type PublishCategoryCacheService = {
  getPublishCategoryMascotProfile(
    userId: string,
    category: string
  ): Promise<StoredMascotProfile>;
  listPublishCategoryMascotProfiles(
    userId: string
  ): Promise<Partial<Record<string, StoredMascotProfile>>>;
  setPublishCategoryMascotProfile(
    userId: string,
    category: string,
    profile: StoredMascotProfile | null
  ): Promise<void>;
  getPublishCategoryTemplateNotes(userId: string, category: string): Promise<string>;
  listPublishCategoryTemplateNotes(userId: string): Promise<Partial<Record<string, string>>>;
  setPublishCategoryTemplateNotes(userId: string, category: string, notes: string): Promise<void>;
  getPublishCategoryPromptTemplates(
    userId: string,
    category: string,
    templateId?: StudioTemplateId
  ): Promise<Partial<StudioPromptTemplates>>;
  listPublishCategoryPromptTemplates(
    userId: string,
    templateId?: StudioTemplateId
  ): Promise<Partial<Record<string, Partial<StudioPromptTemplates>>>>;
  setPublishCategoryPromptTemplates(
    userId: string,
    category: string,
    templates: Partial<StudioPromptTemplates> | null,
    templateId?: StudioTemplateId
  ): Promise<void>;
  clearPublishCategoryPromptTemplates(userId: string, category: string): Promise<void>;
  getPublishCategoryTemplatePreset(
    userId: string,
    category: string,
    templateId?: StudioTemplateId
  ): Promise<PublishCategoryTemplatePreset | null>;
  listPublishCategoryTemplatePresets(
    userId: string,
    templateId?: StudioTemplateId
  ): Promise<Partial<Record<string, PublishCategoryTemplatePreset>>>;
  setPublishCategoryTemplatePreset(
    userId: string,
    category: string,
    templatePreset: PublishCategoryTemplatePreset | null,
    templateId?: StudioTemplateId
  ): Promise<void>;
  movePublishCategoryScopedCacheEntries(userId: string, currentCategory: string, nextCategory: string): Promise<void>;
  deletePublishCategoryScopedCacheEntry(scope: string, userId: string, category: string): Promise<void>;
};

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCategory(value: string): string {
  return value.trim();
}

function sanitizeStoredMascotProfile(value: unknown): StoredMascotProfile {
  const row = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const fixedCharacterProfiles = normalizeStudioCharacterProfiles(row.fixedCharacterProfiles).filter(
    hasStudioCharacterIdentity
  );
  const profile = {
    mascotPrompt: safeTrim(row.mascotPrompt) || undefined,
    mascotName: safeTrim(row.mascotName) || undefined,
    mascotDescription: safeTrim(row.mascotDescription) || undefined,
    mascotStyle: safeTrim(row.mascotStyle) || undefined,
    mascotTone: safeTrim(row.mascotTone) || undefined,
    mascotNegativePrompt: safeTrim(row.mascotNegativePrompt) || undefined,
    mascotAnchorImageUrl: safeTrim(row.mascotAnchorImageUrl) || undefined,
    mascotAnchorAssetId: safeTrim(row.mascotAnchorAssetId) || undefined,
    fixedCharacterProfiles: fixedCharacterProfiles.length > 0 ? fixedCharacterProfiles : undefined,
  };
  return Object.fromEntries(Object.entries(profile).filter(([, entry]) => Boolean(entry))) as typeof profile;
}

function createPublishCategoryCacheService(deps: Partial<PublishCategoryCacheDeps> = {}): PublishCategoryCacheService {
  const cacheDeps: PublishCategoryCacheDeps = {
    getAppCacheEntry: deps.getAppCacheEntry || getAppCacheEntry,
    setAppCacheEntry: deps.setAppCacheEntry || setAppCacheEntry,
    deleteAppCacheEntry: deps.deleteAppCacheEntry || deleteAppCacheEntry,
    selectSupabaseRows: deps.selectSupabaseRows || selectSupabaseRows,
    normalizeAppCacheUserScope: deps.normalizeAppCacheUserScope || normalizeAppCacheUserScope,
  };

  async function getPublishCategoryMascotProfile(
    userId: string,
    category: string
  ): Promise<StoredMascotProfile> {
    const safeCategory = normalizeCategory(category);
    if (!safeCategory) return {};
    const entry = await cacheDeps.getAppCacheEntry(
      PUBLISH_CATEGORY_MASCOT_PROFILE_SCOPE,
      cacheDeps.normalizeAppCacheUserScope(userId),
      safeCategory
    );
    return sanitizeStoredMascotProfile(entry?.valueJson ?? entry?.valueText ?? null);
  }

  async function listPublishCategoryMascotProfiles(
    userId: string
  ): Promise<Partial<Record<string, StoredMascotProfile>>> {
    const rows = await cacheDeps.selectSupabaseRows<AppCacheRow>("app_cache_entries", {
      filters: {
        scope: PUBLISH_CATEGORY_MASCOT_PROFILE_SCOPE,
        user_scope: cacheDeps.normalizeAppCacheUserScope(userId),
      },
      orderBy: {
        column: "updated_at_ms",
        ascending: false,
      },
      limit: 5000,
    });
    const result: Partial<Record<string, ReturnType<typeof sanitizeStoredMascotProfile>>> = {};
    for (const row of rows) {
      const category = normalizeCategory(row.cache_key);
      if (!category) continue;
      const profile = sanitizeStoredMascotProfile(row.value_json ?? row.value_text ?? null);
      if (Object.keys(profile).length <= 0) continue;
      result[category] = profile;
    }
    return result;
  }

  async function setPublishCategoryMascotProfile(
    userId: string,
    category: string,
    profile: StoredMascotProfile | null
  ): Promise<void> {
    const safeCategory = normalizeCategory(category);
    if (!safeCategory) return;
    const safeProfile = sanitizeStoredMascotProfile(profile);
    const userScope = cacheDeps.normalizeAppCacheUserScope(userId);
    if (Object.keys(safeProfile).length <= 0) {
      await cacheDeps.deleteAppCacheEntry(PUBLISH_CATEGORY_MASCOT_PROFILE_SCOPE, userScope, safeCategory);
      return;
    }
    await cacheDeps.setAppCacheEntry({
      scope: PUBLISH_CATEGORY_MASCOT_PROFILE_SCOPE,
      userScope,
      key: safeCategory,
      value: safeProfile,
    });
  }

  async function getPublishCategoryTemplateNotes(userId: string, category: string): Promise<string> {
    const safeCategory = normalizeCategory(category);
    if (!safeCategory) return "";
    const entry = await cacheDeps.getAppCacheEntry(
      PUBLISH_CATEGORY_TEMPLATE_NOTES_SCOPE,
      cacheDeps.normalizeAppCacheUserScope(userId),
      safeCategory
    );
    return safeTrim(entry?.valueText);
  }

  async function listPublishCategoryTemplateNotes(userId: string): Promise<Partial<Record<string, string>>> {
    const rows = await cacheDeps.selectSupabaseRows<AppCacheRow>("app_cache_entries", {
      filters: {
        scope: PUBLISH_CATEGORY_TEMPLATE_NOTES_SCOPE,
        user_scope: cacheDeps.normalizeAppCacheUserScope(userId),
      },
      orderBy: {
        column: "updated_at_ms",
        ascending: false,
      },
      limit: 5000,
    });
    const result: Partial<Record<string, string>> = {};
    for (const row of rows) {
      const category = normalizeCategory(row.cache_key);
      if (!category) continue;
      result[category] = safeTrim(row.value_text);
    }
    return result;
  }

  async function setPublishCategoryTemplateNotes(userId: string, category: string, notes: string): Promise<void> {
    const safeCategory = normalizeCategory(category);
    if (!safeCategory) return;
    const safeNotes = notes.trim();
    const userScope = cacheDeps.normalizeAppCacheUserScope(userId);
    if (!safeNotes) {
      await cacheDeps.deleteAppCacheEntry(PUBLISH_CATEGORY_TEMPLATE_NOTES_SCOPE, userScope, safeCategory);
      return;
    }
    await cacheDeps.setAppCacheEntry({
      scope: PUBLISH_CATEGORY_TEMPLATE_NOTES_SCOPE,
      userScope,
      key: safeCategory,
      value: safeNotes,
    });
  }

  async function getPublishCategoryPromptTemplates(
    userId: string,
    category: string,
    templateId: StudioTemplateId = DEFAULT_STUDIO_PROMPT_TEMPLATE_ID
  ): Promise<Partial<StudioPromptTemplates>> {
    const safeCategory = normalizeCategory(category);
    if (!safeCategory) return {};
    const entry = await cacheDeps.getAppCacheEntry(
      PUBLISH_CATEGORY_PROMPT_TEMPLATES_SCOPE,
      cacheDeps.normalizeAppCacheUserScope(userId),
      safeCategory
    );
    const templateMap = sanitizeStoredTemplatePromptMap(entry?.valueJson);
    const selected = sanitizeStoredStudioPromptTemplates(templateMap[templateId]);
    if (Object.keys(selected).length > 0) return selected;
    if (templateId !== DEFAULT_STUDIO_PROMPT_TEMPLATE_ID) {
      return sanitizeStoredStudioPromptTemplates(templateMap[DEFAULT_STUDIO_PROMPT_TEMPLATE_ID]);
    }
    return {};
  }

  async function listPublishCategoryPromptTemplates(
    userId: string,
    templateId: StudioTemplateId = DEFAULT_STUDIO_PROMPT_TEMPLATE_ID
  ): Promise<Partial<Record<string, Partial<StudioPromptTemplates>>>> {
    const rows = await cacheDeps.selectSupabaseRows<AppCacheRow>("app_cache_entries", {
      filters: {
        scope: PUBLISH_CATEGORY_PROMPT_TEMPLATES_SCOPE,
        user_scope: cacheDeps.normalizeAppCacheUserScope(userId),
      },
      orderBy: {
        column: "updated_at_ms",
        ascending: false,
      },
      limit: 5000,
    });
    const result: Partial<Record<string, Partial<StudioPromptTemplates>>> = {};
    for (const row of rows) {
      const category = normalizeCategory(row.cache_key);
      if (!category) continue;
      const templateMap = sanitizeStoredTemplatePromptMap(row.value_json);
      const selected = sanitizeStoredStudioPromptTemplates(templateMap[templateId]);
      if (Object.keys(selected).length > 0) {
        result[category] = selected;
        continue;
      }
      if (templateId !== DEFAULT_STUDIO_PROMPT_TEMPLATE_ID) {
        const fallback = sanitizeStoredStudioPromptTemplates(templateMap[DEFAULT_STUDIO_PROMPT_TEMPLATE_ID]);
        if (Object.keys(fallback).length > 0) {
          result[category] = fallback;
        }
      }
    }
    return result;
  }

  async function setPublishCategoryPromptTemplates(
    userId: string,
    category: string,
    templates: Partial<StudioPromptTemplates> | null,
    templateId: StudioTemplateId = DEFAULT_STUDIO_PROMPT_TEMPLATE_ID
  ): Promise<void> {
    const safeCategory = normalizeCategory(category);
    if (!safeCategory) return;
    const userScope = cacheDeps.normalizeAppCacheUserScope(userId);
    const entry = await cacheDeps.getAppCacheEntry(PUBLISH_CATEGORY_PROMPT_TEMPLATES_SCOPE, userScope, safeCategory);
    const currentMap = sanitizeStoredTemplatePromptMap(entry?.valueJson);
    const payload = sanitizeStoredPromptTemplatePayload(templates, templateId);
    const nextMap: StoredTemplatePromptMap = { ...currentMap };
    if (Object.keys(payload).length > 0) {
      nextMap[templateId] = payload;
    } else {
      delete nextMap[templateId];
    }
    const compactedMap = compactStoredTemplatePromptMap(nextMap);
    if (Object.keys(compactedMap).length <= 0) {
      await cacheDeps.deleteAppCacheEntry(PUBLISH_CATEGORY_PROMPT_TEMPLATES_SCOPE, userScope, safeCategory);
      return;
    }
    await cacheDeps.setAppCacheEntry({
      scope: PUBLISH_CATEGORY_PROMPT_TEMPLATES_SCOPE,
      userScope,
      key: safeCategory,
      value: {
        templates: compactedMap,
      },
    });
  }

  async function clearPublishCategoryPromptTemplates(userId: string, category: string): Promise<void> {
    const safeCategory = normalizeCategory(category);
    if (!safeCategory) return;
    await cacheDeps.deleteAppCacheEntry(
      PUBLISH_CATEGORY_PROMPT_TEMPLATES_SCOPE,
      cacheDeps.normalizeAppCacheUserScope(userId),
      safeCategory
    );
  }

  async function getPublishCategoryTemplatePreset(
    userId: string,
    category: string,
    templateId: StudioTemplateId = DEFAULT_STUDIO_PROMPT_TEMPLATE_ID
  ): Promise<PublishCategoryTemplatePreset | null> {
    const safeCategory = normalizeCategory(category);
    if (!safeCategory) return null;
    const entry = await cacheDeps.getAppCacheEntry(
      PUBLISH_CATEGORY_TEMPLATE_PRESETS_SCOPE,
      cacheDeps.normalizeAppCacheUserScope(userId),
      safeCategory
    );
    if (!entry) return null;
    const map = sanitizeStoredCategoryTemplatePresetMap(entry.valueJson ?? entry.valueText ?? null);
    return map[templateId] || null;
  }

  async function listPublishCategoryTemplatePresets(
    userId: string,
    templateId: StudioTemplateId = DEFAULT_STUDIO_PROMPT_TEMPLATE_ID
  ): Promise<Partial<Record<string, PublishCategoryTemplatePreset>>> {
    const rows = await cacheDeps.selectSupabaseRows<AppCacheRow>("app_cache_entries", {
      filters: {
        scope: PUBLISH_CATEGORY_TEMPLATE_PRESETS_SCOPE,
        user_scope: cacheDeps.normalizeAppCacheUserScope(userId),
      },
    });
    const result: Partial<Record<string, PublishCategoryTemplatePreset>> = {};
    for (const row of rows) {
      const category = normalizeCategory(row.cache_key);
      if (!category) continue;
      const map = sanitizeStoredCategoryTemplatePresetMap(row.value_json ?? row.value_text ?? null);
      const selected = map[templateId];
      if (selected) {
        result[category] = selected;
      }
    }
    return result;
  }

  async function setPublishCategoryTemplatePreset(
    userId: string,
    category: string,
    templatePreset: PublishCategoryTemplatePreset | null,
    templateId: StudioTemplateId = DEFAULT_STUDIO_PROMPT_TEMPLATE_ID
  ): Promise<void> {
    const safeCategory = normalizeCategory(category);
    if (!safeCategory) return;
    const userScope = cacheDeps.normalizeAppCacheUserScope(userId);
    const entry = await cacheDeps.getAppCacheEntry(PUBLISH_CATEGORY_TEMPLATE_PRESETS_SCOPE, userScope, safeCategory);
    const currentMap = sanitizeStoredCategoryTemplatePresetMap(entry?.valueJson ?? entry?.valueText ?? null);
    const nextMap: StoredCategoryTemplatePresetMap = {
      ...currentMap,
    };
    if (templatePreset) {
      // The map key is the profile metadata namespace; the nested id selects the visual renderer.
      nextMap[templateId] = sanitizeStoredCategoryTemplatePreset(templatePreset, templateId) || undefined;
    } else {
      delete nextMap[templateId];
    }
    const compactedMap = compactStoredCategoryTemplatePresetMap(nextMap);
    if (Object.keys(compactedMap).length <= 0) {
      await cacheDeps.deleteAppCacheEntry(PUBLISH_CATEGORY_TEMPLATE_PRESETS_SCOPE, userScope, safeCategory);
      return;
    }
    await cacheDeps.setAppCacheEntry({
      scope: PUBLISH_CATEGORY_TEMPLATE_PRESETS_SCOPE,
      userScope,
      key: safeCategory,
      value: {
        templates: compactedMap,
      },
    });
  }

  async function movePublishCategoryScopedCacheEntry(
    scope: string,
    userId: string,
    currentCategory: string,
    nextCategory: string
  ): Promise<void> {
    const safeCurrent = normalizeCategory(currentCategory);
    const safeNext = normalizeCategory(nextCategory);
    if (!safeCurrent || !safeNext || safeCurrent === safeNext) return;
    const userScope = cacheDeps.normalizeAppCacheUserScope(userId);
    const [currentEntry, nextEntry] = await Promise.all([
      cacheDeps.getAppCacheEntry(scope, userScope, safeCurrent),
      cacheDeps.getAppCacheEntry(scope, userScope, safeNext),
    ]);
    if (!currentEntry) return;
    if (!nextEntry) {
      await cacheDeps.setAppCacheEntry({
        scope,
        userScope,
        key: safeNext,
        value: currentEntry.valueText !== null ? currentEntry.valueText : currentEntry.valueJson,
      });
    }
    await cacheDeps.deleteAppCacheEntry(scope, userScope, safeCurrent);
  }

  async function movePublishCategoryScopedCacheEntries(
    userId: string,
    currentCategory: string,
    nextCategory: string
  ): Promise<void> {
    await Promise.all([
      movePublishCategoryScopedCacheEntry(PUBLISH_CATEGORY_MASCOT_PROFILE_SCOPE, userId, currentCategory, nextCategory),
      movePublishCategoryScopedCacheEntry(PUBLISH_CATEGORY_TEMPLATE_NOTES_SCOPE, userId, currentCategory, nextCategory),
      movePublishCategoryScopedCacheEntry(PUBLISH_CATEGORY_PROMPT_TEMPLATES_SCOPE, userId, currentCategory, nextCategory),
      movePublishCategoryScopedCacheEntry(PUBLISH_CATEGORY_TEMPLATE_PRESETS_SCOPE, userId, currentCategory, nextCategory),
    ]);
  }

  async function deletePublishCategoryScopedCacheEntry(scope: string, userId: string, category: string): Promise<void> {
    const safeCategory = normalizeCategory(category);
    if (!safeCategory) return;
    await cacheDeps.deleteAppCacheEntry(scope, cacheDeps.normalizeAppCacheUserScope(userId), safeCategory);
  }

  return {
    getPublishCategoryMascotProfile,
    listPublishCategoryMascotProfiles,
    setPublishCategoryMascotProfile,
    getPublishCategoryTemplateNotes,
    listPublishCategoryTemplateNotes,
    setPublishCategoryTemplateNotes,
    getPublishCategoryPromptTemplates,
    listPublishCategoryPromptTemplates,
    setPublishCategoryPromptTemplates,
    clearPublishCategoryPromptTemplates,
    getPublishCategoryTemplatePreset,
    listPublishCategoryTemplatePresets,
    setPublishCategoryTemplatePreset,
    movePublishCategoryScopedCacheEntries,
    deletePublishCategoryScopedCacheEntry,
  };
}

const defaultPublishCategoryCacheService = createPublishCategoryCacheService();

export { createPublishCategoryCacheService };
export const getPublishCategoryMascotProfile = defaultPublishCategoryCacheService.getPublishCategoryMascotProfile;
export const listPublishCategoryMascotProfiles = defaultPublishCategoryCacheService.listPublishCategoryMascotProfiles;
export const setPublishCategoryMascotProfile = defaultPublishCategoryCacheService.setPublishCategoryMascotProfile;
export const getPublishCategoryTemplateNotes = defaultPublishCategoryCacheService.getPublishCategoryTemplateNotes;
export const listPublishCategoryTemplateNotes = defaultPublishCategoryCacheService.listPublishCategoryTemplateNotes;
export const setPublishCategoryTemplateNotes = defaultPublishCategoryCacheService.setPublishCategoryTemplateNotes;
export const getPublishCategoryPromptTemplates = defaultPublishCategoryCacheService.getPublishCategoryPromptTemplates;
export const listPublishCategoryPromptTemplates = defaultPublishCategoryCacheService.listPublishCategoryPromptTemplates;
export const setPublishCategoryPromptTemplates = defaultPublishCategoryCacheService.setPublishCategoryPromptTemplates;
export const clearPublishCategoryPromptTemplates = defaultPublishCategoryCacheService.clearPublishCategoryPromptTemplates;
export const getPublishCategoryTemplatePreset = defaultPublishCategoryCacheService.getPublishCategoryTemplatePreset;
export const listPublishCategoryTemplatePresets = defaultPublishCategoryCacheService.listPublishCategoryTemplatePresets;
export const setPublishCategoryTemplatePreset = defaultPublishCategoryCacheService.setPublishCategoryTemplatePreset;
export const movePublishCategoryScopedCacheEntries = defaultPublishCategoryCacheService.movePublishCategoryScopedCacheEntries;
export const deletePublishCategoryScopedCacheEntry = defaultPublishCategoryCacheService.deletePublishCategoryScopedCacheEntry;
