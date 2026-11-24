"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeStudioAudioMixPresetId, normalizeStudioBgmVolume } from "@/lib/studio/audio-mix-presets";
import { normalizeStudioPlaybackRate } from "@/lib/studio/playback-rate";
import {
  cloneStudioProjectProfileSnapshot,
  parseStudioProjectProfileSnapshot,
  type StudioProjectProfileSnapshot,
} from "@/lib/studio/project-profile-snapshot";
import { DEFAULT_STUDIO_SFX_AUTO_LEVEL, normalizeStudioSfxAutoLevel, type StudioSfxAutoLevel } from "@/lib/studio/sfx-auto-tuning";
import type { PublishCategory } from "@/lib/publish/types";
import {
  DEFAULT_STUDIO_IMAGE_SOURCE,
  normalizeStudioImageSource,
  type CrawlMode,
  type ImageSource,
  type PreparedSlide,
} from "@/types/studio-json";
import { readScopedStorage, writeScopedStorage } from "@/lib/ui/scoped-storage";
import { createStudioTemplateData, normalizeStudioTemplateData } from "./components/templates/template-registry";
import {
  DEFAULT_STUDIO_IMAGE_SEARCH_SOURCE,
  normalizeStudioImageSearchSource,
  normalizeStudioPreselectedMediaApplyMode,
  normalizeStudioPreselectedMediaItems,
  normalizeStudioTemplateId,
  serializeStudioPreselectedMediaItems,
  type StudioImageSearchSource,
  type StudioPreselectedMediaApplyMode,
  type StudioLayoutPreset,
  type StudioPreselectedMediaItem,
  type StudioTemplateId,
  type StudioTemplatePayload,
  type StudioWorkDraft,
  type TemplateBranding,
  type TemplateImageLayout,
  type TemplateLayoutApply,
} from "./types";
import {
  STUDIO_LAST_PUBLISH_CATEGORY_KEY,
  readStoredStudioDraft,
  readStoredStudioDraftUpdatedAt,
  writeStoredStudioDraft,
} from "./storage";
import {
  INITIAL_STUDIO_AUTOSAVE_STATE,
  createHydratedStudioAutosaveState,
  markStudioAutosavePending,
  resolveStudioAutosaveWriteFailure,
  resolveStudioAutosaveWriteSuccess,
  shouldInterceptStudioAutosaveNavigation,
  type StudioAutosaveState,
} from "./studio-autosave-status";
import { recoverPersistedStudioRenderStatus } from "./studio-operation-recovery";

const STUDIO_EDITOR_PRESET_KEY = "studio-editor-preset-v1";
const DRAFT_PERSIST_DEBOUNCE_MS = 350;

type StoredTemplatePreset = {
  templateId?: unknown;
  templateData?: unknown;
  templateImageEnabled?: unknown;
  templateImageUrl?: unknown;
  templateImageLayout?: unknown;
  templateLayoutApply?: unknown;
};

type StoredBrandingPreset = {
  branding: TemplateBranding;
};

type StoredEditorPresetHydrationPlan = {
  categoryToSelect: PublishCategory | null;
  effectiveCategory: PublishCategory;
  brandingPreset: StoredBrandingPreset | null;
  presetBrandingOverride: { category: PublishCategory; branding: TemplateBranding } | null;
  templatePresetCategories: PublishCategory[];
  allowTopLevelTemplatePreset: boolean;
};

type LastCategoryWriteDecision = {
  shouldWrite: boolean;
  pendingRestoreCategory: PublishCategory | null;
};

function hasOwnProperty(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasDraftTemplateSnapshot(draft: StudioWorkDraft): boolean {
  return (
    hasOwnProperty(draft, "templateId") ||
    hasOwnProperty(draft, "templateData") ||
    hasOwnProperty(draft, "templateImageEnabled") ||
    hasOwnProperty(draft, "templateImageUrl") ||
    hasOwnProperty(draft, "templateImageLayout") ||
    hasOwnProperty(draft, "templateLayoutApply")
  );
}

export function hasExplicitDefaultTemplatePresetSnapshot(
  projectProfileSnapshot: StudioProjectProfileSnapshot | null
): boolean {
  const metadata = projectProfileSnapshot?.contentProfile.metadataSnapshot;
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      hasOwnProperty(metadata, "templatePreset") &&
      metadata.templatePreset === null
  );
}

function hasStoredCategoryTemplatePresets(preset: StudioLayoutPreset): boolean {
  return Boolean(
    preset.templateByCategory &&
      typeof preset.templateByCategory === "object" &&
      Object.keys(preset.templateByCategory).length > 0
  );
}

function readCategoryBrandingPresetFromLayoutPreset(
  preset: StudioLayoutPreset,
  category: PublishCategory,
  normalizeCategory: (value: unknown) => PublishCategory
): StoredBrandingPreset | null {
  const brandingByCategory = (preset as Record<string, unknown>).brandingByCategory;
  if (!brandingByCategory || typeof brandingByCategory !== "object") return null;
  for (const [rawCategory, value] of Object.entries(brandingByCategory)) {
    const normalized = normalizeCategory(rawCategory);
    if (!normalized || normalized !== category) continue;
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    if (!row.branding || typeof row.branding !== "object") return null;
    return {
      branding: row.branding as TemplateBranding,
    };
  }
  return null;
}

function readCategoryTemplatePresetFromLayoutPreset(
  preset: StudioLayoutPreset,
  category: PublishCategory,
  normalizeCategory: (value: unknown) => PublishCategory
): StoredTemplatePreset | null {
  if (!preset.templateByCategory || typeof preset.templateByCategory !== "object") return null;
  for (const [rawCategory, value] of Object.entries(preset.templateByCategory)) {
    const normalized = normalizeCategory(rawCategory);
    if (!normalized || normalized !== category) continue;
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    return {
      templateId: row.templateId,
      templateData: row.templateData,
      templateImageEnabled: row.templateImageEnabled,
      templateImageUrl: row.templateImageUrl,
      templateImageLayout: row.templateImageLayout,
      templateLayoutApply: row.templateLayoutApply,
    };
  }
  return null;
}

