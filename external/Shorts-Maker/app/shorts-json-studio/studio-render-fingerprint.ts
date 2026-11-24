"use client";

import type { TemplateBrandingSettings } from "@/lib/publish/template-branding";
import type { StudioSfxCategoryOption } from "@/lib/studio/audio-options";
import type { PreparedSlide } from "@/types/studio-json";
import type {
  StudioRenderSfxCatalogCategory,
  StudioRenderTemplateImageLayout,
  StudioRenderTemplateLayoutApply,
} from "@/types/studio-renderer";
import type { StudioTemplateId, StudioTemplatePayload } from "@/types/studio-template";
import { buildStudioRenderReuseKey } from "./studio-render-reuse-key";
import { resolveDialogueVoiceSelectionForRender } from "./studio-voice-config-helpers";

export type StudioRenderFingerprintInput = {
  slides: PreparedSlide[];
  source: Record<string, unknown>;
  selectedVoiceId: string;
  selectedQuoteVoiceId: string;
  selectedMaleVoiceId: string;
  selectedFemaleVoiceId: string;
  selectedTypecastEmotionType?: string;
  selectedTypecastSpeed?: string | number;
  playbackRate?: number;
  bgmEnabled?: boolean;
  selectedBgmTrack?: string;
  bgmPath?: string;
  bgmVolume?: number;
  mixPresetId?: string;
  sfxEnabled?: boolean;
  sfxMasterGainDb?: number;
  sfxCategories?: StudioSfxCategoryOption[];
  sfxCatalog?: StudioRenderSfxCatalogCategory[] | StudioSfxCategoryOption[];
  branding?: TemplateBrandingSettings | null;
  templateId?: StudioTemplateId | string;
  templateData?: StudioTemplatePayload | Record<string, unknown> | null;
  templateImageEnabled?: boolean;
  templateImageUrl?: string;
  templateImageLayout?: StudioRenderTemplateImageLayout | unknown;
  templateLayoutApply?: StudioRenderTemplateLayoutApply | unknown;
};

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function trimStringLike(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

function normalizeFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hashString32(value: string, seed: number): string {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function hashStudioFingerprintKey(value: string): string {
  return `${hashString32(value, 0x811c9dc5)}${hashString32(value, 0x9e3779b9)}`;
}

function sanitizeLargeInlineString(value: string): string {
  if (/^data:/i.test(value)) {
    return `data-url:${value.length}:${hashStudioFingerprintKey(value)}`;
  }
  if (/base64,/i.test(value)) {
    return `base64-url:${value.length}:${hashStudioFingerprintKey(value)}`;
  }
  if (value.length > 2_000) {
    return `long-string:${value.length}:${hashStudioFingerprintKey(value)}`;
  }
  return value;
}

function normalizeStable(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === "string") return sanitizeLargeInlineString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(normalizeStable);
  if (typeof value !== "object") return null;

  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const next = normalizeStable((value as Record<string, unknown>)[key]);
    if (typeof next !== "undefined") {
      normalized[key] = next;
    }
  }
  return normalized;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeStable(value));
}

function normalizeRoutedSpeakerVoices(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .map(([speakerId, voiceId]) => ({
      speakerId: trim(speakerId).toLowerCase(),
      voiceId: trim(voiceId),
    }))
    .filter((entry) => entry.speakerId || entry.voiceId)
    .sort((left, right) => left.speakerId.localeCompare(right.speakerId));
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => trimStringLike(item)).filter(Boolean);
}

function normalizeDialogueSegments(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((segment) => {
      if (!segment || typeof segment !== "object") return null;
      const row = segment as Record<string, unknown>;
      return {
        type: trimStringLike(row.type).toLowerCase() === "quote" ? "quote" : "narration",
        text: trimStringLike(row.text),
        speakerId: trimStringLike(row.speakerId),
        voice: trimStringLike(row.voice),
        speed: normalizeFiniteNumber(row.speed),
        pauseAfterMs: normalizeFiniteNumber(row.pauseAfterMs),
      };
    })
    .filter((segment): segment is { type: string; text: string; speakerId: string; voice: string; speed: number | null; pauseAfterMs: number | null } =>
      Boolean(segment?.text || segment?.speakerId || segment?.voice || segment?.speed !== null || segment?.pauseAfterMs !== null)
    );
}

