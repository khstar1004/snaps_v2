"use client";

import { useCallback } from "react";
import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import {
  hasStudioCharacterIdentity,
  normalizeStudioCharacterProfiles,
  resolveStudioCharacterProfileById,
} from "@/lib/studio/character-profiles";
import { toCategoryLabel } from "@/lib/publish/categories";
import type { PublishCategory } from "@/lib/publish/types";
import { getSlideNarrationText } from "@/lib/studio/narration-text";
import type { ImageSource, PreparedSlide } from "@/types/studio-json";
import { createStudioTemplateData } from "./components/templates/template-registry";
import type { StudioDesktopWorkspaceShellProps } from "./components/studio-mode-shells";
import type { StudioAutosaveState } from "./studio-autosave-status";
import type { StudioChangeImpactSummary } from "./studio-change-impact";
import type { SpeakerVoiceEditorRow, StoryCharacterProfileEditorRow } from "./studio-page-helpers";
import type { StudioRenderPreflightSummary } from "./studio-render-preflight";
import type { StudioVoiceOption } from "./use-studio-bootstrap-data";
import type { StudioRenderPrimaryAction } from "./use-studio-render-publish-view-model";
import type {
  StudioImageSearchSource,
  StudioPreselectedMediaApplyMode,
  StudioPreselectedMediaItem,
  StudioTemplateId,
  StudioTemplatePayload,
  TemplateBranding,
  TemplateImageLayout,
  TemplateLayoutApply,
} from "./types";

type TemplatePresetDraftLike = {
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageUrl: string;
  templateImageLayout: TemplateImageLayout;
  templateLayoutApply: TemplateLayoutApply;
};

type CodexUsageState = {
  inputTokens: number;
  outputTokens: number;
};

type RenderUsageState = {
  ttsChars: number;
  renderSeconds: number;
};

type TemplateDefinitionLike = {
  label: string;
  layoutStudioHint: string;
};

type EffectiveCategoryTemplatePresetLike = {
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageUrl: string;
  templateImageLayout: TemplateImageLayout;
  templateLayoutApply: TemplateLayoutApply;
};

type BrandingFabRef = StudioDesktopWorkspaceShellProps["brandingFabRef"];
type HistoryEntries = StudioDesktopWorkspaceShellProps["historyPanelProps"]["historyEntries"];
type HistoryPanelRef = StudioDesktopWorkspaceShellProps["historyPanelProps"]["panelRef"];
type PreselectedMediaAppendAction = StudioDesktopWorkspaceShellProps["preselectedMediaPanelProps"]["onAppendItemsAction"];
type MemeLibraryApplyAssetAction = StudioDesktopWorkspaceShellProps["memeLibraryPanelProps"]["onApplyAssetToSlideAction"];
type PreviewSlideImageCandidateApplyAction = StudioDesktopWorkspaceShellProps["previewPanelProps"]["onSlideImageCandidateApplyAction"];
type PreviewSlideSfxCueChangeAction = StudioDesktopWorkspaceShellProps["previewPanelProps"]["onSlideSfxCueChange"];
type PreviewSlideSfxReplanAction = NonNullable<
  StudioDesktopWorkspaceShellProps["previewPanelProps"]["onSlideSfxReplanAction"]
>;
type PreviewSlideRenderAction = StudioDesktopWorkspaceShellProps["previewPanelProps"]["renderSlidePreview"];
type StopVoicePreviewAction = StudioDesktopWorkspaceShellProps["advancedSettingsPanelProps"]["onStopVoicePreviewAction"];
type SelectHistorySnapshotAction = StudioDesktopWorkspaceShellProps["historyPanelProps"]["onSelectHistoryAction"];

const DEFAULT_VOICE_PREVIEW_TEXT = "안녕하세요. 반갑습니다.";

