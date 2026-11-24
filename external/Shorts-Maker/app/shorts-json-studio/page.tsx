"use client";

import { useCallback, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { fetchStudioCategoryMetadata } from "@/lib/api/studio-client";
import { isStudioStepperV1Enabled } from "@/lib/config/feature-flags";
import {
  DEFAULT_TEMPLATE_IMAGE_LAYOUT,
  DEFAULT_TEMPLATE_LAYOUT_APPLY,
  applyPreselectedMediaToParsed,
  applyPublishTitleToSlides,
  buildPreselectedMediaAssignments,
  clearManualImagePromptsFromScriptJson,
  extractFixedCharacterProfileId,
  extractImageStylePrompt,
  extractSpeakerVoiceRows,
  extractStoryCharacterProfileRows,
  fitDurationsByTail,
  getLinkedSlideIndexes,
  getParsedSlideCount,
  getPreselectedMediaValidationMessage,
  hasScriptJsonImagePromptInputsChanged,
  hasScriptJsonPreparedContentChanged,
  hydrateRenderedSlidesWithPrepared,
  mergePreparedSlidesPreservingManualMedia,
  mergeSlidesPreservingMedia,
  normalizeGeneratedStudioJsonDraft,
  normalizeScriptDialogueMode,
  normalizeScriptJsonSlidesPayload,
  normalizeTemplateImageLayout,
  normalizeTemplateLayoutApply,
  nowMs,
  pickPreparePayloadBase,
  readImageFileAsDataUrl,
  revokeIfBlobUrl,
  sanitizeRect,
  syncPreparedSlideCharactersFromScriptJson,
  syncPreparedSlideDialogueSegmentsFromScriptJson,
  toEventDetailFromApiError,
  toPrepareCompatibleSlidePayload,
  toSafeFileName,
  toSfxPlanCompatibleSlidePayload,
  toTimingDetail,
} from "./studio-page-helpers";
import { useStudioCategoryPresetState } from "./use-studio-category-preset-state";
import { DEFAULT_PUBLISH_CATEGORY_OPTIONS, normalizeCategory } from "@/lib/publish/categories";
import { listDefaultTemplateBrandings, type TemplateBrandingSettings } from "@/lib/publish/template-branding";
import { GENERAL_STUDIO_SFX_CATEGORY_ID, STUDIO_BGM_OPTIONS } from "@/lib/studio/audio-options";
import { resolveStudioCharacterProfileById } from "@/lib/studio/character-profiles";
import { usePreflightTracking } from "@/lib/telemetry/use-preflight-tracking";
import { explodeSlidesForPop } from "@/lib/studio/frames";
import type { PublishCategory } from "@/lib/publish/types";
import type { PreparedSlide } from "@/types/studio-json";
import { StudioDesktopWorkspaceShell } from "./components/studio-mode-shells";
import { getStudioTemplateFeatureToggles } from "@/types/studio-feature-document";
import {
  applyStudioCaptionAutoMetadata,
  formatStudioCaptionCueLines,
  parseStudioCaptionCueLine,
} from "@/types/studio-caption";
import { useStudioPrepareFlow } from "./use-studio-prepare-flow";
import { useStudioEditorState } from "./use-studio-editor-state";
import { useStudioBrandingPanelViewModel } from "./use-studio-branding-panel-view-model";
import { applySpeakerRenameMapToScriptJson, useStudioInputActions } from "./use-studio-input-actions";
import { useStudioModeShellProps } from "./use-studio-mode-shell-props";
import { useStudioRenderWorkflowController } from "./use-studio-render-workflow-controller";
import { useStudioPermissionActions } from "./use-studio-permission-actions";
import { useStudioPreselectedMediaActions } from "./use-studio-preselected-media-actions";
import { useStudioParsedPublishingState } from "./use-studio-parsed-publishing-state";
import { useStudioPreviewTelemetryUi } from "./use-studio-preview-telemetry-ui";
import {
  resolveStudioRenderPrimaryAction,
  useStudioRenderPublishViewModel,
} from "./use-studio-render-publish-view-model";
import {
  buildStudioDraftRenderFingerprint,
  buildStudioImageApprovalFingerprint,
  buildStudioRenderFingerprint,
  type StudioRenderFingerprintInput,
} from "./studio-render-fingerprint";
import { resolveStudioChangeImpactSummary } from "./studio-change-impact";
import {
  buildStudioRenderPreflightFingerprint,
  buildStudioRenderPreflightSummary,
  hasRenderableMedia,
  type StudioRenderPreflightInput,
} from "./studio-render-preflight";
import { buildStudioAssetSnapshot } from "./studio-asset-snapshot";
import {
  gateStudioPublishIssuesByFinalAsset,
  resolveStudioFinalAssetGate,
} from "./studio-final-asset-gate";
import { useStudioScriptGenerationActions } from "./use-studio-script-generation-actions";
import { useStudioSessionHistoryController } from "./use-studio-session-history-controller";
import { useStudioSlideEditHistoryActions } from "./use-studio-slide-edit-history-actions";
import { useStudioSlideEditActions } from "./use-studio-slide-edit-actions";
import { useStudioProjectProfileSync } from "./use-studio-project-profile-sync";
import type { StudioWorkDraft, TemplateBranding } from "./types";
const DEFAULT_CATEGORY = DEFAULT_PUBLISH_CATEGORY_OPTIONS[0]?.key || "default";
const HISTORY_INPUT_DEBOUNCE_MS = 700;

function toTemplateBranding(input: TemplateBrandingSettings): TemplateBranding {
  return {
    variant: "news",
    headerTitle: input.headerTitle,
    headerAccentText: input.headerAccentText,
    headerColor: input.headerColor,
    footerColor: input.footerColor,
    infoLineText: input.infoLineText,
    fontFamily: input.fontFamily,
    imageRounded: input.imageRounded,
  };
}

const DEFAULT_BRANDING_BY_CATEGORY: Record<PublishCategory, TemplateBranding> = Object.fromEntries(
  Object.entries(listDefaultTemplateBrandings()).map(([category, branding]) => [category, toTemplateBranding(branding)])
);

export default function ShortsJsonStudioPage() {
  const studioStepperEnabled = isStudioStepperV1Enabled();
  const {
    bgmEnabled,
    bgmVolume,
    brandingDraft,
    brandingFabRef,
    brandingPanelOpen,
    brandingPanelPreviewIndex,
    brandingPanelRef,
    brandingSaveBusy,
    brandingStatus,
    busy,
    categoryBrandingMap,
    categoryChannels,
    categoryMetadataMap,
    categoryOptions,
    codexLocalReady,
    codexModel,
    codexOauthConnected,
    codexOauthMode,
    codexOauthStatus,
    codexStatusLoaded,
    codexUsage,
    crawlMode,
    debugImageSearch,
    defaultTtsProvider,
    historyFabRef,
    historyPanelRef,
    imageErrors,
    imageApprovalFingerprint,
    imageSource,
    imageSearchSource,
    isOnboardingMode,
    jsonInputStartedRef,
    jsonText,
    lastDraftRenderFingerprint,
    lastFinalRenderFingerprint,
    lastRenderPreflightFingerprint,
    lastSfxPlanSourceKeyRef,
    layoutPresetVersion,
    localPresetRevision,
    markCodexOauthDisconnected,
    updateCategoryMetadata,
    mixPresetId,
    playbackRate,
    preselectedMediaApplyMode,
    preselectedMediaItems,
    preselectedMediaSessionRegistryRef,
    presetBrandingOverride,
    previewTiming,
    publishAccounts,
    publishCategory,
    projectProfileSnapshot,
    quickScheduledAt,
    renderStatus,
    renderUsage,
    resetPreviewRefs,
    savedBrandingSnapshotByCategory,
    scriptMode,
    scriptText,
    scriptToJsonBusy,
    scriptToJsonStatus,
    selectedBgmTrack,
    selectedPreviewGroupIndex,
    selectedFemaleVoiceId,
    selectedMaleVoiceId,
    selectedQuoteVoiceId,
    selectedTypecastEmotionType,
    selectedTypecastSpeed,
    selectedVoiceId,
    addCustomTypecastVoiceOption,
    autosave,
    setBgmEnabled,
    setBgmVolume,
    setBrandingDraft,
    setBrandingPanelOpen,
    setBrandingPanelPreviewIndex,
    setBrandingSaveBusy,
    setBrandingStatus,
    setBusy,
    setCodexModel,
    setCodexOauthStatus,
    setCodexUsage,
    setCrawlMode,
    setDebugImageSearch,
    setImageErrors,
    setImageApprovalFingerprint,
    setImageSource,
    setImageSearchSource,
    setJsonText,
    setLayoutPresetVersion,
    setLastDraftRenderFingerprint,
    setLastFinalRenderFingerprint,
    setLastRenderPreflightFingerprint,
    setLocalPresetRevision,
    setMixPresetId,
    setPlaybackRate,
    setPresetBrandingOverride,
    setPreselectedMediaApplyMode,
    setPreselectedMediaItems,
    setPreviewTiming,
    setPublishCategory,
    setProjectProfileSnapshot,
    setQuickScheduledAt,
    setRenderNeedsRefresh,
    setRenderStatus,
    setRenderUsage,
    setSavedBrandingSnapshotByCategory,
    setScriptMode,
    setScriptText,
    setScriptToJsonBusy,
    setScriptToJsonStatus,
    setSelectedBgmTrack,
    setSelectedPreviewGroupIndex,
    setSelectedFemaleVoiceId,
    setSelectedMaleVoiceId,
    setSelectedQuoteVoiceId,
    setSelectedTypecastEmotionType,
    setSelectedTypecastSpeed,
    setSelectedVoiceId,
    setSfxAutoLevel,
    setSfxCategories,
    setSfxEnabled,
    setSfxMasterGainDb,
    setShowJsonEditor,
    setSlides,
    setTemplateData,
    setTemplateId,
    setTemplateImageEnabled,
    setTemplateImageLayout,
    setTemplateImageUrl,
    setTemplateLayoutApply,
    setTemplateNotesByCategory,
    setTemplateNotesSaveBusy,
    setTopicText,
    setTopicToScriptBusy,
    setTopicToScriptStatus,
    setUploadedVideoUrl,
    setVideoUrl,
    setWorkName,
    sfxAutoLevel,
    sfxCategories,
    sfxEnabled,
    sfxMasterGainDb,
    showJsonEditor,
    skipCategoryAudioPresetRef,
    slides,
    templateData,
    templateId,
    templateImageEnabled,
    templateImageLayout,
    templateImageUrl,
    templateLayoutApply,
    templateNotesByCategory,
    templateNotesSaveBusy,
    topicInputStartedRef,
    topicText,
    topicToScriptBusy,
    topicToScriptStatus,
    uploadedVideoUrl,
    videoUrl,
    voiceOptions,
    workName,
    workspacePermissions,
  } = useStudioEditorState({
    defaultBrandingByCategory: DEFAULT_BRANDING_BY_CATEGORY,
    defaultCategory: DEFAULT_CATEGORY,
    defaultCategoryOptions: DEFAULT_PUBLISH_CATEGORY_OPTIONS.map((item) => ({ value: item.key, label: item.label })),
    defaultTemplateImageLayout: DEFAULT_TEMPLATE_IMAGE_LAYOUT,
    defaultTemplateLayoutApply: DEFAULT_TEMPLATE_LAYOUT_APPLY,
    normalizeCategoryAction: normalizeCategory,
    normalizeTemplateImageLayoutAction: normalizeTemplateImageLayout,
    studioStepperEnabled,
    toTemplateBrandingAction: toTemplateBranding,
  });

  const {
    parsed,
    speakerVoiceRows,
    storyCharacterProfileRows,
    fixedCharacterProfileId,
    imageStylePrompt,
    parsedSlideCount,
    preselectedMediaAssignments,
    preselectedMediaValidationMessage,
    mappedChannelId,
    mappedChannelTitle,
    selectedCategoryPermissionLevel,
    selectedCategoryPermissionLabel,
    canEditSelectedCategory,
    canPublishSelectedCategory,
    studioEditPermissionMessage,
    studioPublishPermissionMessage,
    publishTitle,
    displaySlides,
    studioPublishPreflightIssues: storedStudioPublishPreflightIssues,
    studioSchedulePreflightIssues: storedStudioSchedulePreflightIssues,
  } = useStudioParsedPublishingState({
    applyPublishTitleToSlidesAction: applyPublishTitleToSlides,
    buildPreselectedMediaAssignmentsAction: buildPreselectedMediaAssignments,
    categoryChannels,
    extractSpeakerVoiceRowsAction: extractSpeakerVoiceRows,
    extractStoryCharacterProfileRowsAction: extractStoryCharacterProfileRows,
    extractFixedCharacterProfileIdAction: extractFixedCharacterProfileId,
    extractImageStylePromptAction: extractImageStylePrompt,
    getParsedSlideCountAction: getParsedSlideCount,
    getPreselectedMediaValidationMessageAction: getPreselectedMediaValidationMessage,
    jsonText,
    preselectedMediaApplyMode,
    preselectedMediaItems,
    publishAccounts,
    publishCategory,
    quickScheduledAt,
    slides,
    uploadedVideoUrl,
    workspacePermissions,
  });
  const currentCategoryMetadata =
    categoryMetadataMap[publishCategory] ||
    (projectProfileSnapshot?.contentProfile.category === publishCategory
      ? projectProfileSnapshot.contentProfile.metadataSnapshot
      : null);
  const selectedFixedCharacterProfile = resolveStudioCharacterProfileById(
    currentCategoryMetadata?.fixedCharacterProfiles,
    fixedCharacterProfileId
  );
  const activeFixedCharacterProfileId = selectedFixedCharacterProfile?.characterId;
  const { ensureEditPermission, ensurePublishPermission, markRenderedAssetAsDirty } = useStudioPermissionActions({
    canEditSelectedCategory,
    canPublishSelectedCategory,
    setBrandingStatus,
    setRenderNeedsRefresh,
    setRenderStatus,
    setRenderUsage,
    setScriptToJsonStatus,
    setTopicToScriptStatus,
    studioEditPermissionMessage,
    studioPublishPermissionMessage,
  });
  const persistLocalPresetRevision = useCallback(() => {
    setLocalPresetRevision((prev) => prev + 1);
  }, [setLocalPresetRevision]);

  const handleImagePromptInputsChange = useCallback(
    (nextJson: Record<string, unknown>) => {
      setSlides((prev) => syncPreparedSlideCharactersFromScriptJson(prev, nextJson));
      markRenderedAssetAsDirty("대본·캐릭터·이미지 스타일이 변경되었습니다. 이미지와 영상을 다시 생성해야 합니다.");
    },
    [markRenderedAssetAsDirty, setSlides]
  );

  const {
    selectedBranding,
    templateNotesDraft,
    effectiveCategoryTemplatePreset,
    localPresetSummary,
    brandingDbDirty,
    handleOpenLayoutStudio,
    handleBrandingChange,
    handleTemplateNotesChange,
    handleTemplatePresetChange,
    handleTemplateImageFileChange,
    handleTemplateFontSizeChange,
    handleTemplateLayoutColorChange,
    handleResetCurrentCategory,
    handleSaveCategoryBranding,
    handleSaveTemplateNotes,
    resetCurrentCategoryAudioPreset,
  } = useStudioCategoryPresetState({
    brandingDraft,
    categoryBrandingMap,
    categoryMetadataMap,
    defaultBrandingByCategory: DEFAULT_BRANDING_BY_CATEGORY,
    defaultCategory: DEFAULT_CATEGORY,
    defaultTemplateImageLayout: DEFAULT_TEMPLATE_IMAGE_LAYOUT,
    defaultTemplateLayoutApply: DEFAULT_TEMPLATE_LAYOUT_APPLY,
    ensureEditPermission,
    hasRenderedVideo: Boolean(videoUrl),
    layoutPresetVersion,
    localPresetRevision,
    markRenderedAssetAsDirty,
    normalizeTemplateImageLayout,
    normalizeTemplateLayoutApply,
    persistLocalPresetRevision,
    presetBrandingOverride,
    projectProfileSnapshot,
    publishCategory,
    readImageFileAsDataUrl,
    savedBrandingSnapshotByCategory,
    sanitizeRect,
    selectedVoiceId,
    setBgmEnabled,
    setBgmVolume,
    setBrandingDraft,
    setBrandingSaveBusy,
    setBrandingStatus,
    setMixPresetId,
    setPlaybackRate,
    setPresetBrandingOverride,
    setSavedBrandingSnapshotByCategory,
    setSelectedBgmTrack,
    setSelectedVoiceId,
    setSfxEnabled,
    setSfxMasterGainDb,
    setTemplateData,
    setTemplateId,
    setTemplateImageEnabled,
    setTemplateImageLayout,
    setTemplateImageUrl,
    setTemplateLayoutApply,
    setTemplateNotesByCategory,
    setTemplateNotesSaveBusy,
    skipCategoryAudioPresetRef,
    templateData,
    templateId,
    templateImageEnabled,
    templateImageLayout,
    templateImageUrl,
    templateLayoutApply,
    templateNotesByCategory,
  });

  useEffect(() => {
    if (!parsed || typeof parsed !== "object") return;
    const nextMode = normalizeScriptDialogueMode((parsed as Record<string, unknown>).mode);
    setScriptMode((current) => (current === nextMode ? current : nextMode));
  }, [parsed]);
  const {
    templateRequirementAlert,
    activeTemplateDefinition,
    captionFeaturePreviewSlide,
    brandingPanelPreviewSlides,
    brandingPanelPreviewUsesSample,
    layoutStudioHref,
    templateManagerHref,
    fixedCharacterProfilesHref,
    handleJumpToResultAction,
    downloadFileName,
    autoSfxCategoryIds,
    sfxPlanSourceKey,
  } = useStudioBrandingPanelViewModel({
    brandingPanelPreviewIndex,
    closeBrandingPanel: () => setBrandingPanelOpen(false),
    displaySlides,
    effectiveCategoryTemplatePreset,
    generalSfxCategoryId: GENERAL_STUDIO_SFX_CATEGORY_ID,
    jsonText,
    publishCategory,
    publishTitle,
    sfxCategories,
    toSafeFileNameAction: toSafeFileName,
  });
  const renderFingerprintSource = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const selectedBgmPath = STUDIO_BGM_OPTIONS.find((item) => item.id === selectedBgmTrack)?.path || "";
  const renderFingerprintInput = useMemo<StudioRenderFingerprintInput>(
    () => ({
      slides,
      source: renderFingerprintSource,
      selectedVoiceId,
      selectedQuoteVoiceId,
      selectedMaleVoiceId,
      selectedFemaleVoiceId,
      selectedTypecastEmotionType,
      selectedTypecastSpeed,
      playbackRate,
      bgmEnabled,
      selectedBgmTrack,
      bgmPath: selectedBgmPath,
      bgmVolume,
      mixPresetId,
      sfxEnabled,
      sfxMasterGainDb,
      sfxCategories,
      branding: {
        headerTitle: selectedBranding.headerTitle,
        headerAccentText: selectedBranding.headerAccentText || "",
        headerColor: selectedBranding.headerColor,
        footerColor: selectedBranding.footerColor,
        infoLineText: selectedBranding.infoLineText,
        fontFamily: selectedBranding.fontFamily,
        imageRounded: selectedBranding.imageRounded,
      },
      templateId: effectiveCategoryTemplatePreset.templateId,
      templateData: effectiveCategoryTemplatePreset.templateData,
      templateImageEnabled: effectiveCategoryTemplatePreset.templateImageEnabled,
      templateImageUrl: effectiveCategoryTemplatePreset.templateImageUrl,
      templateImageLayout: effectiveCategoryTemplatePreset.templateImageLayout,
      templateLayoutApply: effectiveCategoryTemplatePreset.templateLayoutApply,
    }),
    [
      bgmEnabled,
      bgmVolume,
      effectiveCategoryTemplatePreset,
      mixPresetId,
      playbackRate,
      renderFingerprintSource,
      selectedBgmPath,
      selectedBgmTrack,
      selectedBranding,
      selectedFemaleVoiceId,
      selectedMaleVoiceId,
      selectedQuoteVoiceId,
      selectedTypecastEmotionType,
      selectedTypecastSpeed,
      selectedVoiceId,
      sfxCategories,
      sfxEnabled,
      sfxMasterGainDb,
      slides,
    ]
  );
  const currentRenderFingerprint = useMemo(
    () => buildStudioRenderFingerprint(renderFingerprintInput),
    [renderFingerprintInput]
  );
  const currentDraftRenderFingerprint = useMemo(
    () => buildStudioDraftRenderFingerprint(renderFingerprintInput),
    [renderFingerprintInput]
  );
  const currentImageApprovalFingerprint = useMemo(
    () => buildStudioImageApprovalFingerprint(renderFingerprintInput),
    [renderFingerprintInput]
  );
  const imageApproved = Boolean(
    imageApprovalFingerprint && imageApprovalFingerprint === currentImageApprovalFingerprint
  );
  const handleApproveImage = useCallback(() => {
    setImageApprovalFingerprint(currentImageApprovalFingerprint);
    setRenderStatus("이미지 확인을 완료했습니다.");
  }, [currentImageApprovalFingerprint, setImageApprovalFingerprint, setRenderStatus]);
  const imagesComplete = slides.length > 0 && slides.every(hasRenderableMedia);
  useEffect(() => {
    if (imageSource !== "auto-ai-generate" || !imagesComplete || imageApproved) return;
    setImageApprovalFingerprint(currentImageApprovalFingerprint);
  }, [
    currentImageApprovalFingerprint,
    imageApproved,
    imageSource,
    imagesComplete,
    setImageApprovalFingerprint,
  ]);
  const draftIsCurrent = Boolean(
    videoUrl &&
      lastDraftRenderFingerprint &&
      lastDraftRenderFingerprint === currentDraftRenderFingerprint
  );
  const finalIsCurrent = Boolean(
    uploadedVideoUrl &&
      draftIsCurrent &&
      lastFinalRenderFingerprint &&
      lastFinalRenderFingerprint === currentRenderFingerprint
  );
  const finalNeedsRefresh = Boolean(uploadedVideoUrl) && !finalIsCurrent;
  const changeImpactSummary = useMemo(
    () =>
      resolveStudioChangeImpactSummary({
        imageApprovalRecorded: Boolean(imageApprovalFingerprint),
        imageApproved,
        hasDraftVideo: Boolean(videoUrl),
        draftIsCurrent,
        hasFinalVideo: Boolean(uploadedVideoUrl),
        finalIsCurrent,
      }),
    [
      draftIsCurrent,
      finalIsCurrent,
      imageApprovalFingerprint,
      imageApproved,
      uploadedVideoUrl,
      videoUrl,
    ]
  );
  const { hasUsableFinalAsset: hasUploadedAsset } = useMemo(
    () => resolveStudioFinalAssetGate({ uploadedVideoUrl, imageApproved, finalIsCurrent }),
    [finalIsCurrent, imageApproved, uploadedVideoUrl]
  );
  const studioPublishPreflightIssues = useMemo(
    () => gateStudioPublishIssuesByFinalAsset(storedStudioPublishPreflightIssues, hasUploadedAsset),
    [hasUploadedAsset, storedStudioPublishPreflightIssues]
  );
  const studioSchedulePreflightIssues = useMemo(
    () => gateStudioPublishIssuesByFinalAsset(storedStudioSchedulePreflightIssues, hasUploadedAsset),
    [hasUploadedAsset, storedStudioSchedulePreflightIssues]
  );
  const studioPublishReady = studioPublishPreflightIssues.length === 0;
  const studioScheduleReady = studioSchedulePreflightIssues.length === 0;
  usePreflightTracking({ issues: studioPublishPreflightIssues, page: "studio", stage: "publish", ready: studioPublishReady });
  usePreflightTracking({ issues: studioSchedulePreflightIssues, page: "studio", stage: "schedule", ready: studioScheduleReady });
  const effectiveRenderNeedsRefresh = Boolean(videoUrl) && !draftIsCurrent;
  const renderPreflightInput = useMemo<StudioRenderPreflightInput>(
    () => ({
      slides,
      source: renderFingerprintSource,
      selectedVoiceId,
      selectedQuoteVoiceId,
      selectedMaleVoiceId,
      selectedFemaleVoiceId,
      previewTiming,
      imageApproved,
      renderNeedsRefresh: effectiveRenderNeedsRefresh,
      hasDraftVideo: Boolean(videoUrl),
      templateRequirementAlert,
      bgmEnabled,
      bgmPath: selectedBgmPath,
      sfxEnabled,
      sfxCategories,
      templateId: effectiveCategoryTemplatePreset.templateId,
      templateData: effectiveCategoryTemplatePreset.templateData,
      templateImageEnabled: effectiveCategoryTemplatePreset.templateImageEnabled,
      templateImageLayout: effectiveCategoryTemplatePreset.templateImageLayout,
    }),
    [
      bgmEnabled,
      effectiveRenderNeedsRefresh,
      effectiveCategoryTemplatePreset,
      previewTiming,
      imageApproved,
      renderFingerprintSource,
      selectedFemaleVoiceId,
      selectedMaleVoiceId,
      selectedQuoteVoiceId,
      selectedVoiceId,
      selectedBgmPath,
      sfxCategories,
      sfxEnabled,
      slides,
      templateRequirementAlert,
      videoUrl,
    ]
  );
  const renderPreflightSummary = useMemo(
    () => buildStudioRenderPreflightSummary(renderPreflightInput),
    [renderPreflightInput]
  );
  const currentRenderPreflightKey = useMemo(
    () => buildStudioRenderPreflightFingerprint(renderPreflightInput),
    [renderPreflightInput]
  );
  const renderPreflightHasRun = Boolean(
    draftIsCurrent &&
      lastRenderPreflightFingerprint &&
      lastRenderPreflightFingerprint === currentRenderPreflightKey
  );
  const buildRenderAssetSnapshot = useCallback(
    (stage: "draft" | "final", renderedSlides: PreparedSlide[]) => {
      const snapshotDraft: StudioWorkDraft = {
        workName: workName.trim() || undefined,
        topicText,
        scriptText,
        scriptMode,
        jsonText,
        showJsonEditor,
        imageSource,
        imageSearchSource,
        crawlMode,
        preselectedMediaItems,
        preselectedMediaApplyMode,
        publishCategory,
        projectProfileSnapshot: projectProfileSnapshot || undefined,
        codexModel,
        quickScheduledAt,
        selectedVoiceId,
        selectedQuoteVoiceId,
        selectedMaleVoiceId,
        selectedFemaleVoiceId,
        selectedTypecastEmotionType,
        selectedTypecastSpeed,
        playbackRate,
        bgmEnabled,
        selectedBgmTrack,
        bgmVolume,
        mixPresetId,
        sfxEnabled,
        sfxMasterGainDb,
        sfxAutoLevel,
        imageApprovalFingerprint,
        lastDraftRenderFingerprint: currentDraftRenderFingerprint,
        lastFinalRenderFingerprint: stage === "final" ? currentRenderFingerprint : undefined,
        lastRenderPreflightFingerprint: stage === "final" ? currentRenderPreflightKey : undefined,
        templateId: effectiveCategoryTemplatePreset.templateId,
        templateData: effectiveCategoryTemplatePreset.templateData,
        templateImageEnabled: effectiveCategoryTemplatePreset.templateImageEnabled,
        templateImageUrl: effectiveCategoryTemplatePreset.templateImageUrl,
        templateImageLayout: effectiveCategoryTemplatePreset.templateImageLayout,
        templateLayoutApply: effectiveCategoryTemplatePreset.templateLayoutApply,
      };
      return buildStudioAssetSnapshot({
        stage,
        draft: snapshotDraft,
        slides: renderedSlides,
        brandingDraft: selectedBranding,
      });
    },
    [
      bgmEnabled,
      bgmVolume,
      codexModel,
      crawlMode,
      currentDraftRenderFingerprint,
      currentRenderFingerprint,
      currentRenderPreflightKey,
      effectiveCategoryTemplatePreset,
      imageSearchSource,
      imageApprovalFingerprint,
      imageSource,
      jsonText,
      mixPresetId,
      playbackRate,
      preselectedMediaApplyMode,
      preselectedMediaItems,
      projectProfileSnapshot,
      publishCategory,
      quickScheduledAt,
      scriptMode,
      scriptText,
      selectedBgmTrack,
      selectedBranding,
      selectedFemaleVoiceId,
      selectedMaleVoiceId,
      selectedQuoteVoiceId,
      selectedTypecastEmotionType,
      selectedTypecastSpeed,
      selectedVoiceId,
      sfxAutoLevel,
      sfxEnabled,
      sfxMasterGainDb,
      showJsonEditor,
      topicText,
      workName,
    ]
  );
  const renderPrimaryAction = resolveStudioRenderPrimaryAction({
    isJsonValid: Boolean(parsed && typeof parsed === "object"),
    hasPreparedSlides: slides.length > 0,
    hasDraftVideo: Boolean(videoUrl),
    draftNeedsRefresh: effectiveRenderNeedsRefresh,
    preflightHasRun: renderPreflightHasRun,
    preflightBlockerCount: renderPreflightSummary.counts.blocker,
    hasFinalVideo: Boolean(uploadedVideoUrl),
    finalNeedsRefresh,
  });
  const handleRunRenderPreflight = useCallback(() => {
    if (!draftIsCurrent) {
      setRenderStatus("현재 입력으로 1차 확인본을 먼저 제작해 주세요.");
      return;
    }
    setLastRenderPreflightFingerprint(currentRenderPreflightKey);
    if (renderPreflightSummary.counts.blocker > 0) {
      setRenderStatus(`렌더 사전검사 차단 ${renderPreflightSummary.counts.blocker}건`);
      return;
    }
    setRenderStatus(
      renderPreflightSummary.counts.warning > 0
        ? `렌더 사전검사 통과 (경고 ${renderPreflightSummary.counts.warning}건)`
        : "렌더 사전검사 통과"
    );
  }, [
    currentRenderPreflightKey,
    draftIsCurrent,
    renderPreflightSummary.counts.blocker,
    renderPreflightSummary.counts.warning,
    setLastRenderPreflightFingerprint,
    setRenderStatus,
  ]);
  const {
    runPrepare,
    runRenderVideo,
    handleAutoPlanSfx,
    handleAutoPlanSfxForSlide,
    handleRenderVideo,
    handleRenderDraftVideo,
    handleOneClickAuto,
    handleOneClickAutoSchedule,
  } =
    useStudioRenderWorkflowController({
      parsed,
      publishCategory,
      projectProfileSnapshot,
      fixedCharacterProfileId: activeFixedCharacterProfileId,
      codexModel,
      imageSource,
      imageSearchSource,
      crawlMode,
      debugImageSearch,
      sfxCategoryIds: autoSfxCategoryIds,
      sfxAutoLevel,
      setBusyAction: setBusy,
      setSlidesAction: setSlides,
      setPreviewTimingAction: setPreviewTiming,
      setImageErrorsAction: setImageErrors,
      setVideoUrlAction: setVideoUrl,
      setUploadedVideoUrlAction: setUploadedVideoUrl,
      setRenderUsageAction: setRenderUsage,
      setRenderStatusAction: setRenderStatus,
      setJsonTextAction: setJsonText,
      getCurrentSlidesAction: () => slides,
      slides,
      preselectedMediaItems,
      preselectedMediaAssignments,
      effectiveCategoryTemplatePreset,
      lastSfxPlanSourceKeyRef,
      sfxPlanSourceKey,
      ensureEditPermission,
      ensurePublishPermission,
      studioPublishPreflightIssues,
      studioSchedulePreflightIssues,
      currentBranding: selectedBranding,
      buildStudioAssetSnapshotAction: buildRenderAssetSnapshot,
      publishTitle,
      quickScheduledAt,
      selectedFemaleVoiceId,
      selectedMaleVoiceId,
      selectedQuoteVoiceId,
      selectedTypecastEmotionType,
      selectedTypecastSpeed,
      selectedVoiceId,
      playbackRate,
      bgmEnabled,
      selectedBgmTrack,
      bgmVolume,
      mixPresetId,
      sfxEnabled,
      sfxMasterGainDb,
      sfxCategories,
      videoUrl,
      uploadedVideoUrl,
      renderNeedsRefresh: effectiveRenderNeedsRefresh,
      currentDraftRenderFingerprint,
      currentFinalRenderFingerprint: currentRenderFingerprint,
      canStartFinalRender:
        imageApproved &&
        draftIsCurrent &&
        renderPreflightHasRun &&
        renderPreflightSummary.canRenderFinal,
      setLastDraftRenderFingerprint,
      setLastFinalRenderFingerprint,
      setLastRenderPreflightFingerprint,
      onFinalRenderBlockedAction: () => {
        setRenderStatus("렌더 사전검사를 통과한 뒤 최종 영상을 제작해 주세요.");
      },
      setPreviewTiming,
      setVideoUrl,
      setUploadedVideoUrl,
      setRenderUsage,
      setRenderStatus,
      fitDurationsByTailAction: fitDurationsByTail,
      hydrateRenderedSlidesWithPreparedAction: hydrateRenderedSlidesWithPrepared,
      nowMsAction: nowMs,
      toTimingDetailAction: toTimingDetail,
      toEventDetailFromApiErrorAction: toEventDetailFromApiError,
    });
  const isJsonValid = Boolean(parsed && typeof parsed === "object");
  const {
    hasPreparedSlides,
    hasRenderedVideo,
    hasFinalVideo,
    previewPlayerSlides,
    previewPlayerFrameDurations,
    renderStateLabel,
    renderStateTone,
    publishStepEnabled,
    beginnerStepIndex,
    prepareButtonLabel,
    renderButtonLabel,
    renderStageLabel,
    renderStageDescription,
  } = useStudioRenderPublishViewModel({
    applyPublishTitleToSlidesAction: applyPublishTitleToSlides,
    displaySlides,
    explodeSlidesForPopAction: explodeSlidesForPop,
    hasUploadedAsset,
    isJsonValid,
    finalNeedsRefresh,
    previewTiming,
    publishTitle,
    renderNeedsRefresh: effectiveRenderNeedsRefresh,
    slides,
    uploadedVideoUrl,
    videoUrl,
  });

  const {
    handleTopicTextChange,
    handleScriptTextChange,
    handleImageSourceChange,
    handleImageSearchSourceChange,
    handleDebugImageSearchChange,
    handleQuickScheduledAtChange,
    handleJsonTextChange,
    handleScriptModeChange,
    handleSpeakerVoicesChange: applySpeakerVoicesChange,
    handleStoryCharacterProfilesChange: applyStoryCharacterProfilesChange,
    handleFixedCharacterProfileIdChange,
    handleImageStylePromptChange,
    handleAssignDialogueSpeakers,
  } = useStudioInputActions({
    canEditSelectedCategory,
    codexModel,
    ensureEditPermission,
    ensurePublishPermission,
    jsonInputStartedRef,
    nowMsAction: nowMs,
    onImagePromptInputsChangeAction: handleImagePromptInputsChange,
    parsed,
    publishCategory,
    selectedQuoteVoiceId,
    selectedVoiceId,
    setCodexUsage,
    setDebugImageSearch,
    setImageSource,
    setImageSearchSource,
    setJsonText,
    setQuickScheduledAt,
    setScriptMode,
    setScriptText,
    setScriptToJsonBusy,
    setScriptToJsonStatus,
    setShowJsonEditor,
    setTopicText,
    toEventDetailFromApiErrorAction: toEventDetailFromApiError,
    toTimingDetailAction: toTimingDetail,
    topicInputStartedRef,
  });

  const projectProfileSync = useStudioProjectProfileSync({
    publishCategory,
    profileLabel:
      categoryOptions.find((option) => option.value === publishCategory)?.label ||
      projectProfileSnapshot?.contentProfile.label ||
      publishCategory,
    projectProfileSnapshot,
    categoryMetadataMap,
    selectedVoiceId,
    playbackRate,
    bgmEnabled,
    selectedBgmTrack,
    mixPresetId,
    bgmVolume,
    sfxEnabled,
    sfxMasterGainDb,
    effectiveTemplatePreset: effectiveCategoryTemplatePreset,
    templateNotesDraft,
    imageStylePrompt,
    hasStructuredDraft: Boolean(parsed),
    defaultTemplateImageLayout: DEFAULT_TEMPLATE_IMAGE_LAYOUT,
    defaultTemplateLayoutApply: DEFAULT_TEMPLATE_LAYOUT_APPLY,
    normalizeTemplateImageLayout,
    normalizeTemplateLayoutApply,
    ensureEditPermission,
    markRenderedAssetAsDirty,
    onImageStylePromptChangeAction: handleImageStylePromptChange,
    onCategoryMetadataUpdatedAction: updateCategoryMetadata,
    setProjectProfileSnapshot,
    setSelectedVoiceId,
    setPlaybackRate,
    setBgmEnabled,
    setSelectedBgmTrack,
    setMixPresetId,
    setBgmVolume,
    setSfxEnabled,
    setSfxMasterGainDb,
    setTemplateId,
    setTemplateData,
    setTemplateImageEnabled,
    setTemplateImageUrl,
    setTemplateImageLayout,
    setTemplateLayoutApply,
    setTemplateNotesByCategory,
    setImageApprovalFingerprint,
  });

  const {
    historyEntries,
    activeHistoryId,
    historyPanelVisible,
    selectedHistoryId,
    openHistoryPanel,
    toggleHistoryPanel,
    closeHistoryPanel,
    selectHistorySnapshot,
    scheduleHistoryCapture,
    handleSaveCurrentSnapshot,
    handleRestoreHistorySnapshot,
    handleDeleteHistorySnapshot,
    handleClearHistory,
    closeBrandingPanel,
    toggleBrandingPanel,
    handleResetWorkspace,
    handlePlaybackRateChange,
    handleQuoteVoiceChange,
    handleMaleVoiceChange,
    handleFemaleVoiceChange,
    handleTypecastEmotionTypeChange,
    handleTypecastSpeedChange,
    handleVoiceChange,
    handleBgmEnabledChange,
    handleBgmTrackChange,
    handleBgmVolumeChange,
    handleMixPresetChange,
    handleSfxEnabledChange,
    handleSfxMasterGainChange,
    handleSfxAutoLevelChange,
  } = useStudioSessionHistoryController({
    defaultBrandingByCategory: DEFAULT_BRANDING_BY_CATEGORY,
    defaultCategory: DEFAULT_CATEGORY,
    floatingPanelInput: {
      brandingFabRef,
      brandingPanelOpen,
      brandingPanelRef,
      historyFabRef,
      historyPanelRef,
      setBrandingPanelOpen,
    },
    historyDraftInput: {
      bgmEnabled,
      bgmVolume,
      codexModel,
      crawlMode,
      effectiveCategoryTemplatePreset,
      imageSource,
      imageSearchSource,
      imageApprovalFingerprint,
      jsonText,
      mixPresetId,
      playbackRate,
      preselectedMediaApplyMode,
      preselectedMediaItems,
      previewTiming,
      projectProfileSnapshot,
      publishCategory,
      quickScheduledAt,
      renderStatus,
      scriptMode,
      scriptText,
      selectedBgmTrack,
      selectedPreviewGroupIndex,
      selectedFemaleVoiceId,
      selectedMaleVoiceId,
      selectedQuoteVoiceId,
      selectedTypecastEmotionType,
      selectedTypecastSpeed,
      selectedVoiceId,
      sfxAutoLevel,
      sfxEnabled,
      sfxMasterGainDb,
      showJsonEditor,
      slides,
      templateData,
      templateId,
      topicText,
      uploadedVideoUrl,
      videoUrl,
      workName,
    },
    historyPanelInput: {
      ensureEditPermission,
      jsonText,
      previewTiming,
      preselectedMediaItemCount: preselectedMediaItems.length,
      publishCategory,
      publishTitle,
      renderStatus,
      scriptText,
      setBrandingPanelOpen,
      setWorkName,
      slides,
      topicText,
      uploadedVideoUrl,
      videoUrl,
      workName,
    },
    restoreDraftActionInput: {
      categoryBrandingMap,
      preselectedMediaSessionRegistryRef,
      skipCategoryAudioPresetRef,
      revokeIfBlobUrl,
      setBgmEnabled,
      setBgmVolume,
      setBrandingDraft,
      setBusy,
      setCrawlMode,
      setCodexModel,
      setImageErrors,
      setImageSource,
      setImageSearchSource,
      setImageApprovalFingerprint,
      setJsonText,
      setLocalPresetRevision,
      setMixPresetId,
      setPlaybackRate,
      setPreselectedMediaApplyMode,
      setPreselectedMediaItems,
      setPresetBrandingOverride,
      setPreviewTiming,
      setProjectProfileSnapshot,
      setPublishCategory,
      setQuickScheduledAt,
      setRenderNeedsRefresh,
      setRenderStatus,
      setRenderUsage,
      setScriptMode,
      setScriptText,
      setScriptToJsonBusy,
      setSelectedBgmTrack,
      setSelectedPreviewGroupIndex,
      setSelectedFemaleVoiceId,
      setSelectedMaleVoiceId,
      setSelectedQuoteVoiceId,
      setSelectedTypecastEmotionType,
      setSelectedTypecastSpeed,
      setSelectedVoiceId,
      setSfxAutoLevel,
      setSfxEnabled,
      setSfxMasterGainDb,
      setShowJsonEditor,
      setSlides,
      setTemplateData,
      setTemplateId,
      setTemplateImageEnabled,
      setTemplateImageLayout,
      setTemplateImageUrl,
      setTemplateLayoutApply,
      setTopicText,
      setTopicToScriptBusy,
      setUploadedVideoUrl,
      setVideoUrl,
      setWorkName,
    },
    workspaceSettingsInput: {
      ensureEditPermission,
      resetCategoryAudioPreset: resetCurrentCategoryAudioPreset,
      handleJsonTextChange,
      hasRenderedVideo,
      jsonInputStartedRef,
      lastSfxPlanSourceKeyRef,
      markRenderedAssetAsDirty,
      parsed,
      preselectedMediaApplyMode,
      preselectedMediaSessionRegistryRef,
      publishCategory,
      revokeIfBlobUrl,
      scriptMode,
      setBgmEnabled,
      setBgmVolume,
      setBusy,
      setCodexUsage,
      setImageErrors,
      setImageSearchSource,
      setImageApprovalFingerprint,
      setJsonText,
      setPlaybackRate,
      setPreselectedMediaApplyMode,
      setPreselectedMediaItems,
      setPreviewTiming,
      setQuickScheduledAt,
      setRenderNeedsRefresh,
      setRenderStatus,
      setRenderUsage,
      setScriptMode,
      setScriptText,
      setScriptToJsonBusy,
      setScriptToJsonStatus,
      setSelectedBgmTrack,
      setSelectedPreviewGroupIndex,
      setSelectedFemaleVoiceId,
      setSelectedMaleVoiceId,
      setSelectedQuoteVoiceId,
      setSelectedTypecastEmotionType,
      setSelectedTypecastSpeed,
      setSelectedVoiceId,
      setSfxAutoLevel,
      setSfxEnabled,
      setSfxMasterGainDb,
      setShowJsonEditor,
      setSlides,
      setTopicText,
      setTopicToScriptBusy,
      setTopicToScriptStatus,
      setUploadedVideoUrl,
      setVideoUrl,
      setWorkName,
      setMixPresetId,
      topicInputStartedRef,
      videoUrl,
    },
  });

  const {
    handleAppendPreselectedMediaItems,
    handleRemovePreselectedMediaItem,
    handlePreselectedMediaTargetSlideChange,
    handleMovePreselectedMediaItem,
    handleReorderPreselectedMediaItem,
    handleClearPreselectedMediaItems,
    handlePreselectedMediaApplyModeChange,
  } = useStudioPreselectedMediaActions({
    ensureEditPermission,
    preselectedMediaApplyMode,
    preselectedMediaSessionRegistryRef,
    scheduleHistoryCapture,
    setPreselectedMediaApplyMode,
    setPreselectedMediaItems,
  });

  const {
    handleGenerateScriptFromTopic,
    handleConvertScriptToJson,
    handleConvertScriptTextOnly,
  } = useStudioScriptGenerationActions({
    codexModel,
    ensureEditPermission,
    handleJsonTextChange,
    mergeSlidesPreservingMediaAction: mergeSlidesPreservingMedia,
    normalizeGeneratedStudioJsonDraftAction: normalizeGeneratedStudioJsonDraft,
    normalizeScriptDialogueModeAction: normalizeScriptDialogueMode,
    nowMsAction: nowMs,
    publishCategory,
    projectProfileSnapshot,
    resetPreviewRefs,
    scheduleHistoryCapture,
    scriptMode,
    scriptText,
    slides,
    templateId: effectiveCategoryTemplatePreset.templateId,
    templateData: effectiveCategoryTemplatePreset.templateData,
    templateImageEnabled: effectiveCategoryTemplatePreset.templateImageEnabled,
    templateImageLayout: effectiveCategoryTemplatePreset.templateImageLayout,
    toEventDetailFromApiErrorAction: toEventDetailFromApiError,
    toTimingDetailAction: toTimingDetail,
    topicText,
    setCodexUsage,
    setPreviewTiming,
    setRenderStatus,
    setRenderUsage,
    setScriptMode,
    setScriptText,
    setScriptToJsonBusy,
    setScriptToJsonStatus,
    setShowJsonEditor,
    setSlides,
    setTopicToScriptBusy,
    setTopicToScriptStatus,
  });

  const {
    handleDisconnectCodexOauth,
    handlePrepareWithHistory,
    handleStopVoicePreview,
    previewVoiceText,
    renderStudioSlidePreview,
    selectedVoiceOption,
    voicePreviewLoading,
    voicePreviewPlaying,
  } = useStudioPreviewTelemetryUi({
    beginnerStepIndex,
    effectiveCategoryTemplatePreset,
    ensureEditPermission,
    markCodexOauthDisconnected,
    preselectedMediaValidationMessage,
    publishCategory,
    runPrepareAction: runPrepare,
    scheduleHistoryCapture,
    selectedBranding,
    selectedTypecastEmotionType,
    selectedTypecastSpeed,
    selectedVoiceId,
    setCodexOauthStatus,
    showJsonEditor,
    studioStepperEnabled,
    voiceOptions,
  });

  const {
    handleTitleChange: applyTitleChange,
    handleSlideTitleChange: applySlideTitleChange,
    handleSlideImageUrlChange: applySlideImageUrlChange,
    handleSlideImageFileChange: applySlideImageFileChange,
    handleSlideLibraryAssetApply: applySlideLibraryAssetApply,
    handleManualImageGenerate: applyManualImageGenerate,
    handleManualImageGenerateMissing: applyManualImageGenerateMissing,
    handleSlideImageCandidateApply: applySlideImageCandidateApply,
    handleSlideNarrationTextChange: applySlideNarrationTextChange,
    handleSlideVoiceChange: applySlideVoiceChange,
    handleSlideCharacterIdsChange: applySlideCharacterIdsChange,
    handleSlideDelete: applySlideDelete,
    handleSlideAdd: applySlideAdd,
    handleSlideSfxCueChange: applySlideSfxCueChange,
  } = useStudioSlideEditActions({
    slides,
    publishCategory,
    imageSource,
    projectProfileSnapshot,
    fixedCharacterProfileId: activeFixedCharacterProfileId,
    codexModel,
    imageStylePrompt,
    templateId: effectiveCategoryTemplatePreset.templateId,
    templateData: effectiveCategoryTemplatePreset.templateData,
    jsonText,
    setJsonTextAction: setJsonText,
    setPreviewTimingAction: setPreviewTiming,
    setRenderStatusAction: setRenderStatus,
    setSlidesAction: setSlides,
    getLinkedSlideIndexesAction: getLinkedSlideIndexes,
    readImageFileAsDataUrlAction: readImageFileAsDataUrl,
  });

  const {
    handleTitleChange,
    handleSlideImageUrlChange,
    handleSlideTitleChange,
    handleSlideImageFileChange,
    handleSlideLibraryAssetApply,
    handleSlideImageCandidateApply,
    handleSlideNarrationTextChange,
    handleSlideVoiceChange,
    handleSlideDelete,
    handleSlideAdd,
    handleSlideSfxCueChange,
  } = useStudioSlideEditHistoryActions({
    ensureEditPermission,
    historyInputDebounceMs: HISTORY_INPUT_DEBOUNCE_MS,
    handleTitleChangeAction: applyTitleChange,
    handleSlideAddAction: applySlideAdd,
    handleSlideDeleteAction: applySlideDelete,
    handleSlideImageFileChangeAction: applySlideImageFileChange,
    handleSlideImageUrlChangeAction: applySlideImageUrlChange,
    handleSlideLibraryAssetApplyAction: applySlideLibraryAssetApply,
    handleSlideImageCandidateApplyAction: applySlideImageCandidateApply,
    handleSlideNarrationTextChangeAction: applySlideNarrationTextChange,
    handleSlideSfxCueChangeAction: applySlideSfxCueChange,
    handleSlideTitleChangeAction: applySlideTitleChange,
    handleSlideVoiceChangeAction: applySlideVoiceChange,
    scheduleHistoryCapture,
  });

  const handleSlideCharacterIdsChange = useCallback(
    (index: number, characterIds: string[]) => {
      if (!ensureEditPermission(false)) return;
      scheduleHistoryCapture(`슬라이드 ${index + 1} 등장 캐릭터 변경`);
      applySlideCharacterIdsChange(index, characterIds);
    },
    [applySlideCharacterIdsChange, ensureEditPermission, scheduleHistoryCapture]
  );

  const handleSlideSfxReplan = useCallback(
    async (slideIndex: number) => {
      if (!ensureEditPermission()) return;
      scheduleHistoryCapture(`슬라이드 ${slideIndex + 1} 효과음 다시 추천`);
      await handleAutoPlanSfxForSlide(slideIndex);
    },
    [ensureEditPermission, handleAutoPlanSfxForSlide, scheduleHistoryCapture]
  );

  const handleSpeakerVoicesChange = useCallback(
    (
      rows: Array<{ speakerId: string; voiceId: string }>,
      options?: { renamedSpeakerIds?: Record<string, string> }
    ) => {
      if (!ensureEditPermission() || !parsed || typeof parsed !== "object") return;
      applySpeakerVoicesChange(rows, options);
      if (!options?.renamedSpeakerIds || Object.keys(options.renamedSpeakerIds).length <= 0) return;
      setSlides((prev) => {
        const updated = applySpeakerRenameMapToScriptJson(
          { slides: prev },
          options.renamedSpeakerIds
        );
        return Array.isArray(updated.slides) ? (updated.slides as PreparedSlide[]) : prev;
      });
      markRenderedAssetAsDirty("화자 ID가 변경되었습니다. 이미지와 영상을 다시 생성해야 합니다.");
    },
    [applySpeakerVoicesChange, ensureEditPermission, markRenderedAssetAsDirty, parsed, setSlides]
  );

  const handleDialogueSpeakerAssignment = useCallback(
    (nextJson: Record<string, unknown>) => {
      if (!ensureEditPermission() || !parsed || typeof parsed !== "object") return;
      setJsonText(JSON.stringify(nextJson, null, 2));
      setShowJsonEditor(true);
      handleImagePromptInputsChange(nextJson);
    },
    [ensureEditPermission, handleImagePromptInputsChange, parsed, setJsonText, setShowJsonEditor]
  );

  const handleStoryCharacterProfilesChange = useCallback(
    (rows: typeof storyCharacterProfileRows) => {
      if (!ensureEditPermission()) return;
      if (!parsed || typeof parsed !== "object") return;
      applyStoryCharacterProfilesChange(rows);
      setSlides((prev) =>
        prev.map((slide) => {
          if (!slide.manualImagePrompt) return slide;
          return {
            ...slide,
            manualImagePrompt: undefined,
          };
        })
      );
      markRenderedAssetAsDirty("캐릭터 설정이 변경되었습니다. 영상 다시 생성이 필요합니다.");
    },
    [applyStoryCharacterProfilesChange, ensureEditPermission, markRenderedAssetAsDirty, parsed, setSlides]
  );

  const handleJsonTextCommit = useCallback(
    (value: string, previousValue: string) => {
      let nextJson: Record<string, unknown>;
      let previousJson: unknown = null;
      try {
        const parsedValue = JSON.parse(value) as unknown;
        if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) return;
        nextJson = parsedValue as Record<string, unknown>;
      } catch {
        return;
      }
      try {
        previousJson = JSON.parse(previousValue) as unknown;
      } catch {
        previousJson = null;
      }

      const imagePromptInputsChanged = hasScriptJsonImagePromptInputsChanged(previousJson, nextJson);
      const preparedContentChanged = hasScriptJsonPreparedContentChanged(previousJson, nextJson);
      let committedJson = nextJson;
      if (imagePromptInputsChanged) {
        committedJson = clearManualImagePromptsFromScriptJson(nextJson);
        if (committedJson !== nextJson) {
          setJsonText(JSON.stringify(committedJson, null, 2));
        }
      }
      if (preparedContentChanged) {
        setSlides([]);
      } else if (imagePromptInputsChanged) {
        setSlides((current) => syncPreparedSlideCharactersFromScriptJson(current, committedJson));
      } else {
        setSlides((current) => syncPreparedSlideDialogueSegmentsFromScriptJson(current, committedJson));
      }
      markRenderedAssetAsDirty("JSON 장면 구조가 변경되었습니다. 이미지와 영상을 다시 생성해야 합니다.");
    },
    [markRenderedAssetAsDirty, setJsonText, setSlides]
  );

  const { desktopWorkspaceShellProps } = useStudioModeShellProps({
    activeHistoryId,
    activeTemplateDefinition,
    bgmEnabled,
    bgmVolume,
    beginnerStepIndex,
    brandingFabRef,
    brandingDbDirty,
    brandingPanelOpen,
    brandingPanelPreviewIndexSetter: setBrandingPanelPreviewIndex,
    brandingPanelPreviewSlides,
    brandingPanelPreviewUsesSample,
    brandingPanelRef,
    brandingSaveBusy,
    brandingStatus,
    busy,
    canEditSelectedCategory,
    changeImpactSummary,
    canPublishSelectedCategory,
    categoryOptions,
    projectName: workName,
    projectProfileSnapshot,
    projectProfileSyncProps: {
      profileToProjectGroupIds: projectProfileSync.profileToProjectGroupIds,
      projectToProfileGroupIds: projectProfileSync.projectToProfileGroupIds,
      hasProfileSnapshot: projectProfileSync.hasProfileSnapshot,
      syncBusy: projectProfileSync.syncBusy,
      syncMessage: projectProfileSync.syncMessage,
      onRefreshProfileAction: projectProfileSync.handleRefreshProfile,
      onApplyProfileGroupsAction: projectProfileSync.handleApplyProfileGroups,
      onSaveProjectGroupsAction: projectProfileSync.handleSaveProjectGroups,
    },
    onProjectNameChangeAction: setWorkName,
    autosaveState: autosave.autosaveState,
    onAutosaveRetryAction: autosave.retryAutosave,
    closeBrandingPanel,
    closeHistoryPanel,
    codexLocalReady,
    codexOauthConnected,
    codexOauthMode,
    codexOauthStatus,
    codexUsage,
    debugImageSearch,
    defaultTtsProvider,
    displaySlides,
    downloadFileName,
    effectiveCategoryTemplatePreset,
    handleAppendPreselectedMediaItems,
    handleAutoPlanSfx,
    handleBgmEnabledChange,
    handleBgmTrackChange,
    handleBgmVolumeChange,
    handleBrandingChange,
    handleClearHistory,
    handleClearPreselectedMediaItems,
    handleConvertScriptTextOnly,
    handleConvertScriptToJson,
    handleDebugImageSearchChange,
    handleDeleteHistorySnapshot,
    handleDisconnectCodexOauth,
    handleAssignDialogueSpeakers,
    handleDialogueSpeakerAssignment,
    handleGenerateScriptFromTopic,
    handleImageSourceChange,
    handleImageSearchSourceChange,
    handleApproveImage,
    handleJsonTextChange,
    handleJsonTextCommit,
    handleJumpToResultAction,
    handleMixPresetChange,
    handleMovePreselectedMediaItem,
    handleOneClickAuto,
    handleOneClickAutoSchedule,
    handleOpenLayoutStudio,
    handlePlaybackRateChange,
    handleQuoteVoiceChange,
    handlePreselectedMediaApplyModeChange,
    handlePreselectedMediaTargetSlideChange,
    handlePrepareWithHistory,
    handleQuickScheduledAtChange,
    handleRemovePreselectedMediaItem,
    handleReorderPreselectedMediaItem,
    handleResetCurrentCategory,
    handleRunRenderPreflight,
    handleRenderDraftVideo,
    handleRenderVideo,
    handleRestoreHistorySnapshot,
    handleSaveCategoryBranding,
    handleSaveTemplateNotes,
    handleScriptModeChange,
    handleScriptTextChange,
    handleSelectHistorySnapshot: selectHistorySnapshot,
    handleSelectedVoicePreviewBase: previewVoiceText,
    handleSfxAutoLevelChange,
    handleSfxEnabledChange,
    handleSfxMasterGainChange,
    handleSlideAdd,
    handleSlideDelete,
    handleSlideImageFileChange,
    handleSlideImageUrlChange,
    handleSlideLibraryAssetApply,
    handleManualImageGenerate: applyManualImageGenerate,
    handleManualImageGenerateMissing: applyManualImageGenerateMissing,
    handleSlideImageCandidateApply,
    handleSlideCharacterIdsChange,
    handleSlideNarrationTextChange,
    handleSlideSfxCueChange,
    handleSlideSfxReplan,
    handleSlideTitleChange,
    handleSlideVoiceChange,
    handleSpeakerVoicesChange,
    handleStoryCharacterProfilesChange,
    handleFixedCharacterProfileIdChange,
    handleImageStylePromptChange,
    handleStopVoicePreview,
    handleStudioTemplateFontSizeChange: handleTemplateFontSizeChange,
    handleStudioTemplateImageFileChange: handleTemplateImageFileChange,
    handleStudioTemplateLayoutColorChange: handleTemplateLayoutColorChange,
    handleTemplateNotesChange,
    handleTemplatePresetChange,
    handleTitleChange,
    handleTypecastEmotionTypeChange,
    handleTypecastSpeedChange,
    handleTopicTextChange,
    handleVoiceChange,
    handleMaleVoiceChange,
    handleFemaleVoiceChange,
    handleAddCustomTypecastVoiceOption: addCustomTypecastVoiceOption,
    hasFinalVideo,
    hasPreparedSlides,
    hasRenderedVideo,
    hasUploadedAsset,
    historyEntries,
    historyFabRef,
    historyPanelRef,
    historyPanelVisible,
    imageApproved,
    imageErrors,
    imageSource,
    imageSearchSource,
    fixedCharacterProfileId,
    imageStylePrompt,
    isJsonValid,
    jsonText,
    layoutStudioHref,
    localPresetSummary,
    mappedChannelId,
    mappedChannelTitle,
    memeLibrarySlides: displaySlides,
    mixPresetId,
    openHistoryPanel,
    parsedSlideCount,
    playbackRate,
    prepareButtonLabel,
    preselectedMediaApplyMode,
    preselectedMediaAssignments,
    preselectedMediaItems,
    preselectedMediaValidationMessage,
    previewPlayerFrameDurations,
    previewPlayerSlides,
    publishCategory,
    currentCategoryMetadata,
    projectProfileLabel:
      projectProfileSnapshot?.contentProfile.category === publishCategory
        ? projectProfileSnapshot.contentProfile.label
        : undefined,
    publishStepEnabled,
    publishTitle,
    quickScheduledAt,
    renderButtonLabel,
    renderPreflightSummary,
    renderPreflightHasRun,
    renderPrimaryAction,
    draftIsCurrent,
    finalIsCurrent,
    renderStageDescription,
    renderStageLabel,
    renderStateLabel,
    renderStateTone,
    renderStatus,
    renderUsage,
    renderStudioSlidePreview,
    scriptMode,
    scriptText,
    scriptToJsonBusy,
    scriptToJsonStatus,
    selectedBgmTrack,
    selectedPreviewGroupIndex,
    selectedBranding,
    selectedHistoryId,
    selectedFemaleVoiceId,
    selectedMaleVoiceId,
    selectedQuoteVoiceId,
    selectedTypecastEmotionType,
    selectedTypecastSpeed,
    selectedVoiceId,
    selectedVoiceOption,
    setSelectedPreviewGroupIndex,
    setShowJsonEditor,
    sfxAutoLevel,
    sfxCategories,
    sfxEnabled,
    sfxMasterGainDb,
    showJsonEditor,
    speakerVoiceRows,
    storyCharacterProfileRows,
    studioEditPermissionMessage,
    studioPublishPermissionMessage,
    studioPublishPreflightIssueCount: studioPublishPreflightIssues.length,
    studioPublishReady,
    studioSchedulePreflightIssueCount: studioSchedulePreflightIssues.length,
    studioScheduleReady,
    templateId,
    fixedCharacterProfilesHref,
    templateManagerHref,
    templateNotesDraft,
    templateNotesSaveBusy,
    templateRequirementAlert,
    toggleBrandingPanel,
    toggleHistoryPanel,
    topicText,
    topicToScriptBusy,
    topicToScriptStatus,
    uploadedVideoUrl,
    videoUrl,
    voiceOptions,
    voicePreviewLoading,
    voicePreviewPlaying,
  });

  return (
    <AppLayout>
      <div className="studio-page-stack studio-page-stack-workbench">
        {!canEditSelectedCategory ? (
          <section className="card studio-permission-banner">
            <strong className="studio-permission-banner-title">
              현재 콘텐츠 프로필 권한: {selectedCategoryPermissionLabel}
            </strong>
            <span className="studio-permission-banner-description">
              {studioEditPermissionMessage}
            </span>
          </section>
        ) : null}

        <StudioDesktopWorkspaceShell
          {...desktopWorkspaceShellProps}
          onSaveCurrentAction={handleSaveCurrentSnapshot}
          onResetWorkspaceAction={handleResetWorkspace}
        />
      </div>
    </AppLayout>
  );
}

