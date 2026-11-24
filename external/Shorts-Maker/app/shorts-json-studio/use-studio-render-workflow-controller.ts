"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { PublishPreflightIssue } from "@/lib/publish/preflight";
import type { PublishCategory } from "@/lib/publish/types";
import type { StudioSfxCategoryOption } from "@/lib/studio/audio-options";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import type { CrawlMode, ImageSource, PreparedSlide } from "@/types/studio-json";
import type { StudioAssetRenderStage, StudioAssetSnapshot } from "@/types/studio-snapshot";
import { getStudioTemplateFeatureToggles } from "@/types/studio-feature-document";
import {
  applyStudioCaptionAutoMetadata,
  formatStudioCaptionCueLines,
  parseStudioCaptionCueLine,
} from "@/types/studio-caption";
import { useStudioPrepareFlow } from "./use-studio-prepare-flow";
import { useStudioWorkflowActions } from "./use-studio-workflow-actions";
import type { PreviewTimingState, RenderUsageState } from "./studio-page-helpers";
import type {
  StudioImageSearchSource,
  StudioPreselectedMediaItem,
  StudioTemplateId,
  StudioTemplatePayload,
  TemplateBranding,
  TemplateImageLayout,
  TemplateLayoutApply,
} from "./types";
import {
  applyPreselectedMediaToParsed,
  fitDurationsByTail,
  hydrateRenderedSlidesWithPrepared,
  applyStudioImageSearchSourceToPreparePayload,
  mergePreparedSlidesPreservingManualMedia,
  mergePreparedSlidesPreservingSfx,
  normalizeGeneratedStudioJsonDraft,
  normalizeScriptJsonSlidesPayload,
  nowMs,
  pickPreparePayloadBase,
  toEventDetailFromApiError,
  toPrepareCompatibleSlidePayload,
  toSfxPlanCompatibleSlidePayload,
  toTimingDetail,
} from "./studio-page-helpers";

type CurrentTemplatePreset = {
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageUrl: string;
  templateImageLayout: TemplateImageLayout;
  templateLayoutApply: TemplateLayoutApply;
};

type UseStudioRenderWorkflowControllerInput = {
  parsed: unknown;
  publishCategory: PublishCategory;
  codexModel: string;
  imageSource: ImageSource;
  imageSearchSource: StudioImageSearchSource;
  crawlMode: CrawlMode;
  debugImageSearch: boolean;
  projectProfileSnapshot?: StudioProjectProfileSnapshot | null;
  fixedCharacterProfileId?: string;
  sfxCategoryIds: string[];
  sfxAutoLevel: "sparse" | "balanced" | "dense";
  setBusyAction: Dispatch<SetStateAction<boolean>>;
  setSlidesAction: Dispatch<SetStateAction<PreparedSlide[]>>;
  setPreviewTimingAction: Dispatch<SetStateAction<PreviewTimingState | null>>;
  setImageErrorsAction: Dispatch<SetStateAction<string[]>>;
  setVideoUrlAction: Dispatch<SetStateAction<string | null>>;
  setUploadedVideoUrlAction: Dispatch<SetStateAction<string | null>>;
  setRenderUsageAction: Dispatch<SetStateAction<RenderUsageState | null>>;
  setRenderStatusAction: Dispatch<SetStateAction<string>>;
  setJsonTextAction: Dispatch<SetStateAction<string>>;
  getCurrentSlidesAction: () => PreparedSlide[];
  slides: PreparedSlide[];
  preselectedMediaItems: StudioPreselectedMediaItem[];
  preselectedMediaAssignments: Array<{ itemId: string; slideIndex: number }>;
  effectiveCategoryTemplatePreset: CurrentTemplatePreset;
  lastSfxPlanSourceKeyRef: MutableRefObject<string>;
  sfxPlanSourceKey: string;
  ensureEditPermission: (alertUser?: boolean) => boolean;
  ensurePublishPermission: (alertUser?: boolean) => boolean;
  studioPublishPreflightIssues: PublishPreflightIssue[];
  studioSchedulePreflightIssues: PublishPreflightIssue[];
  currentBranding: TemplateBranding;
  buildStudioAssetSnapshotAction: (stage: StudioAssetRenderStage, slides: PreparedSlide[]) => StudioAssetSnapshot;
  publishTitle: string;
  quickScheduledAt: string;
  selectedFemaleVoiceId: string;
  selectedMaleVoiceId: string;
  selectedQuoteVoiceId: string;
  selectedVoiceId: string;
  selectedTypecastEmotionType: string;
  selectedTypecastSpeed: string;
  playbackRate: number;
  bgmEnabled: boolean;
  selectedBgmTrack: string;
  bgmVolume: number;
  mixPresetId: string;
  sfxEnabled: boolean;
  sfxMasterGainDb: number;
  sfxCategories: StudioSfxCategoryOption[];
  videoUrl: string | null;
  uploadedVideoUrl: string | null;
  renderNeedsRefresh: boolean;
  currentDraftRenderFingerprint: string;
  currentFinalRenderFingerprint: string;
  canStartFinalRender: boolean;
  setLastDraftRenderFingerprint: Dispatch<SetStateAction<string>>;
  setLastFinalRenderFingerprint: Dispatch<SetStateAction<string>>;
  setLastRenderPreflightFingerprint: Dispatch<SetStateAction<string>>;
  onFinalRenderBlockedAction?: () => void;
  setPreviewTiming: Dispatch<SetStateAction<PreviewTimingState | null>>;
  setVideoUrl: Dispatch<SetStateAction<string | null>>;
  setUploadedVideoUrl: Dispatch<SetStateAction<string | null>>;
  setRenderUsage: Dispatch<SetStateAction<RenderUsageState | null>>;
  setRenderStatus: Dispatch<SetStateAction<string>>;
  fitDurationsByTailAction: typeof fitDurationsByTail;
  hydrateRenderedSlidesWithPreparedAction: typeof hydrateRenderedSlidesWithPrepared;
  nowMsAction: typeof nowMs;
  toTimingDetailAction: typeof toTimingDetail;
  toEventDetailFromApiErrorAction: typeof toEventDetailFromApiError;
};

