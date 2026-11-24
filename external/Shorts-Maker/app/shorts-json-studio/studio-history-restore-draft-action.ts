"use client";

import { startTransition } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { PublishCategory } from "@/lib/publish/types";
import { STUDIO_BGM_OPTIONS } from "@/lib/studio/audio-options";
import { normalizeStudioAudioMixPresetId, normalizeStudioBgmVolume } from "@/lib/studio/audio-mix-presets";
import { normalizeStudioPlaybackRate } from "@/lib/studio/playback-rate";
import {
  parseStudioProjectProfileSnapshot,
  type StudioProjectProfileSnapshot,
} from "@/lib/studio/project-profile-snapshot";
import { normalizeStudioSfxAutoLevel } from "@/lib/studio/sfx-auto-tuning";
import { normalizeStudioImageSource, type ImageSource, type PreparedSlide } from "@/types/studio-json";
import {
  normalizeStudioImageSearchSource,
  normalizeStudioPreselectedMediaApplyMode,
  normalizeStudioPreselectedMediaItems,
  normalizeStudioTemplateId,
  type StudioPreselectedMediaApplyMode,
  type StudioPreselectedMediaItem,
  type StudioWorkDraft,
  type TemplateBranding,
  type LayoutRect,
  type TemplateImageLayout,
  type TemplateLayoutApply,
} from "./types";
import { normalizeStudioTemplateData } from "./components/templates/template-registry";
import {
  readStoredBrandingPresetForCategory,
  type StoredCategoryTemplatePreset,
} from "./studio-category-preset-storage";
import { recoverPersistedStudioRenderStatus } from "./studio-operation-recovery";

type PreviewTimingState = {
  slides: PreparedSlide[];
  frameDurationsSec: number[];
} | null;

type StudioHistoryRestoreDraftTransition = (callback: () => void) => void;

