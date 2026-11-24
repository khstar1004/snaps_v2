"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  createStudioRenderJob,
  fetchStudioSfxCatalog,
  fetchStudioRenderJob,
  publishStudioVideo,
  requestStudioRender,
  requestStudioRenderNative,
  type ApiErrorResponse,
} from "@/lib/api/studio-client";
import type { PublishPreflightIssue } from "@/lib/publish/preflight";
import type { PublishCategory } from "@/lib/publish/types";
import { DEFAULT_STUDIO_BGM_PATH, STUDIO_BGM_OPTIONS, type StudioSfxCategoryOption } from "@/lib/studio/audio-options";
import { normalizeStudioPlaybackRate } from "@/lib/studio/playback-rate";
import { buildStudioRenderSfxCues } from "@/lib/studio/render-sfx-cues";
import { toTelemetryErrorDetail } from "@/lib/telemetry/error-detail";
import { trackWorkflowEvent } from "@/lib/telemetry/client";
import { localDateTimeToIso } from "@/lib/ui/datetime";
import { toUiErrorMessage } from "@/lib/ui/publish-errors";
import { readScopedStorage, removeScopedStorage, writeScopedStorage } from "@/lib/ui/scoped-storage";
import type { PreparedSlide, RenderResponse } from "@/types/studio-json";
import type { StudioAssetRenderStage, StudioAssetSnapshot } from "@/types/studio-snapshot";
import type {
  StudioNativeRenderRequest,
  StudioRenderJobRecord,
  StudioRenderNarrationInput,
  StudioRenderSfxCatalogCategory,
} from "@/types/studio-renderer";
import type { Dispatch, SetStateAction } from "react";
import type { StudioTemplateId, StudioTemplatePayload, TemplateBranding, TemplateImageLayout, TemplateLayoutApply } from "./types";
import { buildStudioRenderReuseKey } from "./studio-render-reuse-key";
import { resolveDialogueVoiceSelectionForRender } from "./studio-voice-config-helpers";
import { toRenderCompatibleSlidePayload, toServerRenderVisualSlides } from "./studio-page-helpers";

type RenderUsageState = {
  ttsChars: number;
  renderSeconds: number;
};

type PreviewTimingState = {
  slides: PreparedSlide[];
  frameDurationsSec: number[];
};

type CurrentTemplatePreset = {
  templateId: StudioTemplateId;
  templateData?: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageUrl: string;
  templateImageLayout: TemplateImageLayout;
  templateLayoutApply: TemplateLayoutApply;
};

type RenderAndUploadResult = {
  localUrl: string;
  uploadedUrl: string;
  usage: RenderUsageState;
  studioSnapshotSaved: boolean;
};

type HandleRenderVideoOptions = {
  slidesOverride?: PreparedSlide[];
  throwOnError?: boolean;
};

type CompletedServerNativeRenderResult = {
  uploadedAssetId: string;
  uploadedAssetUrl: string;
  studioSnapshotSaved: boolean;
  usage?: {
    renderMs: number;
  };
  rendererMode: "direct" | "async";
};

type StoredRenderReuseCache = {
  key: string;
  response: RenderResponse;
  savedAt: number;
};

const STUDIO_RENDER_REUSE_CACHE_KEY = "studio-render-reuse-cache-v1";
const STUDIO_RENDER_REUSE_CACHE_TTL_MS = 10 * 60 * 1000;
const STUDIO_RENDER_JOB_POLL_INTERVAL_MS = 1200;
const STUDIO_RENDER_JOB_MAX_WAIT_MS = 15 * 60 * 1000;
const STUDIO_RENDER_JOB_MAX_POLL_INTERVAL_MS = 5000;

function isBlobUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("blob:");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getRenderJobPollDelayMs(attempt: number): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const multiplier = Math.min(1 + safeAttempt * 0.45, STUDIO_RENDER_JOB_MAX_POLL_INTERVAL_MS / STUDIO_RENDER_JOB_POLL_INTERVAL_MS);
  return Math.min(STUDIO_RENDER_JOB_MAX_POLL_INTERVAL_MS, Math.round(STUDIO_RENDER_JOB_POLL_INTERVAL_MS * multiplier));
}