export type UseStudioRenderWorkflowControllerResult = {
  runPrepare: (options?: { preparePayloadOverride?: Record<string, unknown>; throwOnError?: boolean }) => Promise<PreparedSlide[] | null>;
  runRenderVideo: (
    preferredStage?: "draft" | "final",
    options?: { slidesOverride?: PreparedSlide[]; throwOnError?: boolean }
  ) => Promise<{ uploadedUrl: string } | null>;
  handleAutoPlanSfx: () => Promise<void>;
  handleAutoPlanSfxForSlide: (slideIndex: number) => Promise<void>;
  handleRenderVideo: () => Promise<void>;
  handleRenderDraftVideo: () => Promise<void>;
  handleOneClickAuto: () => Promise<void>;
  handleOneClickAutoSchedule: () => Promise<void>;
};

export function resolveStudioRenderWorkflowStage(input: {
  preferredStage?: "draft" | "final";
  renderNeedsRefresh: boolean;
  videoUrl: string | null;
}): "draft" | "final" {
  if (input.preferredStage) return input.preferredStage;
  if (input.renderNeedsRefresh) return "draft";
  return input.videoUrl ? "final" : "draft";
}

export function shouldBlockStudioFinalRender(input: {
  stage: "draft" | "final";
  canStartFinalRender: boolean;
}): boolean {
  return input.stage === "final" && !input.canStartFinalRender;
}

export async function runStudioRenderStageWithPreflight<T>(input: {
  stage: "draft" | "final";
  canStartFinalRender: boolean;
  onBlocked: () => void;
  runAction: () => Promise<T | null>;
}): Promise<T | null> {
  if (shouldBlockStudioFinalRender(input)) {
    input.onBlocked();
    return null;
  }
  return input.runAction();
}