function normalizeSfxCatalog(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((category) => {
      if (!category || typeof category !== "object") return null;
      const row = category as Record<string, unknown>;
      const files = Array.isArray(row.files)
        ? row.files
            .map((file) => {
              if (!file || typeof file !== "object") return null;
              const fileRow = file as Record<string, unknown>;
              return {
                id: trim(fileRow.id),
                path: trim(fileRow.path),
                defaultGainDb: normalizeFiniteNumber(fileRow.defaultGainDb),
              };
            })
            .filter((file): file is { id: string; path: string; defaultGainDb: number | null } => Boolean(file?.id || file?.path))
            .sort((left, right) => `${left.id}:${left.path}`.localeCompare(`${right.id}:${right.path}`))
        : [];
      return {
        id: trim(row.id),
        label: trim(row.label),
        files,
      };
    })
    .filter((category): category is { id: string; label: string; files: Array<{ id: string; path: string; defaultGainDb: number | null }> } =>
      Boolean(category?.id || category?.label || category?.files.length)
    )
    .sort((left, right) => left.id.localeCompare(right.id) || left.label.localeCompare(right.label));
}

function normalizeImageRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    query: trimStringLike(row.query),
    queryCandidates: normalizeStringList(row.queryCandidates),
    preferredProviders: normalizeStringList(row.preferredProviders),
    people: normalizeStringList(row.people),
    scene: trimStringLike(row.scene),
    orientation: trimStringLike(row.orientation),
    mustAvoid: normalizeStringList(row.mustAvoid),
    plannerSource: trimStringLike(row.plannerSource),
  };
}

function normalizeApprovedImageSelection(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    selectedQuery: trimStringLike(row.selectedQuery),
    provider: trimStringLike(row.provider),
    selectedCandidateId: trimStringLike(row.selectedCandidateId),
    selectionReason: trimStringLike(row.selectionReason),
    scoreBreakdown: row.scoreBreakdown ?? null,
  };
}

function normalizeManualImagePrompt(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    source: trimStringLike(row.source),
    mascotName: trimStringLike(row.mascotName),
    characterIds: normalizeStringList(row.characterIds),
    characterNames: normalizeStringList(row.characterNames),
    characterSummary: trimStringLike(row.characterSummary),
    basePrompt: trimStringLike(row.basePrompt),
    scenePrompt: trimStringLike(row.scenePrompt),
    finalPrompt: trimStringLike(row.finalPrompt),
    emotion: trimStringLike(row.emotion),
    action: trimStringLike(row.action),
    background: trimStringLike(row.background),
    props: trimStringLike(row.props),
    composition: trimStringLike(row.composition),
    anchorImageUrl: trimStringLike(row.anchorImageUrl),
    anchorAssetId: trimStringLike(row.anchorAssetId),
    usesFallbackMascot: row.usesFallbackMascot === true,
    warning: trimStringLike(row.warning),
    plannerModel: trimStringLike(row.plannerModel),
  };
}

function normalizeImageBeats(slide: PreparedSlide) {
  if (!Array.isArray(slide.imageBeats)) return [];
  return slide.imageBeats.map((beat) => ({
    beatId: trimStringLike(beat.beatId),
    startLineIndex: normalizeFiniteNumber(beat.startLineIndex),
    clearVisual: beat.clearVisual === true,
    imageUrl: trimStringLike(beat.imageUrl),
    resolvedImageUrl: trimStringLike(beat.resolvedImageUrl),
    resolvedBy: trimStringLike(beat.resolvedBy),
    imageSelection: normalizeApprovedImageSelection(beat.imageSelection),
    mediaUrl: trimStringLike(beat.mediaUrl),
    mediaKind: trimStringLike(beat.mediaKind),
    imageRequest: normalizeImageRequest(beat.imageRequest),
    reason: trimStringLike(beat.reason),
  }));
}

function pickSourceFields(source: Record<string, unknown>, keys: string[]) {
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (typeof source[key] !== "undefined") picked[key] = source[key];
  }
  return picked;
}

