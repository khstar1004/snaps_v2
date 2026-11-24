"use client";

import { useMemo } from "react";
import type { PublishCategory } from "@/lib/publish/types";
import {
  cloneStudioProjectProfileSnapshot,
  type StudioProjectProfileSnapshot,
} from "@/lib/studio/project-profile-snapshot";
import type { CrawlMode, ImageSource, PreparedSlide } from "@/types/studio-json";
import { createStudioHistoryRestoreDraftAction, type StudioHistoryRestoreDraftActionInput } from "./studio-history-restore-draft-action";
import { useStudioFloatingPanelChrome } from "./use-studio-floating-panel-chrome";
import { useStudioHistory } from "./use-studio-history";
import { useStudioHistoryPanelState } from "./use-studio-history-panel-state";
import { useStudioWorkspaceSettingsActions } from "./use-studio-workspace-settings-actions";
import {
  serializeStudioPreselectedMediaItems,
  type StudioImageSearchSource,
  type StudioPreselectedMediaApplyMode,
  type StudioPreselectedMediaItem,
  type StudioTemplateId,
  type StudioTemplatePayload,
  type StudioWorkDraft,
  type TemplateBranding,
  type TemplateImageLayout,
  type TemplateLayoutApply,
} from "./types";

type PreviewTimingState = {
  slides: PreparedSlide[];
  frameDurationsSec: number[];
} | null;

type ScriptDialogueMode = "normal" | "dialogue";

type EffectiveCategoryTemplatePresetLike = {
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageUrl: string;
  templateImageLayout: TemplateImageLayout;
  templateLayoutApply: TemplateLayoutApply;
};

type HistoryDraftInput = {
  bgmEnabled: boolean;
  bgmVolume: number;
  codexModel: string;
  crawlMode: CrawlMode;
  effectiveCategoryTemplatePreset: EffectiveCategoryTemplatePresetLike;
  imageApprovalFingerprint?: string;
  imageSource: ImageSource;
  imageSearchSource: StudioImageSearchSource;
  jsonText: string;
  mixPresetId: string;
  playbackRate: number;
  preselectedMediaApplyMode: StudioPreselectedMediaApplyMode;
  preselectedMediaItems: StudioPreselectedMediaItem[];
  previewTiming: PreviewTimingState;
  projectProfileSnapshot: StudioProjectProfileSnapshot | null;
  publishCategory: PublishCategory;
  quickScheduledAt: string;
  renderStatus: string;
  scriptMode: ScriptDialogueMode;
  scriptText: string;
  selectedBgmTrack: string;
  selectedPreviewGroupIndex: number;
  selectedFemaleVoiceId: string;
  selectedMaleVoiceId: string;
  selectedQuoteVoiceId: string;
  selectedTypecastEmotionType: string;
  selectedTypecastSpeed: string;
  selectedVoiceId: string;
  sfxAutoLevel: "sparse" | "balanced" | "dense";
  sfxEnabled: boolean;
  sfxMasterGainDb: number;
  showJsonEditor: boolean;
  slides: PreparedSlide[];
  templateData: StudioTemplatePayload;
  templateId: StudioTemplateId;
  topicText: string;
  uploadedVideoUrl: string | null;
  videoUrl: string | null;
  workName: string;
};

type HistoryPanelInputBase = Omit<
  Parameters<typeof useStudioHistoryPanelState>[0],
  "activeHistoryId" | "captureHistory" | "clearHistory" | "deleteHistory" | "historyDraft" | "historyEntries" | "restoreHistory"
>;

type FloatingPanelInputBase = Omit<
  Parameters<typeof useStudioFloatingPanelChrome>[0],
  "closeHistoryPanel" | "historyPanelVisible"
>;

type WorkspaceSettingsInputBase = Omit<
  Parameters<typeof useStudioWorkspaceSettingsActions>[0],
  "clearSelectedHistorySnapshot" | "confirmSaveBeforeResettingCurrentProject"
>;

type RestoreDraftActionInputBase = Omit<
  StudioHistoryRestoreDraftActionInput,
  "defaultBrandingByCategory" | "defaultCategory" | "publishCategory" | "videoUrl"
>;

export type UseStudioSessionHistoryControllerInput = {
  defaultBrandingByCategory: Record<PublishCategory, TemplateBranding>;
  defaultCategory: PublishCategory;
  floatingPanelInput: FloatingPanelInputBase;
  historyDraftInput: HistoryDraftInput;
  historyPanelInput: HistoryPanelInputBase;
  restoreDraftActionInput: RestoreDraftActionInputBase;
  workspaceSettingsInput: WorkspaceSettingsInputBase;
};

