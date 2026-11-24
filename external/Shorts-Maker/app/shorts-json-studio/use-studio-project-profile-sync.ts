"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { refreshStudioCategoryMetadata } from "@/lib/api/studio-client";
import { getPublishMetadata, type PublishMetadata } from "@/lib/publish/category-metadata";
import type { PublishCategory } from "@/lib/publish/types";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import type { PublishCategoryTemplatePreset } from "@/types/publish-template-preset";
import { createStudioTemplateData, normalizeStudioTemplateData } from "./components/templates/template-registry";
import {
  buildCurrentProjectPublishMetadata,
  diffPublishMetadataSettingGroups,
  mergeStudioProjectProfileSnapshotGroups,
  mergePublishMetadataSettingGroups,
  resolveStudioProjectProfileSyncInvalidation,
  resolveStudioProfileMetadataForComparison,
  STUDIO_PROFILE_METADATA_TEMPLATE_ID,
  type StudioProjectProfileSettingGroupId,
} from "./studio-project-profile-settings";
import { resolveStudioCategoryAudioSettings } from "./use-studio-category-preset-state";
import type {
  StudioTemplatePayload,
  TemplateImageLayout,
  TemplateLayoutApply,
} from "./types";
import { normalizeStudioTemplateId, type StudioTemplateId } from "./types";

type StudioProjectProfileSyncInput = {
  publishCategory: PublishCategory;
  profileLabel: string;
  projectProfileSnapshot: StudioProjectProfileSnapshot | null;
  categoryMetadataMap: Record<string, PublishMetadata>;
  selectedVoiceId: string;
  playbackRate: number;
  bgmEnabled: boolean;
  selectedBgmTrack: string;
  mixPresetId: string;
  bgmVolume: number;
  sfxEnabled: boolean;
  sfxMasterGainDb: number;
  effectiveTemplatePreset: PublishCategoryTemplatePreset;
  templateNotesDraft: string;
  imageStylePrompt: string;
  hasStructuredDraft: boolean;
  defaultTemplateImageLayout: TemplateImageLayout;
  defaultTemplateLayoutApply: TemplateLayoutApply;
  normalizeTemplateImageLayout: (input: unknown) => TemplateImageLayout;
  normalizeTemplateLayoutApply: (input: unknown) => TemplateLayoutApply;
  ensureEditPermission: (showAlert?: boolean) => boolean;
  markRenderedAssetAsDirty: (message: string) => void;
  onImageStylePromptChangeAction: (value: string) => void;
  onCategoryMetadataUpdatedAction: (category: PublishCategory, metadata: PublishMetadata) => void;
  setProjectProfileSnapshot: Dispatch<SetStateAction<StudioProjectProfileSnapshot | null>>;
  setSelectedVoiceId: Dispatch<SetStateAction<string>>;
  setPlaybackRate: Dispatch<SetStateAction<number>>;
  setBgmEnabled: Dispatch<SetStateAction<boolean>>;
  setSelectedBgmTrack: Dispatch<SetStateAction<string>>;
  setMixPresetId: Dispatch<SetStateAction<string>>;
  setBgmVolume: Dispatch<SetStateAction<number>>;
  setSfxEnabled: Dispatch<SetStateAction<boolean>>;
  setSfxMasterGainDb: Dispatch<SetStateAction<number>>;
  setTemplateId: Dispatch<SetStateAction<StudioTemplateId>>;
  setTemplateData: Dispatch<SetStateAction<StudioTemplatePayload>>;
  setTemplateImageEnabled: Dispatch<SetStateAction<boolean>>;
  setTemplateImageUrl: Dispatch<SetStateAction<string>>;
  setTemplateImageLayout: Dispatch<SetStateAction<TemplateImageLayout>>;
  setTemplateLayoutApply: Dispatch<SetStateAction<TemplateLayoutApply>>;
  setTemplateNotesByCategory: Dispatch<SetStateAction<Record<PublishCategory, string>>>;
  setImageApprovalFingerprint: Dispatch<SetStateAction<string>>;
};

type CategoryMetadataResponse = {
  ok?: boolean;
  metadata?: PublishMetadata;
  error?: string;
};

