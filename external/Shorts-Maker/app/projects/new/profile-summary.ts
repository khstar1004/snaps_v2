import {
  normalizePublishPlaybackRate,
  type PublishMetadata,
} from "@/lib/publish/category-metadata";
import { STUDIO_BGM_OPTIONS } from "@/lib/studio/audio-options";
import { normalizeStudioTemplateId, STUDIO_TEMPLATE_LABELS } from "@/types/studio-template";

const OUTPUT_FORMAT_LABEL = "Shorts 1080×1920 (9:16)";
const UNSELECTED_VOICE_LABEL = "제작 단계에서 선택";
const UNSELECTED_IMAGE_STYLE_LABEL = "제작 단계에서 설정";
const OFF_LABEL = "끔";
const IMAGE_STYLE_MAX_LENGTH = 96;

export type NewProjectProfileSummary = {
  outputFormat: string;
  template: string;
  defaultVoice: string;
  playbackRate: string;
  bgm: string;
  sfx: string;
  imageStyle: string;
  hasDefaultVoice: boolean;
  hasRequiredStorage: boolean;
};

export function buildNewProjectProfileSummary(
  metadata: PublishMetadata | null | undefined,
  options?: { storageReady?: boolean }
): NewProjectProfileSummary {
  const templateId = normalizeStudioTemplateId(metadata?.templatePreset?.templateId);
  const configuredVoice = normalizeWhitespace(metadata?.ttsVoiceId);

  return {
    outputFormat: OUTPUT_FORMAT_LABEL,
    template: STUDIO_TEMPLATE_LABELS[templateId],
    defaultVoice: configuredVoice || UNSELECTED_VOICE_LABEL,
    playbackRate: formatPlaybackRate(normalizePublishPlaybackRate(metadata?.playbackRate)),
    bgm: resolveBgmLabel(metadata),
    sfx: resolveSfxLabel(metadata),
    imageStyle: resolveImageStyle(metadata),
    hasDefaultVoice: Boolean(configuredVoice),
    hasRequiredStorage: options?.storageReady !== false,
  };
}

function resolveBgmLabel(metadata: PublishMetadata | null | undefined): string {
  if (!metadata?.bgmEnabled) return OFF_LABEL;
  const trackId = normalizeWhitespace(metadata.bgmTrackId);
  return STUDIO_BGM_OPTIONS.find((option) => option.id === trackId)?.label || trackId || "기본 BGM";
}

function resolveSfxLabel(metadata: PublishMetadata | null | undefined): string {
  if (!metadata?.sfxEnabled) return OFF_LABEL;
  const gain = Number.isFinite(metadata.sfxMasterGainDb) ? metadata.sfxMasterGainDb : 0;
  return `자동 추천 · 마스터 ${formatSignedDb(gain)}`;
}

function resolveImageStyle(metadata: PublishMetadata | null | undefined): string {
  const source = [metadata?.mascotPrompt, metadata?.mascotStyle, metadata?.mascotDescription]
    .map((value) => normalizeWhitespace(value))
    .find(Boolean);
  return source ? compactText(source, IMAGE_STYLE_MAX_LENGTH) : UNSELECTED_IMAGE_STYLE_LABEL;
}

function normalizeWhitespace(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function compactText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function formatPlaybackRate(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded)}x`;
}

function formatSignedDb(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const label = Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded);
  return `${rounded > 0 ? "+" : ""}${label} dB`;
}
