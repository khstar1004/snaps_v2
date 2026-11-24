import type { TemplateBrandingSettings } from "@/lib/publish/template-branding";
import type { PublishCategory } from "@/lib/publish/types";
import type { StudioPromptTemplates } from "@/lib/studio/prompt-templates";
import type { StudioTemplateId } from "@/types/studio-template";
import type { PublishCategoryTemplatePreset } from "@/types/publish-template-preset";
import type { CharacterProfile } from "@/types/character-profile";
import { getAppCacheEntry, setAppCacheEntry } from "@/lib/supabase/app-cache";
import { selectSupabaseRows, upsertSupabaseRows } from "@/lib/supabase/server";
import { listGlobalPublishCustomerOwners } from "@/lib/publish/publish-store-owners";
import {
  getPublishCategoryMascotProfile,
  getPublishCategoryPromptTemplates,
  listPublishCategoryMascotProfiles,
  getPublishCategoryTemplateNotes,
  getPublishCategoryTemplatePreset,
  listPublishCategoryPromptTemplates,
  setPublishCategoryMascotProfile,
  listPublishCategoryTemplateNotes,
  listPublishCategoryTemplatePresets,
  setPublishCategoryPromptTemplates,
  setPublishCategoryTemplateNotes,
  setPublishCategoryTemplatePreset,
} from "@/lib/publish/publish-store-category-cache";
import {
  buildPublishCategoryRow,
  normalizeUserScope,
  safeTrim,
  toCategoryBranding,
  toCategoryMetadata,
} from "./publish-store-category-settings-helpers";
import { createPublishCategorySettingsRowService } from "./publish-store-category-settings-rows";

export {
  buildPublishCategoryRow,
  normalizeDeletedAt,
  normalizeStringArray,
  normalizeUserScope,
  safeTrim,
  toCategoryBranding,
  toCategoryMetadata,
  toSoftDeleteFilter,
} from "./publish-store-category-settings-helpers";

const PUBLISH_ANALYTICS_INSIGHTS_SCOPE = "publish_analytics_insights";
export const DEFAULT_STUDIO_PROMPT_TEMPLATE_ID: StudioTemplateId = "default";

export type SoftDeleteMode = "active" | "deleted" | "all";

export type PublishCategoryRow = {
  user_id: string;
  customer_key: string;
  is_default: boolean;
  channel_id?: string | null;
  description: string;
  tags: string[];
  tts_voice_id: string;
  bgm_enabled?: boolean | null;
  bgm_track_id: string;
  mix_preset_id: string;
  bgm_volume?: number | null;
  playback_rate?: number | null;
  sfx_enabled?: boolean | null;
  sfx_master_gain_db?: number | null;
  header_title: string;
  header_accent_text: string;
  header_color: string;
  footer_color: string;
  info_line_text: string;
  font_family: string;
  image_rounded: boolean;
  created_at_ms: number;
  updated_at_ms: number;
  deleted_at_ms?: number | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
};