export function useStudioSessionHistoryController(input: UseStudioSessionHistoryControllerInput) {
  const historyDraft = useMemo<StudioWorkDraft>(
    () => ({
      workName: input.historyDraftInput.workName.trim() || undefined,
      topicText: input.historyDraftInput.topicText.trim() || undefined,
      scriptText: input.historyDraftInput.scriptText.trim() || undefined,
      scriptMode: input.historyDraftInput.scriptMode,
      jsonText: input.historyDraftInput.jsonText,
      showJsonEditor: input.historyDraftInput.showJsonEditor,
      imageSource: input.historyDraftInput.imageSource,
      imageSearchSource: input.historyDraftInput.imageSearchSource,
      crawlMode: input.historyDraftInput.crawlMode,
      slides: input.historyDraftInput.slides,
      selectedPreviewGroupIndex: input.historyDraftInput.selectedPreviewGroupIndex,
      preselectedMediaItems: serializeStudioPreselectedMediaItems(input.historyDraftInput.preselectedMediaItems),
      preselectedMediaApplyMode: input.historyDraftInput.preselectedMediaApplyMode,
      projectProfileSnapshot: input.historyDraftInput.projectProfileSnapshot
        ? cloneStudioProjectProfileSnapshot(input.historyDraftInput.projectProfileSnapshot)
        : undefined,
      publishCategory: input.historyDraftInput.publishCategory,
      codexModel: input.historyDraftInput.codexModel,
      quickScheduledAt: input.historyDraftInput.quickScheduledAt,
      selectedFemaleVoiceId: input.historyDraftInput.selectedFemaleVoiceId,
      selectedMaleVoiceId: input.historyDraftInput.selectedMaleVoiceId,
      selectedQuoteVoiceId: input.historyDraftInput.selectedQuoteVoiceId,
      selectedTypecastEmotionType: input.historyDraftInput.selectedTypecastEmotionType,
      selectedTypecastSpeed: input.historyDraftInput.selectedTypecastSpeed,
      selectedVoiceId: input.historyDraftInput.selectedVoiceId,
      imageApprovalFingerprint: input.historyDraftInput.imageApprovalFingerprint?.trim() || undefined,
      playbackRate: input.historyDraftInput.playbackRate,
      bgmEnabled: input.historyDraftInput.bgmEnabled,
      bgmVolume: input.historyDraftInput.bgmVolume,
      selectedBgmTrack: input.historyDraftInput.selectedBgmTrack,
      mixPresetId: input.historyDraftInput.mixPresetId,
      sfxEnabled: input.historyDraftInput.sfxEnabled,
      sfxMasterGainDb: input.historyDraftInput.sfxMasterGainDb,
      sfxAutoLevel: input.historyDraftInput.sfxAutoLevel,
      videoUrl: typeof input.historyDraftInput.videoUrl === "string" ? input.historyDraftInput.videoUrl : undefined,
      uploadedVideoUrl:
        typeof input.historyDraftInput.uploadedVideoUrl === "string" ? input.historyDraftInput.uploadedVideoUrl : undefined,
      previewFrameDurationsSec:
        input.historyDraftInput.previewTiming &&
        input.historyDraftInput.previewTiming.frameDurationsSec.length === input.historyDraftInput.slides.length
          ? input.historyDraftInput.previewTiming.frameDurationsSec
          : undefined,
      renderStatus: input.historyDraftInput.renderStatus,
      templateId: input.historyDraftInput.templateId,
      templateData: input.historyDraftInput.templateData,
      templateImageEnabled: input.historyDraftInput.effectiveCategoryTemplatePreset.templateImageEnabled,
      templateImageUrl: input.historyDraftInput.effectiveCategoryTemplatePreset.templateImageUrl,
      templateImageLayout: input.historyDraftInput.effectiveCategoryTemplatePreset.templateImageLayout,
      templateLayoutApply: input.historyDraftInput.effectiveCategoryTemplatePreset.templateLayoutApply,
    }),
    [input.historyDraftInput]
  );

  const restoreDraftAction = createStudioHistoryRestoreDraftAction({
    ...input.restoreDraftActionInput,
    defaultBrandingByCategory: input.defaultBrandingByCategory,
    defaultCategory: input.defaultCategory,
    publishCategory: input.historyDraftInput.publishCategory,
    videoUrl: input.historyDraftInput.videoUrl,
  });

  const {
    historyEntries,
    activeHistoryId,
    captureHistory,
    restoreHistory,
    deleteHistory,
    clearHistory,
  } = useStudioHistory({
    draft: historyDraft,
    publishCategory: input.historyDraftInput.publishCategory,
    restoreDraftAction,
  });

  const historyPanelState = useStudioHistoryPanelState({
    ...input.historyPanelInput,
    activeHistoryId,
    captureHistory,
    clearHistory,
    deleteHistory,
    historyDraft,
    historyEntries,
    restoreHistory,
  });

  const floatingPanelChrome = useStudioFloatingPanelChrome({
    ...input.floatingPanelInput,
    closeHistoryPanel: historyPanelState.closeHistoryPanel,
    historyPanelVisible: historyPanelState.historyPanelVisible,
  });

  const workspaceSettingsActions = useStudioWorkspaceSettingsActions({
    ...input.workspaceSettingsInput,
    clearSelectedHistorySnapshot: historyPanelState.clearSelectedHistorySnapshot,
    confirmSaveBeforeResettingCurrentProject: historyPanelState.confirmSaveBeforeResettingCurrentProject,
  });

  return {
    activeHistoryId,
    historyEntries,
    ...historyPanelState,
    ...floatingPanelChrome,
    ...workspaceSettingsActions,
  };
}

export type UseStudioSessionHistoryControllerResult = ReturnType<typeof useStudioSessionHistoryController>;
