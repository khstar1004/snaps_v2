"use client";

import { startTransition, useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { normalizeStudioAudioMixPresetId, normalizeStudioBgmVolume } from "@/lib/studio/audio-mix-presets";
import { normalizeStudioPlaybackRate } from "@/lib/studio/playback-rate";
import { normalizeStudioSfxAutoLevel, type StudioSfxAutoLevel } from "@/lib/studio/sfx-auto-tuning";
import type { PublishCategory } from "@/lib/publish/types";
import { trackWorkflowEvent } from "@/lib/telemetry/client";
import type { PreparedSlide } from "@/types/studio-json";
import { DEFAULT_STUDIO_IMAGE_SEARCH_SOURCE, type StudioPreselectedMediaApplyMode, type StudioPreselectedMediaItem } from "./types";
import { removeStoredStudioDraft } from "./storage";
import {
  applyNarrationVoiceSelectionToScriptJson,
  applyNarrationVoiceSelectionToSlides,
  applyQuoteVoiceSelectionToScriptJson,
  applyVoiceSelectionToScriptJson,
  applyVoiceSelectionToSlides,
} from "./studio-voice-config-helpers";

type CodexUsageState = {
  inputTokens: number;
  outputTokens: number;
};

type ScriptDialogueMode = "normal" | "dialogue";

type UseStudioWorkspaceSettingsActionsInput = {
  clearSelectedHistorySnapshot: () => void;
  confirmSaveBeforeResettingCurrentProject: () => boolean;
  ensureEditPermission: (showAlert?: boolean) => boolean;
  handleJsonTextChange: (value: string) => void;
  hasRenderedVideo: boolean;
  jsonInputStartedRef: MutableRefObject<boolean>;
  lastSfxPlanSourceKeyRef: MutableRefObject<string>;
  markRenderedAssetAsDirty: (message: string) => void;
  parsed: unknown;
  preselectedMediaApplyMode: StudioPreselectedMediaApplyMode;
  preselectedMediaSessionRegistryRef: MutableRefObject<Map<string, StudioPreselectedMediaItem>>;
  publishCategory: PublishCategory;
  resetCategoryAudioPreset: () => void;
  revokeIfBlobUrl: (url: string | null) => void;
  scriptMode: ScriptDialogueMode;
  setBgmEnabled: Dispatch<SetStateAction<boolean>>;
  setBgmVolume: Dispatch<SetStateAction<number>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setCodexUsage: Dispatch<SetStateAction<CodexUsageState | null>>;
  setImageErrors: Dispatch<SetStateAction<string[]>>;
  setImageApprovalFingerprint: Dispatch<SetStateAction<string>>;
  setImageSearchSource: Dispatch<SetStateAction<"crawl" | "library">>;
  setJsonText: Dispatch<SetStateAction<string>>;
  setPlaybackRate: Dispatch<SetStateAction<number>>;
  setPreselectedMediaApplyMode: Dispatch<SetStateAction<StudioPreselectedMediaApplyMode>>;
  setPreselectedMediaItems: Dispatch<SetStateAction<StudioPreselectedMediaItem[]>>;
  setPreviewTiming: Dispatch<SetStateAction<{ slides: PreparedSlide[]; frameDurationsSec: number[] } | null>>;
  setQuickScheduledAt: Dispatch<SetStateAction<string>>;
  setRenderNeedsRefresh: Dispatch<SetStateAction<boolean>>;
  setRenderUsage: Dispatch<SetStateAction<{ ttsChars: number; renderSeconds: number } | null>>;
  setRenderStatus: Dispatch<SetStateAction<string>>;
  setScriptMode: Dispatch<SetStateAction<ScriptDialogueMode>>;
  setScriptText: Dispatch<SetStateAction<string>>;
  setScriptToJsonBusy: Dispatch<SetStateAction<boolean>>;
  setScriptToJsonStatus: Dispatch<SetStateAction<string>>;
  setSelectedBgmTrack: Dispatch<SetStateAction<string>>;
  setSelectedPreviewGroupIndex: Dispatch<SetStateAction<number>>;
  setSelectedFemaleVoiceId: Dispatch<SetStateAction<string>>;
  setSelectedMaleVoiceId: Dispatch<SetStateAction<string>>;
  setSelectedQuoteVoiceId: Dispatch<SetStateAction<string>>;
  setSelectedTypecastEmotionType: Dispatch<SetStateAction<string>>;
  setSelectedTypecastSpeed: Dispatch<SetStateAction<string>>;
  setSelectedVoiceId: Dispatch<SetStateAction<string>>;
  setSfxAutoLevel: Dispatch<SetStateAction<StudioSfxAutoLevel>>;
  setSfxEnabled: Dispatch<SetStateAction<boolean>>;
  setSfxMasterGainDb: Dispatch<SetStateAction<number>>;
  setShowJsonEditor: Dispatch<SetStateAction<boolean>>;
  setSlides: Dispatch<SetStateAction<PreparedSlide[]>>;
  setTopicText: Dispatch<SetStateAction<string>>;
  setTopicToScriptBusy: Dispatch<SetStateAction<boolean>>;
  setTopicToScriptStatus: Dispatch<SetStateAction<string>>;
  setUploadedVideoUrl: Dispatch<SetStateAction<string | null>>;
  setVideoUrl: Dispatch<SetStateAction<string | null>>;
  setWorkName: Dispatch<SetStateAction<string>>;
  setMixPresetId: Dispatch<SetStateAction<string>>;
  topicInputStartedRef: MutableRefObject<boolean>;
  videoUrl: string | null;
};

export function useStudioWorkspaceSettingsActions(input: UseStudioWorkspaceSettingsActionsInput) {
  const performWorkspaceReset = useCallback(
    (telemetryDetail: string) => {
      input.revokeIfBlobUrl(input.videoUrl);
      input.topicInputStartedRef.current = false;
      input.jsonInputStartedRef.current = false;
      input.lastSfxPlanSourceKeyRef.current = "";

      startTransition(() => {
        input.setTopicText("");
        input.setTopicToScriptBusy(false);
        input.setTopicToScriptStatus("");
        input.setScriptText("");
        input.setScriptMode("normal");
        input.setJsonText("");
        input.setWorkName("");
        input.setScriptToJsonBusy(false);
        input.setScriptToJsonStatus("");
        input.setShowJsonEditor(true);
        input.setSlides([]);
        input.setSelectedPreviewGroupIndex(0);
        input.setPreselectedMediaItems([]);
        input.setPreselectedMediaApplyMode("spread");
        input.setImageSearchSource(DEFAULT_STUDIO_IMAGE_SEARCH_SOURCE);
        input.setPreviewTiming(null);
        input.setVideoUrl(null);
        input.setUploadedVideoUrl(null);
        input.setRenderUsage(null);
        input.setRenderNeedsRefresh(false);
        input.setRenderStatus("");
        input.setImageErrors([]);
        input.setImageApprovalFingerprint("");
        input.setCodexUsage(null);
        input.setQuickScheduledAt("");
        input.setBusy(false);
      });

      input.clearSelectedHistorySnapshot();
      input.preselectedMediaSessionRegistryRef.current.clear();

      try {
        removeStoredStudioDraft(input.publishCategory);
        input.resetCategoryAudioPreset();
      } catch {
        return;
      } finally {
        trackWorkflowEvent({
          name: "settings_quick_action_clicked",
          page: "studio",
          stage: "input",
          status: "success",
          detail: telemetryDetail,
        });
      }
    },
    [
      input.clearSelectedHistorySnapshot,
      input.jsonInputStartedRef,
      input.lastSfxPlanSourceKeyRef,
      input.preselectedMediaSessionRegistryRef,
      input.publishCategory,
      input.resetCategoryAudioPreset,
      input.revokeIfBlobUrl,
      input.setBusy,
      input.setCodexUsage,
      input.setImageErrors,
      input.setImageApprovalFingerprint,
      input.setImageSearchSource,
      input.setJsonText,
      input.setPreselectedMediaApplyMode,
      input.setPreselectedMediaItems,
      input.setPreviewTiming,
      input.setQuickScheduledAt,
      input.setRenderNeedsRefresh,
      input.setRenderUsage,
      input.setRenderStatus,
      input.setScriptMode,
      input.setScriptText,
      input.setScriptToJsonBusy,
      input.setScriptToJsonStatus,
      input.setSelectedPreviewGroupIndex,
      input.setShowJsonEditor,
      input.setSlides,
      input.setTopicText,
      input.setTopicToScriptBusy,
      input.setTopicToScriptStatus,
      input.setUploadedVideoUrl,
      input.setVideoUrl,
      input.setWorkName,
      input.topicInputStartedRef,
      input.videoUrl,
    ]
  );

  const handleResetWorkspace = useCallback(() => {
    if (!input.ensureEditPermission()) return;
    const shouldProceed = input.confirmSaveBeforeResettingCurrentProject();
    if (!shouldProceed) return;
    performWorkspaceReset("workspace_reset_current_project");
  }, [input.confirmSaveBeforeResettingCurrentProject, input.ensureEditPermission, performWorkspaceReset]);

  const handlePlaybackRateChange = useCallback(
    (value: number) => {
      if (!input.ensureEditPermission(false)) return;
      const nextRate = normalizeStudioPlaybackRate(value);
      input.setPlaybackRate(nextRate);
      if (!input.hasRenderedVideo) return;
      input.markRenderedAssetAsDirty(`배속이 ${nextRate.toFixed(1)}x로 변경되었습니다. 확인본을 다시 제작해 반영해 주세요.`);
    },
    [input.ensureEditPermission, input.hasRenderedVideo, input.markRenderedAssetAsDirty, input.setPlaybackRate]
  );

  const handleVoiceChange = useCallback(
    (value: string) => {
      if (!input.ensureEditPermission(false)) return;
      const nextVoiceId = String(value || "").trim();
      input.setSelectedVoiceId(nextVoiceId);
      const shouldUseDialogueRouting =
        input.scriptMode === "dialogue" ||
        (input.parsed &&
          typeof input.parsed === "object" &&
          typeof (input.parsed as Record<string, unknown>).mode === "string" &&
          String((input.parsed as Record<string, unknown>).mode).trim().toLowerCase() === "dialogue");
      input.setSlides((current) =>
        shouldUseDialogueRouting ? applyNarrationVoiceSelectionToSlides(current, nextVoiceId) : applyVoiceSelectionToSlides(current, nextVoiceId)
      );

      if (input.parsed && typeof input.parsed === "object") {
        const nextJson = shouldUseDialogueRouting
          ? applyNarrationVoiceSelectionToScriptJson(input.parsed as Record<string, unknown>, nextVoiceId)
          : applyVoiceSelectionToScriptJson(input.parsed as Record<string, unknown>, nextVoiceId);
        input.handleJsonTextChange(JSON.stringify(nextJson, null, 2));
      }

      if (!input.hasRenderedVideo) return;
      input.markRenderedAssetAsDirty("음성 설정이 변경되었습니다. 기존 슬라이드/TTS 재료를 재사용해 다시 렌더합니다.");
    },
    [
      input.ensureEditPermission,
      input.handleJsonTextChange,
      input.hasRenderedVideo,
      input.markRenderedAssetAsDirty,
      input.parsed,
      input.scriptMode,
      input.setSelectedVoiceId,
      input.setSlides,
    ]
  );

  const handleQuoteVoiceChange = useCallback(
    (value: string) => {
      if (!input.ensureEditPermission(false)) return;
      const nextVoiceId = String(value || "").trim();
      input.setSelectedQuoteVoiceId(nextVoiceId);

      if (input.parsed && typeof input.parsed === "object") {
        const nextJson = applyQuoteVoiceSelectionToScriptJson(input.parsed as Record<string, unknown>, nextVoiceId);
        if (nextJson !== input.parsed) {
          input.handleJsonTextChange(JSON.stringify(nextJson, null, 2));
        }
      }

      if (!input.hasRenderedVideo) return;
      input.markRenderedAssetAsDirty("대사 기본 음성이 변경되었습니다. 기존 슬라이드/TTS 재료를 재사용해 다시 렌더합니다.");
    },
    [
      input.ensureEditPermission,
      input.handleJsonTextChange,
      input.hasRenderedVideo,
      input.markRenderedAssetAsDirty,
      input.parsed,
      input.setSelectedQuoteVoiceId,
    ]
  );

  const handleMaleVoiceChange = useCallback(
    (value: string) => {
      if (!input.ensureEditPermission(false)) return;
      input.setSelectedMaleVoiceId(String(value || "").trim());
      if (!input.hasRenderedVideo) return;
      input.markRenderedAssetAsDirty("남자 화자 기본 음성이 변경되었습니다. 기존 슬라이드/TTS 재료를 재사용해 다시 렌더합니다.");
    },
    [input.ensureEditPermission, input.hasRenderedVideo, input.markRenderedAssetAsDirty, input.setSelectedMaleVoiceId]
  );

  const handleFemaleVoiceChange = useCallback(
    (value: string) => {
      if (!input.ensureEditPermission(false)) return;
      input.setSelectedFemaleVoiceId(String(value || "").trim());
      if (!input.hasRenderedVideo) return;
      input.markRenderedAssetAsDirty("여자 화자 기본 음성이 변경되었습니다. 기존 슬라이드/TTS 재료를 재사용해 다시 렌더합니다.");
    },
    [input.ensureEditPermission, input.hasRenderedVideo, input.markRenderedAssetAsDirty, input.setSelectedFemaleVoiceId]
  );

  const handleTypecastEmotionTypeChange = useCallback(
    (value: string) => {
      if (!input.ensureEditPermission(false)) return;
      input.setSelectedTypecastEmotionType(String(value || ""));
      if (!input.hasRenderedVideo) return;
      input.markRenderedAssetAsDirty("Typecast 감정이 변경되었습니다. 기존 슬라이드/TTS 재료를 재사용해 다시 렌더합니다.");
    },
    [input.ensureEditPermission, input.hasRenderedVideo, input.markRenderedAssetAsDirty, input.setSelectedTypecastEmotionType]
  );

  const handleTypecastSpeedChange = useCallback(
    (value: string) => {
      if (!input.ensureEditPermission(false)) return;
      input.setSelectedTypecastSpeed(String(value || ""));
      if (!input.hasRenderedVideo) return;
      input.markRenderedAssetAsDirty("Typecast 음성 배속이 변경되었습니다. 기존 슬라이드/TTS 재료를 재사용해 다시 렌더합니다.");
    },
    [input.ensureEditPermission, input.hasRenderedVideo, input.markRenderedAssetAsDirty, input.setSelectedTypecastSpeed]
  );

  const handleBgmEnabledChange = useCallback(
    (value: boolean) => {
      if (!input.ensureEditPermission(false)) return;
      input.setBgmEnabled(value);
      if (!input.hasRenderedVideo) return;
      input.markRenderedAssetAsDirty("BGM 설정이 변경되었습니다. 기존 재료를 재사용해 배경음악만 다시 반영합니다.");
    },
    [input.ensureEditPermission, input.hasRenderedVideo, input.markRenderedAssetAsDirty, input.setBgmEnabled]
  );

  const handleBgmTrackChange = useCallback(
    (value: string) => {
      if (!input.ensureEditPermission(false)) return;
      input.setSelectedBgmTrack(value);
      if (!input.hasRenderedVideo) return;
      input.markRenderedAssetAsDirty("BGM 트랙이 변경되었습니다. 기존 재료를 재사용해 배경음악만 다시 반영합니다.");
    },
    [input.ensureEditPermission, input.hasRenderedVideo, input.markRenderedAssetAsDirty, input.setSelectedBgmTrack]
  );

  const handleBgmVolumeChange = useCallback(
    (value: number) => {
      if (!input.ensureEditPermission(false)) return;
      input.setBgmVolume(normalizeStudioBgmVolume(value));
      if (!input.hasRenderedVideo) return;
      input.markRenderedAssetAsDirty("BGM 볼륨이 변경되었습니다. 기존 재료를 재사용해 배경음악만 다시 반영합니다.");
    },
    [input.ensureEditPermission, input.hasRenderedVideo, input.markRenderedAssetAsDirty, input.setBgmVolume]
  );

  const handleMixPresetChange = useCallback(
    (value: string) => {
      if (!input.ensureEditPermission(false)) return;
      input.setMixPresetId(normalizeStudioAudioMixPresetId(value));
      if (!input.hasRenderedVideo) return;
      input.markRenderedAssetAsDirty("오디오 믹스가 변경되었습니다. 기존 재료를 재사용해 다시 렌더합니다.");
    },
    [input.ensureEditPermission, input.hasRenderedVideo, input.markRenderedAssetAsDirty, input.setMixPresetId]
  );

  const handleSfxEnabledChange = useCallback(
    (value: boolean) => {
      if (!input.ensureEditPermission(false)) return;
      input.setSfxEnabled(value);
      if (!input.hasRenderedVideo) return;
      input.markRenderedAssetAsDirty("SFX 설정이 변경되었습니다. 기존 재료를 재사용해 다시 렌더합니다.");
    },
    [input.ensureEditPermission, input.hasRenderedVideo, input.markRenderedAssetAsDirty, input.setSfxEnabled]
  );

  const handleSfxMasterGainChange = useCallback(
    (value: number) => {
      if (!input.ensureEditPermission(false)) return;
      input.setSfxMasterGainDb(Math.max(-24, Math.min(12, value)));
      if (!input.hasRenderedVideo) return;
      input.markRenderedAssetAsDirty("SFX 볼륨이 변경되었습니다. 기존 재료를 재사용해 다시 렌더합니다.");
    },
    [input.ensureEditPermission, input.hasRenderedVideo, input.markRenderedAssetAsDirty, input.setSfxMasterGainDb]
  );

  const handleSfxAutoLevelChange = useCallback(
    (value: StudioSfxAutoLevel) => {
      if (!input.ensureEditPermission(false)) return;
      input.setSfxAutoLevel(normalizeStudioSfxAutoLevel(value));
    },
    [input.ensureEditPermission, input.setSfxAutoLevel]
  );

  return {
    performWorkspaceReset,
    handleResetWorkspace,
    handlePlaybackRateChange,
    handleVoiceChange,
    handleQuoteVoiceChange,
    handleMaleVoiceChange,
    handleFemaleVoiceChange,
    handleTypecastEmotionTypeChange,
    handleTypecastSpeedChange,
    handleBgmEnabledChange,
    handleBgmTrackChange,
    handleBgmVolumeChange,
    handleMixPresetChange,
    handleSfxEnabledChange,
    handleSfxMasterGainChange,
    handleSfxAutoLevelChange,
  };
}