function applyTemplatePreset(
  preset: StoredTemplatePreset,
  normalizeTemplateImageLayout: (input: unknown) => TemplateImageLayout,
  setTemplateId: (value: StudioTemplateId) => void,
  setTemplateData: (value: StudioTemplatePayload) => void,
  setTemplateImageEnabled: (value: boolean) => void,
  setTemplateImageUrl: (value: string) => void,
  setTemplateImageLayout: (value: TemplateImageLayout) => void,
  setTemplateLayoutApply: (value: TemplateLayoutApply) => void
): void {
  const templateId = normalizeStudioTemplateId(preset.templateId);
  setTemplateId(templateId);
  setTemplateData(normalizeStudioTemplateData(templateId, preset.templateData));
  setTemplateImageEnabled(Boolean(preset.templateImageEnabled));
  setTemplateImageUrl(typeof preset.templateImageUrl === "string" ? preset.templateImageUrl : "");
  setTemplateImageLayout(normalizeTemplateImageLayout(preset.templateImageLayout));
  if (preset.templateLayoutApply && typeof preset.templateLayoutApply === "object") {
    const row = preset.templateLayoutApply as Record<string, unknown>;
    setTemplateLayoutApply({
      title: Boolean(row.title),
      body: Boolean(row.body),
      image: Boolean(row.image),
      info: Boolean(row.info),
    });
  }
}

function applyDefaultTemplatePreset(
  normalizeTemplateImageLayout: (input: unknown) => TemplateImageLayout,
  setTemplateId: (value: StudioTemplateId) => void,
  setTemplateData: (value: StudioTemplatePayload) => void,
  setTemplateImageEnabled: (value: boolean) => void,
  setTemplateImageUrl: (value: string) => void,
  setTemplateImageLayout: (value: TemplateImageLayout) => void,
  setTemplateLayoutApply: (value: TemplateLayoutApply) => void
): void {
  setTemplateId("default");
  setTemplateData(createStudioTemplateData("default"));
  setTemplateImageEnabled(false);
  setTemplateImageUrl("");
  setTemplateImageLayout(normalizeTemplateImageLayout(null));
  setTemplateLayoutApply({
    title: true,
    body: true,
    image: true,
    info: true,
  });
}

function uniqueCategories(values: Array<PublishCategory | null | undefined>): PublishCategory[] {
  const categories: PublishCategory[] = [];
  for (const value of values) {
    if (!value || categories.includes(value)) continue;
    categories.push(value);
  }
  return categories;
}

export function resolveLockedTemplatePresetHydrationPlan(input: {
  layoutPreset: StudioLayoutPreset;
  targetCategory: PublishCategory;
  defaultCategory: PublishCategory;
  normalizeCategory: (value: unknown) => PublishCategory;
}): Pick<StoredEditorPresetHydrationPlan, "templatePresetCategories" | "allowTopLevelTemplatePreset"> {
  const presetCategory = input.normalizeCategory(input.layoutPreset.publishCategory);
  return {
    templatePresetCategories: uniqueCategories([input.targetCategory, input.defaultCategory]),
    allowTopLevelTemplatePreset: !presetCategory || presetCategory === input.targetCategory,
  };
}

export function shouldWriteLastPublishCategory(input: {
  publishCategory: PublishCategory;
  pendingRestoreCategory: PublishCategory | null;
}): LastCategoryWriteDecision {
  if (!input.publishCategory) {
    return {
      shouldWrite: false,
      pendingRestoreCategory: input.pendingRestoreCategory,
    };
  }
  if (input.pendingRestoreCategory && input.pendingRestoreCategory !== input.publishCategory) {
    return {
      shouldWrite: false,
      pendingRestoreCategory: input.pendingRestoreCategory,
    };
  }
  return {
    shouldWrite: true,
    pendingRestoreCategory:
      input.pendingRestoreCategory && input.pendingRestoreCategory === input.publishCategory ? null : input.pendingRestoreCategory,
  };
}

export function resolveStoredEditorPresetHydrationPlan(input: {
  layoutPreset: StudioLayoutPreset;
  storedLastPublishCategory: unknown;
  publishCategory: PublishCategory;
  defaultCategory: PublishCategory;
  defaultBrandingByCategory: Record<PublishCategory, TemplateBranding>;
  normalizeCategory: (value: unknown) => PublishCategory;
}): StoredEditorPresetHydrationPlan {
  const storedLastCategory = input.normalizeCategory(input.storedLastPublishCategory);
  const presetCategory = input.normalizeCategory(input.layoutPreset.publishCategory);
  const categoryToSelect = storedLastCategory || presetCategory || null;
  const effectiveCategory = storedLastCategory || input.publishCategory || presetCategory || input.defaultCategory;
  const baseBranding = input.defaultBrandingByCategory[effectiveCategory] || input.defaultBrandingByCategory[input.defaultCategory];
  const categoryBrandingPreset = readCategoryBrandingPresetFromLayoutPreset(
    input.layoutPreset,
    effectiveCategory,
    input.normalizeCategory
  );
  const canUseTopLevelPreset = !presetCategory || presetCategory === effectiveCategory;
  const topLevelBrandingPreset =
    canUseTopLevelPreset && input.layoutPreset.brandingDraft
      ? {
          branding: {
            ...baseBranding,
            ...input.layoutPreset.brandingDraft,
          },
        }
      : null;
  const brandingPreset = categoryBrandingPreset || topLevelBrandingPreset;

  return {
    categoryToSelect,
    effectiveCategory,
    brandingPreset,
    presetBrandingOverride: brandingPreset
      ? {
          category: effectiveCategory,
          branding: brandingPreset.branding,
        }
      : null,
    templatePresetCategories: storedLastCategory
      ? resolveLockedTemplatePresetHydrationPlan({
          layoutPreset: input.layoutPreset,
          targetCategory: effectiveCategory,
          defaultCategory: input.defaultCategory,
          normalizeCategory: input.normalizeCategory,
        }).templatePresetCategories
      : uniqueCategories([presetCategory, input.publishCategory, input.defaultCategory]),
    allowTopLevelTemplatePreset: canUseTopLevelPreset,
  };
}

