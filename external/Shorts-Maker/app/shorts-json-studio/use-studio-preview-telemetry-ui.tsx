"use client";

import { useCallback, useEffect, useMemo, useRef, type Dispatch, type ReactElement, type SetStateAction } from "react";
import { disconnectStudioCodexOauth } from "@/lib/api/studio-client";
import { toCategoryLabel } from "@/lib/publish/categories";
import { trackWorkflowEvent } from "@/lib/telemetry/client";
import type { PublishCategory } from "@/lib/publish/types";
import type { PreparedSlide } from "@/types/studio-json";
import { StudioRemotionSlideThumbnail } from "./components/studio-remotion-preview";
import type { StudioVoiceOption } from "./use-studio-bootstrap-data";
import { useStudioVoicePreview } from "./use-studio-voice-preview";
import type {
  StudioTemplateId,
  StudioTemplatePayload,
  TemplateBranding,
  TemplateImageLayout,
  TemplateLayoutApply,
} from "./types";

type EffectiveCategoryTemplatePresetLike = {
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageUrl: string;
  templateImageLayout: TemplateImageLayout;
  templateLayoutApply: TemplateLayoutApply;
};

export type UseStudioPreviewTelemetryUiInput = {
  beginnerStepIndex: number;
  effectiveCategoryTemplatePreset: EffectiveCategoryTemplatePresetLike;
  ensureEditPermission: () => boolean;
  markCodexOauthDisconnected: () => void;
  preselectedMediaValidationMessage: string;
  publishCategory: PublishCategory;
  runPrepareAction: () => Promise<PreparedSlide[] | null>;
  scheduleHistoryCapture: (label: string) => void;
  selectedBranding: TemplateBranding;
  selectedTypecastEmotionType: string;
  selectedTypecastSpeed: string;
  selectedVoiceId: string;
  setCodexOauthStatus: Dispatch<SetStateAction<string>>;
  showJsonEditor: boolean;
  studioStepperEnabled: boolean;
  voiceOptions: StudioVoiceOption[];
};

export type UseStudioPreviewTelemetryUiResult = {
  handleDisconnectCodexOauth: () => Promise<void>;
  handlePrepareWithHistory: () => Promise<PreparedSlide[] | null>;
  handleStopVoicePreview: () => void;
  previewVoiceText: (
    text: string,
    voiceIdOverride?: string,
    typecastSpeedOverride?: number | string
  ) => Promise<void>;
  renderStudioSlidePreview: (slide: PreparedSlide, index: number) => ReactElement;
  selectedVoiceOption: StudioVoiceOption | null;
  voicePreviewLoading: boolean;
  voicePreviewPlaying: boolean;
};

export function useStudioPreviewTelemetryUi(
  input: UseStudioPreviewTelemetryUiInput
): UseStudioPreviewTelemetryUiResult {
  const lastStepRef = useRef(0);
  const {
    voicePreviewLoading,
    voicePreviewPlaying,
    previewVoiceText,
    handleStopVoicePreview,
  } = useStudioVoicePreview(input.selectedVoiceId, input.selectedTypecastEmotionType, input.selectedTypecastSpeed);

  const selectedVoiceOption = useMemo(
    () => input.voiceOptions.find((voice) => voice.id === input.selectedVoiceId) || null,
    [input.selectedVoiceId, input.voiceOptions]
  );

  const handleDisconnectCodexOauth = useCallback(async () => {
    try {
      const ok = await disconnectStudioCodexOauth();
      if (!ok) {
        throw new Error("Codex OAuth 연결 해제에 실패했습니다.");
      }
      input.markCodexOauthDisconnected();
      input.setCodexOauthStatus("Codex OAuth 연결을 해제했습니다.");
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  }, [input]);

  const renderStudioSlidePreview = useCallback(
    (slide: PreparedSlide, index: number) => (
      <StudioRemotionSlideThumbnail
        slide={slide}
        branding={input.selectedBranding}
        templateId={input.effectiveCategoryTemplatePreset.templateId}
        templateData={input.effectiveCategoryTemplatePreset.templateData}
        templateImageEnabled={input.effectiveCategoryTemplatePreset.templateImageEnabled}
        templateImageUrl={input.effectiveCategoryTemplatePreset.templateImageUrl}
        templateImageLayout={input.effectiveCategoryTemplatePreset.templateImageLayout}
        templateLayoutApply={input.effectiveCategoryTemplatePreset.templateLayoutApply}
        playMotionMedia
      />
    ),
    [input.effectiveCategoryTemplatePreset, input.selectedBranding]
  );

  const handlePrepareWithHistory = useCallback(async () => {
    if (!input.ensureEditPermission()) return null;
    if (input.preselectedMediaValidationMessage) {
      alert(input.preselectedMediaValidationMessage);
      return null;
    }
    input.scheduleHistoryCapture(`prepare · ${toCategoryLabel(input.publishCategory)}`);
    return input.runPrepareAction();
  }, [input]);

  useEffect(() => {
    if (!input.studioStepperEnabled) return;
    if (lastStepRef.current === input.beginnerStepIndex) return;
    lastStepRef.current = input.beginnerStepIndex;
    trackWorkflowEvent({
      name: "step_entered",
      page: "studio",
      stage: `step_${input.beginnerStepIndex}`,
      status: "success",
    });
  }, [input.beginnerStepIndex, input.studioStepperEnabled]);

  useEffect(() => {
    if (!input.showJsonEditor) return;
    trackWorkflowEvent({
      name: "json_editor_opened",
      page: "studio",
      stage: "input",
      status: "success",
    });
  }, [input.showJsonEditor]);

  return {
    handleDisconnectCodexOauth,
    handlePrepareWithHistory,
    handleStopVoicePreview,
    previewVoiceText,
    renderStudioSlidePreview,
    selectedVoiceOption,
    voicePreviewLoading,
    voicePreviewPlaying,
  };
}
