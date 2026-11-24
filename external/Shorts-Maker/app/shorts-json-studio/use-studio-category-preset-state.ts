"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { fetchStudioCategoryMetadata } from "@/lib/api/studio-client";
import { getPublishMetadata, type PublishMetadata } from "@/lib/publish/category-metadata";
import type { PublishCategory } from "@/lib/publish/types";
import { STUDIO_BGM_OPTIONS } from "@/lib/studio/audio-options";
import { normalizeStudioAudioMixPresetId, normalizeStudioBgmVolume } from "@/lib/studio/audio-mix-presets";
import { normalizeStudioPlaybackRate } from "@/lib/studio/playback-rate";
import {
  parseStudioProjectProfileSnapshot,
  type StudioProjectProfileSnapshot,
} from "@/lib/studio/project-profile-snapshot";
import {
  normalizeStudioTemplateId,
  type LayoutRect,
  type StudioWorkDraft,
  type TemplateBranding,
  type TemplateImageLayout,
  type TemplateLayoutApply,
} from "./types";
import { createStudioTemplateData, normalizeStudioTemplateData } from "./components/templates/template-registry";
import { readStoredStudioDraft } from "./storage";
import {
  formatStudioPresetSavedAtLabel,
  isSameTemplateBranding,
  persistStudioEditorPresetForCategory,
  readStoredBrandingPresetForCategory,
  readStoredPresetMetaForCategory,
  readStoredTemplatePresetForCategory,
  resolveCategoryBranding,
  type PresetBrandingOverride,
  type StoredCategoryTemplatePreset,
} from "./studio-category-preset-storage";

type EditableTemplateRectSlotKey =
  | "headerTitleSlot"
  | "headerAccentSlot"
  | "titleSlot"
  | "infoSlot"
  | "bodySlot"
  | "imageSlot";

type UseStudioCategoryPresetStateInput = {
  brandingDraft: TemplateBranding;
  categoryBrandingMap: Record<PublishCategory, TemplateBranding>;
  categoryMetadataMap: Record<string, PublishMetadata>;
  defaultBrandingByCategory: Record<PublishCategory, TemplateBranding>;
  defaultCategory: PublishCategory;
  defaultTemplateImageLayout: TemplateImageLayout;
  defaultTemplateLayoutApply: TemplateLayoutApply;
  ensureEditPermission: (showAlert?: boolean) => boolean;
  hasRenderedVideo: boolean;
  layoutPresetVersion: number;
  localPresetRevision: number;
  markRenderedAssetAsDirty: (message: string) => void;
  normalizeTemplateImageLayout: (input: unknown) => TemplateImageLayout;
  normalizeTemplateLayoutApply: (input: unknown) => TemplateLayoutApply;
  persistLocalPresetRevision: () => void;
  presetBrandingOverride: PresetBrandingOverride | null;
  projectProfileSnapshot: StudioProjectProfileSnapshot | null;
  publishCategory: PublishCategory;
  readImageFileAsDataUrl: (file: File) => Promise<string>;
  savedBrandingSnapshotByCategory: Record<string, TemplateBranding>;
  sanitizeRect: (input: unknown, fallback: LayoutRect) => LayoutRect;
  selectedVoiceId: string;
  setBgmEnabled: Dispatch<SetStateAction<boolean>>;
  setBgmVolume: Dispatch<SetStateAction<number>>;
  setBrandingDraft: Dispatch<SetStateAction<TemplateBranding>>;
  setBrandingSaveBusy: Dispatch<SetStateAction<boolean>>;
  setBrandingStatus: Dispatch<SetStateAction<string>>;
  setMixPresetId: Dispatch<SetStateAction<string>>;
  setPlaybackRate: Dispatch<SetStateAction<number>>;
  setPresetBrandingOverride: Dispatch<SetStateAction<PresetBrandingOverride | null>>;
  setSavedBrandingSnapshotByCategory: Dispatch<SetStateAction<Record<string, TemplateBranding>>>;
  setSelectedBgmTrack: Dispatch<SetStateAction<string>>;
  setSelectedVoiceId: Dispatch<SetStateAction<string>>;
  setSfxEnabled: Dispatch<SetStateAction<boolean>>;
  setSfxMasterGainDb: Dispatch<SetStateAction<number>>;
  setTemplateData: Dispatch<SetStateAction<StoredCategoryTemplatePreset["templateData"]>>;
  setTemplateId: Dispatch<SetStateAction<StoredCategoryTemplatePreset["templateId"]>>;
  setTemplateImageEnabled: Dispatch<SetStateAction<boolean>>;
  setTemplateImageLayout: Dispatch<SetStateAction<TemplateImageLayout>>;
  setTemplateImageUrl: Dispatch<SetStateAction<string>>;
  setTemplateLayoutApply: Dispatch<SetStateAction<TemplateLayoutApply>>;
  setTemplateNotesByCategory: Dispatch<SetStateAction<Record<PublishCategory, string>>>;
  setTemplateNotesSaveBusy: Dispatch<SetStateAction<boolean>>;
  skipCategoryAudioPresetRef: MutableRefObject<boolean>;
  templateData: StoredCategoryTemplatePreset["templateData"];
  templateId: StoredCategoryTemplatePreset["templateId"];
  templateImageEnabled: boolean;
  templateImageLayout: TemplateImageLayout;
  templateImageUrl: string;
  templateLayoutApply: TemplateLayoutApply;
  templateNotesByCategory: Record<PublishCategory, string>;
};