export type UseStudioModeShellPropsInput = {
  activeHistoryId: string | null;
  activeTemplateDefinition: TemplateDefinitionLike;
  bgmEnabled: boolean;
  bgmVolume: number;
  beginnerStepIndex: number;
  brandingFabRef: BrandingFabRef;
  brandingDbDirty: boolean;
  brandingPanelOpen: boolean;
  brandingPanelPreviewIndexSetter: (index: number) => void;
  brandingPanelPreviewSlides: PreparedSlide[];
  brandingPanelPreviewUsesSample: boolean;
  brandingPanelRef: StudioDesktopWorkspaceShellProps["brandingPanelRef"];
  brandingSaveBusy: boolean;
  brandingStatus: string;
  busy: boolean;
  canEditSelectedCategory: boolean;
  canPublishSelectedCategory: boolean;
  changeImpactSummary: StudioChangeImpactSummary;
  categoryOptions: Array<{ value: PublishCategory; label: string }>;
  profileSnapshotLabel?: string;
  projectName: string;
  projectProfileLabel?: string;
  projectProfileSnapshot: StudioProjectProfileSnapshot | null;
  projectProfileSyncProps: StudioDesktopWorkspaceShellProps["projectProfileSyncProps"];
  autosaveState: StudioAutosaveState;
  onAutosaveRetryAction: () => void;
  closeBrandingPanel: () => void;
  closeHistoryPanel: () => void;
  codexLocalReady: boolean;
  codexOauthConnected: boolean;
  codexOauthMode: "oauth" | "local_codex_bridge";
  codexOauthStatus: string;
  codexUsage: CodexUsageState | null;
  debugImageSearch: boolean;
  defaultTtsProvider: "typecast";
  displaySlides: PreparedSlide[];
  downloadFileName: string;
  effectiveCategoryTemplatePreset: EffectiveCategoryTemplatePresetLike;
  handleAppendPreselectedMediaItems: PreselectedMediaAppendAction;
  handleAutoPlanSfx: () => Promise<void>;
  handleBgmEnabledChange: (checked: boolean) => void;
  handleBgmTrackChange: (value: string) => void;
  handleBgmVolumeChange: (value: number) => void;
  handleBrandingChange: (value: Partial<TemplateBranding>) => void;
  handleClearHistory: () => void;
  handleClearPreselectedMediaItems: () => void;
  handleConvertScriptTextOnly: () => Promise<void>;
  handleConvertScriptToJson: () => Promise<void>;
  handleDebugImageSearchChange: (checked: boolean) => void;
  handleDeleteHistorySnapshot: (id: string) => void;
  handleDisconnectCodexOauth: () => void | Promise<void>;
  handleAssignDialogueSpeakers: () => void | Promise<void>;
  handleDialogueSpeakerAssignment: (nextJson: Record<string, unknown>) => void;
  handleGenerateScriptFromTopic: () => Promise<void>;
  handleImageSourceChange: (value: ImageSource) => void;
  handleImageSearchSourceChange: (value: StudioImageSearchSource) => void;
  handleApproveImage: () => void;
  handleJsonTextChange: (value: string) => void;
  handleJsonTextCommit: (value: string, previousValue: string) => void;
  handleJumpToResultAction: () => void;
  handleMixPresetChange: (value: string) => void;
  handleMovePreselectedMediaItem: (itemId: string, direction: -1 | 1) => void;
  handleOneClickAuto: () => Promise<void>;
  handleOneClickAutoSchedule: () => Promise<void>;
  handleOpenLayoutStudio: () => boolean;
  handlePlaybackRateChange: (value: number) => void;
  handlePreselectedMediaApplyModeChange: (value: StudioPreselectedMediaApplyMode) => void;
  handlePreselectedMediaTargetSlideChange: (itemId: string, slideIndex: number | null) => void;
  handlePrepareWithHistory: () => Promise<PreparedSlide[] | null>;
  handleQuickScheduledAtChange: (value: string) => void;
  handleRemovePreselectedMediaItem: (itemId: string) => void;
  handleReorderPreselectedMediaItem: (itemId: string, toIndex: number) => void;
  handleResetCurrentCategory: () => void;
  handleRunRenderPreflight: () => void;
  handleRenderDraftVideo: () => Promise<void>;
  handleRenderVideo: () => Promise<void>;
  handleRestoreHistorySnapshot: (id: string) => void;
  handleSaveCategoryBranding: () => Promise<void>;
  handleSaveTemplateNotes: () => Promise<void>;
  handleScriptModeChange: (value: "normal" | "dialogue") => void;
  handleScriptTextChange: (value: string) => void;
  handleQuoteVoiceChange: (value: string) => void;
  handleSelectHistorySnapshot: SelectHistorySnapshotAction;
  handleSelectedVoicePreviewBase: (
    text: string,
    voiceIdOverride?: string,
    typecastSpeedOverride?: number | string
  ) => Promise<void>;
  handleSfxAutoLevelChange: (value: "sparse" | "balanced" | "dense") => void;
  handleSfxEnabledChange: (checked: boolean) => void;
  handleSfxMasterGainChange: (value: number) => void;
  handleSlideAdd: (index: number) => void;
  handleSlideDelete: (index: number) => void;
  handleSlideImageFileChange: (index: number, file: File | null) => Promise<void>;
  handleSlideImageUrlChange: (index: number, value: string) => void;
  handleSlideLibraryAssetApply: MemeLibraryApplyAssetAction;
  handleManualImageGenerate: (index: number) => Promise<string>;
  handleManualImageGenerateMissing: () => Promise<string>;
  handleSlideImageCandidateApply: PreviewSlideImageCandidateApplyAction;
  handleSlideCharacterIdsChange: (index: number, characterIds: string[]) => void;
  handleSlideNarrationTextChange: (index: number, value: string) => void;
  handleSlideSfxCueChange: PreviewSlideSfxCueChangeAction;
  handleSlideSfxReplan: PreviewSlideSfxReplanAction;
  handleSlideTitleChange: (index: number, value: string) => void;
  handleSlideVoiceChange: (index: number, value: string) => void;
  handleSpeakerVoicesChange: (
    rows: Array<{ speakerId: string; voiceId: string }>,
    options?: { renamedSpeakerIds?: Record<string, string> }
  ) => void;
  handleStoryCharacterProfilesChange: (rows: StoryCharacterProfileEditorRow[]) => void;
  handleFixedCharacterProfileIdChange: (value: string) => void;
  handleImageStylePromptChange: (value: string) => void;
  handleStopVoicePreview: StopVoicePreviewAction;
  handleStudioTemplateFontSizeChange: (field: "headerSize" | "titleSize" | "bodySize" | "infoSize", value: string) => void;
  handleStudioTemplateImageFileChange: (file: File | null) => Promise<void>;
  handleStudioTemplateLayoutColorChange: (field: "titleColor" | "bodyColor" | "infoColor", value: string) => void;
  handleTemplateNotesChange: (value: string) => void;
  handleTemplatePresetChange: (updater: (current: TemplatePresetDraftLike) => TemplatePresetDraftLike, dirtyMessage: string) => void;
  handleMaleVoiceChange: (value: string) => void;
  handleFemaleVoiceChange: (value: string) => void;
  handleTypecastEmotionTypeChange: (value: string) => void;
  handleTypecastSpeedChange: (value: string) => void;
  handleTitleChange: (value: string) => void;
  handleTopicTextChange: (value: string) => void;
  handleVoiceChange: (value: string) => void;
  handleAddCustomTypecastVoiceOption: (value: string) => void;
  hasPreparedSlides: boolean;
  hasRenderedVideo: boolean;
  hasFinalVideo: boolean;
  hasUploadedAsset: boolean;
  historyEntries: HistoryEntries;
  historyFabRef: StudioDesktopWorkspaceShellProps["historyFabRef"];
  historyPanelRef: HistoryPanelRef;
  historyPanelVisible: boolean;
  imageApproved: boolean;
  imageErrors: string[];
  imageSource: ImageSource;
  imageSearchSource: StudioImageSearchSource;
  isJsonValid: boolean;
  fixedCharacterProfileId: string;
  imageStylePrompt: string;
  jsonText: string;
  layoutStudioHref: string;
  localPresetSummary: string;
  mappedChannelId: string;
  mappedChannelTitle: string;
  memeLibrarySlides: PreparedSlide[];
  mixPresetId: string;
  openHistoryPanel: () => void;
  parsedSlideCount: number;
  playbackRate: number;
  prepareButtonLabel: string;
  preselectedMediaApplyMode: StudioPreselectedMediaApplyMode;
  preselectedMediaAssignments: StudioDesktopWorkspaceShellProps["preselectedMediaPanelProps"]["assignmentPreview"];
  preselectedMediaItems: StudioPreselectedMediaItem[];
  preselectedMediaValidationMessage: string;
  previewPlayerFrameDurations: number[] | undefined;
  previewPlayerSlides: PreparedSlide[];
  publishCategory: PublishCategory;
  currentCategoryMetadata?: PublishMetadata | null;
  publishStepEnabled: boolean;
  publishTitle: string;
  quickScheduledAt: string;
  renderButtonLabel: string;
  renderPreflightSummary: StudioRenderPreflightSummary;
  renderPreflightHasRun: boolean;
  renderPrimaryAction: StudioRenderPrimaryAction;
  draftIsCurrent: boolean;
  finalIsCurrent: boolean;
  renderStageDescription: string;
  renderStageLabel: string;
  renderStateLabel: string;
  renderStateTone: "neutral" | "warning" | "success";
  renderStatus: string;
  renderUsage: RenderUsageState | null;
  renderStudioSlidePreview: PreviewSlideRenderAction;
  scriptMode: "normal" | "dialogue";
  scriptText: string;
  scriptToJsonBusy: boolean;
  scriptToJsonStatus: string;
  selectedBgmTrack: string;
  selectedPreviewGroupIndex: number;
  selectedBranding: TemplateBranding;
  selectedFemaleVoiceId: string;
  selectedHistoryId: string | null;
  selectedMaleVoiceId: string;
  selectedQuoteVoiceId: string;
  selectedTypecastEmotionType: string;
  selectedTypecastSpeed: string;
  selectedVoiceId: string;
  selectedVoiceOption: StudioVoiceOption | null;
  setSelectedPreviewGroupIndex: (value: number) => void;
  setShowJsonEditor: (updater: (prev: boolean) => boolean) => void;
  sfxAutoLevel: "sparse" | "balanced" | "dense";
  sfxCategories: StudioDesktopWorkspaceShellProps["previewPanelProps"]["sfxCategories"];
  sfxEnabled: boolean;
  sfxMasterGainDb: number;
  showJsonEditor: boolean;
  speakerVoiceRows: SpeakerVoiceEditorRow[];
  storyCharacterProfileRows: StoryCharacterProfileEditorRow[];
  studioEditPermissionMessage: string;
  studioPublishPermissionMessage: string;
  studioPublishReady: boolean;
  studioPublishPreflightIssueCount: number;
  studioScheduleReady: boolean;
  studioSchedulePreflightIssueCount: number;
  templateId: StudioTemplateId;
  onProjectNameChangeAction: (value: string) => void;
  fixedCharacterProfilesHref: string;
  templateManagerHref: string;
  templateNotesDraft: string;
  templateNotesSaveBusy: boolean;
  templateRequirementAlert: string | null;
  toggleBrandingPanel: () => void;
  toggleHistoryPanel: () => void;
  topicText: string;
  topicToScriptBusy: boolean;
  topicToScriptStatus: string;
  uploadedVideoUrl: string | null;
  videoUrl: string | null;
  voiceOptions: StudioVoiceOption[];
  voicePreviewLoading: boolean;
  voicePreviewPlaying: boolean;
};