function toRenderJobStatusLabel(stage: "draft" | "final", status: StudioRenderJobRecord["status"]): string {
  if (status === "queued") {
    return stage === "draft" ? "2/3 확인본 렌더 대기열 처리 중" : "2/3 최종 렌더 대기열 처리 중";
  }
  if (status === "processing") {
    return stage === "draft" ? "2/3 확인본 MP4 렌더링 중" : "2/3 최종 MP4 오디오 합성 중";
  }
  return stage === "draft" ? "3/3 확인본 반영 중" : "3/3 최종 결과 반영 중";
}

function shouldUseDirectServerNativeRender(): boolean {
  return process.env.NODE_ENV !== "production";
}

function shouldFallbackToDirectServerNativeRender(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Unexpected token '<'") || /<!doctype|<!DOCTYPE|not valid json|JSON 대신 HTML|status 404/i.test(message);
}

function resolveRenderedAssetUrls(input: {
  stage: "draft" | "final";
  currentDraftUrl: string | null;
  currentFinalUrl: string | null;
  renderedUrl: string;
}): { draftUrl: string | null; finalUrl: string | null } {
  if (input.stage === "draft") {
    return {
      draftUrl: input.renderedUrl,
      finalUrl: input.currentFinalUrl,
    };
  }
  return {
    draftUrl: input.currentDraftUrl,
    finalUrl: input.renderedUrl,
  };
}

function canPersistRenderReuseResponse(_response: RenderResponse): boolean {
  return false;
}

function clearPersistedRenderReuseCache(): void {
  try {
    removeScopedStorage(STUDIO_RENDER_REUSE_CACHE_KEY);
  } catch {
    return;
  }
}

