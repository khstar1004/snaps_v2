import { normalizePublishBgmVolume, normalizePublishPlaybackRate, PUBLISH_CATEGORIES } from "@/lib/publish/category-metadata";
import type { TemplateBrandingSettings } from "@/lib/publish/template-branding";
import type { PublishCategory } from "@/lib/publish/types";
import type { PublishCategoryMetadataRecord, PublishCategoryRow, SoftDeleteMode } from "./publish-store-category-settings";

export function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeUserScope(userId: string): string {
  const safe = userId.trim();
  if (!safe) {
    throw new Error("userId is required");
  }
  return safe.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean) : [];
}

export function normalizeDeletedAt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function toSoftDeleteFilter(mode: SoftDeleteMode = "active") {
  if (mode === "all") return undefined;
  if (mode === "deleted") {
    return {
      op: "gt" as const,
      value: 0,
    };
  }
  return null;
}

function hasCategoryMetadata(row: PublishCategoryRow): boolean {
  return Boolean(
    safeTrim(row.description) ||
      normalizeStringArray(row.tags).length > 0 ||
      safeTrim(row.tts_voice_id) ||
      typeof row.bgm_enabled === "boolean" ||
      safeTrim(row.bgm_track_id) ||
      safeTrim(row.mix_preset_id) ||
      typeof row.bgm_volume === "number" ||
      typeof row.playback_rate === "number" ||
      typeof row.sfx_enabled === "boolean" ||
      typeof row.sfx_master_gain_db === "number"
  );
}

export function toCategoryMetadata(row: PublishCategoryRow): PublishCategoryMetadataRecord | null {
  if (!hasCategoryMetadata(row)) return null;
  return {
    description: safeTrim(row.description),
    tags: normalizeStringArray(row.tags),
    ttsVoiceId: safeTrim(row.tts_voice_id),
    bgmEnabled: typeof row.bgm_enabled === "boolean" ? row.bgm_enabled : undefined,
    bgmTrackId: safeTrim(row.bgm_track_id),
    mixPresetId: safeTrim(row.mix_preset_id) || undefined,
    bgmVolume: typeof row.bgm_volume === "number" ? normalizePublishBgmVolume(row.bgm_volume) : undefined,
    playbackRate: typeof row.playback_rate === "number" ? normalizePublishPlaybackRate(row.playback_rate) : undefined,
    sfxEnabled: typeof row.sfx_enabled === "boolean" ? row.sfx_enabled : undefined,
    sfxMasterGainDb: typeof row.sfx_master_gain_db === "number" ? row.sfx_master_gain_db : undefined,
    templateNotes: "",
  };
}

export function toCategoryBranding(row: PublishCategoryRow): TemplateBrandingSettings | null {
  const headerColor = row.header_color.trim();
  const footerColor = row.footer_color.trim();
  if (!headerColor || !footerColor) return null;
  return {
    headerTitle: row.header_title.trim(),
    headerAccentText: row.header_accent_text.trim(),
    headerColor,
    footerColor,
    infoLineText: row.info_line_text.trim(),
    fontFamily: row.font_family.trim(),
    imageRounded: row.image_rounded,
  };
}

export function buildPublishCategoryRow(input: {
  userId: string;
  category: PublishCategory;
  existing?: PublishCategoryRow | null;
  overrides?: Partial<PublishCategoryRow>;
}): PublishCategoryRow {
  const safeCategory = input.category.trim();
  const existing = input.existing || null;
  const overrides = input.overrides || {};
  const now = Date.now();
  return {
    user_id: normalizeUserScope(input.userId),
    customer_key: safeCategory,
    is_default: PUBLISH_CATEGORIES.includes(safeCategory),
    channel_id: typeof overrides.channel_id !== "undefined" ? overrides.channel_id : existing?.channel_id ?? null,
    description: typeof overrides.description === "string" ? overrides.description : existing?.description ?? "",
    tags: Array.isArray(overrides.tags) ? normalizeStringArray(overrides.tags) : normalizeStringArray(existing?.tags),
    tts_voice_id: typeof overrides.tts_voice_id === "string" ? overrides.tts_voice_id : existing?.tts_voice_id ?? "",
    bgm_enabled: typeof overrides.bgm_enabled !== "undefined" ? overrides.bgm_enabled : existing?.bgm_enabled ?? null,
    bgm_track_id: typeof overrides.bgm_track_id === "string" ? overrides.bgm_track_id : existing?.bgm_track_id ?? "",
    mix_preset_id: typeof overrides.mix_preset_id === "string" ? overrides.mix_preset_id : existing?.mix_preset_id ?? "",
    bgm_volume: typeof overrides.bgm_volume !== "undefined" ? overrides.bgm_volume : existing?.bgm_volume ?? null,
    playback_rate: typeof overrides.playback_rate !== "undefined" ? overrides.playback_rate : existing?.playback_rate ?? null,
    sfx_enabled: typeof overrides.sfx_enabled !== "undefined" ? overrides.sfx_enabled : existing?.sfx_enabled ?? null,
    sfx_master_gain_db:
      typeof overrides.sfx_master_gain_db !== "undefined"
        ? overrides.sfx_master_gain_db
        : existing?.sfx_master_gain_db ?? null,
    header_title: typeof overrides.header_title === "string" ? overrides.header_title : existing?.header_title ?? "",
    header_accent_text:
      typeof overrides.header_accent_text === "string" ? overrides.header_accent_text : existing?.header_accent_text ?? "",
    header_color: typeof overrides.header_color === "string" ? overrides.header_color : existing?.header_color ?? "",
    footer_color: typeof overrides.footer_color === "string" ? overrides.footer_color : existing?.footer_color ?? "",
    info_line_text: typeof overrides.info_line_text === "string" ? overrides.info_line_text : existing?.info_line_text ?? "",
    font_family: typeof overrides.font_family === "string" ? overrides.font_family : existing?.font_family ?? "",
    image_rounded: typeof overrides.image_rounded === "boolean" ? overrides.image_rounded : existing?.image_rounded ?? true,
    created_at_ms: existing?.created_at_ms ?? now,
    updated_at_ms: now,
    deleted_at_ms: typeof overrides.deleted_at_ms !== "undefined" ? overrides.deleted_at_ms : null,
    deleted_by: typeof overrides.deleted_by !== "undefined" ? overrides.deleted_by : null,
    delete_reason: typeof overrides.delete_reason !== "undefined" ? overrides.delete_reason : null,
  };
}