export type StudioHistoryRestoreDraftActionInput = {
  categoryBrandingMap: Record<PublishCategory, TemplateBranding>;
  defaultBrandingByCategory: Record<PublishCategory, TemplateBranding>;
  defaultCategory: PublishCategory;
  preselectedMediaSessionRegistryRef: MutableRefObject<Map<string, StudioPreselectedMediaItem>>;
  publishCategory: PublishCategory;
  skipCategoryAudioPresetRef: MutableRefObject<boolean>;
  transition?: StudioHistoryRestoreDraftTransition;
  videoUrl: string | null;
  revokeIfBlobUrl: (url: string | null) => void;
  setBgmEnabled: Dispatch<SetStateAction<boolean>>;
  setBgmVolume: Dispatch<SetStateAction<number>>;
  setBrandingDraft: Dispatch<SetStateAction<TemplateBranding>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setCrawlMode: Dispatch<SetStateAction<"auto" | "fun" | "stock">>;
  setCodexModel: Dispatch<SetStateAction<string>>;
  setImageErrors: Dispatch<SetStateAction<string[]>>;
  setImageApprovalFingerprint?: Dispatch<SetStateAction<string>>;
  setImageSource: Dispatch<SetStateAction<ImageSource>>;
  setImageSearchSource: Dispatch<SetStateAction<"crawl" | "library">>;
  setJsonText: Dispatch<SetStateAction<string>>;
  setLocalPresetRevision: Dispatch<SetStateAction<number>>;
  setMixPresetId: Dispatch<SetStateAction<string>>;
  setPlaybackRate: Dispatch<SetStateAction<number>>;
  setPreselectedMediaApplyMode: Dispatch<SetStateAction<StudioPreselectedMediaApplyMode>>;
  setPreselectedMediaItems: Dispatch<SetStateAction<StudioPreselectedMediaItem[]>>;
  setPresetBrandingOverride: Dispatch<SetStateAction<{ category: PublishCategory; branding: TemplateBranding } | null>>;
  setPreviewTiming: Dispatch<SetStateAction<PreviewTimingState>>;
  setProjectProfileSnapshot: Dispatch<SetStateAction<StudioProjectProfileSnapshot | null>>;
  setPublishCategory: Dispatch<SetStateAction<PublishCategory>>;
  setRenderNeedsRefresh: Dispatch<SetStateAction<boolean>>;
  setRenderStatus: Dispatch<SetStateAction<string>>;
  setRenderUsage: Dispatch<SetStateAction<{ ttsChars: number; renderSeconds: number } | null>>;
  setScriptMode: Dispatch<SetStateAction<"normal" | "dialogue">>;
  setScriptText: Dispatch<SetStateAction<string>>;
  setScriptToJsonBusy: Dispatch<SetStateAction<boolean>>;
  setQuickScheduledAt: Dispatch<SetStateAction<string>>;
  setSelectedBgmTrack: Dispatch<SetStateAction<string>>;
  setSelectedPreviewGroupIndex: Dispatch<SetStateAction<number>>;
  setSelectedFemaleVoiceId: Dispatch<SetStateAction<string>>;
  setSelectedMaleVoiceId: Dispatch<SetStateAction<string>>;
  setSelectedQuoteVoiceId: Dispatch<SetStateAction<string>>;
  setSelectedTypecastEmotionType: Dispatch<SetStateAction<string>>;
  setSelectedTypecastSpeed: Dispatch<SetStateAction<string>>;
  setSelectedVoiceId: Dispatch<SetStateAction<string>>;
  setSfxAutoLevel: Dispatch<SetStateAction<"sparse" | "balanced" | "dense">>;
  setSfxEnabled: Dispatch<SetStateAction<boolean>>;
  setSfxMasterGainDb: Dispatch<SetStateAction<number>>;
  setShowJsonEditor: Dispatch<SetStateAction<boolean>>;
  setSlides: Dispatch<SetStateAction<PreparedSlide[]>>;
  setTemplateData: Dispatch<SetStateAction<StoredCategoryTemplatePreset["templateData"]>>;
  setTemplateId: Dispatch<SetStateAction<StoredCategoryTemplatePreset["templateId"]>>;
  setTemplateImageEnabled: Dispatch<SetStateAction<boolean>>;
  setTemplateImageLayout: Dispatch<SetStateAction<TemplateImageLayout>>;
  setTemplateImageUrl: Dispatch<SetStateAction<string>>;
  setTemplateLayoutApply: Dispatch<SetStateAction<TemplateLayoutApply>>;
  setTopicText: Dispatch<SetStateAction<string>>;
  setTopicToScriptBusy: Dispatch<SetStateAction<boolean>>;
  setUploadedVideoUrl: Dispatch<SetStateAction<string | null>>;
  setVideoUrl: Dispatch<SetStateAction<string | null>>;
  setWorkName: Dispatch<SetStateAction<string>>;
};

export type StudioHistoryRestoreDraftAction = (draft: StudioWorkDraft) => void;

const DEFAULT_TEMPLATE_IMAGE_LAYOUT: TemplateImageLayout = {
  headerTitleSlot: { x: 0.09, y: 0.018, w: 0.62, h: 0.04 },
  headerAccentSlot: { x: 0.62, y: 0.018, w: 0.28, h: 0.04 },
  titleSlot: { x: 0.09, y: 0.1, w: 0.82, h: 0.07 },
  bodySlot: { x: 0.09, y: 0.25, w: 0.82, h: 0.18 },
  imageSlot: { x: 0.09, y: 0.47, w: 0.82, h: 0.38 },
  infoSlot: { x: 0.09, y: 0.152, w: 0.82, h: 0.03 },
  headerTitleColor: "#ffffff",
  headerAccentColor: "rgba(255,255,255,0.9)",
  titleColor: "#ffffff",
  bodyColor: "#ffffff",
  infoColor: "rgba(255,255,255,0.92)",
  titleAlign: "center",
  bodyAlign: "center",
  headerSize: 17,
  titleSize: 46,
  bodySize: 26,
  infoSize: 15,
};