function readPersistedRenderReuseCache(): StoredRenderReuseCache | null {
  try {
    const raw = readScopedStorage(STUDIO_RENDER_REUSE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRenderReuseCache> | null;
    if (!parsed || typeof parsed !== "object") {
      clearPersistedRenderReuseCache();
      return null;
    }
    const key = typeof parsed.key === "string" ? parsed.key : "";
    const savedAt = Number(parsed.savedAt);
    const response = parsed.response;
    if (!key || !Number.isFinite(savedAt) || !response || typeof response !== "object") {
      clearPersistedRenderReuseCache();
      return null;
    }
    if (Date.now() - savedAt > STUDIO_RENDER_REUSE_CACHE_TTL_MS) {
      clearPersistedRenderReuseCache();
      return null;
    }
    if (!canPersistRenderReuseResponse(response as RenderResponse)) {
      clearPersistedRenderReuseCache();
      return null;
    }
    return {
      key,
      response: response as RenderResponse,
      savedAt,
    };
  } catch {
    clearPersistedRenderReuseCache();
    return null;
  }
}

function persistRenderReuseCache(entry: StoredRenderReuseCache): void {
  if (!canPersistRenderReuseResponse(entry.response)) {
    clearPersistedRenderReuseCache();
    return;
  }
  try {
    writeScopedStorage(STUDIO_RENDER_REUSE_CACHE_KEY, JSON.stringify(entry));
  } catch {
    clearPersistedRenderReuseCache();
  }
}

export function useStudioWorkflowActions(input: {
  parsed: unknown;
  slides: PreparedSlide[];
  publishCategory: PublishCategory;
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
  studioPublishPreflightIssues: PublishPreflightIssue[];
  studioSchedulePreflightIssues: PublishPreflightIssue[];
  currentBranding: TemplateBranding;
  currentTemplatePreset: CurrentTemplatePreset;
  buildStudioAssetSnapshotAction: (stage: StudioAssetRenderStage, slides: PreparedSlide[]) => StudioAssetSnapshot;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setPreviewTiming: Dispatch<SetStateAction<PreviewTimingState | null>>;
  setVideoUrl: Dispatch<SetStateAction<string | null>>;
  setUploadedVideoUrl: Dispatch<SetStateAction<string | null>>;
  setRenderUsage: Dispatch<SetStateAction<RenderUsageState | null>>;
  setRenderStatus: Dispatch<SetStateAction<string>>;
  fitDurationsByTail: (durations: number[], total: number) => number[];
  hydrateRenderedSlidesWithPrepared: (renderedSlides: PreparedSlide[], sourceSlides: PreparedSlide[]) => PreparedSlide[];
  nowMs: () => number;
  toTimingDetail: (label: string, ms: number, extra?: string) => string;
  toEventDetailFromApiError: (data: ApiErrorResponse, fallback: string) => string;
}): {
  handleRenderVideo: (preferredStage?: "draft" | "final", options?: HandleRenderVideoOptions) => Promise<RenderAndUploadResult | null>;
  handleUploadedPublishAction: (mode: "now" | "schedule") => Promise<void>;
} {
  const renderReuseCacheRef = useRef<{
    key: string;
    response: RenderResponse;
  } | null>(null);

  useEffect(() => {
    const restored = readPersistedRenderReuseCache();
    renderReuseCacheRef.current = restored
      ? {
          key: restored.key,
          response: restored.response,
        }
      : null;
  }, []);

  const waitForStudioRenderJob = useCallback(
    async (jobId: string, stage: "draft" | "final"): Promise<StudioRenderJobRecord> => {
      const startedAt = Date.now();
      let attempt = 0;
      while (Date.now() - startedAt < STUDIO_RENDER_JOB_MAX_WAIT_MS) {
        const payload = await fetchStudioRenderJob(jobId);
        const job = payload.job;
        input.setRenderStatus(toRenderJobStatusLabel(stage, job.status));
        if (job.status === "completed") {
          return job;
        }
        if (job.status === "failed") {
          const reason = job.error || "서버 Remotion 렌더링에 실패했습니다.";
          throw new Error(job.errorCode ? toUiErrorMessage(job.errorCode, reason) : reason);
        }
        await delay(getRenderJobPollDelayMs(attempt));
        attempt += 1;
      }
      throw new Error("렌더 작업이 제한 시간 안에 완료되지 않았습니다. 잠시 후 다시 확인해 주세요.");
    },
    [input]
  );

  const renderAndUpload = useCallback(
    async (
      payload: Record<string, unknown>,
      preparedSlides: PreparedSlide[],
      options: { stage: "draft" | "final" }
    ): Promise<RenderAndUploadResult> => {
      const routedVoiceSelection = resolveDialogueVoiceSelectionForRender({
        selectedVoiceId: input.selectedVoiceId,
        selectedQuoteVoiceId: input.selectedQuoteVoiceId,
        selectedMaleVoiceId: input.selectedMaleVoiceId,
        selectedFemaleVoiceId: input.selectedFemaleVoiceId,
        source: payload,
        slides: preparedSlides,
      });
      const selectedTypecastSpeedRaw = input.selectedTypecastSpeed.trim();
      const selectedTypecastSpeed =
        selectedTypecastSpeedRaw && Number.isFinite(Number(selectedTypecastSpeedRaw))
          ? Number(selectedTypecastSpeedRaw)
          : undefined;
      const effectivePayload = routedVoiceSelection.source;
      const effectivePreparedSlides = routedVoiceSelection.slides;
      const effectiveTtsVoiceId =
        typeof effectivePayload.ttsVoiceId === "string" && effectivePayload.ttsVoiceId.trim()
          ? effectivePayload.ttsVoiceId.trim()
          : input.selectedVoiceId || undefined;
      const renderSlides = effectivePreparedSlides.map((slide) => toRenderCompatibleSlidePayload(slide));
      const requestBody = {
        ...effectivePayload,
        videoMode: "segments",
        ttsVoiceId: effectiveTtsVoiceId,
        typecastEmotionType: input.selectedTypecastEmotionType.trim() || undefined,
        typecastSpeed: selectedTypecastSpeed,
        slides: renderSlides,
      };
      const renderReuseKey = buildStudioRenderReuseKey(
        effectivePreparedSlides,
        effectiveTtsVoiceId || "",
        input.selectedTypecastEmotionType,
        input.selectedTypecastSpeed,
        {
          mode: typeof effectivePayload.mode === "string" ? effectivePayload.mode : "",
          narrationVoice: typeof effectivePayload.narrationVoice === "string" ? effectivePayload.narrationVoice : "",
          quoteVoice: typeof effectivePayload.quoteVoice === "string" ? effectivePayload.quoteVoice : "",
          speakerVoices: effectivePayload.speakerVoices,
        }
      );
      trackWorkflowEvent({
        name: "render_clicked",
        page: "studio",
        stage: "render",
        status: "success",
      });
      const renderApiStartedAt = input.nowMs();
      const cachedRender = renderReuseCacheRef.current?.key === renderReuseKey ? renderReuseCacheRef.current.response : null;
      let data: RenderResponse;
      if (cachedRender) {
        data = cachedRender;
      } else {
        const renderApiResult = await requestStudioRender(requestBody);
        const responseData = renderApiResult.data;
        if (!renderApiResult.responseOk || !("ok" in responseData) || !responseData.ok) {
          const reason = "error" in responseData ? responseData.error : "렌더 준비에 실패했습니다.";
          const detail = "error" in responseData ? input.toEventDetailFromApiError(responseData, reason) : reason;
          const uiMessage = "error" in responseData ? toUiErrorMessage(responseData.errorCode, reason) : reason;
          trackWorkflowEvent({
            name: "render_failed",
            page: "studio",
            stage: "render",
            status: "failure",
            detail: `${detail}, ${input.toTimingDetail("render_api", input.nowMs() - renderApiStartedAt)}`,
            errorCode: "errorCode" in responseData ? responseData.errorCode : undefined,
            retryable: "retryable" in responseData ? responseData.retryable : undefined,
          });
          trackWorkflowEvent({
            name: "stage_timing",
            page: "studio",
            stage: "render_api",
            status: "failure",
            detail: input.toTimingDetail("render_api", input.nowMs() - renderApiStartedAt),
          });
          throw new Error(uiMessage);
        }
        data = responseData;
        renderReuseCacheRef.current = {
          key: renderReuseKey,
          response: data,
        };
        if (canPersistRenderReuseResponse(data)) {
          persistRenderReuseCache({
            key: renderReuseKey,
            response: data,
            savedAt: Date.now(),
          });
        } else {
          clearPersistedRenderReuseCache();
        }
      }
      if (cachedRender) {
        trackWorkflowEvent({
          name: "stage_timing",
          page: "studio",
          stage: "render_api",
          status: "success",
          detail: input.toTimingDetail("render_api", input.nowMs() - renderApiStartedAt, "reused_cached_audio=1"),
        });
      }
      if (data.videoMode !== "singleAudio" && data.videoMode !== "segments") {
        throw new Error("지원하지 않는 videoMode 응답입니다.");
      }
      const renderApiMs = input.nowMs() - renderApiStartedAt;
      const renderApiExtraParts: string[] = [];
      renderApiExtraParts.push(`video_mode=${data.videoMode}`);
      if (data.videoMode === "segments") {
        renderApiExtraParts.push(`narration_segments=${data.narrationSegmentCount}`);
      }
      if (data.usage?.ttsMs) {
        renderApiExtraParts.push(`tts_server_ms=${Math.round(data.usage.ttsMs)}`);
      }
      if (data.usage?.alignmentProvider) {
        renderApiExtraParts.push(`alignment_provider=${data.usage.alignmentProvider}`);
      }
      if (data.usage?.alignmentResolvedProvider) {
        renderApiExtraParts.push(`alignment_resolved=${data.usage.alignmentResolvedProvider}`);
      }
      if (typeof data.usage?.alignmentFallback === "boolean") {
        renderApiExtraParts.push(`alignment_fallback=${data.usage.alignmentFallback ? 1 : 0}`);
      }
      if (typeof data.usage?.alignmentCanary === "boolean") {
        renderApiExtraParts.push(`alignment_canary=${data.usage.alignmentCanary ? 1 : 0}`);
      }
      trackWorkflowEvent({
        name: "stage_timing",
        page: "studio",
        stage: "render_api",
        status: "success",
        detail: input.toTimingDetail(
          "render_api",
          renderApiMs,
          renderApiExtraParts.length > 0 ? renderApiExtraParts.join(", ") : undefined
        ),
      });
      if (data.usage?.ttsMs) {
        trackWorkflowEvent({
          name: "stage_timing",
          page: "studio",
          stage: "tts",
          status: "success",
          detail: input.toTimingDetail("tts", data.usage.ttsMs),
        });
      }

      const totalSec = Math.max(0.001, data.durationMs / 1000);
      const baseFrameDurations =
        data.videoMode === "segments"
          ? data.timeline.frameDurationsSec.map((value) => (Number.isFinite(value) && value > 0 ? value : 0.001))
          : input.fitDurationsByTail(data.timeline.frameDurationsSec, totalSec);
      const playbackRate = normalizeStudioPlaybackRate(input.playbackRate);
      const frameDurations = baseFrameDurations.map((value) => Math.max(0.001, value / playbackRate));
      const renderedSlides = input.hydrateRenderedSlidesWithPrepared(data.slides, effectivePreparedSlides);
      input.setPreviewTiming({
        slides: renderedSlides,
        frameDurationsSec: frameDurations,
      });
      const selectedBgmPath = STUDIO_BGM_OPTIONS.find((item) => item.id === input.selectedBgmTrack)?.path || DEFAULT_STUDIO_BGM_PATH;
      const narrationInput: StudioRenderNarrationInput =
        data.videoMode === "segments"
          ? data.narrationRef
            ? {
                mode: "segmentsRef",
                narrationRef: data.narrationRef,
              }
            : Array.isArray(data.narrationSegments) && data.narrationSegments.length > 0
            ? {
                mode: "segments",
                segments: data.narrationSegments,
                crossfadeMsByBoundary: Array.isArray(data.crossfadeMsByBoundary) ? data.crossfadeMsByBoundary : [],
              }
            : {
                mode: "segmentsRef",
                narrationRef: data.narrationRef,
              }
          : {
              mode: "singleAudio",
              fullAudio: data.fullAudio,
              fullAudioMimeType: data.fullAudioMimeType,
              fullAudioFormat: data.fullAudioFormat,
            };

      const includeSfx = input.sfxEnabled;
      const effectiveSfxCues = buildStudioRenderSfxCues({
        renderPlan: data.renderPlan,
        slides: data.slides,
        playbackRate: input.playbackRate,
      });
      const sfxCatalogSource =
        includeSfx && input.sfxCategories.length <= 0
          ? await fetchStudioSfxCatalog()
              .then((response) => (Array.isArray(response.categories) ? response.categories : []))
              .catch(() => [])
          : input.sfxCategories;
      const effectiveSfxCatalog: StudioRenderSfxCatalogCategory[] = sfxCatalogSource.map((category) => ({
        id: category.id,
        files: category.files.map((file) => ({
          id: file.id,
          path: file.path,
          defaultGainDb: file.defaultGainDb,
        })),
      }));
      const audioOptions = {
        playbackRate,
        bgmEnabled: options.stage === "final" ? input.bgmEnabled : false,
        bgmPath: selectedBgmPath,
        bgmVolume: input.bgmVolume,
        mixPresetId: input.mixPresetId,
        sfxEnabled: includeSfx,
        sfxMasterGainDb: input.sfxMasterGainDb,
        sfxCues: includeSfx ? effectiveSfxCues : [],
        sfxCatalog: includeSfx ? effectiveSfxCatalog : [],
      };
      const adjustedDurationMs = Math.max(1, Math.round(data.durationMs / playbackRate));
      const heavyJob = adjustedDurationMs >= 90_000 || frameDurations.length >= 24;
      const remotionVisuals = {
        slides: toServerRenderVisualSlides(renderedSlides),
        branding: {
          headerTitle: input.currentBranding.headerTitle,
          headerAccentText: input.currentBranding.headerAccentText || "",
          headerColor: input.currentBranding.headerColor,
          footerColor: input.currentBranding.footerColor,
          infoLineText: input.currentBranding.infoLineText,
          fontFamily: input.currentBranding.fontFamily,
          imageRounded: input.currentBranding.imageRounded,
        },
        templateId: input.currentTemplatePreset.templateId,
        templateData: input.currentTemplatePreset.templateData,
        templateImageEnabled: input.currentTemplatePreset.templateImageEnabled,
        templateImageUrl: input.currentTemplatePreset.templateImageUrl,
        templateImageLayout: input.currentTemplatePreset.templateImageLayout,
        templateLayoutApply: input.currentTemplatePreset.templateLayoutApply,
      };
      const nativeFullAudio = data.videoMode === "singleAudio" ? data.fullAudio : "";
      const nativeRenderRequest: StudioNativeRenderRequest = {
        fullAudio: nativeFullAudio,
        narration: narrationInput,
        durationMs: adjustedDurationMs,
        frameDurationsSec: frameDurations,
        audioOptions,
        visuals: remotionVisuals,
        asset: {
          title: preparedSlides[0]?.title || "숏츠",
          publishCategory: input.publishCategory,
          studioSnapshot: input.buildStudioAssetSnapshotAction(options.stage, renderedSlides),
        },
        meta: {
          selectedRenderer: "server_native",
          heavyJob,
        },
      };

      const runDirectServerNativeRender = async (): Promise<CompletedServerNativeRenderResult> => {
        input.setRenderStatus(options.stage === "draft" ? "2/3 확인본 서버 렌더링 중" : "2/3 최종 서버 렌더링 중");
        const directAttemptStartedAt = input.nowMs();
        const renderNativeResult = await requestStudioRenderNative(nativeRenderRequest);
        const responseData = renderNativeResult.data;
        if (!renderNativeResult.responseOk || !("ok" in responseData) || !responseData.ok) {
          const reason = "error" in responseData ? responseData.error : "서버 네이티브 렌더링에 실패했습니다.";
          const uiMessage = "error" in responseData ? toUiErrorMessage(responseData.errorCode, reason) : reason;
          trackWorkflowEvent({
            name: "stage_timing",
            page: "studio",
            stage: "renderer_attempt",
            status: "failure",
            detail: `renderer=server_native_remotion_direct, attempt_ms=${Math.max(0, Math.round(input.nowMs() - directAttemptStartedAt))}, reason=${uiMessage}`,
          });
          throw new Error(uiMessage);
        }
        trackWorkflowEvent({
          name: "stage_timing",
          page: "studio",
          stage: "renderer_attempt",
          status: "success",
          detail: `renderer=server_native_remotion_direct, attempt_ms=${Math.max(0, Math.round(input.nowMs() - directAttemptStartedAt))}`,
        });
        return {
          uploadedAssetId: responseData.uploadedAssetId,
          uploadedAssetUrl: responseData.uploadedAssetUrl,
          studioSnapshotSaved: responseData.studioSnapshotSaved,
          usage: responseData.usage,
          rendererMode: "direct",
        };
      };

      trackWorkflowEvent({
        name: "stage_timing",
        page: "studio",
        stage: "renderer_plan",
        status: "success",
        detail: [
          `selected=${shouldUseDirectServerNativeRender() ? "server_native_remotion_direct" : "server_native_remotion_async"}`,
          "fallback_enabled=0",
          `heavy_job=${heavyJob ? 1 : 0}`,
          `frames=${frameDurations.length}`,
        ].join(", "),
      });

      let completedRender: CompletedServerNativeRenderResult;
      if (shouldUseDirectServerNativeRender()) {
        completedRender = await runDirectServerNativeRender();
      } else {
        input.setRenderStatus(options.stage === "draft" ? "2/3 확인본 렌더 큐 등록 중" : "2/3 최종 렌더 큐 등록 중");
        const serverAttemptStartedAt = input.nowMs();
        let jobId = "";
        try {
          const jobResponse = await createStudioRenderJob(nativeRenderRequest);
          jobId = jobResponse.job.id;
          const initialJob = jobResponse.job;
          trackWorkflowEvent({
            name: "stage_timing",
            page: "studio",
            stage: "renderer_enqueue",
            status: "success",
            detail: [
              "renderer=server_native_remotion_async",
              `enqueue_ms=${Math.max(0, Math.round(input.nowMs() - serverAttemptStartedAt))}`,
              `initial_status=${initialJob.status}`,
            ].join(", "),
          });
          let completedJob: StudioRenderJobRecord;
          if (initialJob.status === "completed") {
            completedJob = initialJob;
          } else if (initialJob.status === "failed") {
            const reason = initialJob.error || "서버 Remotion 렌더링에 실패했습니다.";
            throw new Error(initialJob.errorCode ? toUiErrorMessage(initialJob.errorCode, reason) : reason);
          } else {
            input.setRenderStatus(toRenderJobStatusLabel(options.stage, initialJob.status));
            completedJob = await waitForStudioRenderJob(jobId, options.stage);
          }
          trackWorkflowEvent({
            name: "stage_timing",
            page: "studio",
            stage: "renderer_attempt",
            status: "success",
            detail: `renderer=server_native_remotion_async, attempt_ms=${Math.max(0, Math.round(input.nowMs() - serverAttemptStartedAt))}, job_id=${jobId}`,
          });
          completedRender = {
            uploadedAssetId: completedJob.uploadedAssetId || "",
            uploadedAssetUrl: completedJob.uploadedAssetUrl || "",
            studioSnapshotSaved: completedJob.studioSnapshotSaved === true,
            usage: completedJob.usage,
            rendererMode: "async",
          };
        } catch (error) {
          trackWorkflowEvent({
            name: "stage_timing",
            page: "studio",
            stage: "renderer_attempt",
            status: "failure",
            detail: `renderer=server_native_remotion_async, attempt_ms=${Math.max(0, Math.round(input.nowMs() - serverAttemptStartedAt))}, job_id=${jobId || "unknown"}, reason=${error instanceof Error ? error.message : String(error)}`,
          });
          if (!shouldFallbackToDirectServerNativeRender(error)) {
            throw error;
          }
          completedRender = await runDirectServerNativeRender();
        }
      }

      if (completedRender.usage?.renderMs) {
        trackWorkflowEvent({
          name: "stage_timing",
          page: "studio",
          stage: "ffmpeg",
          status: "success",
          detail: input.toTimingDetail(
            "ffmpeg",
            completedRender.usage.renderMs,
            `renderer=server_native_remotion_${completedRender.rendererMode}, frames=${frameDurations.length}, fallback_enabled=0`
          ),
        });
      }
      trackWorkflowEvent({
        name: "render_succeeded",
        page: "studio",
        stage: "render",
        status: "success",
        detail: input.toTimingDetail("render_pipeline", input.nowMs() - renderApiStartedAt),
      });

      input.setRenderStatus(options.stage === "draft" ? "3/3 확인본 반영 중" : "3/3 최종 결과 반영 중");
      const uploadedUrl = typeof completedRender.uploadedAssetUrl === "string" ? completedRender.uploadedAssetUrl.trim() : "";
      if (!uploadedUrl) {
        throw new Error("서버 렌더 결과 업로드 URL이 비어 있습니다.");
      }
      const localUrl = uploadedUrl;
      const nextAssetUrls = resolveRenderedAssetUrls({
        stage: options.stage,
        currentDraftUrl: input.videoUrl,
        currentFinalUrl: input.uploadedVideoUrl,
        renderedUrl: uploadedUrl,
      });
      if (options.stage === "draft" && isBlobUrl(input.videoUrl)) URL.revokeObjectURL(input.videoUrl);
      if (options.stage === "final" && isBlobUrl(input.uploadedVideoUrl)) URL.revokeObjectURL(input.uploadedVideoUrl);
      input.setVideoUrl(nextAssetUrls.draftUrl);
      input.setUploadedVideoUrl(nextAssetUrls.finalUrl);
      return {
        localUrl,
        uploadedUrl: options.stage === "final" ? uploadedUrl : "",
        usage: {
          ttsChars: Math.max(0, Number(data.usage?.ttsChars) || 0),
          renderSeconds: Math.max(0, Number(data.usage?.renderSeconds) || Math.round(adjustedDurationMs / 1000)),
        },
        studioSnapshotSaved: completedRender.studioSnapshotSaved,
      };
    },
    [input, waitForStudioRenderJob]
  );

  const publishUploadedVideo = useCallback(
    async (
      uploadedUrl: string,
      title: string,
      mode: "now" | "schedule",
      category: PublishCategory,
      scheduledAt?: string
    ) => {
      try {
        await publishStudioVideo({
          mode,
          category,
          uploadedUrl,
          title,
          scheduledAt,
        });
        trackWorkflowEvent({
          name: "publish_request_succeeded",
          page: "studio",
          stage: mode === "schedule" ? "schedule" : "publish",
          status: "success",
        });
      } catch (error) {
        const telemetry = toTelemetryErrorDetail(error);
        if (telemetry.errorCode) {
          trackWorkflowEvent({
            name: "publish_request_failed",
            page: "studio",
            stage: mode === "schedule" ? "schedule" : "publish",
            status: "failure",
            detail: telemetry.detail,
            errorCode: telemetry.errorCode,
            retryable: telemetry.retryable,
          });
        }
        throw error;
      }
    },
    []
  );

  const handleRenderVideo = useCallback(async (
    preferredStage?: "draft" | "final",
    options?: HandleRenderVideoOptions
  ): Promise<RenderAndUploadResult | null> => {
    const targetSlides = Array.isArray(options?.slidesOverride) ? options.slidesOverride : input.slides;
    if (!input.parsed || targetSlides.length === 0) {
      const missingPreviewError = new Error("먼저 미리보기를 만들어 주세요.");
      if (options?.throwOnError) throw missingPreviewError;
      alert(missingPreviewError.message);
      return null;
    }
    input.setBusy(true);
    const stage = preferredStage || (input.videoUrl ? "final" : "draft");
    input.setRenderStatus(stage === "draft" ? "1/3 확인본 오디오 및 타임라인 계산 중" : "1/3 최종 오디오 및 타임라인 계산 중");
    try {
      const payload = typeof input.parsed === "object" && input.parsed ? (input.parsed as Record<string, unknown>) : {};
      const rendered = await renderAndUpload(payload, targetSlides, { stage });
      input.setRenderUsage(rendered.usage);
      input.setRenderStatus(
        rendered.studioSnapshotSaved
          ? stage === "draft"
            ? "확인본 제작 완료"
            : "최종 영상 제작 완료"
          : stage === "draft"
            ? "확인본 제작 완료 · 보관함 편집 상태 저장은 실패했습니다."
            : "최종 영상 제작 완료 · 보관함 편집 상태 저장은 실패했습니다."
      );
      trackWorkflowEvent({
        name: "video_generated",
        page: "studio",
        stage: "render",
        status: "success",
        detail: `render_stage=${stage}, snapshot_saved=${rendered.studioSnapshotSaved ? 1 : 0}`,
      });
      return rendered;
    } catch (error) {
      const resolvedError = error instanceof Error ? error : new Error(String(error));
      trackWorkflowEvent({
        name: "video_generated",
        page: "studio",
        stage: "render",
        status: "failure",
        detail: resolvedError.message,
      });
      if (!options?.throwOnError) {
        alert(resolvedError.message);
      }
      input.setRenderStatus(input.videoUrl ? "이전 렌더 결과 유지 (이번 제작 실패)" : "");
      if (options?.throwOnError) throw resolvedError;
      return null;
    } finally {
      input.setBusy(false);
    }
  }, [input, renderAndUpload]);

  const handleUploadedPublishAction = useCallback(
    async (mode: "now" | "schedule") => {
      const isSchedule = mode === "schedule";
      const stage = isSchedule ? "schedule" : "publish";
      const uploadEventName = isSchedule ? "upload_scheduled" : "upload_now";
      const activeIssues = isSchedule ? input.studioSchedulePreflightIssues : input.studioPublishPreflightIssues;
      const missingVideoMessage = "영상 생성을 먼저 완료해 주세요.";
      const preflightFallback = isSchedule ? "예약 발행 전 점검 항목을 확인해 주세요." : "발행 전 점검 항목을 확인해 주세요.";
      const loadingMessage = isSchedule ? "기존 업로드 자산으로 예약 작업 등록 중" : "기존 업로드 자산으로 발행 작업 등록 중";
      const successMessage = isSchedule ? "완료: 기존 업로드 자산으로 예약 작업 등록됨" : "완료: 기존 업로드 자산으로 발행 작업 등록됨";

      if (!input.uploadedVideoUrl) {
        alert(missingVideoMessage);
        return;
      }
      if (activeIssues.length > 0) {
        alert(activeIssues[0]?.message || preflightFallback);
        return;
      }

      input.setBusy(true);
      input.setRenderStatus(loadingMessage);
      try {
        trackWorkflowEvent({
          name: "publish_clicked",
          page: "studio",
          stage,
          status: "success",
        });
        await publishUploadedVideo(
          input.uploadedVideoUrl,
          input.publishTitle,
          mode,
          input.publishCategory,
          isSchedule ? localDateTimeToIso(input.quickScheduledAt) : undefined
        );
        input.setRenderStatus(successMessage);
        trackWorkflowEvent({
          name: uploadEventName,
          page: "studio",
          stage,
          status: "success",
          detail: "reuse_uploaded_asset",
        });
      } catch (error) {
        trackWorkflowEvent({
          name: uploadEventName,
          page: "studio",
          stage,
          status: "failure",
          detail: error instanceof Error ? error.message : String(error),
        });
        alert(error instanceof Error ? error.message : String(error));
        input.setRenderStatus("");
      } finally {
        input.setBusy(false);
      }
    },
    [input, publishUploadedVideo]
  );

  return {
    handleRenderVideo,
    handleUploadedPublishAction,
  };
}

export const __internal = {
  resolveRenderedAssetUrls,
  shouldFallbackToDirectServerNativeRender,
  shouldUseDirectServerNativeRender,
};