export type UseStudioModeShellPropsResult = {
  desktopWorkspaceShellProps: StudioDesktopWorkspaceShellProps;
};

function resolveProfileSnapshotLabel(input: {
  categoryOptions: Array<{ value: PublishCategory; label: string }>;
  profileSnapshotLabel?: string;
  projectProfileLabel?: string;
  publishCategory: PublishCategory;
}): string {
  const profileSnapshotLabel = String(input.profileSnapshotLabel || "").trim();
  if (profileSnapshotLabel) return profileSnapshotLabel;
  const projectProfileLabel = String(input.projectProfileLabel || "").trim();
  if (projectProfileLabel) return projectProfileLabel;
  return input.categoryOptions.find((option) => option.value === input.publishCategory)?.label || toCategoryLabel(input.publishCategory);
}

export function useStudioModeShellProps(input: UseStudioModeShellPropsInput): UseStudioModeShellPropsResult {
  const resolvedProfileSnapshotLabel = resolveProfileSnapshotLabel({
    categoryOptions: input.categoryOptions,
    profileSnapshotLabel: input.profileSnapshotLabel,
    projectProfileLabel: input.projectProfileLabel,
    publishCategory: input.publishCategory,
  });
  const fixedCharacterProfiles = normalizeStudioCharacterProfiles(
    input.currentCategoryMetadata?.fixedCharacterProfiles
  ).filter(hasStudioCharacterIdentity);
  const selectedFixedCharacterProfile = resolveStudioCharacterProfileById(
    fixedCharacterProfiles,
    input.fixedCharacterProfileId
  );

  const handleStudioTemplateIdChange = useCallback(
    (value: StudioTemplateId) => {
      input.handleTemplatePresetChange(
        (current) => ({
          ...current,
          templateId: value,
          templateData: current.templateId === value ? current.templateData : createStudioTemplateData(value),
        }),
        "템플릿이 변경되었습니다. 결과 영상을 다시 생성해 주세요."
      );
    },
    [input.handleTemplatePresetChange]
  );

  const handleStudioTemplateDataChange = useCallback(
    (value: StudioTemplatePayload) => {
      input.handleTemplatePresetChange(
        (current) => ({
          ...current,
          templateData: value,
        }),
        "템플릿 설정이 변경되었습니다. 결과 영상을 다시 생성해 주세요."
      );
    },
    [input.handleTemplatePresetChange]
  );

  const handleStudioTemplateImageEnabledChange = useCallback(
    (checked: boolean) => {
      input.handleTemplatePresetChange(
        (current) => ({
          ...current,
          templateImageEnabled: checked,
        }),
        "템플릿 이미지 사용 여부가 변경되었습니다. 결과 영상을 다시 생성해 주세요."
      );
    },
    [input.handleTemplatePresetChange]
  );

  const handleStudioTemplateImageUrlChange = useCallback(
    (value: string) => {
      input.handleTemplatePresetChange(
        (current) => ({
          ...current,
          templateImageUrl: value,
        }),
        "템플릿 이미지 URL이 변경되었습니다. 결과 영상을 다시 생성해 주세요."
      );
    },
    [input.handleTemplatePresetChange]
  );

  const handleStudioTemplateLayoutApplyChange = useCallback(
    (field: keyof TemplateLayoutApply, checked: boolean) => {
      input.handleTemplatePresetChange(
        (current) => ({
          ...current,
          templateLayoutApply: {
            ...current.templateLayoutApply,
            [field]: checked,
          },
        }),
        "템플릿 적용 범위가 변경되었습니다. 결과 영상을 다시 생성해 주세요."
      );
    },
    [input.handleTemplatePresetChange]
  );

  const handleSelectedVoicePreview = useCallback(() => {
    void input.handleSelectedVoicePreviewBase(
      DEFAULT_VOICE_PREVIEW_TEXT,
      input.selectedVoiceId
    );
  }, [input.handleSelectedVoicePreviewBase, input.selectedVoiceId]);

  const handleInputVoicePreview = useCallback(
    (voiceIdOverride?: string, previewText?: string, speedOverride?: number) => {
      const resolvedVoiceId = String(voiceIdOverride ?? input.selectedVoiceId).trim();
      void input.handleSelectedVoicePreviewBase(
        String(previewText || DEFAULT_VOICE_PREVIEW_TEXT),
        resolvedVoiceId,
        speedOverride
      );
    },
    [input.handleSelectedVoicePreviewBase, input.selectedVoiceId]
  );

  const handleSlideVoicePreview = useCallback(
    (index: number) => {
      const slide = input.displaySlides[index];
      if (!slide) return;
      void input.handleSelectedVoicePreviewBase(getSlideNarrationText(slide), slide.ttsVoiceId || input.selectedVoiceId);
    },
    [input.displaySlides, input.handleSelectedVoicePreviewBase, input.selectedVoiceId]
  );

  const sharedResultPanelProps: StudioDesktopWorkspaceShellProps["resultPanelProps"] = {
    videoUrl: input.videoUrl,
    hasPreparedSlides: input.hasPreparedSlides,
    uploadedVideoUrl: input.uploadedVideoUrl,
    downloadFileName: input.downloadFileName,
    emailTitle: input.publishTitle,
    previewPlayerSlides: input.previewPlayerSlides,
    previewPlayerFrameDurations: input.previewPlayerFrameDurations,
    branding: input.selectedBranding,
    templateId: input.effectiveCategoryTemplatePreset.templateId,
    templateData: input.effectiveCategoryTemplatePreset.templateData,
    templateImageEnabled: input.effectiveCategoryTemplatePreset.templateImageEnabled,
    templateImageUrl: input.effectiveCategoryTemplatePreset.templateImageUrl,
    templateImageLayout: input.effectiveCategoryTemplatePreset.templateImageLayout,
    templateLayoutApply: input.effectiveCategoryTemplatePreset.templateLayoutApply,
    busy: input.busy,
    playbackRate: input.playbackRate,
    bgmEnabled: input.bgmEnabled,
    selectedBgmTrack: input.selectedBgmTrack,
    bgmVolume: input.bgmVolume,
    mixPresetId: input.mixPresetId,
    sfxEnabled: input.sfxEnabled,
    sfxMasterGainDb: input.sfxMasterGainDb,
    sfxAutoLevel: input.sfxAutoLevel,
    renderButtonLabel: input.renderButtonLabel,
    renderStageLabel: input.renderStageLabel,
    renderStageDescription: input.renderStageDescription,
    renderStatus: input.renderStatus,
    renderDisabledReason: input.templateRequirementAlert,
    renderPreflightSummary: input.renderPreflightSummary,
    renderPreflightHasRun: input.renderPreflightHasRun,
    renderPrimaryAction: input.renderPrimaryAction,
    draftIsCurrent: input.draftIsCurrent,
    finalIsCurrent: input.finalIsCurrent,
    canEditSelectedCategory: input.canEditSelectedCategory,
    editPermissionMessage: input.studioEditPermissionMessage,
    onRenderAction: input.handleRenderVideo,
    onRenderDraftAction: input.handleRenderDraftVideo,
    onRunRenderPreflightAction: input.handleRunRenderPreflight,
    onAutoPlanSfxAction: () => void input.handleAutoPlanSfx(),
    onPlaybackRateChangeAction: input.handlePlaybackRateChange,
    onBgmEnabledChangeAction: input.handleBgmEnabledChange,
    onBgmTrackChangeAction: input.handleBgmTrackChange,
    onBgmVolumeChangeAction: input.handleBgmVolumeChange,
    onMixPresetChangeAction: input.handleMixPresetChange,
    onSfxEnabledChangeAction: input.handleSfxEnabledChange,
    onSfxMasterGainChangeAction: input.handleSfxMasterGainChange,
    onSfxAutoLevelChangeAction: input.handleSfxAutoLevelChange,
    onOpenLayoutStudioAction: input.handleOpenLayoutStudio,
  };

  const quickPublishPanelProps: StudioDesktopWorkspaceShellProps["preparePanelProps"] = {
    busy: input.busy,
    hasPreparedSlides: input.hasPreparedSlides,
    hasUploadedAsset: input.hasUploadedAsset,
    isJsonValid: input.isJsonValid,
    showProgressCard: true,
    showPrepareAction: true,
    showPublishSection: false,
    publishStepEnabled: input.publishStepEnabled,
    studioPublishReady: input.studioPublishReady,
    studioScheduleReady: input.studioScheduleReady,
    studioPublishIssueCount: input.studioPublishPreflightIssueCount,
    studioScheduleIssueCount: input.studioSchedulePreflightIssueCount,
    quickScheduledAt: input.quickScheduledAt,
    prepareButtonLabel: input.prepareButtonLabel,
    prepareDisabledReason: input.preselectedMediaValidationMessage || undefined,
    sfxAutoLevel: input.sfxAutoLevel,
    canEditSelectedCategory: input.canEditSelectedCategory,
    canPublishSelectedCategory: input.canPublishSelectedCategory,
    editPermissionMessage: input.studioEditPermissionMessage,
    publishPermissionMessage: input.studioPublishPermissionMessage,
    renderStatus: input.renderStatus,
    onPrepareAction: () => input.handlePrepareWithHistory(),
    onSfxAutoLevelChangeAction: input.handleSfxAutoLevelChange,
    onQuickScheduledAtChangeAction: input.handleQuickScheduledAtChange,
    onPublishNowAction: input.handleOneClickAuto,
    onPublishScheduleAction: input.handleOneClickAutoSchedule,
  };

  const resultPublishPanelProps: StudioDesktopWorkspaceShellProps["resultPublishPanelProps"] = {
    ...quickPublishPanelProps,
    showProgressCard: false,
    showPrepareAction: false,
    showPublishSection: true,
  };

  const brandingPanelProps: StudioDesktopWorkspaceShellProps["brandingPanelProps"] = {
    categoryLabel: resolvedProfileSnapshotLabel,
    branding: input.selectedBranding,
    previewSlides: input.brandingPanelPreviewSlides,
    previewUsesSample: input.brandingPanelPreviewUsesSample,
    templateId: input.effectiveCategoryTemplatePreset.templateId,
    templateData: input.effectiveCategoryTemplatePreset.templateData,
    templateImageEnabled: input.effectiveCategoryTemplatePreset.templateImageEnabled,
    templateImageUrl: input.effectiveCategoryTemplatePreset.templateImageUrl,
    templateImageLayout: input.effectiveCategoryTemplatePreset.templateImageLayout,
    templateLayoutApply: input.effectiveCategoryTemplatePreset.templateLayoutApply,
    templateLayoutHint: input.activeTemplateDefinition.layoutStudioHint,
    templateRequirementAlert: input.templateRequirementAlert,
    localPresetSummary: input.localPresetSummary,
    brandingDbDirty: input.brandingDbDirty,
    renderStateLabel: input.renderStateLabel,
    renderStateTone: input.renderStateTone,
    brandingSaveBusy: input.brandingSaveBusy,
    templateNotes: input.templateNotesDraft,
    templateNotesSaveBusy: input.templateNotesSaveBusy,
    statusMessage: input.brandingStatus,
    readOnly: !input.canEditSelectedCategory,
    permissionMessage: input.studioEditPermissionMessage,
    onPreviewSlideIndexChangeAction: input.brandingPanelPreviewIndexSetter,
    onBrandingChangeAction: input.handleBrandingChange,
    onTemplateIdChangeAction: handleStudioTemplateIdChange,
    onTemplateDataChangeAction: handleStudioTemplateDataChange,
    onTemplateImageEnabledChangeAction: handleStudioTemplateImageEnabledChange,
    onTemplateImageUrlChangeAction: handleStudioTemplateImageUrlChange,
    onTemplateImageFileChangeAction: (file: File | null) => void input.handleStudioTemplateImageFileChange(file),
    onTemplateLayoutApplyChangeAction: handleStudioTemplateLayoutApplyChange,
    onTemplateFontSizeChangeAction: input.handleStudioTemplateFontSizeChange,
    onTemplateLayoutColorChangeAction: input.handleStudioTemplateLayoutColorChange,
    onSaveBrandingAction: () => void input.handleSaveCategoryBranding(),
    onTemplateNotesChangeAction: input.handleTemplateNotesChange,
    onSaveTemplateNotesAction: () => void input.handleSaveTemplateNotes(),
    onResetCurrentCategoryAction: input.handleResetCurrentCategory,
    onJumpToResultAction: input.handleJumpToResultAction,
  };

  const scriptJsonPanelProps: StudioDesktopWorkspaceShellProps["scriptJsonPanelProps"] = {
    imageSource: input.imageSource,
    topicText: input.topicText,
    scriptText: input.scriptText,
    topicToScriptBusy: input.topicToScriptBusy,
    topicToScriptStatus: input.topicToScriptStatus,
    scriptToJsonBusy: input.scriptToJsonBusy,
    scriptToJsonStatus: input.scriptToJsonStatus,
    scriptMode: input.scriptMode,
    voiceOptions: input.voiceOptions,
    selectedVoiceId: input.selectedVoiceId,
    selectedTypecastSpeed: input.selectedTypecastSpeed,
    selectedQuoteVoiceId: input.selectedQuoteVoiceId,
    selectedMaleVoiceId: input.selectedMaleVoiceId,
    selectedFemaleVoiceId: input.selectedFemaleVoiceId,
    speakerVoices: input.speakerVoiceRows,
    storyCharacterProfiles: input.storyCharacterProfileRows,
    hasFixedCharacterProfile: Boolean(selectedFixedCharacterProfile),
    imageStylePrompt: input.imageStylePrompt,
    speakerAssignBusy: input.scriptToJsonBusy,
    voicePreviewLoading: input.voicePreviewLoading,
    voicePreviewPlaying: input.voicePreviewPlaying,
    showJsonEditor: input.showJsonEditor,
    jsonText: input.jsonText,
    isJsonValid: input.isJsonValid,
    disabled: !input.canEditSelectedCategory,
    onTopicTextChangeAction: input.handleTopicTextChange,
    onScriptTextChangeAction: input.handleScriptTextChange,
    onGenerateScriptFromTopicAction: input.handleGenerateScriptFromTopic,
    onConvertScriptToJsonAction: input.handleConvertScriptToJson,
    onConvertScriptTextOnlyAction: input.handleConvertScriptTextOnly,
    onScriptModeChangeAction: input.handleScriptModeChange,
    onVoiceChangeAction: input.handleVoiceChange,
    onPreviewVoiceAction: handleInputVoicePreview,
    onStopVoicePreviewAction: input.handleStopVoicePreview,
    onAssignDialogueSpeakersAction: input.handleAssignDialogueSpeakers,
    onDialogueSpeakerAssignmentAction: input.handleDialogueSpeakerAssignment,
    onSpeakerVoicesChangeAction: input.handleSpeakerVoicesChange,
    onStoryCharacterProfilesChangeAction: input.handleStoryCharacterProfilesChange,
    onImageStylePromptChangeAction: input.handleImageStylePromptChange,
    onToggleJsonEditorAction: () => input.setShowJsonEditor((prev) => !prev),
    onJsonTextChangeAction: input.handleJsonTextChange,
    onJsonTextCommitAction: input.handleJsonTextCommit,
  };

  const preselectedMediaPanelProps: StudioDesktopWorkspaceShellProps["preselectedMediaPanelProps"] = {
    items: input.preselectedMediaItems,
    applyMode: input.preselectedMediaApplyMode,
    sourceSlideCount: input.parsedSlideCount,
    assignmentPreview: input.preselectedMediaAssignments,
    validationMessage: input.preselectedMediaValidationMessage || undefined,
    disabled: !input.canEditSelectedCategory,
    onApplyModeChangeAction: input.handlePreselectedMediaApplyModeChange,
    onAppendItemsAction: input.handleAppendPreselectedMediaItems,
    onRemoveItemAction: input.handleRemovePreselectedMediaItem,
    onTargetSlideChangeAction: input.handlePreselectedMediaTargetSlideChange,
    onMoveItemAction: input.handleMovePreselectedMediaItem,
    onReorderItemAction: input.handleReorderPreselectedMediaItem,
    onClearItemsAction: input.handleClearPreselectedMediaItems,
  };

  const templateQuickPickerProps: StudioDesktopWorkspaceShellProps["templateQuickPickerProps"] = {
    templateId: input.templateId,
    detailsHref: input.templateManagerHref,
    templateRequirementAlert: input.templateRequirementAlert,
    disabled: !input.canEditSelectedCategory,
    onTemplateIdChangeAction: handleStudioTemplateIdChange,
  };

  const advancedSettingsPanelProps: StudioDesktopWorkspaceShellProps["advancedSettingsPanelProps"] = {
    imageSource: input.imageSource,
    imageSearchSource: input.imageSearchSource,
    fixedCharacterProfiles,
    fixedCharacterProfileId: selectedFixedCharacterProfile?.characterId,
    debugImageSearch: input.debugImageSearch,
    defaultTtsProvider: input.defaultTtsProvider,
    scriptMode: input.scriptMode,
    selectedVoiceId: input.selectedVoiceId,
    selectedQuoteVoiceId: input.selectedQuoteVoiceId,
    selectedMaleVoiceId: input.selectedMaleVoiceId,
    selectedFemaleVoiceId: input.selectedFemaleVoiceId,
    selectedTypecastEmotionType: input.selectedTypecastEmotionType,
    selectedTypecastSpeed: input.selectedTypecastSpeed,
    selectedVoiceOption: input.selectedVoiceOption,
    voiceOptions: input.voiceOptions,
    voicePreviewLoading: input.voicePreviewLoading,
    voicePreviewPlaying: input.voicePreviewPlaying,
    fixedCharacterProfilesHref: input.fixedCharacterProfilesHref,
    templateManagerHref: input.templateManagerHref,
    disabled: !input.canEditSelectedCategory,
    onImageSourceChangeAction: input.handleImageSourceChange,
    onImageSearchSourceChangeAction: input.handleImageSearchSourceChange,
    onDebugImageSearchChangeAction: input.handleDebugImageSearchChange,
    onFixedCharacterProfileIdChangeAction: input.handleFixedCharacterProfileIdChange,
    onScriptModeChangeAction: input.handleScriptModeChange,
    onTypecastEmotionTypeChangeAction: input.handleTypecastEmotionTypeChange,
    onTypecastSpeedChangeAction: input.handleTypecastSpeedChange,
    onVoiceChangeAction: input.handleVoiceChange,
    onQuoteVoiceChangeAction: input.handleQuoteVoiceChange,
    onMaleVoiceChangeAction: input.handleMaleVoiceChange,
    onFemaleVoiceChangeAction: input.handleFemaleVoiceChange,
    onAddCustomTypecastVoiceAction: input.handleAddCustomTypecastVoiceOption,
    onPreviewVoiceAction: handleSelectedVoicePreview,
    onStopVoicePreviewAction: input.handleStopVoicePreview,
  };

  const historyPanelProps: StudioDesktopWorkspaceShellProps["historyPanelProps"] = {
    historyEntries: input.historyEntries,
    activeHistoryId: input.activeHistoryId,
    selectedHistoryId: input.selectedHistoryId,
    panelRef: input.historyPanelRef,
    readOnly: !input.canEditSelectedCategory,
    permissionMessage: input.studioEditPermissionMessage,
    onSelectHistoryAction: input.handleSelectHistorySnapshot,
    onRestoreHistoryAction: input.handleRestoreHistorySnapshot,
    onDeleteHistoryAction: input.handleDeleteHistorySnapshot,
    onClearHistoryAction: input.handleClearHistory,
    onCloseAction: input.closeHistoryPanel,
  };

  const previewPanelProps: StudioDesktopWorkspaceShellProps["previewPanelProps"] = {
    title: input.publishTitle,
    slides: input.displaySlides,
    warnings: input.imageErrors,
    hasPreparedSlides: input.hasPreparedSlides,
    imageSource: input.imageSource,
    publishCategory: input.publishCategory,
    categoryMetadata: input.currentCategoryMetadata,
    fixedCharacterProfile: selectedFixedCharacterProfile,
    imageStylePrompt: selectedFixedCharacterProfile ? undefined : input.imageStylePrompt,
    templateId: input.effectiveCategoryTemplatePreset.templateId,
    templateData: input.effectiveCategoryTemplatePreset.templateData,
    templateImageEnabled: input.effectiveCategoryTemplatePreset.templateImageEnabled,
    templateImageLayout: input.effectiveCategoryTemplatePreset.templateImageLayout,
    busy: input.busy,
    isJsonValid: input.isJsonValid,
    showPrepareAction: false,
    prepareButtonLabel: input.prepareButtonLabel,
    prepareDisabledReason: input.preselectedMediaValidationMessage || undefined,
    imageOnlyEditMode: false,
    selectedSlideGroupIndex: input.selectedPreviewGroupIndex,
    onSelectedSlideGroupIndexChangeAction: input.setSelectedPreviewGroupIndex,
    readOnly: !input.canEditSelectedCategory,
    permissionMessage: input.studioEditPermissionMessage,
    onPrepareAction: () => void input.handlePrepareWithHistory(),
    onTitleChangeAction: input.handleTitleChange,
    onSlideTitleChangeAction: input.handleSlideTitleChange,
    onSlideImageUrlChange: input.handleSlideImageUrlChange,
    onSlideImageFileChange: input.handleSlideImageFileChange,
    onSlideLibraryAssetApplyAction: input.handleSlideLibraryAssetApply,
    onSlideImageCandidateApplyAction: input.handleSlideImageCandidateApply,
    onSlideNarrationTextChange: input.handleSlideNarrationTextChange,
    onSlideVoiceChangeAction: input.handleSlideVoiceChange,
    onSlideDeleteAction: input.handleSlideDelete,
    onSlideAddAction: input.handleSlideAdd,
    onSlideVoicePreviewAction: handleSlideVoicePreview,
    onSlideSfxCueChange: input.handleSlideSfxCueChange,
    onSlideSfxReplanAction: input.handleSlideSfxReplan,
    sfxCategories: input.sfxCategories,
    sfxEnabled: input.sfxEnabled,
    selectedVoiceId: input.selectedVoiceId,
    voiceOptions: input.voiceOptions,
    renderSlidePreview: input.renderStudioSlidePreview,
  };

  return {
    desktopWorkspaceShellProps: {
      advancedSettingsPanelProps,
      beginnerStepIndex: input.beginnerStepIndex,
      brandingFabRef: input.brandingFabRef,
      brandingPanelOpen: input.brandingPanelOpen,
      brandingPanelProps,
      brandingPanelRef: input.brandingPanelRef,
      canEditSelectedCategory: input.canEditSelectedCategory,
      changeImpactSummary: input.changeImpactSummary,
      closeBrandingPanel: input.closeBrandingPanel,
      closeHistoryPanel: input.closeHistoryPanel,
      codexLocalReady: input.codexLocalReady,
      codexOauthConnected: input.codexOauthConnected,
      codexOauthMode: input.codexOauthMode,
      codexOauthStatus: input.codexOauthStatus,
      codexUsage: input.codexUsage,
      handleDisconnectCodexOauth: input.handleDisconnectCodexOauth,
      hasFinalVideo: input.hasFinalVideo,
      hasPreparedSlides: input.hasPreparedSlides,
      hasRenderedVideo: input.hasRenderedVideo,
      imageApproved: input.imageApproved,
      historyFabRef: input.historyFabRef,
      historyPanelProps,
      historyPanelVisible: input.historyPanelVisible,
      memeLibraryPanelProps: {
        slides: input.memeLibrarySlides,
        canEditSelectedCategory: input.canEditSelectedCategory,
        permissionMessage: input.studioEditPermissionMessage,
        onApplyAssetToSlideAction: input.handleSlideLibraryAssetApply,
      },
      onApproveImageAction: input.handleApproveImage,
      onOpenLayoutStudioAction: input.handleOpenLayoutStudio,
      openHistoryPanel: input.openHistoryPanel,
      preparePanelProps: quickPublishPanelProps,
      preselectedMediaPanelProps,
      previewPanelProps,
      profileSnapshotLabel: resolvedProfileSnapshotLabel,
      projectName: input.projectName,
      projectProfileLabel: input.projectProfileLabel,
      projectProfileSnapshot: input.projectProfileSnapshot,
      projectProfileSyncProps: input.projectProfileSyncProps,
      autosaveState: input.autosaveState,
      onAutosaveRetryAction: input.onAutosaveRetryAction,
      publishCategory: input.publishCategory,
      isJsonValid: input.isJsonValid,
      resultPanelProps: sharedResultPanelProps,
      resultPublishPanelProps,
      renderUsage: input.renderUsage,
      scriptJsonPanelProps,
      templateQuickPickerProps,
      toggleBrandingPanel: input.toggleBrandingPanel,
      toggleHistoryPanel: input.toggleHistoryPanel,
      categoryOptions: input.categoryOptions,
      mappedChannelId: input.mappedChannelId,
      mappedChannelTitle: input.mappedChannelTitle,
      busy: input.busy,
      layoutStudioHref: input.layoutStudioHref,
      templateId: input.templateId,
      templateLabel: input.activeTemplateDefinition.label,
      onProjectNameChangeAction: input.onProjectNameChangeAction,
    },
  };
}
