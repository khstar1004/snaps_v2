"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TemplateBrandingSettings } from "@/lib/publish/template-branding";
import type { PublishCategory } from "@/lib/publish/types";
import { STUDIO_BGM_OPTIONS, type StudioSfxCategoryOption } from "@/lib/studio/audio-options";
import { DEFAULT_STUDIO_AUDIO_MIX_PRESET_ID, getStudioAudioMixPreset } from "@/lib/studio/audio-mix-presets";
import { DEFAULT_STUDIO_PLAYBACK_RATE } from "@/lib/studio/playback-rate";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import { DEFAULT_STUDIO_SFX_AUTO_LEVEL, type StudioSfxAutoLevel } from "@/lib/studio/sfx-auto-tuning";
import { DEFAULT_STUDIO_IMAGE_SOURCE, type CrawlMode, type ImageSource, type PreparedSlide } from "@/types/studio-json";
import { createStudioTemplateData } from "./components/templates/template-registry";
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
import { DEFAULT_STUDIO_IMAGE_SEARCH_SOURCE } from "./types";
import { useStudioBootstrapData } from "./use-studio-bootstrap-data";
import { useStudioBootstrapSyncEffects } from "./use-studio-bootstrap-sync-effects";
import { useStudioLocalStorageSync } from "./use-studio-local-storage-sync";
import { useStudioRouteShellState } from "./use-studio-route-shell-state";
import {
  addManualTypecastVoiceOption,
  findMatchingStudioVoiceOption,
  mergeStudioVoiceOptions,
} from "./studio-manual-voice-options";

type ScriptDialogueMode = "normal" | "dialogue";

type PreviewTimingState = {
  slides: PreparedSlide[];
  frameDurationsSec: number[];
};

export type UseStudioEditorStateInput = {
  defaultBrandingByCategory: Record<PublishCategory, TemplateBranding>;
  defaultCategory: PublishCategory;
  defaultCategoryOptions: Array<{ value: PublishCategory; label: string }>;
  defaultTemplateImageLayout: TemplateImageLayout;
  defaultTemplateLayoutApply: TemplateLayoutApply;
  normalizeCategoryAction: (value: unknown) => PublishCategory;
  normalizeTemplateImageLayoutAction: (input: unknown) => TemplateImageLayout;
  studioStepperEnabled: boolean;
  toTemplateBrandingAction: (input: TemplateBrandingSettings) => TemplateBranding;
};