function applyTemplatePresetByCategory(
  preset: StudioLayoutPreset,
  category: PublishCategory,
  normalizeCategory: (value: unknown) => PublishCategory,
  normalizeTemplateImageLayout: (input: unknown) => TemplateImageLayout,
  setTemplateId: (value: StudioTemplateId) => void,
  setTemplateData: (value: StudioTemplatePayload) => void,
  setTemplateImageEnabled: (value: boolean) => void,
  setTemplateImageUrl: (value: string) => void,
  setTemplateImageLayout: (value: TemplateImageLayout) => void,
  setTemplateLayoutApply: (value: TemplateLayoutApply) => void
): boolean {
  const categoryPreset = readCategoryTemplatePresetFromLayoutPreset(preset, category, normalizeCategory);
  if (!categoryPreset) return false;
  applyTemplatePreset(
    categoryPreset,
    normalizeTemplateImageLayout,
    setTemplateId,
    setTemplateData,
    setTemplateImageEnabled,
    setTemplateImageUrl,
    setTemplateImageLayout,
    setTemplateLayoutApply
  );
  return true;
}

type UseStudioLocalStorageSyncArgs = {
  defaultCategory: PublishCategory;
  defaultBrandingByCategory: Record<PublishCategory, TemplateBranding>;
  normalizeCategory: (value: unknown) => PublishCategory;
  normalizeTemplateImageLayout: (input: unknown) => TemplateImageLayout;
  publishCategory: PublishCategory;
  projectProfileSnapshot: StudioProjectProfileSnapshot | null;
  workName: string;
  setWorkName: (value: string) => void;
  topicText: string;
  setTopicText: (value: string) => void;
  scriptText: string;
  setScriptText: (value: string) => void;
  scriptMode: "normal" | "dialogue";
  setScriptMode: (value: "normal" | "dialogue") => void;
  codexModel: string;
  setCodexModel: (value: string) => void;
  setPublishCategory: (value: PublishCategory) => void;
  setProjectProfileSnapshot: (value: StudioProjectProfileSnapshot | null) => void;
  setBrandingDraft: (value: TemplateBranding) => void;
  setPresetBrandingOverride: (value: { category: PublishCategory; branding: TemplateBranding } | null) => void;
  setTemplateId: (value: StudioTemplateId) => void;
  setTemplateData: (value: StudioTemplatePayload) => void;
  setTemplateImageEnabled: (value: boolean) => void;
  setTemplateImageUrl: (value: string) => void;
  setTemplateImageLayout: (value: TemplateImageLayout) => void;
  setTemplateLayoutApply: (value: TemplateLayoutApply) => void;
  jsonText: string;
  setJsonText: (value: string) => void;
  showJsonEditor: boolean;
  setShowJsonEditor: (value: boolean) => void;
  imageSource: ImageSource;
  setImageSource: (value: ImageSource) => void;
  imageSearchSource: StudioImageSearchSource;
  setImageSearchSource: (value: StudioImageSearchSource) => void;
  crawlMode: CrawlMode;
  setCrawlMode: (value: CrawlMode) => void;
  slides: PreparedSlide[];
  setSlides: (value: PreparedSlide[]) => void;
  selectedPreviewGroupIndex: number;
  setSelectedPreviewGroupIndex: (value: number) => void;
  previewTiming: { slides: PreparedSlide[]; frameDurationsSec: number[] } | null;
  setPreviewTiming: (value: { slides: PreparedSlide[]; frameDurationsSec: number[] } | null) => void;
  videoUrl: string | null;
  setVideoUrl: (value: string | null) => void;
  uploadedVideoUrl: string | null;
  setUploadedVideoUrl: (value: string | null) => void;
  renderStatus: string;
  setRenderStatus: (value: string) => void;
  lastDraftRenderFingerprint: string;
  setLastDraftRenderFingerprint: (value: string) => void;
  lastFinalRenderFingerprint: string;
  setLastFinalRenderFingerprint: (value: string) => void;
  lastRenderPreflightFingerprint: string;
  setLastRenderPreflightFingerprint: (value: string) => void;
  imageApprovalFingerprint: string;
  setImageApprovalFingerprint: (value: string) => void;
  preselectedMediaItems: StudioPreselectedMediaItem[];
  setPreselectedMediaItems: (value: StudioPreselectedMediaItem[]) => void;
  preselectedMediaApplyMode: StudioPreselectedMediaApplyMode;
  setPreselectedMediaApplyMode: (value: StudioPreselectedMediaApplyMode) => void;
  preselectedMediaSessionRegistry: Map<string, StudioPreselectedMediaItem>;
  resetPreviewRefs: () => void;
  quickScheduledAt: string;
  setQuickScheduledAt: (value: string) => void;
  selectedVoiceId: string;
  setSelectedVoiceId: (value: string) => void;
  selectedQuoteVoiceId: string;
  setSelectedQuoteVoiceId: (value: string) => void;
  selectedMaleVoiceId: string;
  setSelectedMaleVoiceId: (value: string) => void;
  selectedFemaleVoiceId: string;
  setSelectedFemaleVoiceId: (value: string) => void;
  selectedTypecastEmotionType: string;
  setSelectedTypecastEmotionType: (value: string) => void;
  selectedTypecastSpeed: string;
  setSelectedTypecastSpeed: (value: string) => void;
  playbackRate: number;
  setPlaybackRate: (value: number) => void;
  bgmEnabled: boolean;
  setBgmEnabled: (value: boolean) => void;
  selectedBgmTrack: string;
  setSelectedBgmTrack: (value: string) => void;
  mixPresetId: string;
  setMixPresetId: (value: string) => void;
  bgmVolume: number;
  setBgmVolume: (value: number) => void;
  sfxEnabled: boolean;
  setSfxEnabled: (value: boolean) => void;
  sfxMasterGainDb: number;
  setSfxMasterGainDb: (value: number) => void;
  sfxAutoLevel: StudioSfxAutoLevel;
  setSfxAutoLevel: (value: StudioSfxAutoLevel) => void;
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageUrl: string;
  templateImageLayout: TemplateImageLayout;
  templateLayoutApply: TemplateLayoutApply;
};

