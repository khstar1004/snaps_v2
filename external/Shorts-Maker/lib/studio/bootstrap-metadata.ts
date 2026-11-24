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

const DEFAULT_TEMPLATE_ID = "default";

export function mergeStudioBootstrapMetadata(
  category: PublishCategory,
  stored: PublishCategoryMetadataRecord | null
): PublishMetadata {
  const fallback = getPublishMetadata(category);
  const templateDefaults = getDefaultStudioPromptTemplates(DEFAULT_TEMPLATE_ID);
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
  };
}

export function buildStudioBootstrapMetadataMap(input: {
  categories: PublishCategory[];
  storedMetadataMap: Partial<Record<PublishCategory, PublishCategoryMetadataRecord>>;
}): Record<PublishCategory, PublishMetadata> {
  const mergedMetadata: Record<PublishCategory, PublishMetadata> = {} as Record<
    PublishCategory,
    PublishMetadata
  >;
  const categories = new Set<PublishCategory>([
    ...PUBLISH_CATEGORIES,
    ...input.categories,
    ...(Object.keys(input.storedMetadataMap) as PublishCategory[]),
  ]);
  for (const category of categories) {
    mergedMetadata[category] = mergeStudioBootstrapMetadata(category, input.storedMetadataMap[category] || null);
  }
  return mergedMetadata;
}