export function useStudioEditorState(input: UseStudioEditorStateInput) {
  const [topicText, setTopicText] = useState("");
  const [topicToScriptBusy, setTopicToScriptBusy] = useState(false);
  const [topicToScriptStatus, setTopicToScriptStatus] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [scriptMode, setScriptMode] = useState<ScriptDialogueMode>("normal");
  const [jsonText, setJsonText] = useState("");
  const [scriptToJsonBusy, setScriptToJsonBusy] = useState(false);
  const [scriptToJsonStatus, setScriptToJsonStatus] = useState("");
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [imageSource, setImageSource] = useState<ImageSource>(DEFAULT_STUDIO_IMAGE_SOURCE);
  const [imageSearchSource, setImageSearchSource] = useState<StudioImageSearchSource>(DEFAULT_STUDIO_IMAGE_SEARCH_SOURCE);
  const [crawlMode, setCrawlMode] = useState<CrawlMode>("auto");
  const [codexModel, setCodexModel] = useState("");
  const [codexUsage, setCodexUsage] = useState<{ inputTokens: number; outputTokens: number } | null>(null);
  const [debugImageSearch, setDebugImageSearch] = useState(false);
  const [renderUsage, setRenderUsage] = useState<{ ttsChars: number; renderSeconds: number } | null>(null);
  const [slides, setSlides] = useState<PreparedSlide[]>([]);
  const [selectedPreviewGroupIndex, setSelectedPreviewGroupIndex] = useState(0);
  const [preselectedMediaItems, setPreselectedMediaItems] = useState<StudioPreselectedMediaItem[]>([]);
  const [preselectedMediaApplyMode, setPreselectedMediaApplyMode] = useState<StudioPreselectedMediaApplyMode>("spread");
  const [previewTiming, setPreviewTiming] = useState<PreviewTimingState | null>(null);
  const resetPreviewRefs = useCallback(() => {}, []);
  const jsonInputStartedRef = useRef(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renderStatus, setRenderStatus] = useState("");
  const [workName, setWorkName] = useState("");
  const [codexOauthStatus, setCodexOauthStatus] = useState("");
  const [imageErrors, setImageErrors] = useState<string[]>([]);
  const [quickScheduledAt, setQuickScheduledAt] = useState("");
  const [publishCategory, setPublishCategory] = useState<PublishCategory>(input.defaultCategory);
  const [projectProfileSnapshot, setProjectProfileSnapshot] = useState<StudioProjectProfileSnapshot | null>(null);
  const [brandingDraft, setBrandingDraft] = useState<TemplateBranding>(input.defaultBrandingByCategory[input.defaultCategory]);
  const [presetBrandingOverride, setPresetBrandingOverride] = useState<{ category: PublishCategory; branding: TemplateBranding } | null>(null);
  const [brandingStatus, setBrandingStatus] = useState("");
  const [brandingSaveBusy, setBrandingSaveBusy] = useState(false);
  const [savedBrandingSnapshotByCategory, setSavedBrandingSnapshotByCategory] = useState<Record<string, TemplateBranding>>({});
  const [templateNotesByCategory, setTemplateNotesByCategory] = useState<Record<PublishCategory, string>>({});
  const [templateNotesSaveBusy, setTemplateNotesSaveBusy] = useState(false);
  const [templateId, setTemplateId] = useState<StudioTemplateId>("default");
  const [templateData, setTemplateData] = useState<StudioTemplatePayload>(createStudioTemplateData("default"));
  const [templateImageEnabled, setTemplateImageEnabled] = useState(false);
  const [templateImageUrl, setTemplateImageUrl] = useState("");
  const [templateImageLayout, setTemplateImageLayout] = useState<TemplateImageLayout>(input.defaultTemplateImageLayout);
  const [templateLayoutApply, setTemplateLayoutApply] = useState<TemplateLayoutApply>(input.defaultTemplateLayoutApply);
  const [layoutPresetVersion, setLayoutPresetVersion] = useState(0);
  const [localPresetRevision, setLocalPresetRevision] = useState(0);
  const [renderNeedsRefresh, setRenderNeedsRefresh] = useState(false);
  const [lastDraftRenderFingerprint, setLastDraftRenderFingerprint] = useState("");
  const [lastFinalRenderFingerprint, setLastFinalRenderFingerprint] = useState("");
  const [lastRenderPreflightFingerprint, setLastRenderPreflightFingerprint] = useState("");
  const [imageApprovalFingerprint, setImageApprovalFingerprint] = useState("");
  const [brandingPanelPreviewIndex, setBrandingPanelPreviewIndex] = useState(0);
  const [brandingPanelOpen, setBrandingPanelOpen] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [selectedQuoteVoiceId, setSelectedQuoteVoiceId] = useState("");
  const [selectedMaleVoiceId, setSelectedMaleVoiceId] = useState("");
  const [selectedFemaleVoiceId, setSelectedFemaleVoiceId] = useState("");
  const [manualVoiceOptions, setManualVoiceOptions] = useState<ReturnType<typeof mergeStudioVoiceOptions>>([]);
  const [selectedTypecastEmotionType, setSelectedTypecastEmotionType] = useState("");
  const [selectedTypecastSpeed, setSelectedTypecastSpeed] = useState("");
  const [playbackRate, setPlaybackRate] = useState(DEFAULT_STUDIO_PLAYBACK_RATE);
  const [sfxCategories, setSfxCategories] = useState<StudioSfxCategoryOption[]>([]);
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [selectedBgmTrack, setSelectedBgmTrack] = useState(STUDIO_BGM_OPTIONS[0]?.id || "");
  const [mixPresetId, setMixPresetId] = useState<string>(DEFAULT_STUDIO_AUDIO_MIX_PRESET_ID);
  const [bgmVolume, setBgmVolume] = useState(
    getStudioAudioMixPreset(DEFAULT_STUDIO_AUDIO_MIX_PRESET_ID).bgmVolume
  );
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [sfxMasterGainDb, setSfxMasterGainDb] = useState(2);
  const [sfxAutoLevel, setSfxAutoLevel] = useState<StudioSfxAutoLevel>(DEFAULT_STUDIO_SFX_AUTO_LEVEL);
  const historyPanelRef = useRef<HTMLElement | null>(null);
  const historyFabRef = useRef<HTMLButtonElement | null>(null);
  const brandingPanelRef = useRef<HTMLElement | null>(null);
  const brandingFabRef = useRef<HTMLButtonElement | null>(null);
  const preselectedMediaSessionRegistryRef = useRef(new Map<string, StudioPreselectedMediaItem>());
  const lastSfxPlanSourceKeyRef = useRef("");
  const topicInputStartedRef = useRef(false);
  const skipCategoryAudioPresetRef = useRef(false);

  const {
    codexOauthConnected,
    codexStatusLoaded,
    codexOauthMode,
    codexLocalReady,
    publishAccounts,
    categoryChannels,
    categoryOptions,
    categoryMetadataMap,
    workspacePermissions,
    categoryBrandingMap,
    defaultTtsProvider,
    voiceOptions: bootstrapVoiceOptions,
    codexModelOptions,
    defaultCodexModel,
    markCodexOauthDisconnected,
    updateCategoryMetadata,
    refreshCategoryMetadata,
  } = useStudioBootstrapData({
    defaultCategoryOptions: input.defaultCategoryOptions,
    defaultBrandingByCategory: input.defaultBrandingByCategory,
    toTemplateBranding: input.toTemplateBrandingAction,
  });

  const { isOnboardingMode } = useStudioRouteShellState({
    codexOauthConnected,
    codexStatusLoaded,
    setCodexOauthStatus,
    setShowJsonEditor,
  });

  useStudioBootstrapSyncEffects({
    categoryBrandingMap,
    categoryOptions,
    codexModel,
    publishCategory,
    refreshCategoryMetadata,
    setCodexModel,
    setLayoutPresetVersion,
    setPublishCategory,
    setRenderNeedsRefresh,
    setSavedBrandingSnapshotByCategory,
    setSfxCategories,
    studioStepperEnabled: input.studioStepperEnabled,
    videoUrl,
  });

  const autosave = useStudioLocalStorageSync({
    defaultCategory: input.defaultCategory,
    defaultBrandingByCategory: input.defaultBrandingByCategory,
    normalizeCategory: input.normalizeCategoryAction,
    normalizeTemplateImageLayout: input.normalizeTemplateImageLayoutAction,
    publishCategory,
    projectProfileSnapshot,
    workName,
    setWorkName,
    topicText,
    setTopicText,
    scriptText,
    setScriptText,
    scriptMode,
    setScriptMode,
    codexModel,
    setCodexModel,
    setPublishCategory,
    setProjectProfileSnapshot,
    setBrandingDraft,
    setPresetBrandingOverride,
    setTemplateId,
    setTemplateData,
    setTemplateImageEnabled,
    setTemplateImageUrl,
    setTemplateImageLayout,
    setTemplateLayoutApply,
    jsonText,
    setJsonText,
    showJsonEditor,
    setShowJsonEditor,
    imageSource,
    setImageSource,
    imageSearchSource,
    setImageSearchSource,
    crawlMode,
    setCrawlMode,
    slides,
    setSlides,
    selectedPreviewGroupIndex,
    setSelectedPreviewGroupIndex,
    previewTiming,
    setPreviewTiming,
    videoUrl,
    setVideoUrl,
    uploadedVideoUrl,
    setUploadedVideoUrl,
    renderStatus,
    setRenderStatus,
    lastDraftRenderFingerprint,
    setLastDraftRenderFingerprint,
    lastFinalRenderFingerprint,
    setLastFinalRenderFingerprint,
    lastRenderPreflightFingerprint,
    setLastRenderPreflightFingerprint,
    imageApprovalFingerprint,
    setImageApprovalFingerprint,
    preselectedMediaItems,
    setPreselectedMediaItems,
    preselectedMediaApplyMode,
    setPreselectedMediaApplyMode,
    preselectedMediaSessionRegistry: preselectedMediaSessionRegistryRef.current,
    resetPreviewRefs,
    quickScheduledAt,
    setQuickScheduledAt,
    selectedVoiceId,
    setSelectedVoiceId,
    selectedQuoteVoiceId,
    setSelectedQuoteVoiceId,
    selectedMaleVoiceId,
    setSelectedMaleVoiceId,
    selectedFemaleVoiceId,
    setSelectedFemaleVoiceId,
    selectedTypecastEmotionType,
    setSelectedTypecastEmotionType,
    selectedTypecastSpeed,
    setSelectedTypecastSpeed,
    playbackRate,
    setPlaybackRate,
    bgmEnabled,
    setBgmEnabled,
    selectedBgmTrack,
    setSelectedBgmTrack,
    mixPresetId,
    setMixPresetId,
    bgmVolume,
    setBgmVolume,
    sfxEnabled,
    setSfxEnabled,
    sfxMasterGainDb,
    setSfxMasterGainDb,
    sfxAutoLevel,
    setSfxAutoLevel,
    templateId,
    templateData,
    templateImageEnabled,
    templateImageUrl,
    templateImageLayout,
    templateLayoutApply,
  });

  const voiceOptions = useMemo(
    () => mergeStudioVoiceOptions(bootstrapVoiceOptions, manualVoiceOptions, selectedVoiceId),
    [bootstrapVoiceOptions, manualVoiceOptions, selectedVoiceId]
  );

  const addCustomTypecastVoiceOption = useCallback(
    (rawVoiceId: string) => {
      const next = addManualTypecastVoiceOption(bootstrapVoiceOptions, manualVoiceOptions, rawVoiceId);
      if (!next) return;
      setManualVoiceOptions(next.manualOptions);
      setSelectedVoiceId(next.selectedVoiceId);
    },
    [bootstrapVoiceOptions, manualVoiceOptions]
  );

  useEffect(() => {
    if (!selectedVoiceId.trim()) return;
    const matched = findMatchingStudioVoiceOption(voiceOptions, selectedVoiceId);
    if (!matched || matched.id === selectedVoiceId) return;
    setSelectedVoiceId(matched.id);
  }, [selectedVoiceId, voiceOptions]);

  return {
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
    codexModelOptions,
    codexOauthConnected,
    codexOauthMode,
    codexOauthStatus,
    codexStatusLoaded,
    codexUsage,
    crawlMode,
    debugImageSearch,
    defaultTtsProvider,
    defaultCodexModel,
    historyFabRef,
    historyPanelRef,
    imageErrors,
    imageSource,
    imageSearchSource,
    isOnboardingMode,
    jsonInputStartedRef,
    jsonText,
    lastDraftRenderFingerprint,
    lastFinalRenderFingerprint,
    lastRenderPreflightFingerprint,
    imageApprovalFingerprint,
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
    renderNeedsRefresh,
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
    selectedTypecastEmotionType,
    selectedTypecastSpeed,
    selectedVoiceId,
    selectedQuoteVoiceId,
    selectedMaleVoiceId,
    selectedFemaleVoiceId,
    addCustomTypecastVoiceOption,
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
    setImageSource,
    setImageSearchSource,
    setJsonText,
    setLayoutPresetVersion,
    setLastDraftRenderFingerprint,
    setLastFinalRenderFingerprint,
    setLastRenderPreflightFingerprint,
    setImageApprovalFingerprint,
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
    setSelectedTypecastEmotionType,
    setSelectedTypecastSpeed,
    setSelectedVoiceId,
    setSelectedQuoteVoiceId,
    setSelectedMaleVoiceId,
    setSelectedFemaleVoiceId,
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
    autosave,
  };
}