const DEFAULT_TEMPLATE_LAYOUT_APPLY: TemplateLayoutApply = {
  title: true,
  body: true,
  image: true,
  info: true,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function sanitizeRect(input: unknown, fallback: LayoutRect): LayoutRect {
  if (!input || typeof input !== "object") return fallback;
  const row = input as Record<string, unknown>;
  const x = clamp01(Number(row.x));
  const y = clamp01(Number(row.y));
  const w = Math.max(0.05, Math.min(1, Number(row.w)));
  const h = Math.max(0.04, Math.min(1, Number(row.h)));
  return {
    x,
    y,
    w: Math.min(1 - x, w),
    h: Math.min(1 - y, h),
  };
}

function isSameRectInput(input: unknown, target: { x: number; y: number; w: number; h: number }): boolean {
  if (!input || typeof input !== "object") return false;
  const row = input as Record<string, unknown>;
  return Number(row.x) === target.x && Number(row.y) === target.y && Number(row.w) === target.w && Number(row.h) === target.h;
}

function isLegacyGenericTemplateImageLayout(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const row = input as Record<string, unknown>;
  return (
    isSameRectInput(row.titleSlot, { x: 0.08, y: 0.08, w: 0.84, h: 0.14 }) &&
    isSameRectInput(row.bodySlot, { x: 0.08, y: 0.72, w: 0.84, h: 0.2 }) &&
    isSameRectInput(row.imageSlot, { x: 0.08, y: 0.24, w: 0.84, h: 0.44 }) &&
    isSameRectInput(row.infoSlot, { x: 0.08, y: 0.66, w: 0.84, h: 0.05 })
  );
}

function isLegacyDefaultNewsTemplateImageLayout(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const row = input as Record<string, unknown>;
  return (
    isSameRectInput(row.headerTitleSlot, { x: 0.09, y: 0.018, w: 0.42, h: 0.04 }) &&
    isSameRectInput(row.headerAccentSlot, { x: 0.62, y: 0.018, w: 0.28, h: 0.04 }) &&
    isSameRectInput(row.titleSlot, { x: 0.09, y: 0.1, w: 0.82, h: 0.07 }) &&
    isSameRectInput(row.bodySlot, { x: 0.09, y: 0.25, w: 0.82, h: 0.18 }) &&
    isSameRectInput(row.imageSlot, { x: 0.09, y: 0.47, w: 0.82, h: 0.38 }) &&
    isSameRectInput(row.infoSlot, { x: 0.09, y: 0.175, w: 0.82, h: 0.035 })
  );
}

function normalizeOptionalFontWeight(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(100, Math.min(900, Math.round(parsed / 100) * 100));
}

function normalizeTemplateImageLayout(input: unknown): TemplateImageLayout {
  const baseRow = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const row = isLegacyGenericTemplateImageLayout(input) || isLegacyDefaultNewsTemplateImageLayout(input)
    ? {
        ...baseRow,
        headerTitleSlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerTitleSlot,
        headerAccentSlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerAccentSlot,
        titleSlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.titleSlot,
        bodySlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.bodySlot,
        imageSlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.imageSlot,
        infoSlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.infoSlot,
      }
    : baseRow;
  const titleAlign = row.titleAlign === "left" || row.titleAlign === "right" ? row.titleAlign : "center";
  const bodyAlign = row.bodyAlign === "left" || row.bodyAlign === "right" ? row.bodyAlign : "center";
  const legacyInfoSize = Math.max(8, Math.min(24, Number(row.infoSize) || DEFAULT_TEMPLATE_IMAGE_LAYOUT.infoSize));
  return {
    headerTitleSlot: sanitizeRect(row.headerTitleSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerTitleSlot),
    headerAccentSlot: sanitizeRect(row.headerAccentSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerAccentSlot),
    titleSlot: sanitizeRect(row.titleSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.titleSlot),
    bodySlot: sanitizeRect(row.bodySlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.bodySlot),
    imageSlot: sanitizeRect(row.imageSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.imageSlot),
    infoSlot: sanitizeRect(row.infoSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.infoSlot),
    headerTitleColor:
      typeof row.headerTitleColor === "string" && row.headerTitleColor.trim()
        ? row.headerTitleColor.trim()
        : DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerTitleColor,
    headerAccentColor:
      typeof row.headerAccentColor === "string" && row.headerAccentColor.trim()
        ? row.headerAccentColor.trim()
        : DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerAccentColor,
    titleColor: typeof row.titleColor === "string" && row.titleColor.trim() ? row.titleColor.trim() : DEFAULT_TEMPLATE_IMAGE_LAYOUT.titleColor,
    bodyColor: typeof row.bodyColor === "string" && row.bodyColor.trim() ? row.bodyColor.trim() : DEFAULT_TEMPLATE_IMAGE_LAYOUT.bodyColor,
    infoColor: typeof row.infoColor === "string" && row.infoColor.trim() ? row.infoColor.trim() : DEFAULT_TEMPLATE_IMAGE_LAYOUT.infoColor,
    titleAlign,
    bodyAlign,
    headerSize: Math.max(10, Math.min(32, Number(row.headerSize) || legacyInfoSize + 2)),
    titleSize: Math.max(10, Math.min(52, Number(row.titleSize) || DEFAULT_TEMPLATE_IMAGE_LAYOUT.titleSize)),
    bodySize: Math.max(9, Math.min(36, Number(row.bodySize) || DEFAULT_TEMPLATE_IMAGE_LAYOUT.bodySize)),
    infoSize: legacyInfoSize,
    headerTitleWeight: normalizeOptionalFontWeight(row.headerTitleWeight),
    headerAccentWeight: normalizeOptionalFontWeight(row.headerAccentWeight),
    titleWeight: normalizeOptionalFontWeight(row.titleWeight),
    bodyWeight: normalizeOptionalFontWeight(row.bodyWeight),
    infoWeight: normalizeOptionalFontWeight(row.infoWeight),
  };
}

function normalizeTemplateLayoutApply(input: unknown): TemplateLayoutApply {
  if (!input || typeof input !== "object") return DEFAULT_TEMPLATE_LAYOUT_APPLY;
  const row = input as Record<string, unknown>;
  return {
    title: typeof row.title === "boolean" ? row.title : true,
    body: typeof row.body === "boolean" ? row.body : true,
    image: typeof row.image === "boolean" ? row.image : true,
    info: typeof row.info === "boolean" ? row.info : true,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizePreviewDurations(draft: StudioWorkDraft): number[] {
  return Array.isArray(draft.previewFrameDurationsSec)
    ? draft.previewFrameDurationsSec.filter((value): value is number => Number.isFinite(value) && value > 0)
    : [];
}

function resolveNextBranding(input: StudioHistoryRestoreDraftActionInput, nextCategory: PublishCategory): TemplateBranding {
  return (
    readStoredBrandingPresetForCategory(nextCategory)?.branding ||
    input.categoryBrandingMap[nextCategory] ||
    input.defaultBrandingByCategory[nextCategory] ||
    input.defaultBrandingByCategory[input.defaultCategory]
  );
}

export function createStudioHistoryRestoreDraftAction(
  input: StudioHistoryRestoreDraftActionInput
): StudioHistoryRestoreDraftAction {
  const runTransition = input.transition || startTransition;

  return (draft: StudioWorkDraft) => {
    const nextCategory = input.publishCategory;
    const nextProjectProfileSnapshot = parseStudioProjectProfileSnapshot(draft.projectProfileSnapshot, {
      expectedCategory: nextCategory,
    });
    if (draft.projectProfileSnapshot && !nextProjectProfileSnapshot) {
      input.setRenderStatus("현재 프로젝트와 다른 프로필 스냅샷은 복원할 수 없습니다.");
      return;
    }
    const nextBranding = resolveNextBranding(input, nextCategory);
    const normalizedTemplateId = normalizeStudioTemplateId(draft.templateId);
    const nextTemplatePreset: StoredCategoryTemplatePreset = {
      templateId: normalizedTemplateId,
      templateData: normalizeStudioTemplateData(normalizedTemplateId, draft.templateData),
      templateImageEnabled: Boolean(draft.templateImageEnabled),
      templateImageUrl: typeof draft.templateImageUrl === "string" ? draft.templateImageUrl : "",
      templateImageLayout: normalizeTemplateImageLayout(draft.templateImageLayout),
      templateLayoutApply: normalizeTemplateLayoutApply(draft.templateLayoutApply),
    };
    const nextImageSource: ImageSource = normalizeStudioImageSource(draft.imageSource);
    const nextImageSearchSource = normalizeStudioImageSearchSource(draft.imageSearchSource);
    const nextCrawlMode = draft.crawlMode === "auto" || draft.crawlMode === "fun" || draft.crawlMode === "stock" ? draft.crawlMode : "auto";
    const nextSlides = Array.isArray(draft.slides) ? draft.slides : [];
    const nextPreselectedMediaItems = normalizeStudioPreselectedMediaItems(draft.preselectedMediaItems, {
      sessionRegistry: input.preselectedMediaSessionRegistryRef.current,
    });
    const nextPreselectedMediaApplyMode = normalizeStudioPreselectedMediaApplyMode(draft.preselectedMediaApplyMode);
    const nextTopicText = typeof draft.topicText === "string" ? draft.topicText : "";
    const nextScriptText = typeof draft.scriptText === "string" ? draft.scriptText : "";
    const nextScriptMode = draft.scriptMode === "dialogue" ? "dialogue" : "normal";
    const nextShowJsonEditor = typeof draft.showJsonEditor === "boolean" ? draft.showJsonEditor : false;
    const nextJsonText = typeof draft.jsonText === "string" ? draft.jsonText : "";
    const nextWorkName = typeof draft.workName === "string" ? draft.workName : "";
    const normalizedPlaybackRate = normalizeStudioPlaybackRate(draft.playbackRate);
    const normalizedMixPresetId = normalizeStudioAudioMixPresetId(draft.mixPresetId || "");
    const normalizedBgmVolume = normalizeStudioBgmVolume(draft.bgmVolume, normalizedMixPresetId);
    const normalizedSfxGain = Math.max(-24, Math.min(12, Number(draft.sfxMasterGainDb) || 2));
    const normalizedSfxAutoLevel = normalizeStudioSfxAutoLevel(draft.sfxAutoLevel);
    const restoredPreviewDurations = normalizePreviewDurations(draft);
    const nextImageApprovalFingerprint = typeof draft.imageApprovalFingerprint === "string" ? draft.imageApprovalFingerprint.trim() : "";

    input.skipCategoryAudioPresetRef.current = true;
    input.revokeIfBlobUrl(input.videoUrl);
    input.setVideoUrl(isNonEmptyString(draft.videoUrl) ? draft.videoUrl : null);
    input.setUploadedVideoUrl(isNonEmptyString(draft.uploadedVideoUrl) ? draft.uploadedVideoUrl : null);
    input.setPreviewTiming(
      restoredPreviewDurations.length === nextSlides.length && nextSlides.length > 0
        ? {
            slides: nextSlides,
            frameDurationsSec: restoredPreviewDurations,
          }
        : null
    );
    input.setRenderUsage(null);
    input.setRenderNeedsRefresh(false);
    input.setImageErrors([]);
    input.setBusy(false);
    input.setScriptToJsonBusy(false);
    input.setTopicToScriptBusy(false);
    input.setRenderStatus(
      isNonEmptyString(draft.renderStatus)
        ? recoverPersistedStudioRenderStatus(draft.renderStatus)
        : "선택한 스냅샷을 복원했습니다. 미리보기와 렌더 결과를 다시 확인해 주세요."
    );
    runTransition(() => {
      input.setTopicText(nextTopicText);
      input.setScriptText(nextScriptText);
      input.setScriptMode(nextScriptMode);
      input.setJsonText(nextJsonText);
      input.setWorkName(nextWorkName);
      input.setShowJsonEditor(nextShowJsonEditor);
      input.setSlides(nextSlides);
      input.setPreselectedMediaItems(nextPreselectedMediaItems);
      input.setPreselectedMediaApplyMode(nextPreselectedMediaApplyMode);
      if (nextProjectProfileSnapshot) {
        input.setProjectProfileSnapshot(nextProjectProfileSnapshot);
      }
      input.setPublishCategory(nextCategory);
      input.setImageSource(nextImageSource);
      input.setImageSearchSource(nextImageSearchSource);
      input.setCrawlMode(nextCrawlMode);
      input.setCodexModel(isNonEmptyString(draft.codexModel) ? draft.codexModel : "");
      input.setQuickScheduledAt(isNonEmptyString(draft.quickScheduledAt) ? draft.quickScheduledAt : "");
      input.setSelectedTypecastEmotionType(isNonEmptyString(draft.selectedTypecastEmotionType) ? draft.selectedTypecastEmotionType : "");
      input.setSelectedTypecastSpeed(isNonEmptyString(draft.selectedTypecastSpeed) ? draft.selectedTypecastSpeed : "");
      input.setSelectedVoiceId(isNonEmptyString(draft.selectedVoiceId) ? draft.selectedVoiceId : "");
      input.setSelectedQuoteVoiceId(isNonEmptyString(draft.selectedQuoteVoiceId) ? draft.selectedQuoteVoiceId : "");
      input.setSelectedMaleVoiceId(isNonEmptyString(draft.selectedMaleVoiceId) ? draft.selectedMaleVoiceId : "");
      input.setSelectedFemaleVoiceId(isNonEmptyString(draft.selectedFemaleVoiceId) ? draft.selectedFemaleVoiceId : "");
      input.setImageApprovalFingerprint?.(nextImageApprovalFingerprint);
      input.setPlaybackRate(normalizedPlaybackRate);
      input.setBgmEnabled(typeof draft.bgmEnabled === "boolean" ? draft.bgmEnabled : true);
      input.setSelectedBgmTrack(isNonEmptyString(draft.selectedBgmTrack) ? draft.selectedBgmTrack : STUDIO_BGM_OPTIONS[0]?.id || "");
      const selectedPreviewGroupIndex = Number(draft.selectedPreviewGroupIndex);
      input.setSelectedPreviewGroupIndex(
        Number.isInteger(selectedPreviewGroupIndex) && selectedPreviewGroupIndex >= 0
          ? selectedPreviewGroupIndex
          : 0
      );
      input.setMixPresetId(normalizedMixPresetId);
      input.setBgmVolume(normalizedBgmVolume);
      input.setSfxEnabled(typeof draft.sfxEnabled === "boolean" ? draft.sfxEnabled : true);
      input.setSfxMasterGainDb(normalizedSfxGain);
      input.setSfxAutoLevel(normalizedSfxAutoLevel);
      input.setBrandingDraft(nextBranding);
      input.setPresetBrandingOverride({
        category: nextCategory,
        branding: nextBranding,
      });
      input.setTemplateData(nextTemplatePreset.templateData);
      input.setTemplateId(nextTemplatePreset.templateId);
      input.setTemplateImageEnabled(nextTemplatePreset.templateImageEnabled);
      input.setTemplateImageUrl(nextTemplatePreset.templateImageUrl);
      input.setTemplateImageLayout(nextTemplatePreset.templateImageLayout);
      input.setTemplateLayoutApply(nextTemplatePreset.templateLayoutApply);
    });
  };
}