export function mergeTemplateNotesByCategory(
  prev: Record<PublishCategory, string>,
  category: PublishCategory,
  nextTemplateNotes: string | null | undefined
): Record<PublishCategory, string> {
  const currentValue = prev[category] || "";
  const resolvedValue = nextTemplateNotes || currentValue || "";
  if (resolvedValue === currentValue) return prev;
  return {
    ...prev,
    [category]: resolvedValue,
  };
}

export function resolveStudioCategoryAudioResetMetadata(input: {
  category: PublishCategory;
  templateId: string;
  categoryMetadataMap: Record<string, PublishMetadata>;
  cachedMetadata?: PublishMetadata;
  projectMetadataSnapshot?: PublishMetadata | null;
}): PublishMetadata {
  if (input.projectMetadataSnapshot) return input.projectMetadataSnapshot;
  if (input.templateId === "default") {
    const bootstrappedMetadata = input.categoryMetadataMap[input.category];
    if (bootstrappedMetadata) return bootstrappedMetadata;
  }
  return input.cachedMetadata || getPublishMetadata(input.category);
}

export function resolveStudioCategoryAudioSettings(metadata: PublishMetadata) {
  const mixPresetId = normalizeStudioAudioMixPresetId(metadata.mixPresetId);
  const sfxMasterGainDb = Number(metadata.sfxMasterGainDb);
  return {
    selectedVoiceId: metadata.ttsVoiceId || "",
    playbackRate: normalizeStudioPlaybackRate(metadata.playbackRate),
    bgmEnabled: metadata.bgmEnabled !== false,
    selectedBgmTrack: metadata.bgmTrackId || STUDIO_BGM_OPTIONS[0]?.id || "",
    mixPresetId,
    bgmVolume: normalizeStudioBgmVolume(metadata.bgmVolume, mixPresetId),
    sfxEnabled: metadata.sfxEnabled !== false,
    sfxMasterGainDb: Number.isFinite(sfxMasterGainDb)
      ? Math.max(-24, Math.min(12, sfxMasterGainDb))
      : 0,
  };
}

export function shouldPreserveStudioProjectDraftTemplate(input: {
  projectProfileSnapshot: StudioProjectProfileSnapshot | null;
  storedDraft: StudioWorkDraft | null;
  publishCategory: PublishCategory;
}): boolean {
  if (input.projectProfileSnapshot?.contentProfile.category === input.publishCategory) return true;
  return Boolean(
    parseStudioProjectProfileSnapshot(input.storedDraft?.projectProfileSnapshot, {
      expectedCategory: input.publishCategory,
    })
  );
}

