import type { PublishCategory } from "@/lib/publish/types";
import { DEFAULT_PUBLISH_CATEGORIES } from "@/lib/publish/categories";
import { DEFAULT_STUDIO_BGM_TRACK_ID } from "@/lib/studio/audio-options";
import { DEFAULT_STUDIO_AUDIO_MIX_PRESET_ID, getStudioAudioMixPreset } from "@/lib/studio/audio-mix-presets";
import { DEFAULT_STUDIO_PLAYBACK_RATE, normalizeStudioPlaybackRate } from "@/lib/studio/playback-rate";
import {
  DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE,
  DEFAULT_TOPIC_TO_SCRIPT_PROMPT_TEMPLATE,
} from "@/lib/studio/prompt-templates";
import type { PublishCategoryTemplatePreset } from "@/types/publish-template-preset";
import type { CharacterProfile } from "@/types/character-profile";

export type PublishMetadata = {
  description: string;
  tags: string[];
  ttsVoiceId: string;
  bgmEnabled: boolean;
  bgmTrackId: string;
  mixPresetId: string;
  bgmVolume?: number;
  playbackRate?: number;
  sfxEnabled: boolean;
  sfxMasterGainDb: number;
  templateNotes: string;
  topicToScriptPrompt: string;
  scriptToJsonPrompt: string;
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

export const PUBLISH_CATEGORIES: PublishCategory[] = DEFAULT_PUBLISH_CATEGORIES;
export const DEFAULT_PUBLISH_BGM_VOLUME = getStudioAudioMixPreset(DEFAULT_STUDIO_AUDIO_MIX_PRESET_ID).bgmVolume;
export const DEFAULT_PUBLISH_PLAYBACK_RATE = DEFAULT_STUDIO_PLAYBACK_RATE;

export function normalizePublishBgmVolume(value: unknown, fallback = DEFAULT_PUBLISH_BGM_VOLUME): number {
  if (value === null || typeof value === "undefined" || (typeof value === "string" && !value.trim())) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

export function normalizePublishPlaybackRate(value: unknown, fallback = DEFAULT_PUBLISH_PLAYBACK_RATE): number {
  return normalizeStudioPlaybackRate(value, fallback);
}

const DEFAULT_METADATA: PublishMetadata = {
  description: `채널 운영용 기본 설명입니다.
핵심 메시지를 간결하게 정리하고 시청자 행동(구독/좋아요/댓글)을 유도하세요.
#쇼츠 #뉴스 #브리핑`,
  tags: ["쇼츠", "뉴스", "브리핑"],
  ttsVoiceId: "",
  bgmEnabled: true,
  bgmTrackId: DEFAULT_STUDIO_BGM_TRACK_ID,
  mixPresetId: DEFAULT_STUDIO_AUDIO_MIX_PRESET_ID,
  bgmVolume: DEFAULT_PUBLISH_BGM_VOLUME,
  playbackRate: DEFAULT_PUBLISH_PLAYBACK_RATE,
  sfxEnabled: true,
  sfxMasterGainDb: 2,
  templateNotes: "",
  topicToScriptPrompt: DEFAULT_TOPIC_TO_SCRIPT_PROMPT_TEMPLATE,
  scriptToJsonPrompt: DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE,
};

const METADATA_BY_CATEGORY: Record<string, PublishMetadata> = {
  conservative: {
    description: `공신뉴스 | 진짜 우익·보수 뉴스만 쏙쏙
좌파 왜곡·가짜뉴스 바로잡고 진실만 빠르게 전달합니다
국힘 내부 썰, 보복 징계, 공천권 강탈 등 솔직하게 말 때려박음
구독+좋아요+알림 필수! 댓글로 너네 생각도 풀어봐라!
#공신뉴스 #우익뉴스 #진실보도 #국민의힘 #보수쇼츠`,
    tags: ["공신뉴스", "우익뉴스", "진실보도", "국민의힘", "보수쇼츠"],
    ttsVoiceId: "",
    bgmEnabled: true,
    bgmTrackId: DEFAULT_STUDIO_BGM_TRACK_ID,
    mixPresetId: DEFAULT_STUDIO_AUDIO_MIX_PRESET_ID,
    bgmVolume: DEFAULT_PUBLISH_BGM_VOLUME,
    playbackRate: DEFAULT_PUBLISH_PLAYBACK_RATE,
    sfxEnabled: true,
    sfxMasterGainDb: 2,
    templateNotes: "",
    topicToScriptPrompt: DEFAULT_TOPIC_TO_SCRIPT_PROMPT_TEMPLATE,
    scriptToJsonPrompt: DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE,
  },
  progressive: {
    description: `공신뉴스 | 진보 이슈 집중 브리핑
복지·노동·민생 관점에서 핵심 쟁점을 빠르게 정리합니다
정책 팩트와 논쟁 포인트를 간결하게 전달합니다
구독+좋아요+알림 설정하고 의견은 댓글로 남겨주세요!
#공신뉴스 #진보이슈 #정책브리핑 #민생정치 #진보쇼츠`,
    tags: ["공신뉴스", "진보이슈", "정책브리핑", "민생정치", "진보쇼츠"],
    ttsVoiceId: "",
    bgmEnabled: true,
    bgmTrackId: DEFAULT_STUDIO_BGM_TRACK_ID,
    mixPresetId: DEFAULT_STUDIO_AUDIO_MIX_PRESET_ID,
    bgmVolume: DEFAULT_PUBLISH_BGM_VOLUME,
    playbackRate: DEFAULT_PUBLISH_PLAYBACK_RATE,
    sfxEnabled: true,
    sfxMasterGainDb: 2,
    templateNotes: "",
    topicToScriptPrompt: DEFAULT_TOPIC_TO_SCRIPT_PROMPT_TEMPLATE,
    scriptToJsonPrompt: DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE,
  },
};

export function getPublishMetadata(category: PublishCategory): PublishMetadata {
  return METADATA_BY_CATEGORY[category] || DEFAULT_METADATA;
}

export function listDefaultPublishMetadata(): Record<PublishCategory, PublishMetadata> {
  const result: Record<PublishCategory, PublishMetadata> = {};
  for (const category of PUBLISH_CATEGORIES) {
    result[category] = getPublishMetadata(category);
  }
  return result;
}