type PendingDraftPersist = {
  category: PublishCategory;
  draft: StudioWorkDraft;
  version: number;
};

type FlushPendingDraftPersistOptions = {
  silent?: boolean;
};

export type UseStudioLocalStorageSyncResult = {
  autosaveState: StudioAutosaveState;
  retryAutosave: () => void;
};

export function useStudioLocalStorageSync({
  defaultCategory,
  defaultBrandingByCategory,
  normalizeCategory,
  normalizeTemplateImageLayout,
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
  preselectedMediaSessionRegistry,
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
}: UseStudioLocalStorageSyncArgs): UseStudioLocalStorageSyncResult {
  const [autosaveState, setAutosaveState] = useState<StudioAutosaveState>(INITIAL_STUDIO_AUTOSAVE_STATE);
  const draftHydratedRef = useRef(false);
  const hydratedCategoryRef = useRef<PublishCategory | null>(null);
  const skipNextDraftPersistRef = useRef(false);
  const skipCategoryTemplatePresetApplyRef = useRef<PublishCategory | null>(null);
  const pendingDraftPersistRef = useRef<PendingDraftPersist | null>(null);
  const pendingDraftPersistTimerRef = useRef<number | null>(null);
  const draftPersistVersionRef = useRef(0);
  const pendingLastCategoryRestoreRef = useRef<PublishCategory | null>(null);

  const updateAutosaveState = useCallback((updater: (current: StudioAutosaveState) => StudioAutosaveState) => {
    setAutosaveState((current) => {
      return updater(current);
    });
  }, []);

  const flushPendingDraftPersist = useCallback((options?: FlushPendingDraftPersistOptions): boolean => {
    if (pendingDraftPersistTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(pendingDraftPersistTimerRef.current);
      pendingDraftPersistTimerRef.current = null;
    }
    const pendingDraftPersist = pendingDraftPersistRef.current;
    if (!pendingDraftPersist) return true;
    try {
      writeStoredStudioDraft(pendingDraftPersist.category, pendingDraftPersist.draft);
      pendingDraftPersistRef.current = null;
      if (!options?.silent) {
        let savedAtMs = Date.now();
        try {
          savedAtMs = readStoredStudioDraftUpdatedAt(pendingDraftPersist.category) || savedAtMs;
        } catch {
          // The draft write already succeeded; timestamp readback is best-effort.
        }
        updateAutosaveState((current) =>
          resolveStudioAutosaveWriteSuccess({
            current,
            writeVersion: pendingDraftPersist.version,
            latestVersion: draftPersistVersionRef.current,
            savedAtMs,
          })
        );
      }
      return true;
    } catch (error) {
      if (!options?.silent) {
        updateAutosaveState((current) =>
          resolveStudioAutosaveWriteFailure({
            current,
            pendingVersion: pendingDraftPersist.version,
            error,
          })
        );
      }
      return false;
    }
  }, [updateAutosaveState]);

  const retryAutosave = useCallback(() => {
    flushPendingDraftPersist();
  }, [flushPendingDraftPersist]);

  const flushBeforeCategoryHydration = useCallback(
    (targetCategory: PublishCategory): boolean => {
      const pendingDraftPersist = pendingDraftPersistRef.current;
      if (!pendingDraftPersist || pendingDraftPersist.category === targetCategory) return true;
      const pendingCategory = pendingDraftPersist.category;
      if (flushPendingDraftPersist()) return true;
      setPublishCategory(pendingCategory);
      return false;
    },
    [flushPendingDraftPersist, setPublishCategory]
  );

  const hydrateDraftForCategory = useCallback(
    (targetCategory: PublishCategory) => {
      if (!flushBeforeCategoryHydration(targetCategory)) return;
      try {
        const parsed = readStoredStudioDraft(targetCategory);
        const authoritativeSavedAtMs = readStoredStudioDraftUpdatedAt(targetCategory);
        updateAutosaveState(() => createHydratedStudioAutosaveState(authoritativeSavedAtMs));
        skipNextDraftPersistRef.current = true;
        if (!parsed) {
          setProjectProfileSnapshot(null);
          setTopicText("");
          setScriptText("");
          setScriptMode("normal");
          setJsonText("");
          setShowJsonEditor(false);
          setImageSource(DEFAULT_STUDIO_IMAGE_SOURCE);
          setImageSearchSource(DEFAULT_STUDIO_IMAGE_SEARCH_SOURCE);
          setCrawlMode("auto");
          setSlides([]);
          setSelectedPreviewGroupIndex(0);
          resetPreviewRefs();
          setPreselectedMediaItems([]);
          setPreselectedMediaApplyMode("spread");
          setQuickScheduledAt("");
          setLastDraftRenderFingerprint("");
          setLastFinalRenderFingerprint("");
          setLastRenderPreflightFingerprint("");
          setImageApprovalFingerprint("");
          setSelectedTypecastSpeed("");
          setSfxAutoLevel(DEFAULT_STUDIO_SFX_AUTO_LEVEL);
          hydratedCategoryRef.current = targetCategory;
          return;
        }

        const restoredDraftCategory = normalizeCategory(parsed.publishCategory) || targetCategory;
        const restoredProjectProfileSnapshot = parseStudioProjectProfileSnapshot(parsed.projectProfileSnapshot, {
          expectedCategory: targetCategory,
        });
        setProjectProfileSnapshot(restoredProjectProfileSnapshot);
        const draftHasTemplateSnapshot = hasDraftTemplateSnapshot(parsed);
        const shouldApplyDefaultTemplateSnapshot =
          !draftHasTemplateSnapshot && hasExplicitDefaultTemplatePresetSnapshot(restoredProjectProfileSnapshot);
        if (draftHasTemplateSnapshot && restoredDraftCategory !== targetCategory) {
          skipCategoryTemplatePresetApplyRef.current = restoredDraftCategory;
        }
        if (typeof parsed.topicText === "string") setTopicText(parsed.topicText);
        else setTopicText("");
        if (typeof parsed.scriptText === "string") setScriptText(parsed.scriptText);
        else setScriptText("");
        if (parsed.scriptMode === "normal" || parsed.scriptMode === "dialogue") setScriptMode(parsed.scriptMode);
        else setScriptMode("normal");
        if (typeof parsed.jsonText === "string") setJsonText(parsed.jsonText);
        else setJsonText("");
        setWorkName(typeof parsed.workName === "string" ? parsed.workName : "");
        if (typeof parsed.showJsonEditor === "boolean") setShowJsonEditor(parsed.showJsonEditor);
        else setShowJsonEditor(false);
        setImageSource(normalizeStudioImageSource(parsed.imageSource));
        setImageSearchSource(normalizeStudioImageSearchSource(parsed.imageSearchSource));
        setCrawlMode("auto");
        if (typeof parsed.codexModel === "string") {
          setCodexModel(parsed.codexModel);
        }
        if (Array.isArray(parsed.slides)) {
          setSlides(parsed.slides);
          resetPreviewRefs();
        } else {
          setSlides([]);
          resetPreviewRefs();
        }
        const restoredPreviewGroupIndex = Number(parsed.selectedPreviewGroupIndex);
        setSelectedPreviewGroupIndex(
          Number.isInteger(restoredPreviewGroupIndex) && restoredPreviewGroupIndex >= 0
            ? restoredPreviewGroupIndex
            : 0
        );
        const restoredPreviewDurations = Array.isArray(parsed.previewFrameDurationsSec)
          ? parsed.previewFrameDurationsSec.filter((value): value is number => Number.isFinite(value) && value > 0)
          : [];
        if (Array.isArray(parsed.slides) && parsed.slides.length > 0 && restoredPreviewDurations.length === parsed.slides.length) {
          setPreviewTiming({
            slides: parsed.slides,
            frameDurationsSec: restoredPreviewDurations,
          });
        } else {
          setPreviewTiming(null);
        }
        setVideoUrl(typeof parsed.videoUrl === "string" && parsed.videoUrl.trim() ? parsed.videoUrl : null);
        setUploadedVideoUrl(typeof parsed.uploadedVideoUrl === "string" && parsed.uploadedVideoUrl.trim() ? parsed.uploadedVideoUrl : null);
        setRenderStatus(recoverPersistedStudioRenderStatus(parsed.renderStatus));
        setLastDraftRenderFingerprint(asNonEmptyString(parsed.lastDraftRenderFingerprint));
        setLastFinalRenderFingerprint(asNonEmptyString(parsed.lastFinalRenderFingerprint));
        setLastRenderPreflightFingerprint(asNonEmptyString(parsed.lastRenderPreflightFingerprint));
        setImageApprovalFingerprint(asNonEmptyString(parsed.imageApprovalFingerprint));
        setPreselectedMediaItems(
          normalizeStudioPreselectedMediaItems(parsed.preselectedMediaItems, {
            sessionRegistry: preselectedMediaSessionRegistry,
          })
        );
        setPreselectedMediaApplyMode(normalizeStudioPreselectedMediaApplyMode(parsed.preselectedMediaApplyMode));
        if (typeof parsed.quickScheduledAt === "string") setQuickScheduledAt(parsed.quickScheduledAt);
        else setQuickScheduledAt("");
        if (typeof parsed.selectedVoiceId === "string") setSelectedVoiceId(parsed.selectedVoiceId);
        else setSelectedVoiceId("");
        if (typeof parsed.selectedQuoteVoiceId === "string") setSelectedQuoteVoiceId(parsed.selectedQuoteVoiceId);
        else setSelectedQuoteVoiceId("");
        if (typeof parsed.selectedMaleVoiceId === "string") setSelectedMaleVoiceId(parsed.selectedMaleVoiceId);
        else setSelectedMaleVoiceId("");
        if (typeof parsed.selectedFemaleVoiceId === "string") setSelectedFemaleVoiceId(parsed.selectedFemaleVoiceId);
        else setSelectedFemaleVoiceId("");
        if (typeof parsed.selectedTypecastEmotionType === "string") setSelectedTypecastEmotionType(parsed.selectedTypecastEmotionType);
        if (typeof parsed.selectedTypecastSpeed === "string") setSelectedTypecastSpeed(parsed.selectedTypecastSpeed);
        else setSelectedTypecastSpeed("");
        if (typeof parsed.playbackRate === "number" && Number.isFinite(parsed.playbackRate)) {
          setPlaybackRate(normalizeStudioPlaybackRate(parsed.playbackRate));
        }
        if (typeof parsed.bgmEnabled === "boolean") setBgmEnabled(parsed.bgmEnabled);
        if (typeof parsed.selectedBgmTrack === "string" && parsed.selectedBgmTrack.trim()) setSelectedBgmTrack(parsed.selectedBgmTrack);
        const restoredMixPresetId = normalizeStudioAudioMixPresetId(parsed.mixPresetId);
        setMixPresetId(restoredMixPresetId);
        setBgmVolume(normalizeStudioBgmVolume(parsed.bgmVolume, restoredMixPresetId));
        if (typeof parsed.sfxEnabled === "boolean") setSfxEnabled(parsed.sfxEnabled);
        if (typeof parsed.sfxMasterGainDb === "number" && Number.isFinite(parsed.sfxMasterGainDb)) {
          setSfxMasterGainDb(Math.max(-24, Math.min(12, parsed.sfxMasterGainDb)));
        }
        setSfxAutoLevel(normalizeStudioSfxAutoLevel(parsed.sfxAutoLevel));
        if (draftHasTemplateSnapshot) {
          applyTemplatePreset(
            {
              templateId: parsed.templateId,
              templateData: parsed.templateData,
              templateImageEnabled: parsed.templateImageEnabled,
              templateImageUrl: parsed.templateImageUrl,
              templateImageLayout: parsed.templateImageLayout,
              templateLayoutApply: parsed.templateLayoutApply,
            },
            normalizeTemplateImageLayout,
            setTemplateId,
            setTemplateData,
            setTemplateImageEnabled,
            setTemplateImageUrl,
            setTemplateImageLayout,
            setTemplateLayoutApply
          );
        } else if (shouldApplyDefaultTemplateSnapshot) {
          applyDefaultTemplatePreset(
            normalizeTemplateImageLayout,
            setTemplateId,
            setTemplateData,
            setTemplateImageEnabled,
            setTemplateImageUrl,
            setTemplateImageLayout,
            setTemplateLayoutApply
          );
        } else {
          const layoutPresetRaw = readScopedStorage(STUDIO_EDITOR_PRESET_KEY);
          if (layoutPresetRaw) {
            const layoutPreset = JSON.parse(layoutPresetRaw) as StudioLayoutPreset;
            const templateHydrationPlan = resolveLockedTemplatePresetHydrationPlan({
              layoutPreset,
              targetCategory,
              defaultCategory,
              normalizeCategory,
            });

            let applied = false;
            for (const category of templateHydrationPlan.templatePresetCategories) {
              applied = applyTemplatePresetByCategory(
                layoutPreset,
                category,
                normalizeCategory,
                normalizeTemplateImageLayout,
                setTemplateId,
                setTemplateData,
                setTemplateImageEnabled,
                setTemplateImageUrl,
                setTemplateImageLayout,
                setTemplateLayoutApply
              );
              if (applied) break;
            }
            if (!applied && hasStoredCategoryTemplatePresets(layoutPreset)) {
              applyDefaultTemplatePreset(
                normalizeTemplateImageLayout,
                setTemplateId,
                setTemplateData,
                setTemplateImageEnabled,
                setTemplateImageUrl,
                setTemplateImageLayout,
                setTemplateLayoutApply
              );
            } else if (!applied && templateHydrationPlan.allowTopLevelTemplatePreset) {
              applyTemplatePreset(
                {
                  templateId: layoutPreset.templateId,
                  templateData: layoutPreset.templateData,
                  templateImageEnabled: layoutPreset.templateImageEnabled,
                  templateImageUrl: layoutPreset.templateImageUrl,
                  templateImageLayout: layoutPreset.templateImageLayout,
                  templateLayoutApply: layoutPreset.templateLayoutApply,
                },
                normalizeTemplateImageLayout,
                setTemplateId,
                setTemplateData,
                setTemplateImageEnabled,
                setTemplateImageUrl,
                setTemplateImageLayout,
                setTemplateLayoutApply
              );
            }
          }
        }
        hydratedCategoryRef.current = targetCategory;
      } catch {
        updateAutosaveState(() => createHydratedStudioAutosaveState(0));
        setProjectProfileSnapshot(null);
        setTopicText("");
        setScriptText("");
        setScriptMode("normal");
        setJsonText("");
        setWorkName("");
        setShowJsonEditor(false);
        setImageSource(DEFAULT_STUDIO_IMAGE_SOURCE);
        setImageSearchSource(DEFAULT_STUDIO_IMAGE_SEARCH_SOURCE);
        setCrawlMode("auto");
        setSlides([]);
        setSelectedPreviewGroupIndex(0);
        resetPreviewRefs();
        setPreviewTiming(null);
        setVideoUrl(null);
        setUploadedVideoUrl(null);
        setRenderStatus("");
        setLastDraftRenderFingerprint("");
        setLastFinalRenderFingerprint("");
        setLastRenderPreflightFingerprint("");
        setImageApprovalFingerprint("");
        setPreselectedMediaItems([]);
        setPreselectedMediaApplyMode("spread");
        setQuickScheduledAt("");
        setBgmVolume(normalizeStudioBgmVolume(undefined));
        setSfxAutoLevel(DEFAULT_STUDIO_SFX_AUTO_LEVEL);
        hydratedCategoryRef.current = targetCategory;
      } finally {
        draftHydratedRef.current = true;
      }
    },
    [
      defaultCategory,
      flushBeforeCategoryHydration,
      normalizeCategory,
      normalizeTemplateImageLayout,
      preselectedMediaSessionRegistry,
      resetPreviewRefs,
      setBgmEnabled,
      setBgmVolume,
      setCodexModel,
      setCrawlMode,
      setImageSource,
      setImageSearchSource,
      setJsonText,
      setLastDraftRenderFingerprint,
      setLastFinalRenderFingerprint,
      setLastRenderPreflightFingerprint,
      setImageApprovalFingerprint,
      setMixPresetId,
      setPlaybackRate,
      setPreselectedMediaApplyMode,
      setPreselectedMediaItems,
      setProjectProfileSnapshot,
      setQuickScheduledAt,
      setScriptMode,
      setScriptText,
      setSelectedBgmTrack,
      setSelectedPreviewGroupIndex,
      setSelectedTypecastEmotionType,
      setSelectedTypecastSpeed,
      setSelectedVoiceId,
      setSfxEnabled,
      setSfxAutoLevel,
      setSfxMasterGainDb,
      setShowJsonEditor,
      setSlides,
      setTopicText,
      setTemplateData,
      setTemplateId,
      setTemplateImageEnabled,
      setTemplateImageLayout,
      setTemplateImageUrl,
      setTemplateLayoutApply,
      updateAutosaveState,
    ]
  );

  useEffect(() => {
    try {
      const raw = readScopedStorage(STUDIO_LAST_PUBLISH_CATEGORY_KEY);
      const restored = normalizeCategory(raw);
      if (restored) {
        pendingLastCategoryRestoreRef.current = restored;
        setPublishCategory(restored);
      }
    } catch {
      return;
    }
  }, [normalizeCategory, setPublishCategory]);

  useEffect(() => {
    try {
      const writeDecision = shouldWriteLastPublishCategory({
        publishCategory,
        pendingRestoreCategory: pendingLastCategoryRestoreRef.current,
      });
      pendingLastCategoryRestoreRef.current = writeDecision.pendingRestoreCategory;
      if (!writeDecision.shouldWrite) return;
      writeScopedStorage(STUDIO_LAST_PUBLISH_CATEGORY_KEY, publishCategory);
    } catch {
      return;
    }
  }, [publishCategory]);

  useEffect(() => {
    try {
      const raw = readScopedStorage(STUDIO_EDITOR_PRESET_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StudioLayoutPreset;
      const hydrationPlan = resolveStoredEditorPresetHydrationPlan({
        layoutPreset: parsed,
        storedLastPublishCategory: readScopedStorage(STUDIO_LAST_PUBLISH_CATEGORY_KEY),
        publishCategory,
        defaultCategory,
        defaultBrandingByCategory,
        normalizeCategory,
      });
      if (hydrationPlan.categoryToSelect) {
        setPublishCategory(hydrationPlan.categoryToSelect);
      }
      if (hydrationPlan.brandingPreset) {
        setBrandingDraft(hydrationPlan.brandingPreset.branding);
        setPresetBrandingOverride(hydrationPlan.presetBrandingOverride);
      }
      let applied = false;
      for (const category of hydrationPlan.templatePresetCategories) {
        applied = applyTemplatePresetByCategory(
          parsed,
          category,
          normalizeCategory,
          normalizeTemplateImageLayout,
          setTemplateId,
          setTemplateData,
          setTemplateImageEnabled,
          setTemplateImageUrl,
          setTemplateImageLayout,
          setTemplateLayoutApply
        );
        if (applied) break;
      }
      if (!applied && hasStoredCategoryTemplatePresets(parsed)) {
        applyDefaultTemplatePreset(
          normalizeTemplateImageLayout,
          setTemplateId,
          setTemplateData,
          setTemplateImageEnabled,
          setTemplateImageUrl,
          setTemplateImageLayout,
          setTemplateLayoutApply
        );
      } else if (!applied && hydrationPlan.allowTopLevelTemplatePreset) {
        applyTemplatePreset(
          {
            templateId: parsed.templateId,
            templateData: parsed.templateData,
            templateImageEnabled: parsed.templateImageEnabled,
            templateImageUrl: parsed.templateImageUrl,
            templateImageLayout: parsed.templateImageLayout,
            templateLayoutApply: parsed.templateLayoutApply,
          },
          normalizeTemplateImageLayout,
          setTemplateId,
          setTemplateData,
          setTemplateImageEnabled,
          setTemplateImageUrl,
          setTemplateImageLayout,
          setTemplateLayoutApply
        );
      }
    } catch {
      return;
    }
  }, [
    defaultBrandingByCategory,
    defaultCategory,
    normalizeCategory,
    normalizeTemplateImageLayout,
    publishCategory,
    setBrandingDraft,
    setPresetBrandingOverride,
    setPublishCategory,
    setTemplateId,
    setTemplateData,
    setTemplateImageEnabled,
    setTemplateImageLayout,
    setTemplateImageUrl,
    setTemplateLayoutApply,
  ]);

  useEffect(() => {
    if (skipCategoryTemplatePresetApplyRef.current && skipCategoryTemplatePresetApplyRef.current === publishCategory) {
      skipCategoryTemplatePresetApplyRef.current = null;
      return;
    }
    try {
      const raw = readScopedStorage(STUDIO_EDITOR_PRESET_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StudioLayoutPreset;
      const templateHydrationPlan = resolveLockedTemplatePresetHydrationPlan({
        layoutPreset: parsed,
        targetCategory: publishCategory,
        defaultCategory,
        normalizeCategory,
      });
      const applied = applyTemplatePresetByCategory(
        parsed,
        publishCategory,
        normalizeCategory,
        normalizeTemplateImageLayout,
        setTemplateId,
        setTemplateData,
        setTemplateImageEnabled,
        setTemplateImageUrl,
        setTemplateImageLayout,
        setTemplateLayoutApply
      );
      if (applied) return;
      if (hasStoredCategoryTemplatePresets(parsed)) {
        applyDefaultTemplatePreset(
          normalizeTemplateImageLayout,
          setTemplateId,
          setTemplateData,
          setTemplateImageEnabled,
          setTemplateImageUrl,
          setTemplateImageLayout,
          setTemplateLayoutApply
        );
        return;
      }
      if (!templateHydrationPlan.allowTopLevelTemplatePreset) return;
      applyTemplatePreset(
        {
          templateId: parsed.templateId,
          templateData: parsed.templateData,
          templateImageEnabled: parsed.templateImageEnabled,
          templateImageUrl: parsed.templateImageUrl,
          templateImageLayout: parsed.templateImageLayout,
          templateLayoutApply: parsed.templateLayoutApply,
        },
        normalizeTemplateImageLayout,
        setTemplateId,
        setTemplateData,
        setTemplateImageEnabled,
        setTemplateImageUrl,
        setTemplateImageLayout,
        setTemplateLayoutApply
      );
    } catch {
      return;
    }
  }, [
    defaultCategory,
    normalizeCategory,
    normalizeTemplateImageLayout,
    publishCategory,
    setTemplateId,
    setTemplateData,
    setTemplateImageEnabled,
    setTemplateImageLayout,
    setTemplateImageUrl,
    setTemplateLayoutApply,
  ]);

  useEffect(() => {
    if (draftHydratedRef.current) return;
    const initialCategory = publishCategory || defaultCategory;
    hydrateDraftForCategory(initialCategory);
  }, [defaultCategory, hydrateDraftForCategory, publishCategory]);

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    if (hydratedCategoryRef.current === publishCategory) return;
    hydrateDraftForCategory(publishCategory);
  }, [hydrateDraftForCategory, publishCategory]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const handleBeforeUnload = () => {
      flushPendingDraftPersist({ silent: true });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingDraftPersist();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushPendingDraftPersist({ silent: true });
    };
  }, [flushPendingDraftPersist]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (!pendingDraftPersistRef.current) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const shouldIntercept = shouldInterceptStudioAutosaveNavigation({
        hasPendingDraft: Boolean(pendingDraftPersistRef.current),
        defaultPrevented: event.defaultPrevented,
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        origin: window.location.origin,
        currentPathname: window.location.pathname,
        currentSearch: window.location.search,
        href: anchor.href,
        target: anchor.getAttribute("target"),
        download: anchor.hasAttribute("download"),
      });
      if (!shouldIntercept) return;
      if (flushPendingDraftPersist()) return;
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [flushPendingDraftPersist]);

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    if (skipNextDraftPersistRef.current) {
      skipNextDraftPersistRef.current = false;
      return;
    }
    try {
      const payload: StudioWorkDraft = {
        topicText,
        scriptText,
        scriptMode,
        jsonText,
        workName: workName.trim() || undefined,
        showJsonEditor,
        imageSource,
        imageSearchSource,
        crawlMode: "auto",
        publishCategory,
        projectProfileSnapshot: projectProfileSnapshot
          ? cloneStudioProjectProfileSnapshot(projectProfileSnapshot)
          : undefined,
        codexModel,
        slides,
        selectedPreviewGroupIndex,
        videoUrl: videoUrl || undefined,
        uploadedVideoUrl: uploadedVideoUrl || undefined,
        previewFrameDurationsSec:
          previewTiming && previewTiming.frameDurationsSec.length === slides.length
            ? previewTiming.frameDurationsSec
            : undefined,
        renderStatus,
        lastDraftRenderFingerprint: lastDraftRenderFingerprint.trim() || undefined,
        lastFinalRenderFingerprint: lastFinalRenderFingerprint.trim() || undefined,
        lastRenderPreflightFingerprint: lastRenderPreflightFingerprint.trim() || undefined,
        imageApprovalFingerprint: imageApprovalFingerprint.trim() || undefined,
        preselectedMediaItems: serializeStudioPreselectedMediaItems(preselectedMediaItems),
        preselectedMediaApplyMode,
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
        templateId,
        templateData,
        templateImageEnabled,
        templateImageUrl,
        templateImageLayout,
        templateLayoutApply,
      };
      const existingPendingDraftPersist = pendingDraftPersistRef.current;
      if (existingPendingDraftPersist && existingPendingDraftPersist.category !== publishCategory) {
        if (!flushPendingDraftPersist()) {
          setPublishCategory(existingPendingDraftPersist.category);
          return;
        }
      }
      const draftVersion = draftPersistVersionRef.current + 1;
      draftPersistVersionRef.current = draftVersion;
      pendingDraftPersistRef.current = {
        category: publishCategory,
        draft: payload,
        version: draftVersion,
      };
      updateAutosaveState((current) => markStudioAutosavePending(current, draftVersion));
      if (pendingDraftPersistTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(pendingDraftPersistTimerRef.current);
      }
      pendingDraftPersistTimerRef.current =
        typeof window !== "undefined"
          ? window.setTimeout(() => {
              flushPendingDraftPersist();
            }, DRAFT_PERSIST_DEBOUNCE_MS)
          : null;
    } catch {
      // no-op
    }
    return () => {
      if (pendingDraftPersistTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(pendingDraftPersistTimerRef.current);
        pendingDraftPersistTimerRef.current = null;
      }
    };
  }, [
    bgmEnabled,
    bgmVolume,
    codexModel,
    crawlMode,
    flushPendingDraftPersist,
    imageSource,
    imageSearchSource,
    jsonText,
    lastDraftRenderFingerprint,
    lastFinalRenderFingerprint,
    lastRenderPreflightFingerprint,
    imageApprovalFingerprint,
    playbackRate,
    previewTiming,
    preselectedMediaItems,
    preselectedMediaApplyMode,
    publishCategory,
    projectProfileSnapshot,
    quickScheduledAt,
    renderStatus,
    scriptMode,
    scriptText,
    setPublishCategory,
    selectedBgmTrack,
    selectedPreviewGroupIndex,
    selectedFemaleVoiceId,
    selectedMaleVoiceId,
    selectedQuoteVoiceId,
    selectedTypecastEmotionType,
    selectedTypecastSpeed,
    mixPresetId,
    selectedVoiceId,
    sfxEnabled,
    sfxAutoLevel,
    sfxMasterGainDb,
    showJsonEditor,
    slides,
    templateId,
    templateData,
    templateImageEnabled,
    templateImageLayout,
    templateImageUrl,
    templateLayoutApply,
    topicText,
    updateAutosaveState,
    uploadedVideoUrl,
    videoUrl,
    workName,
  ]);

  return {
    autosaveState,
    retryAutosave,
  };
}
