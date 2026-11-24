import {
  getPublishMetadata,
  normalizePublishBgmVolume,
  normalizePublishPlaybackRate,
  PUBLISH_CATEGORIES,
  type PublishMetadata,
} from "@/lib/publish/category-metadata";
import type { PublishCategoryMetadataRecord } from "@/lib/publish/publish-store-category-settings";
import type { PublishCategory } from "@/lib/publish/types";
import { normalizeStudioAudioMixPresetId, normalizeStudioBgmVolume } from "@/lib/studio/audio-mix-presets";
import { getDefaultStudioPromptTemplates } from "@/lib/studio/prompt-templates";
import type { StudioTemplateId } from "@/types/studio-template";

function asBgmVolume(value: unknown): number | undefined {
  if (value === null || typeof value === "undefined" || (typeof value === "string" && !value.trim())) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return normalizePublishBgmVolume(parsed);
}

export function resolvePublishCategoryBgmVolumeUpdate(input: {
  currentBgmVolume: number;
  hasBgmVolume: boolean;
  requestedBgmVolume: unknown;
  hasMixPresetId: boolean;
  nextMixPresetId: string;
  storedHasExplicitBgmVolume: boolean;
}): number {
  if (input.hasBgmVolume) {
    return asBgmVolume(input.requestedBgmVolume) ?? input.currentBgmVolume;
  }
  if (input.hasMixPresetId && !input.storedHasExplicitBgmVolume) {
    return normalizeStudioBgmVolume(undefined, input.nextMixPresetId);
  }
  return input.currentBgmVolume;
}

export function mergePublishCategoryMetadata(
  category: PublishCategory,
  stored: PublishCategoryMetadataRecord | null,
  templateId: StudioTemplateId
): PublishMetadata {
  const fallback = getPublishMetadata(category);
  const templateDefaults = getDefaultStudioPromptTemplates(templateId);
  return {
    description: stored?.description || fallback.description,
    tags: stored?.tags?.length ? stored.tags : fallback.tags,
    ttsVoiceId: stored?.ttsVoiceId || fallback.ttsVoiceId,
    bgmEnabled: typeof stored?.bgmEnabled === "boolean" ? stored.bgmEnabled : fallback.bgmEnabled,
    bgmTrackId: stored?.bgmTrackId || fallback.bgmTrackId,
    mixPresetId: normalizeStudioAudioMixPresetId(stored?.mixPresetId || fallback.mixPresetId),
    bgmVolume:
      typeof stored?.bgmVolume === "number"
        ? normalizePublishBgmVolume(stored.bgmVolume)
        : normalizeStudioBgmVolume(undefined, stored?.mixPresetId || fallback.mixPresetId),
    playbackRate:
      typeof stored?.playbackRate === "number"
        ? normalizePublishPlaybackRate(stored.playbackRate)
        : normalizePublishPlaybackRate(fallback.playbackRate),
    sfxEnabled: typeof stored?.sfxEnabled === "boolean" ? stored.sfxEnabled : fallback.sfxEnabled,
    sfxMasterGainDb: typeof stored?.sfxMasterGainDb === "number" ? stored.sfxMasterGainDb : fallback.sfxMasterGainDb,
    templateNotes: stored?.templateNotes || fallback.templateNotes,
    topicToScriptPrompt: stored?.topicToScriptPrompt || templateDefaults.topicToScriptPrompt || fallback.topicToScriptPrompt,
    scriptToJsonPrompt: stored?.scriptToJsonPrompt || templateDefaults.scriptToJsonPrompt || fallback.scriptToJsonPrompt,
    templatePreset: stored?.templatePreset || null,
    mascotPrompt: stored?.mascotPrompt || fallback.mascotPrompt,
    mascotName: stored?.mascotName || fallback.mascotName,
    mascotDescription: stored?.mascotDescription || fallback.mascotDescription,
    mascotStyle: stored?.mascotStyle || fallback.mascotStyle,
    mascotTone: stored?.mascotTone || fallback.mascotTone,
    mascotNegativePrompt: stored?.mascotNegativePrompt || fallback.mascotNegativePrompt,
    mascotAnchorImageUrl: stored?.mascotAnchorImageUrl || fallback.mascotAnchorImageUrl,
    mascotAnchorAssetId: stored?.mascotAnchorAssetId || fallback.mascotAnchorAssetId,
    fixedCharacterProfiles:
      stored?.fixedCharacterProfiles?.length
        ? stored.fixedCharacterProfiles
        : fallback.fixedCharacterProfiles,
  };
}

export function buildPublishCategoryMetadataMap(input: {
  categories: PublishCategory[];
  storedMap: Partial<Record<PublishCategory, PublishCategoryMetadataRecord>>;
  templateId: StudioTemplateId;
}): Record<PublishCategory, PublishMetadata> {
  const merged: Record<PublishCategory, PublishMetadata> = {};
  const categories = new Set<PublishCategory>([
    ...PUBLISH_CATEGORIES,
    ...input.categories,
    ...(Object.keys(input.storedMap) as PublishCategory[]),
  ]);
  for (const category of categories) {
    merged[category] = mergePublishCategoryMetadata(category, input.storedMap[category] || null, input.templateId);
  }
  return merged;
}