function cloneMetadata(metadata: PublishMetadata): PublishMetadata {
  if (typeof structuredClone === "function") return structuredClone(metadata);
  return JSON.parse(JSON.stringify(metadata)) as PublishMetadata;
}

function toProfileMetadataRequest(
  category: PublishCategory,
  templateId: StudioTemplateId,
  metadata: PublishMetadata
): Record<string, unknown> {
  return {
    category,
    templateId,
    ...cloneMetadata(metadata),
  };
}

export function useStudioProjectProfileSync(input: StudioProjectProfileSyncInput) {
  const [latestProfileMetadata, setLatestProfileMetadata] = useState<PublishMetadata>(() =>
    cloneMetadata(input.categoryMetadataMap[input.publishCategory] || getPublishMetadata(input.publishCategory))
  );
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    setLatestProfileMetadata(
      cloneMetadata(input.categoryMetadataMap[input.publishCategory] || getPublishMetadata(input.publishCategory))
    );
    setSyncMessage("");
  }, [input.categoryMetadataMap, input.publishCategory]);

  const currentProjectMetadata = useMemo(
    () =>
      buildCurrentProjectPublishMetadata({
        category: input.publishCategory,
        projectProfileSnapshot: input.projectProfileSnapshot,
        latestMetadata: latestProfileMetadata,
        selectedVoiceId: input.selectedVoiceId,
        playbackRate: input.playbackRate,
        bgmEnabled: input.bgmEnabled,
        selectedBgmTrack: input.selectedBgmTrack,
        mixPresetId: input.mixPresetId,
        bgmVolume: input.bgmVolume,
        sfxEnabled: input.sfxEnabled,
        sfxMasterGainDb: input.sfxMasterGainDb,
        effectiveTemplatePreset: input.effectiveTemplatePreset,
        templateNotesDraft: input.templateNotesDraft,
        imageStylePrompt: input.hasStructuredDraft ? input.imageStylePrompt : undefined,
      }),
    [
      input.bgmEnabled,
      input.bgmVolume,
      input.effectiveTemplatePreset,
      input.hasStructuredDraft,
      input.imageStylePrompt,
      input.mixPresetId,
      input.playbackRate,
      input.projectProfileSnapshot,
      input.publishCategory,
      input.selectedBgmTrack,
      input.selectedVoiceId,
      input.sfxEnabled,
      input.sfxMasterGainDb,
      input.templateNotesDraft,
      latestProfileMetadata,
    ]
  );

  const comparableProfileMetadata = useMemo<PublishMetadata>(() => {
    return resolveStudioProfileMetadataForComparison(
      latestProfileMetadata,
      {
        templateId: "default",
        templateData: createStudioTemplateData("default"),
        templateImageEnabled: false,
        templateImageUrl: "",
        templateImageLayout: input.normalizeTemplateImageLayout(input.defaultTemplateImageLayout),
        templateLayoutApply: input.normalizeTemplateLayoutApply(input.defaultTemplateLayoutApply),
      }
    );
  }, [
    input.defaultTemplateImageLayout,
    input.defaultTemplateLayoutApply,
    input.normalizeTemplateImageLayout,
    input.normalizeTemplateLayoutApply,
    latestProfileMetadata,
  ]);

  const changedGroupIds = useMemo(
    () =>
      diffPublishMetadataSettingGroups(
        comparableProfileMetadata,
        currentProjectMetadata,
        input.publishCategory
      ),
    [comparableProfileMetadata, currentProjectMetadata, input.publishCategory]
  );
  const hasProfileSnapshot =
    input.projectProfileSnapshot?.contentProfile.category === input.publishCategory;

  const refreshProfileMetadata = useCallback(async (): Promise<PublishMetadata> => {
    const data = await refreshStudioCategoryMetadata(
      input.publishCategory,
      STUDIO_PROFILE_METADATA_TEMPLATE_ID
    );
    if (!data.metadata) {
      throw new Error("콘텐츠 프로필 최신 기본값을 불러오지 못했습니다.");
    }
    const metadata = cloneMetadata(data.metadata);
    setLatestProfileMetadata(metadata);
    input.onCategoryMetadataUpdatedAction(input.publishCategory, metadata);
    return metadata;
  }, [input.onCategoryMetadataUpdatedAction, input.publishCategory]);

  const handleRefreshProfile = useCallback(async () => {
    setSyncBusy(true);
    setSyncMessage("");
    try {
      await refreshProfileMetadata();
      setSyncMessage("콘텐츠 프로필 최신 기본값을 확인했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSyncMessage(`오류: ${message}`);
      throw error;
    } finally {
      setSyncBusy(false);
    }
  }, [refreshProfileMetadata]);

  const applyAudioGroups = useCallback(
    (metadata: PublishMetadata, groupIds: readonly StudioProjectProfileSettingGroupId[]) => {
      const selected = new Set(groupIds);
      const audio = resolveStudioCategoryAudioSettings(metadata);
      if (selected.has("voicePlayback")) {
        input.setSelectedVoiceId(audio.selectedVoiceId);
        input.setPlaybackRate(audio.playbackRate);
      }
      if (selected.has("bgm")) {
        input.setBgmEnabled(audio.bgmEnabled);
        input.setSelectedBgmTrack(audio.selectedBgmTrack);
        input.setMixPresetId(audio.mixPresetId);
        input.setBgmVolume(audio.bgmVolume);
      }
      if (selected.has("sfx")) {
        input.setSfxEnabled(audio.sfxEnabled);
        input.setSfxMasterGainDb(audio.sfxMasterGainDb);
      }
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

  const applyTemplateGroup = useCallback(
    (metadata: PublishMetadata, groupIds: readonly StudioProjectProfileSettingGroupId[]) => {
      if (!groupIds.includes("template")) return;
      const preset = metadata.templatePreset;
      if (!preset) {
        input.setTemplateId("default");
        input.setTemplateData(createStudioTemplateData("default"));
        input.setTemplateImageEnabled(false);
        input.setTemplateImageUrl("");
        input.setTemplateImageLayout(input.normalizeTemplateImageLayout(input.defaultTemplateImageLayout));
        input.setTemplateLayoutApply(input.normalizeTemplateLayoutApply(input.defaultTemplateLayoutApply));
      } else {
        const templateId = normalizeStudioTemplateId(preset.templateId);
        input.setTemplateId(templateId);
        input.setTemplateData(normalizeStudioTemplateData(templateId, preset.templateData));
        input.setTemplateImageEnabled(Boolean(preset.templateImageEnabled));
        input.setTemplateImageUrl(preset.templateImageUrl || "");
        input.setTemplateImageLayout(input.normalizeTemplateImageLayout(preset.templateImageLayout));
        input.setTemplateLayoutApply(input.normalizeTemplateLayoutApply(preset.templateLayoutApply));
      }
      input.setTemplateNotesByCategory((prev) => ({
        ...prev,
        [input.publishCategory]: metadata.templateNotes || "",
      }));
    },
    [
      input.defaultTemplateImageLayout,
      input.defaultTemplateLayoutApply,
      input.normalizeTemplateImageLayout,
      input.normalizeTemplateLayoutApply,
      input.publishCategory,
      input.setTemplateData,
      input.setTemplateId,
      input.setTemplateImageEnabled,
      input.setTemplateImageLayout,
      input.setTemplateImageUrl,
      input.setTemplateLayoutApply,
      input.setTemplateNotesByCategory,
    ]
  );

  const updateProjectSnapshot = useCallback(
    (
      source: PublishMetadata,
      groupIds: readonly StudioProjectProfileSettingGroupId[]
    ) => {
      input.setProjectProfileSnapshot((current) => {
        if (!current) return current;
        return mergeStudioProjectProfileSnapshotGroups({
          snapshot: current,
          category: input.publishCategory,
          source,
          groups: groupIds,
          profileLabel: input.profileLabel,
        });
      });
    },
    [input.profileLabel, input.publishCategory, input.setProjectProfileSnapshot]
  );

  const handleApplyProfileGroups = useCallback(
    async (groupIds: readonly StudioProjectProfileSettingGroupId[]) => {
      if (!input.ensureEditPermission() || !input.projectProfileSnapshot || groupIds.length === 0) return;
      setSyncBusy(true);
      setSyncMessage("");
      try {
        const latest = await refreshProfileMetadata();
        const nextProjectMetadata = mergePublishMetadataSettingGroups({
          category: input.publishCategory,
          base: currentProjectMetadata,
          source: latest,
          groups: groupIds,
        });
        applyAudioGroups(nextProjectMetadata, groupIds);
        applyTemplateGroup(nextProjectMetadata, groupIds);
        const invalidation = resolveStudioProjectProfileSyncInvalidation(groupIds);
        if (groupIds.includes("imageStyle")) {
          input.onImageStylePromptChangeAction(nextProjectMetadata.mascotPrompt || nextProjectMetadata.mascotStyle || "");
        }
        if (invalidation.imageApproval) input.setImageApprovalFingerprint("");
        updateProjectSnapshot(latest, groupIds);
        if (invalidation.renderedAsset) {
          input.markRenderedAssetAsDirty("콘텐츠 프로필 기본값을 선택 적용했습니다. 영향받는 결과물을 다시 확인해 주세요.");
        }
        setSyncMessage(`선택한 ${groupIds.length}개 기본값 그룹을 현재 프로젝트에 적용했습니다.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setSyncMessage(`오류: ${message}`);
        throw error;
      } finally {
        setSyncBusy(false);
      }
    },
    [
      applyAudioGroups,
      applyTemplateGroup,
      currentProjectMetadata,
      input.ensureEditPermission,
      input.markRenderedAssetAsDirty,
      input.onImageStylePromptChangeAction,
      input.projectProfileSnapshot,
      input.publishCategory,
      input.setImageApprovalFingerprint,
      refreshProfileMetadata,
      updateProjectSnapshot,
    ]
  );

  const handleSaveProjectGroups = useCallback(
    async (groupIds: readonly StudioProjectProfileSettingGroupId[]) => {
      if (!input.ensureEditPermission() || !input.projectProfileSnapshot || groupIds.length === 0) return;
      setSyncBusy(true);
      setSyncMessage("");
      try {
        const latest = await refreshProfileMetadata();
        const nextProfileMetadata = mergePublishMetadataSettingGroups({
          category: input.publishCategory,
          base: latest,
          source: currentProjectMetadata,
          groups: groupIds,
        });
        const response = await fetch("/api/publish/category-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            toProfileMetadataRequest(
              input.publishCategory,
              STUDIO_PROFILE_METADATA_TEMPLATE_ID,
              nextProfileMetadata
            )
          ),
        });
        const data = (await response.json()) as CategoryMetadataResponse;
        if (!response.ok || !data.ok || !data.metadata) {
          throw new Error(data.error || "현재 프로젝트 값을 콘텐츠 프로필 기본값으로 저장하지 못했습니다.");
        }
        const savedMetadata = cloneMetadata(data.metadata);
        setLatestProfileMetadata(savedMetadata);
        input.onCategoryMetadataUpdatedAction(input.publishCategory, savedMetadata);
        updateProjectSnapshot(savedMetadata, groupIds);
        setSyncMessage(`선택한 ${groupIds.length}개 프로젝트 값 그룹을 콘텐츠 프로필 기본값으로 저장했습니다.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setSyncMessage(`오류: ${message}`);
        throw error;
      } finally {
        setSyncBusy(false);
      }
    },
    [
      currentProjectMetadata,
      input.ensureEditPermission,
      input.onCategoryMetadataUpdatedAction,
      input.projectProfileSnapshot,
      input.publishCategory,
      refreshProfileMetadata,
      updateProjectSnapshot,
    ]
  );

  return {
    hasProfileSnapshot,
    latestProfileMetadata,
    currentProjectMetadata,
    profileToProjectGroupIds: hasProfileSnapshot ? changedGroupIds : [],
    projectToProfileGroupIds: hasProfileSnapshot ? changedGroupIds : [],
    syncBusy,
    syncMessage,
    handleRefreshProfile,
    handleApplyProfileGroups,
    handleSaveProjectGroups,
  };
}