export type PublishCategoryMetadataRecord = {
  description: string;
  tags: string[];
  ttsVoiceId: string;
  bgmEnabled?: boolean;
  bgmTrackId: string;
  mixPresetId?: string;
  bgmVolume?: number;
  playbackRate?: number;
  sfxEnabled?: boolean;
  sfxMasterGainDb?: number;
  templateNotes: string;
  topicToScriptPrompt?: string;
  scriptToJsonPrompt?: string;
  templatePreset?: PublishCategoryTemplatePreset | null;
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

export type PublishAnalyticsInsightsCacheRecord<T = unknown> = {
  createdAt: number;
  expiresAt: number;
  value: T;
};

export type PublishCategorySettingsServiceDeps = {
  getAppCacheEntry: typeof getAppCacheEntry;
  setAppCacheEntry: typeof setAppCacheEntry;
  selectSupabaseRows: typeof selectSupabaseRows;
  upsertSupabaseRows: typeof upsertSupabaseRows;
};

export type PublishCategorySettingsService = {
  getPublishCategoryChannel(userId: string, category: PublishCategory): Promise<string | null>;
  listPublishCategoryChannels(userId: string): Promise<Partial<Record<PublishCategory, string>>>;
  listGlobalPublishCategoryChannels(): Promise<Partial<Record<PublishCategory, string>>>;
  setPublishCategoryChannel(userId: string, category: PublishCategory, channelId: string | null): Promise<void>;
  getPublishCategoryMetadata(
    userId: string,
    category: PublishCategory,
    templateId?: StudioTemplateId
  ): Promise<PublishCategoryMetadataRecord | null>;
  listPublishCategoryMetadata(
    userId: string,
    templateId?: StudioTemplateId
  ): Promise<Partial<Record<PublishCategory, PublishCategoryMetadataRecord>>>;
  listGlobalPublishCategoryMetadata(
    templateId?: StudioTemplateId
  ): Promise<Partial<Record<PublishCategory, PublishCategoryMetadataRecord>>>;
  setPublishCategoryMetadata(
    userId: string,
    category: PublishCategory,
    metadata: (Omit<PublishCategoryMetadataRecord, "templateNotes"> & { templateNotes?: string }) | null,
    templateId?: StudioTemplateId
  ): Promise<void>;
  getPublishCategoryBranding(userId: string, category: PublishCategory): Promise<TemplateBrandingSettings | null>;
  listPublishCategoryBrandings(userId: string): Promise<Partial<Record<PublishCategory, TemplateBrandingSettings>>>;
  listGlobalPublishCategoryBrandings(): Promise<Partial<Record<PublishCategory, TemplateBrandingSettings>>>;
  setPublishCategoryBranding(userId: string, category: PublishCategory, branding: TemplateBrandingSettings | null): Promise<void>;
  getPublishAnalyticsInsightsCache<T = unknown>(userId: string, key: string): Promise<PublishAnalyticsInsightsCacheRecord<T> | null>;
  setPublishAnalyticsInsightsCache<T = unknown>(input: {
    userId: string;
    key: string;
    value: T;
    ttlSec: number;
  }): Promise<PublishAnalyticsInsightsCacheRecord<T>>;
};

function createPublishCategorySettingsService(
  deps: Partial<PublishCategorySettingsServiceDeps> = {}
): PublishCategorySettingsService {
  const settingsDeps: PublishCategorySettingsServiceDeps = {
    getAppCacheEntry: deps.getAppCacheEntry || getAppCacheEntry,
    setAppCacheEntry: deps.setAppCacheEntry || setAppCacheEntry,
    selectSupabaseRows: deps.selectSupabaseRows || selectSupabaseRows,
    upsertSupabaseRows: deps.upsertSupabaseRows || upsertSupabaseRows,
  };
  const rowService = createPublishCategorySettingsRowService(settingsDeps);

  async function getPublishCategoryChannel(userId: string, category: PublishCategory): Promise<string | null> {
    const row = await rowService.getPublishCategoryRow(userId, category);
    const channelId = typeof row?.channel_id === "string" ? row.channel_id.trim() : "";
    return channelId || null;
  }

  async function listPublishCategoryChannels(userId: string): Promise<Partial<Record<PublishCategory, string>>> {
    const rows = await rowService.listPublishCategoryRows(userId);
    const result: Partial<Record<PublishCategory, string>> = {};
    for (const row of rows) {
      const category = row.customer_key.trim();
      const channelId = typeof row.channel_id === "string" ? row.channel_id.trim() : "";
      if (category && channelId) {
        result[category] = channelId;
      }
    }
    return result;
  }

  async function listGlobalPublishCategoryChannels(): Promise<Partial<Record<PublishCategory, string>>> {
    const rows = await rowService.listAllActivePublishCategoryRows();
    const result: Partial<Record<PublishCategory, string>> = {};
    for (const row of rows) {
      const category = safeTrim(row.customer_key);
      const channelId = safeTrim(row.channel_id);
      if (!category || !channelId || result[category]) continue;
      result[category] = channelId;
    }
    return result;
  }

  async function setPublishCategoryChannel(userId: string, category: PublishCategory, channelId: string | null): Promise<void> {
    const existing = await rowService.ensurePublishCategoryRow(userId, category);
    const next = buildPublishCategoryRow({
      userId,
      category,
      existing,
      overrides: {
        channel_id: (channelId || "").trim() || null,
      },
    });
    await settingsDeps.upsertSupabaseRows<PublishCategoryRow>("publish_customers", [next], {
      onConflict: ["user_id", "customer_key"],
    });
  }

  async function getPublishCategoryMetadata(
    userId: string,
    category: PublishCategory,
    templateId: StudioTemplateId = DEFAULT_STUDIO_PROMPT_TEMPLATE_ID
  ): Promise<PublishCategoryMetadataRecord | null> {
    const [row, mascotProfile, templateNotes, promptTemplates, templatePreset] = await Promise.all([
      rowService.getPublishCategoryRow(userId, category),
      getPublishCategoryMascotProfile(userId, category),
      getPublishCategoryTemplateNotes(userId, category),
      getPublishCategoryPromptTemplates(userId, category, templateId),
      getPublishCategoryTemplatePreset(userId, category, templateId),
    ]);
    const metadata = row ? toCategoryMetadata(row) : null;
    if (!metadata && Object.keys(mascotProfile).length <= 0 && !templateNotes && Object.keys(promptTemplates).length <= 0 && !templatePreset) {
      return null;
    }
    return {
      description: metadata?.description || "",
      tags: metadata?.tags || [],
      ttsVoiceId: metadata?.ttsVoiceId || "",
      bgmEnabled: metadata?.bgmEnabled,
      bgmTrackId: metadata?.bgmTrackId || "",
      mixPresetId: metadata?.mixPresetId,
      bgmVolume: metadata?.bgmVolume,
      playbackRate: metadata?.playbackRate,
      sfxEnabled: metadata?.sfxEnabled,
      sfxMasterGainDb: metadata?.sfxMasterGainDb,
      templateNotes,
      topicToScriptPrompt: promptTemplates.topicToScriptPrompt,
      scriptToJsonPrompt: promptTemplates.scriptToJsonPrompt,
      templatePreset,
      mascotPrompt: mascotProfile.mascotPrompt,
      mascotName: mascotProfile.mascotName,
      mascotDescription: mascotProfile.mascotDescription,
      mascotStyle: mascotProfile.mascotStyle,
      mascotTone: mascotProfile.mascotTone,
      mascotNegativePrompt: mascotProfile.mascotNegativePrompt,
      mascotAnchorImageUrl: mascotProfile.mascotAnchorImageUrl,
      mascotAnchorAssetId: mascotProfile.mascotAnchorAssetId,
      fixedCharacterProfiles: mascotProfile.fixedCharacterProfiles,
    };
  }

  async function listPublishCategoryMetadata(
    userId: string,
    templateId: StudioTemplateId = DEFAULT_STUDIO_PROMPT_TEMPLATE_ID
  ): Promise<Partial<Record<PublishCategory, PublishCategoryMetadataRecord>>> {
    const rows = await rowService.listPublishCategoryRows(userId);
    const [mascotProfilesByCategory, templateNotesByCategory, promptTemplatesByCategory, templatePresetsByCategory] = await Promise.all([
      listPublishCategoryMascotProfiles(userId),
      listPublishCategoryTemplateNotes(userId),
      listPublishCategoryPromptTemplates(userId, templateId),
      listPublishCategoryTemplatePresets(userId, templateId),
    ]);
    const result: Partial<Record<PublishCategory, PublishCategoryMetadataRecord>> = {};
    for (const row of rows) {
      const metadata = toCategoryMetadata(row);
      if (!metadata) continue;
      metadata.templateNotes = templateNotesByCategory[row.customer_key] || "";
      metadata.topicToScriptPrompt = promptTemplatesByCategory[row.customer_key]?.topicToScriptPrompt;
      metadata.scriptToJsonPrompt = promptTemplatesByCategory[row.customer_key]?.scriptToJsonPrompt;
      metadata.templatePreset = templatePresetsByCategory[row.customer_key] || null;
      Object.assign(metadata, mascotProfilesByCategory[row.customer_key] || {});
      result[row.customer_key] = metadata;
    }
    for (const [category, templateNotes] of Object.entries(templateNotesByCategory)) {
      const safeTemplateNotes = templateNotes || "";
      const current = result[category];
      if (current) {
        current.templateNotes = safeTemplateNotes;
        continue;
      }
      result[category] = {
        description: "",
        tags: [],
        ttsVoiceId: "",
        bgmTrackId: "",
        bgmVolume: undefined,
        playbackRate: undefined,
        templateNotes: safeTemplateNotes,
        topicToScriptPrompt: promptTemplatesByCategory[category]?.topicToScriptPrompt,
        scriptToJsonPrompt: promptTemplatesByCategory[category]?.scriptToJsonPrompt,
        templatePreset: templatePresetsByCategory[category] || null,
        ...(mascotProfilesByCategory[category] || {}),
      };
    }
    for (const [category, promptTemplates] of Object.entries(promptTemplatesByCategory)) {
      const current = result[category];
      if (current) {
        current.topicToScriptPrompt = promptTemplates?.topicToScriptPrompt;
        current.scriptToJsonPrompt = promptTemplates?.scriptToJsonPrompt;
        continue;
      }
      result[category] = {
        description: "",
        tags: [],
        ttsVoiceId: "",
        bgmTrackId: "",
        bgmVolume: undefined,
        playbackRate: undefined,
        templateNotes: "",
        topicToScriptPrompt: promptTemplates?.topicToScriptPrompt,
        scriptToJsonPrompt: promptTemplates?.scriptToJsonPrompt,
        templatePreset: templatePresetsByCategory[category] || null,
        ...(mascotProfilesByCategory[category] || {}),
      };
    }
    for (const [category, templatePreset] of Object.entries(templatePresetsByCategory)) {
      const current = result[category];
      if (current) {
        current.templatePreset = templatePreset || null;
        continue;
      }
      result[category] = {
        description: "",
        tags: [],
        ttsVoiceId: "",
        bgmTrackId: "",
        bgmVolume: undefined,
        playbackRate: undefined,
        templateNotes: templateNotesByCategory[category] || "",
        topicToScriptPrompt: promptTemplatesByCategory[category]?.topicToScriptPrompt,
        scriptToJsonPrompt: promptTemplatesByCategory[category]?.scriptToJsonPrompt,
        templatePreset: templatePreset || null,
        ...(mascotProfilesByCategory[category] || {}),
      };
    }
    return result;
  }

  async function listGlobalPublishCategoryMetadata(
    templateId: StudioTemplateId = DEFAULT_STUDIO_PROMPT_TEMPLATE_ID
  ): Promise<Partial<Record<PublishCategory, PublishCategoryMetadataRecord>>> {
    const owners = await listGlobalPublishCustomerOwners();
    const entries = await Promise.all(
      owners.map(async ({ key, ownerUserId }) => {
        const metadata = await getPublishCategoryMetadata(ownerUserId, key, templateId);
        return [key, metadata] as const;
      })
    );
    const result: Partial<Record<PublishCategory, PublishCategoryMetadataRecord>> = {};
    for (const [key, metadata] of entries) {
      if (!metadata) continue;
      result[key] = metadata;
    }
    return result;
  }

  async function setPublishCategoryMetadata(
    userId: string,
    category: PublishCategory,
    metadata: (Omit<PublishCategoryMetadataRecord, "templateNotes"> & { templateNotes?: string }) | null,
    templateId: StudioTemplateId = DEFAULT_STUDIO_PROMPT_TEMPLATE_ID
  ): Promise<void> {
    const existing = await rowService.ensurePublishCategoryRow(userId, category);
    const next = buildPublishCategoryRow({
      userId,
      category,
      existing,
      overrides: {
        description: (metadata?.description || "").trim(),
        tags: (metadata?.tags || []).map((item) => item.trim()).filter(Boolean),
        tts_voice_id: (metadata?.ttsVoiceId || "").trim(),
        bgm_enabled: typeof metadata?.bgmEnabled === "boolean" ? metadata.bgmEnabled : null,
        bgm_track_id: (metadata?.bgmTrackId || "").trim(),
        mix_preset_id: (metadata?.mixPresetId || "").trim(),
        bgm_volume: typeof metadata?.bgmVolume === "number" ? metadata.bgmVolume : null,
        playback_rate: typeof metadata?.playbackRate === "number" ? metadata.playbackRate : null,
        sfx_enabled: typeof metadata?.sfxEnabled === "boolean" ? metadata.sfxEnabled : null,
        sfx_master_gain_db: typeof metadata?.sfxMasterGainDb === "number" ? metadata.sfxMasterGainDb : null,
      },
    });
    await settingsDeps.upsertSupabaseRows<PublishCategoryRow>("publish_customers", [next], {
      onConflict: ["user_id", "customer_key"],
    });
    await setPublishCategoryTemplateNotes(userId, category, metadata?.templateNotes || "");
    if (!metadata) {
      await setPublishCategoryMascotProfile(userId, category, null);
      await setPublishCategoryPromptTemplates(userId, category, {}, templateId);
      await setPublishCategoryTemplatePreset(userId, category, null, templateId);
      return;
    }
    await setPublishCategoryMascotProfile(userId, category, {
      mascotPrompt: metadata?.mascotPrompt,
      mascotName: metadata?.mascotName,
      mascotDescription: metadata?.mascotDescription,
      mascotStyle: metadata?.mascotStyle,
      mascotTone: metadata?.mascotTone,
      mascotNegativePrompt: metadata?.mascotNegativePrompt,
      mascotAnchorImageUrl: metadata?.mascotAnchorImageUrl,
      mascotAnchorAssetId: metadata?.mascotAnchorAssetId,
      fixedCharacterProfiles: metadata?.fixedCharacterProfiles,
    });
    await setPublishCategoryPromptTemplates(
      userId,
      category,
      {
        topicToScriptPrompt: metadata?.topicToScriptPrompt,
        scriptToJsonPrompt: metadata?.scriptToJsonPrompt,
      },
      templateId
    );
    await setPublishCategoryTemplatePreset(userId, category, metadata?.templatePreset || null, templateId);
  }

  async function getPublishCategoryBranding(userId: string, category: PublishCategory): Promise<TemplateBrandingSettings | null> {
    const row = await rowService.getPublishCategoryRow(userId, category);
    return row ? toCategoryBranding(row) : null;
  }

  async function listPublishCategoryBrandings(userId: string): Promise<Partial<Record<PublishCategory, TemplateBrandingSettings>>> {
    const rows = await rowService.listPublishCategoryRows(userId);
    const result: Partial<Record<PublishCategory, TemplateBrandingSettings>> = {};
    for (const row of rows) {
      const branding = toCategoryBranding(row);
      if (!branding) continue;
      result[row.customer_key] = branding;
    }
    return result;
  }

  async function listGlobalPublishCategoryBrandings(): Promise<Partial<Record<PublishCategory, TemplateBrandingSettings>>> {
    const rows = await rowService.listAllActivePublishCategoryRows();
    const result: Partial<Record<PublishCategory, TemplateBrandingSettings>> = {};
    for (const row of rows) {
      const category = safeTrim(row.customer_key);
      if (!category || result[category]) continue;
      const branding = toCategoryBranding(row);
      if (!branding) continue;
      result[category] = branding;
    }
    return result;
  }

  async function setPublishCategoryBranding(userId: string, category: PublishCategory, branding: TemplateBrandingSettings | null): Promise<void> {
    const existing = await rowService.ensurePublishCategoryRow(userId, category);
    const next = buildPublishCategoryRow({
      userId,
      category,
      existing,
      overrides: {
        header_title: branding?.headerTitle.trim() || "",
        header_accent_text: branding?.headerAccentText.trim() || "",
        header_color: branding?.headerColor.trim() || "",
        footer_color: branding?.footerColor.trim() || "",
        info_line_text: branding?.infoLineText.trim() || "",
        font_family: branding?.fontFamily.trim() || "",
        image_rounded: typeof branding?.imageRounded === "boolean" ? branding.imageRounded : true,
      },
    });
    await settingsDeps.upsertSupabaseRows<PublishCategoryRow>("publish_customers", [next], {
      onConflict: ["user_id", "customer_key"],
    });
  }

  async function getPublishAnalyticsInsightsCache<T = unknown>(
    userId: string,
    key: string
  ): Promise<PublishAnalyticsInsightsCacheRecord<T> | null> {
    const entry = await settingsDeps.getAppCacheEntry(PUBLISH_ANALYTICS_INSIGHTS_SCOPE, normalizeUserScope(userId), key);
    if (!entry) return null;
    const expiresAt = typeof entry.expiresAtMs === "number" ? entry.expiresAtMs : entry.updatedAtMs;
    return {
      createdAt: entry.createdAtMs,
      expiresAt,
      value: entry.valueJson as T,
    };
  }

  async function setPublishAnalyticsInsightsCache<T = unknown>(input: {
    userId: string;
    key: string;
    value: T;
    ttlSec: number;
  }): Promise<PublishAnalyticsInsightsCacheRecord<T>> {
    const safeTtlSec = Math.max(60, Math.min(24 * 60 * 60, Math.floor(input.ttlSec)));
    const entry = await settingsDeps.setAppCacheEntry({
      scope: PUBLISH_ANALYTICS_INSIGHTS_SCOPE,
      userScope: normalizeUserScope(input.userId),
      key: input.key,
      value: input.value,
      ttlSec: safeTtlSec,
    });
    return {
      createdAt: entry.createdAtMs,
      expiresAt: entry.expiresAtMs || entry.updatedAtMs,
      value: input.value,
    };
  }

  return {
    getPublishCategoryChannel,
    listPublishCategoryChannels,
    listGlobalPublishCategoryChannels,
    setPublishCategoryChannel,
    getPublishCategoryMetadata,
    listPublishCategoryMetadata,
    listGlobalPublishCategoryMetadata,
    setPublishCategoryMetadata,
    getPublishCategoryBranding,
    listPublishCategoryBrandings,
    listGlobalPublishCategoryBrandings,
    setPublishCategoryBranding,
    getPublishAnalyticsInsightsCache,
    setPublishAnalyticsInsightsCache,
  };
}

const publishCategorySettingsService = createPublishCategorySettingsService();

export {
  createPublishCategorySettingsService,
  publishCategorySettingsService,
  publishCategorySettingsService as defaultPublishCategorySettingsService,
};

export const getPublishCategoryChannel = publishCategorySettingsService.getPublishCategoryChannel;
export const listPublishCategoryChannels = publishCategorySettingsService.listPublishCategoryChannels;
export const listGlobalPublishCategoryChannels = publishCategorySettingsService.listGlobalPublishCategoryChannels;
export const setPublishCategoryChannel = publishCategorySettingsService.setPublishCategoryChannel;
export const getPublishCategoryMetadata = publishCategorySettingsService.getPublishCategoryMetadata;
export const listPublishCategoryMetadata = publishCategorySettingsService.listPublishCategoryMetadata;
export const listGlobalPublishCategoryMetadata = publishCategorySettingsService.listGlobalPublishCategoryMetadata;
export const setPublishCategoryMetadata = publishCategorySettingsService.setPublishCategoryMetadata;
export const getPublishCategoryBranding = publishCategorySettingsService.getPublishCategoryBranding;
export const listPublishCategoryBrandings = publishCategorySettingsService.listPublishCategoryBrandings;
export const listGlobalPublishCategoryBrandings = publishCategorySettingsService.listGlobalPublishCategoryBrandings;
export const setPublishCategoryBranding = publishCategorySettingsService.setPublishCategoryBranding;
export const getPublishAnalyticsInsightsCache = publishCategorySettingsService.getPublishAnalyticsInsightsCache;
export const setPublishAnalyticsInsightsCache = publishCategorySettingsService.setPublishAnalyticsInsightsCache;