export function buildStudioImageApprovalFingerprint(input: StudioRenderFingerprintInput): string {
  const payload = {
    version: 1,
    sourceVisuals: pickSourceFields(input.source, [
      "publishCategory",
      "topic",
      "context",
      "sceneContext",
      "fixedCharacterProfileId",
      "imageStylePrompt",
      "imagePlannerHint",
      "imagePolicy",
      "crawlMode",
      "imageSearchTuning",
      "characterProfiles",
    ]),
    slides: input.slides.map((slide, index) => ({
      index,
      title: trimStringLike(slide.title),
      text: trimStringLike(slide.text),
      narrationText: trimStringLike(slide.narrationText),
      lines: normalizeStringList(slide.lines),
      characterIds: normalizeStringList(slide.characterIds),
      layout: trimStringLike(slide.layout),
      imageUrl: trimStringLike(slide.imageUrl),
      resolvedImageUrl: trimStringLike(slide.resolvedImageUrl),
      resolvedBy: trimStringLike(slide.resolvedBy),
      imageSelection: normalizeApprovedImageSelection(slide.imageSelection),
      mediaUrl: trimStringLike(slide.mediaUrl),
      mediaKind: trimStringLike(slide.mediaKind),
      imageRequest: normalizeImageRequest(slide.imageRequest),
      manualImagePrompt: normalizeManualImagePrompt(slide.manualImagePrompt),
      imageBeats: normalizeImageBeats(slide),
      imageVariantId: trimStringLike(slide.imageVariantId),
      imageVariantStartLineIndex: normalizeFiniteNumber(slide.imageVariantStartLineIndex),
      groupId: normalizeFiniteNumber(slide.groupId),
      stepIndex: normalizeFiniteNumber(slide.stepIndex),
    })),
    visuals: {
      branding: input.branding ?? null,
      templateId: trimStringLike(input.templateId),
      templateData: input.templateData ?? null,
      templateImageEnabled: input.templateImageEnabled === true,
      templateImageUrl: trimStringLike(input.templateImageUrl),
      templateImageLayout: input.templateImageLayout ?? null,
      templateLayoutApply: input.templateLayoutApply ?? null,
    },
  };

  return `studio-image-approval-fp-v1:${hashStudioFingerprintKey(stableStringify(payload))}`;
}

export function buildStudioRenderFingerprint(input: StudioRenderFingerprintInput): string {
  const routed = resolveDialogueVoiceSelectionForRender({
    selectedVoiceId: input.selectedVoiceId,
    selectedQuoteVoiceId: input.selectedQuoteVoiceId,
    selectedMaleVoiceId: input.selectedMaleVoiceId,
    selectedFemaleVoiceId: input.selectedFemaleVoiceId,
    source: input.source,
    slides: input.slides,
  });
  const selectedTypecastSpeed = trim(input.selectedTypecastSpeed);
  const selectedVoiceId = trim(routed.source.ttsVoiceId) || trim(input.selectedVoiceId);
  const renderReuseKey = buildStudioRenderReuseKey(
    routed.slides,
    selectedVoiceId,
    trim(input.selectedTypecastEmotionType),
    selectedTypecastSpeed,
    {
      mode: trim(routed.source.mode),
      narrationVoice: trim(routed.source.narrationVoice),
      quoteVoice: trim(routed.source.quoteVoice),
      speakerVoices: routed.source.speakerVoices,
    }
  );
  const payload = {
    version: 1,
    renderReuseKey,
    voices: {
      selectedVoiceId: trim(input.selectedVoiceId),
      selectedQuoteVoiceId: trim(input.selectedQuoteVoiceId),
      selectedMaleVoiceId: trim(input.selectedMaleVoiceId),
      selectedFemaleVoiceId: trim(input.selectedFemaleVoiceId),
      routed: {
        ttsVoiceId: trim(routed.source.ttsVoiceId),
        narrationVoice: trim(routed.source.narrationVoice),
        quoteVoice: trim(routed.source.quoteVoice),
        speakerVoices: normalizeRoutedSpeakerVoices(routed.source.speakerVoices),
      },
    },
    typecast: {
      emotionType: trim(input.selectedTypecastEmotionType),
      speed: selectedTypecastSpeed,
    },
    audio: {
      playbackRate: normalizeFiniteNumber(input.playbackRate),
      bgmEnabled: input.bgmEnabled === true,
      selectedBgmTrack: trim(input.selectedBgmTrack),
      bgmPath: trim(input.bgmPath),
      bgmVolume: normalizeFiniteNumber(input.bgmVolume),
      mixPresetId: trim(input.mixPresetId),
      sfxEnabled: input.sfxEnabled === true,
      sfxMasterGainDb: normalizeFiniteNumber(input.sfxMasterGainDb),
      sfxCategories: normalizeSfxCatalog(input.sfxCategories),
      sfxCatalog: normalizeSfxCatalog(input.sfxCatalog),
    },
    visuals: {
      branding: input.branding ?? null,
      templateId: trim(input.templateId),
      templateData: input.templateData ?? null,
      templateImageEnabled: input.templateImageEnabled === true,
      templateImageUrl: trim(input.templateImageUrl),
      templateImageLayout: input.templateImageLayout ?? null,
      templateLayoutApply: input.templateLayoutApply ?? null,
    },
  };

  return `studio-render-fp-v1:${hashStudioFingerprintKey(stableStringify(payload))}`;
}

export function buildStudioDraftRenderFingerprint(input: StudioRenderFingerprintInput): string {
  return buildStudioRenderFingerprint({
    ...input,
    bgmEnabled: false,
    selectedBgmTrack: "",
    bgmPath: "",
    bgmVolume: undefined,
  });
}