export function useStudioCategoryPresetState(input: UseStudioCategoryPresetStateInput) {
  const categoryPresetCacheRef = useRef(new Map<string, PublishMetadata>());
  const categoryPresetInFlightRef = useRef(
    new Map<string, ReturnType<typeof fetchStudioCategoryMetadata>>()
  );
  const hasProjectProfileSnapshot =
    input.projectProfileSnapshot?.contentProfile.category === input.publishCategory;
  const storedDraftHasProjectProfileSnapshot = useMemo(() => {
    const storedDraft = readStoredStudioDraft(input.publishCategory);
    return shouldPreserveStudioProjectDraftTemplate({
      projectProfileSnapshot: null,
      storedDraft,
      publishCategory: input.publishCategory,
    });
  }, [input.publishCategory]);
  const shouldPreserveProjectDraftTemplate =
    hasProjectProfileSnapshot || storedDraftHasProjectProfileSnapshot;
  const projectMetadataSnapshot = useMemo(
    () =>
      hasProjectProfileSnapshot
        ? input.projectProfileSnapshot?.contentProfile.metadataSnapshot || null
        : null,
    [hasProjectProfileSnapshot, input.projectProfileSnapshot]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    input.skipCategoryAudioPresetRef.current = Boolean(readStoredStudioDraft(input.publishCategory));
  }, [input.publishCategory, input.skipCategoryAudioPresetRef]);

  useEffect(() => {
    input.setSavedBrandingSnapshotByCategory((prev) => {
      const next = { ...prev };
      for (const [category, branding] of Object.entries(input.categoryBrandingMap)) {
        next[category] = branding;
      }
      return next;
    });
  }, [input.categoryBrandingMap, input.setSavedBrandingSnapshotByCategory]);

  const hasStoredTemplatePreset = useMemo(() => {
    void input.layoutPresetVersion;
    void input.localPresetRevision;
    return readStoredPresetMetaForCategory(input.publishCategory).hasTemplatePreset;
  }, [input.layoutPresetVersion, input.localPresetRevision, input.publishCategory]);

  useEffect(() => {
    const storedBranding = readStoredBrandingPresetForCategory(input.publishCategory);
    if (storedBranding) {
      input.setPresetBrandingOverride({
        category: input.publishCategory,
        branding: storedBranding.branding,
      });
      input.setBrandingDraft(storedBranding.branding);
    } else {
      input.setPresetBrandingOverride((prev) => (prev?.category === input.publishCategory ? null : prev));
      input.setBrandingDraft(
        input.categoryBrandingMap[input.publishCategory] ||
          input.defaultBrandingByCategory[input.publishCategory] ||
          input.defaultBrandingByCategory[input.defaultCategory]
      );
    }

    if (!shouldPreserveProjectDraftTemplate) {
      const storedTemplate = readStoredTemplatePresetForCategory(input.publishCategory, {
        normalizeTemplateImageLayout: input.normalizeTemplateImageLayout,
        normalizeTemplateLayoutApply: input.normalizeTemplateLayoutApply,
      });
      if (storedTemplate) {
        input.setTemplateId(storedTemplate.templateId);
        input.setTemplateData(storedTemplate.templateData);
        input.setTemplateImageEnabled(storedTemplate.templateImageEnabled);
        input.setTemplateImageUrl(storedTemplate.templateImageUrl);
        input.setTemplateImageLayout(storedTemplate.templateImageLayout);
        input.setTemplateLayoutApply(storedTemplate.templateLayoutApply);
        return;
      }
      input.setTemplateId("default");
      input.setTemplateData(createStudioTemplateData("default"));
      input.setTemplateImageEnabled(false);
      input.setTemplateImageUrl("");
      input.setTemplateImageLayout(input.defaultTemplateImageLayout);
      input.setTemplateLayoutApply(input.defaultTemplateLayoutApply);
    }
  }, [
    input.categoryBrandingMap,
    input.defaultBrandingByCategory,
    input.defaultCategory,
    input.defaultTemplateImageLayout,
    input.defaultTemplateLayoutApply,
    input.layoutPresetVersion,
    input.normalizeTemplateImageLayout,
    input.normalizeTemplateLayoutApply,
    input.publishCategory,
    shouldPreserveProjectDraftTemplate,
    input.setBrandingDraft,
    input.setPresetBrandingOverride,
    input.setTemplateData,
    input.setTemplateId,
    input.setTemplateImageEnabled,
    input.setTemplateImageLayout,
    input.setTemplateImageUrl,
    input.setTemplateLayoutApply,
  ]);

  const selectedBranding = useMemo(
    () =>
      resolveCategoryBranding(input.publishCategory, {
        presetBrandingOverride: input.presetBrandingOverride,
        categoryBrandingMap: input.categoryBrandingMap,
        defaultBrandingByCategory: input.defaultBrandingByCategory,
        brandingDraft: input.brandingDraft,
      }),
    [input.brandingDraft, input.categoryBrandingMap, input.defaultBrandingByCategory, input.presetBrandingOverride, input.publishCategory]
  );

  const templateNotesDraft = input.templateNotesByCategory[input.publishCategory] || "";

  const effectiveCategoryTemplatePreset = useMemo<StoredCategoryTemplatePreset>(
    () => ({
      templateId: input.templateId,
      templateData: input.templateData,
      templateImageEnabled: input.templateImageEnabled,
      templateImageUrl: input.templateImageUrl,
      templateImageLayout: input.templateImageLayout,
      templateLayoutApply: input.templateLayoutApply,
    }),
    [
      input.templateData,
      input.templateId,
      input.templateImageEnabled,
      input.templateImageLayout,
      input.templateImageUrl,
      input.templateLayoutApply,
    ]
  );

  const storedPresetMeta = useMemo(() => {
    void input.layoutPresetVersion;
    void input.localPresetRevision;
    return readStoredPresetMetaForCategory(input.publishCategory);
  }, [input.layoutPresetVersion, input.localPresetRevision, input.publishCategory]);

  const localPresetSummary = useMemo(() => {
    const lastSavedAt = Math.max(storedPresetMeta.brandingUpdatedAt || 0, storedPresetMeta.templateUpdatedAt || 0);
    if (!lastSavedAt) {
      return "변경값은 로컬 preset으로 자동 저장됩니다. 이 고객을 다시 열어도 바로 복원됩니다.";
    }
    return `로컬 preset 마지막 저장 ${formatStudioPresetSavedAtLabel(lastSavedAt)} · 변경 시 자동으로 갱신됩니다.`;
  }, [storedPresetMeta]);

  const brandingDbBase = useMemo(
    () =>
      input.savedBrandingSnapshotByCategory[input.publishCategory] ||
      input.categoryBrandingMap[input.publishCategory] ||
      input.defaultBrandingByCategory[input.publishCategory] ||
      input.defaultBrandingByCategory[input.defaultCategory],
    [
      input.categoryBrandingMap,
      input.defaultBrandingByCategory,
      input.defaultCategory,
      input.publishCategory,
      input.savedBrandingSnapshotByCategory,
    ]
  );

  const brandingDbDirty = useMemo(
    () => !isSameTemplateBranding(brandingDbBase, selectedBranding),
    [brandingDbBase, selectedBranding]
  );

  const applyCategoryAudioSettings = useCallback(
    (metadata: PublishMetadata) => {
      const settings = resolveStudioCategoryAudioSettings(metadata);
      input.setSelectedVoiceId(settings.selectedVoiceId);
      input.setPlaybackRate(settings.playbackRate);
      input.setBgmEnabled(settings.bgmEnabled);
      input.setSelectedBgmTrack(settings.selectedBgmTrack);
      input.setMixPresetId(settings.mixPresetId);
      input.setBgmVolume(settings.bgmVolume);
      input.setSfxEnabled(settings.sfxEnabled);
      input.setSfxMasterGainDb(settings.sfxMasterGainDb);
    },
    [
      input.setBgmEnabled,
      input.setBgmVolume,
      input.setMixPresetId,
      input.setPlaybackRate,
      input.setSelectedBgmTrack,
      input.setSelectedVoiceId,
      input.setSfxEnabled,
      input.setSfxMasterGainDb,
    ]
  );

  const resetCurrentCategoryAudioPreset = useCallback(() => {
    const currentTemplateId = effectiveCategoryTemplatePreset.templateId;
    const cacheKey = `${input.publishCategory}:${currentTemplateId}`;
    const metadata = resolveStudioCategoryAudioResetMetadata({
      category: input.publishCategory,
      templateId: currentTemplateId,
      categoryMetadataMap: input.categoryMetadataMap,
      cachedMetadata: categoryPresetCacheRef.current.get(cacheKey),
      projectMetadataSnapshot,
    });
    input.skipCategoryAudioPresetRef.current = false;
    applyCategoryAudioSettings(metadata);
  }, [
    applyCategoryAudioSettings,
    effectiveCategoryTemplatePreset.templateId,
    input.categoryMetadataMap,
    input.publishCategory,
    input.skipCategoryAudioPresetRef,
    projectMetadataSnapshot,
  ]);

  const persistCurrentCategoryPreset = useCallback(
    (nextBranding: TemplateBranding, nextTemplatePreset: StoredCategoryTemplatePreset, statusMessage?: string) => {
      persistStudioEditorPresetForCategory({
        category: input.publishCategory,
        branding: nextBranding,
        templatePreset: nextTemplatePreset,
      });
      input.persistLocalPresetRevision();
      if (statusMessage) {
        input.setBrandingStatus(statusMessage);
      }
    },
    [input.persistLocalPresetRevision, input.publishCategory, input.setBrandingStatus]
  );

  useEffect(() => {
    if (storedDraftHasProjectProfileSnapshot && !hasProjectProfileSnapshot) return;
    let cancelled = false;
    const currentTemplateId = effectiveCategoryTemplatePreset.templateId;
    const cacheKey = `${input.publishCategory}:${currentTemplateId}`;
    const applyCategoryAudioPresetData = (metadata: PublishMetadata) => {
      if (cancelled) return;
      categoryPresetCacheRef.current.set(cacheKey, metadata);
      input.setTemplateNotesByCategory((prev) => mergeTemplateNotesByCategory(prev, input.publishCategory, metadata.templateNotes));
      if (!shouldPreserveProjectDraftTemplate && !hasStoredTemplatePreset && metadata.templatePreset) {
        const templatePreset = metadata.templatePreset;
        const normalizedTemplateId = normalizeStudioTemplateId(templatePreset.templateId);
        const normalizedPreset: StoredCategoryTemplatePreset = {
          templateId: normalizedTemplateId,
          templateData: normalizeStudioTemplateData(normalizedTemplateId, templatePreset.templateData),
          templateImageEnabled: Boolean(templatePreset.templateImageEnabled),
          templateImageUrl: typeof templatePreset.templateImageUrl === "string" ? templatePreset.templateImageUrl : "",
          templateImageLayout: input.normalizeTemplateImageLayout(templatePreset.templateImageLayout),
          templateLayoutApply: input.normalizeTemplateLayoutApply(templatePreset.templateLayoutApply),
        };
        input.setTemplateData(normalizedPreset.templateData);
        input.setTemplateId(normalizedPreset.templateId);
        input.setTemplateImageEnabled(normalizedPreset.templateImageEnabled);
        input.setTemplateImageUrl(normalizedPreset.templateImageUrl);
        input.setTemplateImageLayout(normalizedPreset.templateImageLayout);
        input.setTemplateLayoutApply(normalizedPreset.templateLayoutApply);
        persistCurrentCategoryPreset(selectedBranding, normalizedPreset);
      }
      if (input.skipCategoryAudioPresetRef.current) return;
      applyCategoryAudioSettings(metadata);
    };

    const applyCategoryAudioPreset = async () => {
      try {
        if (projectMetadataSnapshot) {
          categoryPresetCacheRef.current.set(cacheKey, projectMetadataSnapshot);
          input.setTemplateNotesByCategory((prev) =>
            mergeTemplateNotesByCategory(prev, input.publishCategory, projectMetadataSnapshot.templateNotes)
          );
          if (!input.skipCategoryAudioPresetRef.current) {
            applyCategoryAudioSettings(projectMetadataSnapshot);
          }
          return;
        }
        if (currentTemplateId === "default") {
          const bootstrappedMetadata = input.categoryMetadataMap[input.publishCategory];
          if (bootstrappedMetadata) {
            applyCategoryAudioPresetData(bootstrappedMetadata);
            return;
          }
        }
        const cachedMetadata = categoryPresetCacheRef.current.get(cacheKey);
        if (cachedMetadata) {
          applyCategoryAudioPresetData(cachedMetadata);
          return;
        }
        let request = categoryPresetInFlightRef.current.get(cacheKey);
        if (!request) {
          request = fetchStudioCategoryMetadata(input.publishCategory, currentTemplateId);
          categoryPresetInFlightRef.current.set(cacheKey, request);
        }
        const data = await request;
        if (data.metadata) {
          applyCategoryAudioPresetData(data.metadata);
        }
      } catch {
        return;
      } finally {
        categoryPresetInFlightRef.current.delete(cacheKey);
      }
    };
    if (!input.publishCategory) return;
    void applyCategoryAudioPreset();
    return () => {
      cancelled = true;
    };
  }, [
    effectiveCategoryTemplatePreset,
    applyCategoryAudioSettings,
    hasProjectProfileSnapshot,
    hasStoredTemplatePreset,
    input.categoryMetadataMap,
    input.normalizeTemplateImageLayout,
    input.normalizeTemplateLayoutApply,
    input.publishCategory,
    projectMetadataSnapshot,
    input.setTemplateData,
    input.setTemplateId,
    input.setTemplateImageEnabled,
    input.setTemplateImageLayout,
    input.setTemplateImageUrl,
    input.setTemplateLayoutApply,
    input.setTemplateNotesByCategory,
    input.skipCategoryAudioPresetRef,
    persistCurrentCategoryPreset,
    selectedBranding,
    shouldPreserveProjectDraftTemplate,
    storedDraftHasProjectProfileSnapshot,
  ]);

  const handleOpenLayoutStudio = useCallback(() => {
    if (!input.ensureEditPermission()) return false;
    persistStudioEditorPresetForCategory({
      category: input.publishCategory,
      branding: selectedBranding,
      templatePreset: effectiveCategoryTemplatePreset,
    });
    return true;
  }, [effectiveCategoryTemplatePreset, input.ensureEditPermission, input.publishCategory, selectedBranding]);

  const handleBrandingChange = useCallback(
    (patch: Partial<TemplateBranding>) => {
      if (!input.ensureEditPermission(false)) return;
      const nextBranding = { ...selectedBranding, ...patch };
      input.setBrandingDraft(nextBranding);
      input.setPresetBrandingOverride({
        category: input.publishCategory,
        branding: nextBranding,
      });
      persistCurrentCategoryPreset(nextBranding, effectiveCategoryTemplatePreset, "현재 고객 preset에 자동 저장되었습니다.");
      if (!input.hasRenderedVideo) return;
      input.markRenderedAssetAsDirty("브랜딩 설정이 변경되었습니다. 기존 결과물을 다시 렌더해야 합니다.");
    },
    [
      effectiveCategoryTemplatePreset,
      input.ensureEditPermission,
      input.hasRenderedVideo,
      input.markRenderedAssetAsDirty,
      input.publishCategory,
      input.setBrandingDraft,
      input.setPresetBrandingOverride,
      persistCurrentCategoryPreset,
      selectedBranding,
    ]
  );

  const handleTemplateNotesChange = useCallback(
    (value: string) => {
      if (!input.ensureEditPermission(false)) return;
      input.setTemplateNotesByCategory((prev) => ({
        ...prev,
        [input.publishCategory]: value,
      }));
    },
    [input.ensureEditPermission, input.publishCategory, input.setTemplateNotesByCategory]
  );

  const handleTemplatePresetChange = useCallback(
    (
      updater: (current: StoredCategoryTemplatePreset) => StoredCategoryTemplatePreset,
      dirtyMessage: string,
      statusMessage = "현재 고객 템플릿 preset에 자동 저장되었습니다."
    ) => {
      if (!input.ensureEditPermission(false)) return;
      const nextPreset = updater(effectiveCategoryTemplatePreset);
      input.setTemplateData(nextPreset.templateData);
      input.setTemplateId(nextPreset.templateId);
      input.setTemplateImageEnabled(nextPreset.templateImageEnabled);
      input.setTemplateImageUrl(nextPreset.templateImageUrl);
      input.setTemplateImageLayout(nextPreset.templateImageLayout);
      input.setTemplateLayoutApply(nextPreset.templateLayoutApply);
      persistCurrentCategoryPreset(selectedBranding, nextPreset, statusMessage);
      if (!input.hasRenderedVideo) return;
      input.markRenderedAssetAsDirty(dirtyMessage);
    },
    [
      effectiveCategoryTemplatePreset,
      input.ensureEditPermission,
      input.hasRenderedVideo,
      input.markRenderedAssetAsDirty,
      input.setTemplateData,
      input.setTemplateId,
      input.setTemplateImageEnabled,
      input.setTemplateImageLayout,
      input.setTemplateImageUrl,
      input.setTemplateLayoutApply,
      persistCurrentCategoryPreset,
      selectedBranding,
    ]
  );

  const handleTemplateImageFileChange = useCallback(
    async (file: File | null) => {
      if (!input.ensureEditPermission()) return;
      if (!file) return;
      if (!(file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/jpg" || file.type === "image/webp")) {
        alert("PNG, JPG, WEBP 파일만 업로드할 수 있습니다.");
        return;
      }
      try {
        const dataUrl = await input.readImageFileAsDataUrl(file);
        handleTemplatePresetChange(
          (current) => ({
            ...current,
            templateImageEnabled: true,
            templateImageUrl: dataUrl,
          }),
          "템플릿 이미지가 변경되었습니다. 결과 영상을 다시 생성해 주세요."
        );
      } catch (error) {
        alert(error instanceof Error ? error.message : String(error));
      }
    },
    [handleTemplatePresetChange, input.ensureEditPermission, input.readImageFileAsDataUrl]
  );

  const handleApplyTemplateLayoutJson = useCallback(
    (value: string) => {
      try {
        const parsed = JSON.parse(value) as unknown;
        const nextLayout = input.normalizeTemplateImageLayout(parsed);
        handleTemplatePresetChange(
          (current) => ({
            ...current,
            templateImageLayout: nextLayout,
          }),
          "템플릿 슬롯 JSON이 변경되었습니다. 결과 영상을 다시 생성해 주세요.",
          "템플릿 슬롯 JSON을 현재 고객 preset에 적용했습니다."
        );
      } catch (error) {
        input.setBrandingStatus(error instanceof Error ? error.message : String(error));
      }
    },
    [handleTemplatePresetChange, input.normalizeTemplateImageLayout, input.setBrandingStatus]
  );

  const handleTemplateFontSizeChange = useCallback(
    (key: "titleSize" | "bodySize" | "headerSize" | "infoSize", raw: string) => {
      const parsed = Number(raw);
      const current = Number(effectiveCategoryTemplatePreset.templateImageLayout[key]);
      const fallback = Number.isFinite(current) ? current : input.defaultTemplateImageLayout[key];
      const nextValue = Number.isFinite(parsed) ? parsed : fallback;
      const min = key === "titleSize" ? 10 : key === "bodySize" ? 9 : key === "headerSize" ? 10 : 8;
      const max = key === "titleSize" ? 52 : key === "bodySize" ? 36 : key === "headerSize" ? 32 : 24;
      const clamped = Math.max(min, Math.min(max, Math.round(nextValue)));
      const nextLayout = {
        ...effectiveCategoryTemplatePreset.templateImageLayout,
        [key]: clamped,
      };
      handleTemplatePresetChange(
        (currentPreset) => ({
          ...currentPreset,
          templateImageLayout: nextLayout,
        }),
        "템플릿 폰트 크기가 변경되었습니다. 결과 영상을 다시 생성해 주세요.",
        "템플릿 폰트 크기를 현재 고객 preset에 저장했습니다."
      );
    },
    [effectiveCategoryTemplatePreset.templateImageLayout, handleTemplatePresetChange, input.defaultTemplateImageLayout]
  );

  const handleTemplateLayoutColorChange = useCallback(
    (key: "titleColor" | "bodyColor" | "infoColor", raw: string) => {
      const nextValue = typeof raw === "string" && raw.trim() ? raw.trim() : effectiveCategoryTemplatePreset.templateImageLayout[key];
      const nextLayout = {
        ...effectiveCategoryTemplatePreset.templateImageLayout,
        [key]: nextValue,
      };
      handleTemplatePresetChange(
        (currentPreset) => ({
          ...currentPreset,
          templateImageLayout: nextLayout,
        }),
        "템플릿 텍스트 색상이 변경되었습니다. 결과 영상을 다시 생성해 주세요.",
        "템플릿 텍스트 색상을 현재 고객 preset에 저장했습니다."
      );
    },
    [effectiveCategoryTemplatePreset.templateImageLayout, handleTemplatePresetChange]
  );

  const handleTemplateRectFieldChange = useCallback(
    (slotKey: EditableTemplateRectSlotKey, field: keyof LayoutRect, raw: string) => {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      const currentRect = effectiveCategoryTemplatePreset.templateImageLayout[slotKey];
      const roundedValue = Math.round(parsed * 10000) / 10000;
      const normalized = input.sanitizeRect(
        {
          ...currentRect,
          [field]: roundedValue,
        },
        currentRect
      );
      const nextLayout = {
        ...effectiveCategoryTemplatePreset.templateImageLayout,
        [slotKey]: normalized,
      };
      handleTemplatePresetChange(
        (currentPreset) => ({
          ...currentPreset,
          templateImageLayout: nextLayout,
        }),
        "템플릿 슬롯 좌표가 변경되었습니다. 결과 영상을 다시 생성해 주세요.",
        "템플릿 슬롯 좌표를 현재 고객 preset에 저장했습니다."
      );
    },
    [effectiveCategoryTemplatePreset.templateImageLayout, handleTemplatePresetChange, input.sanitizeRect]
  );

  const handleTemplateRectFieldNudge = useCallback(
    (slotKey: EditableTemplateRectSlotKey, field: keyof LayoutRect, delta: number) => {
      const currentRect = effectiveCategoryTemplatePreset.templateImageLayout[slotKey];
      const baseValue = Number(currentRect[field]);
      if (!Number.isFinite(baseValue)) return;
      handleTemplateRectFieldChange(slotKey, field, String(baseValue + delta));
    },
    [effectiveCategoryTemplatePreset.templateImageLayout, handleTemplateRectFieldChange]
  );

  const handleTemplateRectCommitAction = useCallback(
    (slotKey: EditableTemplateRectSlotKey, rect: LayoutRect) => {
      const currentRect = effectiveCategoryTemplatePreset.templateImageLayout[slotKey];
      const normalized = input.sanitizeRect(rect, currentRect);
      if (
        normalized.x === currentRect.x &&
        normalized.y === currentRect.y &&
        normalized.w === currentRect.w &&
        normalized.h === currentRect.h
      ) {
        return;
      }
      const nextLayout = {
        ...effectiveCategoryTemplatePreset.templateImageLayout,
        [slotKey]: normalized,
      };
      handleTemplatePresetChange(
        (currentPreset) => ({
          ...currentPreset,
          templateImageLayout: nextLayout,
        }),
        "템플릿 슬롯 위치가 변경되었습니다. 결과 영상을 다시 생성해 주세요.",
        "템플릿 슬롯 위치를 현재 고객 preset에 저장했습니다."
      );
    },
    [effectiveCategoryTemplatePreset.templateImageLayout, handleTemplatePresetChange, input.sanitizeRect]
  );

  const handleResetCurrentCategory = useCallback(() => {
    if (!input.ensureEditPermission()) return;
    const nextBranding =
      input.categoryBrandingMap[input.publishCategory] ||
      input.defaultBrandingByCategory[input.publishCategory] ||
      input.defaultBrandingByCategory[input.defaultCategory];
    const nextTemplatePreset: StoredCategoryTemplatePreset = {
      templateId: "default",
      templateData: createStudioTemplateData("default"),
      templateImageEnabled: false,
      templateImageUrl: "",
      templateImageLayout: input.defaultTemplateImageLayout,
      templateLayoutApply: input.defaultTemplateLayoutApply,
    };
    input.setBrandingDraft(nextBranding);
    input.setPresetBrandingOverride({
      category: input.publishCategory,
      branding: nextBranding,
    });
    input.setTemplateData(createStudioTemplateData("default"));
    input.setTemplateId("default");
    input.setTemplateImageEnabled(false);
    input.setTemplateImageUrl("");
    input.setTemplateImageLayout(input.defaultTemplateImageLayout);
    input.setTemplateLayoutApply(input.defaultTemplateLayoutApply);
    persistCurrentCategoryPreset(nextBranding, nextTemplatePreset, "현재 고객 브랜딩과 템플릿을 기본값으로 되돌렸습니다.");
    if (!input.hasRenderedVideo) return;
    input.markRenderedAssetAsDirty("고객 preset을 기본값으로 되돌렸습니다. 결과 영상을 다시 생성해 주세요.");
  }, [
    input.categoryBrandingMap,
    input.defaultBrandingByCategory,
    input.defaultCategory,
    input.defaultTemplateImageLayout,
    input.defaultTemplateLayoutApply,
    input.ensureEditPermission,
    input.hasRenderedVideo,
    input.markRenderedAssetAsDirty,
    input.publishCategory,
    input.setBrandingDraft,
    input.setPresetBrandingOverride,
    input.setTemplateData,
    input.setTemplateId,
    input.setTemplateImageEnabled,
    input.setTemplateImageLayout,
    input.setTemplateImageUrl,
    input.setTemplateLayoutApply,
    persistCurrentCategoryPreset,
  ]);

  const handleSaveCategoryBranding = useCallback(async () => {
    if (!input.ensureEditPermission()) return;
    input.setBrandingSaveBusy(true);
    try {
      const response = await fetch("/api/publish/category-branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: input.publishCategory,
          branding: selectedBranding,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        branding?: TemplateBranding;
        error?: string;
      };
      if (!response.ok || !data.ok || !data.branding) {
        throw new Error(data.error || "고객 브랜딩 저장에 실패했습니다.");
      }
      const nextBranding = data.branding;
      input.setBrandingDraft(nextBranding);
      input.setSavedBrandingSnapshotByCategory((prev) => ({
        ...prev,
        [input.publishCategory]: nextBranding,
      }));
      input.setPresetBrandingOverride({
        category: input.publishCategory,
        branding: nextBranding,
      });
      persistCurrentCategoryPreset(nextBranding, effectiveCategoryTemplatePreset, "고객 브랜딩을 저장했습니다.");
    } catch (error) {
      input.setBrandingStatus(error instanceof Error ? error.message : String(error));
    } finally {
      input.setBrandingSaveBusy(false);
    }
  }, [
    effectiveCategoryTemplatePreset,
    input.ensureEditPermission,
    input.publishCategory,
    input.setBrandingDraft,
    input.setBrandingSaveBusy,
    input.setBrandingStatus,
    input.setPresetBrandingOverride,
    input.setSavedBrandingSnapshotByCategory,
    persistCurrentCategoryPreset,
    selectedBranding,
  ]);

  const handleSaveTemplateNotes = useCallback(async () => {
    if (!input.ensureEditPermission()) return;
    input.setTemplateNotesSaveBusy(true);
    try {
      const response = await fetch("/api/publish/category-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: input.publishCategory,
          templateNotes: templateNotesDraft,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        metadata?: {
          templateNotes?: string;
        };
        error?: string;
      };
      if (!response.ok || !data.ok || !data.metadata) {
        throw new Error(data.error || "템플릿 메모 저장에 실패했습니다.");
      }
      const nextTemplateNotes = data.metadata.templateNotes || "";
      input.setTemplateNotesByCategory((prev) => mergeTemplateNotesByCategory(prev, input.publishCategory, nextTemplateNotes));
      input.setBrandingStatus("템플릿 메모를 저장했습니다.");
    } catch (error) {
      input.setBrandingStatus(error instanceof Error ? error.message : String(error));
    } finally {
      input.setTemplateNotesSaveBusy(false);
    }
  }, [
    input.ensureEditPermission,
    input.publishCategory,
    input.setBrandingStatus,
    input.setTemplateNotesByCategory,
    input.setTemplateNotesSaveBusy,
    templateNotesDraft,
  ]);

  return {
    hasStoredTemplatePreset,
    selectedBranding,
    templateNotesDraft,
    effectiveCategoryTemplatePreset,
    localPresetSummary,
    brandingDbDirty,
    handleOpenLayoutStudio,
    persistCurrentCategoryPreset,
    handleBrandingChange,
    handleTemplateNotesChange,
    handleTemplatePresetChange,
    handleTemplateImageFileChange,
    handleApplyTemplateLayoutJson,
    handleTemplateFontSizeChange,
    handleTemplateLayoutColorChange,
    handleTemplateRectFieldChange,
    handleTemplateRectFieldNudge,
    handleTemplateRectCommitAction,
    handleResetCurrentCategory,
    handleSaveCategoryBranding,
    handleSaveTemplateNotes,
    resetCurrentCategoryAudioPreset,
  };
}