export function useStudioRenderWorkflowController(input: UseStudioRenderWorkflowControllerInput): UseStudioRenderWorkflowControllerResult {
  const {
    handlePrepare: runPrepare,
    handleAutoPlanSfx: runAutoPlanSfx,
    handleAutoPlanSfxForSlide: runAutoPlanSfxForSlide,
  } = useStudioPrepareFlow({
    parsed: input.parsed,
    publishCategory: input.publishCategory,
    codexModel: input.codexModel,
    imageSource: input.imageSource,
    crawlMode: input.crawlMode,
    debugImageSearch: input.debugImageSearch,
    projectProfileSnapshot: input.projectProfileSnapshot,
    fixedCharacterProfileId: input.fixedCharacterProfileId,
    sfxCategoryIds: input.sfxCategoryIds,
    sfxAutoLevel: input.sfxAutoLevel,
    setBusyAction: input.setBusyAction,
    setSlidesAction: input.setSlidesAction,
    setPreviewTimingAction: input.setPreviewTimingAction,
    setImageErrorsAction: input.setImageErrorsAction,
    setRenderUsageAction: input.setRenderUsageAction,
    setRenderStatusAction: input.setRenderStatusAction,
    getCurrentSlidesAction: input.getCurrentSlidesAction,
    getPreparePayloadAction: () => {
      if (!input.parsed || typeof input.parsed !== "object") return null;
      const preparedPayload = applyPreselectedMediaToParsed(
        input.parsed as Record<string, unknown>,
        input.preselectedMediaItems,
        input.preselectedMediaAssignments
      );
      const preparedPayloadWithSearchSource = applyStudioImageSearchSourceToPreparePayload(
        preparedPayload,
        input.imageSearchSource
      );
      const normalizedSlides = normalizeScriptJsonSlidesPayload(preparedPayloadWithSearchSource.slides);
      if (normalizedSlides.length <= 0) return null;
      return {
        ...pickPreparePayloadBase(preparedPayloadWithSearchSource),
        slides: normalizedSlides.map((slide) => toPrepareCompatibleSlidePayload(slide as PreparedSlide)),
      };
    },
    getPreparedPayloadAction: () => {
      if (!input.parsed || typeof input.parsed !== "object") return null;
      const payloadBase = applyStudioImageSearchSourceToPreparePayload(
        input.parsed as Record<string, unknown>,
        input.imageSearchSource
      );
      return {
        ...pickPreparePayloadBase(payloadBase),
        slides: input.slides.map((slide) => toPrepareCompatibleSlidePayload(slide)),
        sfxCategories: input.sfxCategoryIds,
      };
    },
    setJsonTextAction: input.setJsonTextAction,
    buildPreparedPayloadFromSlidesAction: (preparedSlides) =>
      !input.parsed || typeof input.parsed !== "object"
        ? null
        : {
            ...pickPreparePayloadBase(
              applyStudioImageSearchSourceToPreparePayload(
                input.parsed as Record<string, unknown>,
                input.imageSearchSource
              )
            ),
            slides: preparedSlides.map((slide) => toSfxPlanCompatibleSlidePayload(slide)),
            sfxCategories: input.sfxCategoryIds,
          },
    shouldAutoPlanSfxAfterPrepareAction: () =>
    input.slides.length <= 0 || input.lastSfxPlanSourceKeyRef.current !== input.sfxPlanSourceKey,
    markSfxPlanCompletedAction: () => {
      input.lastSfxPlanSourceKeyRef.current = input.sfxPlanSourceKey;
    },
    nowMsAction: input.nowMsAction,
    toTimingDetailAction: input.toTimingDetailAction,
    toEventDetailFromApiErrorAction: input.toEventDetailFromApiErrorAction,
    transformPreparedSlidesAction: (preparedSlides) => {
      const preparedSlidesWithManualMedia = mergePreparedSlidesPreservingManualMedia(preparedSlides, input.slides);
      const preparedSlidesWithPreservedSfx = mergePreparedSlidesPreservingSfx(preparedSlidesWithManualMedia, input.slides);
      const templateFeatureToggles = getStudioTemplateFeatureToggles(
        input.effectiveCategoryTemplatePreset.templateId,
        input.effectiveCategoryTemplatePreset.templateData,
      );
      if (!templateFeatureToggles.cueMetadata || !templateFeatureToggles.autoCaptionFx) {
        return preparedSlidesWithPreservedSfx;
      }
      return preparedSlidesWithPreservedSfx.map((slide) => {
        const cueSource =
          Array.isArray(slide.lines) && slide.lines.length > 0
            ? slide.lines.map((line) => String(line || ""))
            : String(slide.text || "")
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);
        if (cueSource.length === 0) {
          return slide;
        }
        const nextLines = formatStudioCaptionCueLines(
          applyStudioCaptionAutoMetadata(cueSource.map((line) => parseStudioCaptionCueLine(line))),
        );
        return {
          ...slide,
          lines: nextLines,
          captionCues: nextLines.map((line) => parseStudioCaptionCueLine(line)),
        };
      });
    },
  });

  const { handleRenderVideo: runRenderVideoBase, handleUploadedPublishAction } = useStudioWorkflowActions({
    parsed: input.parsed,
    slides: input.slides,
    publishCategory: input.publishCategory,
    publishTitle: input.publishTitle,
    quickScheduledAt: input.quickScheduledAt,
    selectedFemaleVoiceId: input.selectedFemaleVoiceId,
    selectedMaleVoiceId: input.selectedMaleVoiceId,
    selectedQuoteVoiceId: input.selectedQuoteVoiceId,
    selectedVoiceId: input.selectedVoiceId,
    selectedTypecastEmotionType: input.selectedTypecastEmotionType,
    selectedTypecastSpeed: input.selectedTypecastSpeed,
    playbackRate: input.playbackRate,
    bgmEnabled: input.bgmEnabled,
    selectedBgmTrack: input.selectedBgmTrack,
    bgmVolume: input.bgmVolume,
    mixPresetId: input.mixPresetId,
    sfxEnabled: input.sfxEnabled,
    sfxMasterGainDb: input.sfxMasterGainDb,
    sfxCategories: input.sfxCategories,
    videoUrl: input.videoUrl,
    uploadedVideoUrl: input.uploadedVideoUrl,
    studioPublishPreflightIssues: input.studioPublishPreflightIssues,
    studioSchedulePreflightIssues: input.studioSchedulePreflightIssues,
    currentBranding: input.currentBranding,
    currentTemplatePreset: input.effectiveCategoryTemplatePreset,
    buildStudioAssetSnapshotAction: input.buildStudioAssetSnapshotAction,
    setBusy: input.setBusyAction,
    setPreviewTiming: input.setPreviewTiming,
    setVideoUrl: input.setVideoUrl,
    setUploadedVideoUrl: input.setUploadedVideoUrl,
    setRenderUsage: input.setRenderUsage,
    setRenderStatus: input.setRenderStatus,
    fitDurationsByTail: input.fitDurationsByTailAction,
    hydrateRenderedSlidesWithPrepared: input.hydrateRenderedSlidesWithPreparedAction,
    nowMs: input.nowMsAction,
    toTimingDetail: input.toTimingDetailAction,
    toEventDetailFromApiError: input.toEventDetailFromApiErrorAction,
  });

  const runRenderVideo = useCallback(
    async (
      preferredStage?: "draft" | "final",
      options?: { slidesOverride?: PreparedSlide[]; throwOnError?: boolean }
    ) => {
      const stage = resolveStudioRenderWorkflowStage({
        preferredStage,
        renderNeedsRefresh: input.renderNeedsRefresh,
        videoUrl: input.videoUrl,
      });
      const rendered = await runStudioRenderStageWithPreflight({
        stage,
        canStartFinalRender: input.canStartFinalRender,
        onBlocked: () => {
          if (input.onFinalRenderBlockedAction) {
            input.onFinalRenderBlockedAction();
          } else {
            alert("렌더 사전검사를 통과한 뒤 최종 영상을 제작해 주세요.");
          }
        },
        runAction: () => runRenderVideoBase(stage, options),
      });
      if (!rendered) return null;
      if (stage === "draft") {
        input.setLastDraftRenderFingerprint(input.currentDraftRenderFingerprint);
        input.setLastRenderPreflightFingerprint("");
      } else {
        input.setLastFinalRenderFingerprint(input.currentFinalRenderFingerprint);
      }
      return rendered;
    },
    [input, runRenderVideoBase]
  );

  const handleAutoPlanSfx = useCallback(async () => {
    if (!input.ensureEditPermission()) return;
    await runAutoPlanSfx();
  }, [input.ensureEditPermission, runAutoPlanSfx]);

  const handleAutoPlanSfxForSlide = useCallback(
    async (slideIndex: number) => {
      if (!input.ensureEditPermission()) return;
      await runAutoPlanSfxForSlide(slideIndex);
    },
    [input.ensureEditPermission, runAutoPlanSfxForSlide]
  );

  const handleRenderVideo = useCallback(async () => {
    if (!input.ensureEditPermission()) return;
    const stage = resolveStudioRenderWorkflowStage({
      renderNeedsRefresh: input.renderNeedsRefresh,
      videoUrl: input.videoUrl,
    });
    await runRenderVideo(stage);
  }, [input, runRenderVideo]);

  const handleRenderDraftVideo = useCallback(async () => {
    if (!input.ensureEditPermission()) return;
    await runRenderVideo("draft");
  }, [input.ensureEditPermission, runRenderVideo]);

  const handleOneClickAuto = useCallback(async () => {
    if (!input.ensurePublishPermission()) return;
    await handleUploadedPublishAction("now");
  }, [handleUploadedPublishAction, input.ensurePublishPermission]);

  const handleOneClickAutoSchedule = useCallback(async () => {
    if (!input.ensurePublishPermission()) return;
    await handleUploadedPublishAction("schedule");
  }, [handleUploadedPublishAction, input.ensurePublishPermission]);

  return {
    runPrepare,
    runRenderVideo,
    handleAutoPlanSfx,
    handleAutoPlanSfxForSlide,
    handleRenderVideo,
    handleRenderDraftVideo,
    handleOneClickAuto,
    handleOneClickAutoSchedule,
  };
}
