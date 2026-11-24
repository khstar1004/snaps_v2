"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StudioVoicePicker } from "@/components/studio-voice-picker";
import {
  addCategory as addCategoryApi,
  deleteCategory as deleteCategoryApi,
  fetchCategories,
  fetchCategoryMetadataMap,
  fetchPublishJobs,
  fetchStudioVoices,
  repairCategories as repairCategoriesApi,
  renameCategory as renameCategoryApi,
  resetCategoryMetadata,
  saveCategoryChannels,
  saveFixedCharacterProfiles,
  saveCategoryMetadata,
  type CategoryOption,
} from "@/lib/api/publish-settings-client";
import {
  DEFAULT_PUBLISH_BGM_VOLUME,
  DEFAULT_PUBLISH_PLAYBACK_RATE,
  normalizePublishBgmVolume,
  normalizePublishPlaybackRate,
  type PublishMetadata,
} from "@/lib/publish/category-metadata";
import { normalizePublishJobsResponse } from "@/lib/publish/client-normalize";
import type { PublishJobsResponse, WorkspacePermissionsSummary } from "@/lib/publish/client-types";
import { DEFAULT_PUBLISH_CATEGORY_OPTIONS, normalizeCategory } from "@/lib/publish/categories";
import { STUDIO_BGM_OPTIONS } from "@/lib/studio/audio-options";
import {
  areStudioCharacterProfilesEqual,
  hasStudioCharacterIdentity,
  normalizeStudioCharacterProfiles,
  resolveStudioFixedCharacterProfileRoster,
} from "@/lib/studio/character-profiles";
import {
  DEFAULT_STUDIO_AUDIO_MIX_PRESET_ID,
  STUDIO_AUDIO_MIX_PRESETS,
  normalizeStudioAudioMixPresetId,
} from "@/lib/studio/audio-mix-presets";
import {
  DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE,
  DEFAULT_TOPIC_TO_SCRIPT_PROMPT_TEMPLATE,
  STUDIO_PROMPT_TEMPLATE_TOKENS,
} from "@/lib/studio/prompt-templates";
import { buildStudioManualMascotBasePrompt } from "@/lib/studio/manual-image-prompt";
import { trackWorkflowEvent } from "@/lib/telemetry/client";
import { getChannelColor, hexToRgba, loadChannelColors, saveChannelColors } from "@/lib/ui/channel-colors";
import type { PublishCategory } from "@/lib/publish/types";
import {
  listStudioTemplateIds,
  normalizeStudioTemplateId,
  STUDIO_TEMPLATE_LABELS,
  type StudioTemplateId,
} from "@/types/studio-template";
import {
  canEditWorkspaceCategory,
  canManageWorkspaceSummary,
} from "@/lib/ui/workspace-permissions";
import { CONTENT_PROFILE_COPY } from "./content-profile-ui-copy";
import type { CharacterProfile } from "@/types/character-profile";

const DEFAULT_CATEGORY = DEFAULT_PUBLISH_CATEGORY_OPTIONS[0]?.key || "default";
const PROMPT_TEMPLATE_OPTIONS: Array<{ id: StudioTemplateId; label: string }> = listStudioTemplateIds().map((id) => ({
  id,
  label: STUDIO_TEMPLATE_LABELS[id],
}));

function createFixedCharacterProfile(rows: CharacterProfile[]): CharacterProfile {
  const usedIds = new Set(rows.map((row) => row.characterId));
  let index = 1;
  while (usedIds.has(`character_${index}`)) index += 1;
  return {
    characterId: `character_${index}`,
    displayName: `고정 캐릭터 ${index}`,
  };
}

export function ContentProfileSettingsManager() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [accounts, setAccounts] = useState<NonNullable<PublishJobsResponse["accounts"]>>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>(DEFAULT_PUBLISH_CATEGORY_OPTIONS);
  const [categoryChannels, setCategoryChannels] = useState<Partial<Record<PublishCategory, string>>>({});
  const [workspacePermissions, setWorkspacePermissions] = useState<WorkspacePermissionsSummary | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<PublishCategory>(DEFAULT_CATEGORY);
  const [promptTemplateId, setPromptTemplateId] = useState<StudioTemplateId>("default");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [categoryRenameDraft, setCategoryRenameDraft] = useState("");
  const [categoryMetadataMap, setCategoryMetadataMap] = useState<Record<PublishCategory, PublishMetadata>>({});
  const [defaultCategoryMetadataMap, setDefaultCategoryMetadataMap] = useState<Record<PublishCategory, PublishMetadata>>({});
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [tagsDraft, setTagsDraft] = useState("");
  const [voiceOptions, setVoiceOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [ttsVoiceIdDraft, setTtsVoiceIdDraft] = useState("");
  const [bgmEnabledDraft, setBgmEnabledDraft] = useState(true);
  const [bgmTrackIdDraft, setBgmTrackIdDraft] = useState(STUDIO_BGM_OPTIONS[0]?.id || "");
  const [mixPresetIdDraft, setMixPresetIdDraft] = useState<string>(DEFAULT_STUDIO_AUDIO_MIX_PRESET_ID);
  const [bgmVolumeDraft, setBgmVolumeDraft] = useState(DEFAULT_PUBLISH_BGM_VOLUME);
  const [playbackRateDraft, setPlaybackRateDraft] = useState(DEFAULT_PUBLISH_PLAYBACK_RATE);
  const [sfxEnabledDraft, setSfxEnabledDraft] = useState(true);
  const [sfxMasterGainDbDraft, setSfxMasterGainDbDraft] = useState(2);
  const [templateNotesDraft, setTemplateNotesDraft] = useState("");
  const [mascotPromptDraft, setMascotPromptDraft] = useState("");
  const [fixedCharacterProfilesDraft, setFixedCharacterProfilesDraft] = useState<CharacterProfile[]>([]);
  const [savedFixedCharacterProfiles, setSavedFixedCharacterProfiles] = useState<CharacterProfile[]>([]);
  const [fixedCharacterLegacyTemplateId, setFixedCharacterLegacyTemplateId] = useState<StudioTemplateId | null>(null);
  const [fixedCharacterSaving, setFixedCharacterSaving] = useState(false);
  const [fixedCharacterStatus, setFixedCharacterStatus] = useState("");
  const [topicToScriptPromptDraft, setTopicToScriptPromptDraft] = useState(DEFAULT_TOPIC_TO_SCRIPT_PROMPT_TEMPLATE);
  const [scriptToJsonPromptDraft, setScriptToJsonPromptDraft] = useState(DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE);
  const [channelColors, setChannelColors] = useState<Record<string, string>>({});
  const [presetDetailsOpen, setPresetDetailsOpen] = useState(false);
  const fixedCharacterSourceKeyRef = useRef("");
  const fixedCharacterSourceCategoryRef = useRef<PublishCategory | null>(null);

  const authUrl = useMemo(() => "/api/auth/youtube/start?redirect=/settings%3Ftab%3DcontentProfile", []);
  const canManageCurrentWorkspace = canManageWorkspaceSummary(workspacePermissions);
  const canEditSelectedCategory = canEditWorkspaceCategory(workspacePermissions, selectedCategory);
  const managePermissionMessage = canManageCurrentWorkspace
    ? ""
    : CONTENT_PROFILE_COPY.readOnlyMessage;
  const selectedCategoryPermissionMessage = canEditSelectedCategory
    ? ""
    : CONTENT_PROFILE_COPY.selectedReadOnlyMessage;

  useEffect(() => {
    trackWorkflowEvent({
      name: "page_view",
      page: "settings",
      stage: "settings",
      detail: "content_profile",
      status: "success",
    });
  }, []);

  useEffect(() => {
    if (categoryOptions.some((item) => item.key === selectedCategory)) return;
    setSelectedCategory(categoryOptions[0]?.key || DEFAULT_CATEGORY);
  }, [categoryOptions, selectedCategory]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const requestedCategory = normalizeCategory(new URLSearchParams(window.location.search).get("category"));
    if (!requestedCategory || !categoryOptions.some((item) => item.key === requestedCategory)) return;
    setSelectedCategory(requestedCategory);
  }, [categoryOptions]);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#fixed-character-profiles") return;
    setPresetDetailsOpen(true);
  }, []);

  useEffect(() => {
    if (!presetDetailsOpen || typeof window === "undefined" || window.location.hash !== "#fixed-character-profiles") return;
    document.getElementById("fixed-character-profiles")?.scrollIntoView({ block: "start" });
  }, [presetDetailsOpen, selectedCategory]);

  useEffect(() => {
    setCategoryRenameDraft(selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    const metadata = categoryMetadataMap[selectedCategory];
    if (!metadata) {
      setDescriptionDraft("");
      setTagsDraft("");
      setTtsVoiceIdDraft("");
      setBgmEnabledDraft(true);
      setBgmTrackIdDraft(STUDIO_BGM_OPTIONS[0]?.id || "");
      setMixPresetIdDraft(DEFAULT_STUDIO_AUDIO_MIX_PRESET_ID);
      setBgmVolumeDraft(DEFAULT_PUBLISH_BGM_VOLUME);
      setPlaybackRateDraft(DEFAULT_PUBLISH_PLAYBACK_RATE);
      setSfxEnabledDraft(true);
      setSfxMasterGainDbDraft(0);
      setTemplateNotesDraft("");
      setMascotPromptDraft("");
      setTopicToScriptPromptDraft(DEFAULT_TOPIC_TO_SCRIPT_PROMPT_TEMPLATE);
      setScriptToJsonPromptDraft(DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE);
      return;
    }
    setDescriptionDraft(metadata.description || "");
    setTagsDraft((metadata.tags || []).join(", "));
    setTtsVoiceIdDraft(metadata.ttsVoiceId || "");
    setBgmEnabledDraft(metadata.bgmEnabled !== false);
    setBgmTrackIdDraft(metadata.bgmTrackId || STUDIO_BGM_OPTIONS[0]?.id || "");
    setMixPresetIdDraft(normalizeStudioAudioMixPresetId(metadata.mixPresetId || DEFAULT_STUDIO_AUDIO_MIX_PRESET_ID));
    setBgmVolumeDraft(normalizePublishBgmVolume(metadata.bgmVolume));
    setPlaybackRateDraft(normalizePublishPlaybackRate(metadata.playbackRate));
    setSfxEnabledDraft(metadata.sfxEnabled !== false);
    setSfxMasterGainDbDraft(Number.isFinite(metadata.sfxMasterGainDb) ? metadata.sfxMasterGainDb : 2);
    setTemplateNotesDraft(metadata.templateNotes || "");
    setMascotPromptDraft(
      metadata.mascotPrompt ||
        (metadata.mascotName ||
        metadata.mascotDescription ||
        metadata.mascotStyle ||
        metadata.mascotTone ||
        metadata.mascotNegativePrompt ||
        metadata.mascotAnchorImageUrl ||
        metadata.mascotAnchorAssetId
          ? buildStudioManualMascotBasePrompt({
              publishCategory: selectedCategory,
              metadata,
            })
          : "")
    );
    setTopicToScriptPromptDraft(metadata.topicToScriptPrompt || DEFAULT_TOPIC_TO_SCRIPT_PROMPT_TEMPLATE);
    setScriptToJsonPromptDraft(metadata.scriptToJsonPrompt || DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE);
  }, [selectedCategory, categoryMetadataMap]);

  useEffect(() => {
    setChannelColors(loadChannelColors());
  }, []);

  useEffect(() => {
    saveChannelColors(channelColors);
  }, [channelColors]);

  const refresh = useCallback(async () => {
    const [jobsData, categoriesData, metadataData, defaultMetadataData, voicesData] = await Promise.all([
      fetchPublishJobs(),
      fetchCategories(),
      fetchCategoryMetadataMap({ templateId: promptTemplateId }),
      promptTemplateId === "default"
        ? Promise.resolve(null)
        : fetchCategoryMetadataMap({ templateId: "default" }),
      fetchStudioVoices(),
    ]);
    if (!categoriesData.categories) throw new Error("콘텐츠 프로필 목록 응답이 올바르지 않습니다.");
    if (!metadataData.categoryMetadata) throw new Error("콘텐츠 프로필 프리셋 응답이 올바르지 않습니다.");
    const defaultMetadataMap =
      promptTemplateId === "default"
        ? metadataData.categoryMetadata
        : defaultMetadataData?.categoryMetadata;
    if (!defaultMetadataMap) throw new Error("콘텐츠 프로필 공통 캐릭터 응답이 올바르지 않습니다.");
    const jobsSnapshot = normalizePublishJobsResponse(jobsData);
    setAccounts(jobsSnapshot.accounts);
    setCategoryChannels(jobsSnapshot.categoryChannels);
    setCategoryOptions(categoriesData.categories);
    setWorkspacePermissions(categoriesData.workspacePermissions || null);
    setCategoryMetadataMap(metadataData.categoryMetadata);
    setDefaultCategoryMetadataMap(defaultMetadataMap);
    setVoiceOptions(Array.isArray(voicesData.voices) ? voicesData.voices.filter((item) => item.id.trim()) : []);
  }, [promptTemplateId]);

  useEffect(() => {
    void refresh().catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
  }, [refresh]);

  const canonicalFixedCharacterProfiles = useMemo(
    () =>
      normalizeStudioCharacterProfiles(
        defaultCategoryMetadataMap[selectedCategory]?.fixedCharacterProfiles
      ),
    [defaultCategoryMetadataMap, selectedCategory]
  );
  const fixedCharacterRoster = useMemo(
    () =>
      resolveStudioFixedCharacterProfileRoster(
        canonicalFixedCharacterProfiles,
        promptTemplateId !== "default"
          ? categoryMetadataMap[selectedCategory]?.fixedCharacterProfiles
          : []
      ),
    [
      canonicalFixedCharacterProfiles,
      categoryMetadataMap,
      promptTemplateId,
      selectedCategory,
    ]
  );
  const fixedCharacterSourceProfiles = fixedCharacterRoster.profiles;
  const fixedCharacterSourceKey = `${selectedCategory}:${fixedCharacterRoster.source}:${JSON.stringify(fixedCharacterSourceProfiles)}`;
  const fixedCharacterProfilesDirty =
    !areStudioCharacterProfilesEqual(
      fixedCharacterProfilesDraft,
      savedFixedCharacterProfiles
    ) ||
    Boolean(fixedCharacterLegacyTemplateId);
  const invalidFixedCharacterProfileCount = fixedCharacterProfilesDraft.filter(
    (profile) => !hasStudioCharacterIdentity(profile)
  ).length;

  useEffect(() => {
    if (fixedCharacterSourceKeyRef.current === fixedCharacterSourceKey) return;
    const categoryChanged = fixedCharacterSourceCategoryRef.current !== selectedCategory;
    const draftWasClean = areStudioCharacterProfilesEqual(
      fixedCharacterProfilesDraft,
      savedFixedCharacterProfiles
    );
    if (!categoryChanged && !draftWasClean) {
      fixedCharacterSourceKeyRef.current = fixedCharacterSourceKey;
      fixedCharacterSourceCategoryRef.current = selectedCategory;
      return;
    }
    const nextProfiles = fixedCharacterSourceProfiles.map((profile) => ({ ...profile }));
    setSavedFixedCharacterProfiles(nextProfiles);
    setFixedCharacterProfilesDraft(nextProfiles);
    const legacyTemplateId =
      fixedCharacterRoster.source === "legacy" &&
      promptTemplateId !== "default"
        ? promptTemplateId
        : null;
    setFixedCharacterLegacyTemplateId(legacyTemplateId);
    if (legacyTemplateId) {
      setFixedCharacterStatus(
        "이 템플릿에 저장된 기존 캐릭터입니다. 저장하면 콘텐츠 프로필 공통 목록으로 이전됩니다."
      );
    } else if (categoryChanged) {
      setFixedCharacterStatus("");
    } else {
      setFixedCharacterStatus((current) =>
        current.startsWith("이 템플릿에 저장된 기존 캐릭터입니다.") ? "" : current
      );
    }
    fixedCharacterSourceKeyRef.current = fixedCharacterSourceKey;
    fixedCharacterSourceCategoryRef.current = selectedCategory;
  }, [
    fixedCharacterProfilesDraft,
    fixedCharacterRoster.source,
    fixedCharacterSourceKey,
    fixedCharacterSourceProfiles,
    promptTemplateId,
    savedFixedCharacterProfiles,
    selectedCategory,
  ]);

  const saveMappings = useCallback(async () => {
    if (!canManageCurrentWorkspace) {
      setMessage(managePermissionMessage);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const data = await saveCategoryChannels({ categoryChannels });
      setCategoryChannels(data.categoryChannels || {});
      setMessage("콘텐츠 프로필 기본 채널을 저장했습니다.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [canManageCurrentWorkspace, categoryChannels, managePermissionMessage]);

  const addCategory = useCallback(async () => {
    if (!canManageCurrentWorkspace) {
      setMessage(managePermissionMessage);
      return;
    }
    const safe = normalizeCategory(categoryDraft);
    if (!safe) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await addCategoryApi(safe);
      if (!data.categories) throw new Error("콘텐츠 프로필 추가 결과가 올바르지 않습니다.");
      setCategoryOptions(data.categories);
      setSelectedCategory(safe);
      setCategoryDraft("");
      setMessage(`콘텐츠 프로필을 추가했습니다: ${safe}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [canManageCurrentWorkspace, categoryDraft, managePermissionMessage]);

  const renameCategory = useCallback(async () => {
    if (!canManageCurrentWorkspace) {
      setMessage(managePermissionMessage);
      return;
    }
    const next = normalizeCategory(categoryRenameDraft);
    if (!next || next === selectedCategory) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await renameCategoryApi(selectedCategory, next);
      if (!data.categories) throw new Error("콘텐츠 프로필 이름 변경 결과가 올바르지 않습니다.");
      setCategoryOptions(data.categories);
      setCategoryChannels((prev) => {
        const nextMap = { ...prev };
        if (nextMap[selectedCategory]) {
          nextMap[next] = nextMap[selectedCategory];
          delete nextMap[selectedCategory];
        }
        return nextMap;
      });
      setSelectedCategory(next);
      setMessage(`콘텐츠 프로필 이름을 변경했습니다: ${selectedCategory} -> ${next}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [canManageCurrentWorkspace, categoryRenameDraft, managePermissionMessage, selectedCategory]);

  const deleteCategory = useCallback(async () => {
    if (!canManageCurrentWorkspace) {
      setMessage(managePermissionMessage);
      return;
    }
    if (selectedCategory === DEFAULT_CATEGORY) {
      setMessage(CONTENT_PROFILE_COPY.deleteDefaultTitle);
      return;
    }
    const ok = window.confirm(`콘텐츠 프로필 '${selectedCategory}'를 휴지통으로 이동할까요?\n휴지통에서 다시 복구할 수 있습니다.`);
    if (!ok) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await deleteCategoryApi(selectedCategory);
      if (!data.categories) throw new Error("콘텐츠 프로필 삭제 결과가 올바르지 않습니다.");
      setCategoryOptions(data.categories);
      setCategoryChannels((prev) => {
        const nextMap = { ...prev };
        delete nextMap[selectedCategory];
        return nextMap;
      });
      setSelectedCategory(data.categories[0]?.key || DEFAULT_CATEGORY);
      setMessage(`콘텐츠 프로필을 휴지통으로 이동했습니다: ${selectedCategory}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [canManageCurrentWorkspace, managePermissionMessage, selectedCategory]);

  const saveCategoryPreset = useCallback(async () => {
    if (!canEditSelectedCategory) {
      setMessage(selectedCategoryPermissionMessage);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const data = await saveCategoryMetadata({
        category: selectedCategory,
        templateId: promptTemplateId,
        description: descriptionDraft,
        tags: tagsDraft
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        ttsVoiceId: ttsVoiceIdDraft,
        bgmEnabled: bgmEnabledDraft,
        bgmTrackId: bgmTrackIdDraft,
        mixPresetId: mixPresetIdDraft,
        bgmVolume: normalizePublishBgmVolume(bgmVolumeDraft),
        playbackRate: normalizePublishPlaybackRate(playbackRateDraft),
        sfxEnabled: sfxEnabledDraft,
        sfxMasterGainDb: sfxMasterGainDbDraft,
        templateNotes: templateNotesDraft,
        mascotPrompt: mascotPromptDraft.trim() || undefined,
        mascotName: "",
        mascotDescription: "",
        mascotStyle: "",
        mascotTone: "",
        mascotNegativePrompt: "",
        mascotAnchorImageUrl: "",
        mascotAnchorAssetId: "",
        topicToScriptPrompt: topicToScriptPromptDraft,
        scriptToJsonPrompt: scriptToJsonPromptDraft,
      });
      if (!data.metadata) throw new Error("콘텐츠 프로필 프리셋 저장 결과가 올바르지 않습니다.");
      const nextMetadata = data.metadata;
      setCategoryMetadataMap((prev) => ({ ...prev, [selectedCategory]: nextMetadata }));
      setMessage(`콘텐츠 프로필 프리셋 저장 완료: ${selectedCategory} / ${promptTemplateId}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [
    selectedCategory,
    descriptionDraft,
    tagsDraft,
    ttsVoiceIdDraft,
    bgmEnabledDraft,
    bgmTrackIdDraft,
    mixPresetIdDraft,
    bgmVolumeDraft,
    playbackRateDraft,
    sfxEnabledDraft,
    sfxMasterGainDbDraft,
    templateNotesDraft,
    mascotPromptDraft,
    topicToScriptPromptDraft,
    scriptToJsonPromptDraft,
    promptTemplateId,
    canEditSelectedCategory,
    selectedCategoryPermissionMessage,
  ]);

  const saveFixedCharacters = useCallback(async () => {
    if (!canEditSelectedCategory) {
      setFixedCharacterStatus(selectedCategoryPermissionMessage);
      return;
    }
    if (invalidFixedCharacterProfileCount > 0) {
      setFixedCharacterStatus(
        `오류: ${invalidFixedCharacterProfileCount}명의 고정 캐릭터에 외형 설명 또는 기준 이미지가 필요합니다.`
      );
      return;
    }
    setFixedCharacterSaving(true);
    setFixedCharacterStatus("");
    try {
      const normalizedProfiles = normalizeStudioCharacterProfiles(fixedCharacterProfilesDraft);
      const data = await saveFixedCharacterProfiles({
        category: selectedCategory,
        templateId: "default",
        fixedCharacterProfiles: normalizedProfiles,
      });
      if (!data.metadata) throw new Error("고정 캐릭터 저장 결과가 올바르지 않습니다.");

      let legacyCleanupWarning = "";
      if (fixedCharacterLegacyTemplateId && fixedCharacterLegacyTemplateId !== "default") {
        try {
          const legacyData = await saveFixedCharacterProfiles({
            category: selectedCategory,
            templateId: fixedCharacterLegacyTemplateId,
            fixedCharacterProfiles: [],
          });
          if (legacyData.metadata) {
            setCategoryMetadataMap((current) => ({
              ...current,
              [selectedCategory]: legacyData.metadata as PublishMetadata,
            }));
          }
        } catch {
          legacyCleanupWarning = " 이전 템플릿의 중복 목록은 정리하지 못했습니다.";
        }
      }

      const savedProfiles = normalizeStudioCharacterProfiles(data.metadata.fixedCharacterProfiles);
      setDefaultCategoryMetadataMap((current) => ({
        ...current,
        [selectedCategory]: data.metadata as PublishMetadata,
      }));
      if (promptTemplateId === "default") {
        setCategoryMetadataMap((current) => ({
          ...current,
          [selectedCategory]: data.metadata as PublishMetadata,
        }));
      }
      setSavedFixedCharacterProfiles(savedProfiles);
      setFixedCharacterProfilesDraft(savedProfiles.map((profile) => ({ ...profile })));
      setFixedCharacterLegacyTemplateId(null);
      setFixedCharacterStatus(`고정 캐릭터 저장 완료.${legacyCleanupWarning}`);
    } catch (error) {
      setFixedCharacterStatus(`오류: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setFixedCharacterSaving(false);
    }
  }, [
    canEditSelectedCategory,
    fixedCharacterLegacyTemplateId,
    fixedCharacterProfilesDraft,
    invalidFixedCharacterProfileCount,
    promptTemplateId,
    selectedCategory,
    selectedCategoryPermissionMessage,
  ]);

  const repairCategories = useCallback(async () => {
    if (!canManageCurrentWorkspace) {
      setMessage(managePermissionMessage);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const data = await repairCategoriesApi();
      const repaired = data.repaired || { jobsUpdated: 0, assetsUpdated: 0 };
      await refresh();
      setMessage(`일괄 재분류 완료: 작업 ${repaired.jobsUpdated}건, 자산 ${repaired.assetsUpdated}건`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [canManageCurrentWorkspace, managePermissionMessage, refresh]);

  const resetCategoryPreset = useCallback(async () => {
    if (!canEditSelectedCategory) {
      setMessage(selectedCategoryPermissionMessage);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const data = await resetCategoryMetadata(selectedCategory, promptTemplateId);
      if (!data.metadata) throw new Error("콘텐츠 프로필 프리셋 초기화 결과가 올바르지 않습니다.");
      const nextMetadata = data.metadata;
      setCategoryMetadataMap((prev) => ({ ...prev, [selectedCategory]: nextMetadata }));
      setMessage(`콘텐츠 프로필 프리셋 초기화 완료: ${selectedCategory}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [promptTemplateId, selectedCategory, canEditSelectedCategory, selectedCategoryPermissionMessage]);

  return (
      <div className="page-stack-tight content-profile-settings-manager">
        <section className="card page-section-card">
          <div className="page-hero-head">
            <div className="page-hero-copy">
              <p className="page-hero-description">
                {CONTENT_PROFILE_COPY.pageDescription}
              </p>
            </div>
            <div className="page-hero-actions">
              <button className="btn-primary" onClick={() => void refresh()} disabled={loading}>
                새로고침
              </button>
            </div>
          </div>
          <div className="page-hero-stats">
            <span className="page-chip">연결 채널 <strong>{accounts.length}</strong></span>
            <span className="page-chip">{CONTENT_PROFILE_COPY.profileCountLabel} <strong>{categoryOptions.length}</strong></span>
          </div>
        </section>

        {message && <div className="page-inline-banner is-info">{message}</div>}
        {managePermissionMessage ? (
          <div className="page-inline-banner is-warning">
            {managePermissionMessage}
          </div>
        ) : null}
        {selectedCategoryPermissionMessage ? (
          <div className="page-inline-banner is-warning">
            {selectedCategoryPermissionMessage}
          </div>
        ) : null}

        <section className="card page-section-card">
          <h2 className="page-section-title">기본 설정</h2>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="input-field" placeholder={CONTENT_PROFILE_COPY.addPlaceholder} value={categoryDraft} onChange={(e) => setCategoryDraft(e.target.value)} disabled={!canManageCurrentWorkspace} />
            <button className="btn-primary" onClick={() => void addCategory()} disabled={loading || !canManageCurrentWorkspace}>
              {CONTENT_PROFILE_COPY.addButton}
            </button>
          </div>
          <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <label htmlFor="content-profile-manager-select" style={{ fontWeight: 600, fontSize: '0.875rem' }}>{CONTENT_PROFILE_COPY.selectLabel}</label>
            <select
              id="content-profile-manager-select"
              className="input-field"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(normalizeCategory(e.target.value) || DEFAULT_CATEGORY)}
            >
              {categoryOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
            <input className="input-field" placeholder={CONTENT_PROFILE_COPY.renamePlaceholder} value={categoryRenameDraft} onChange={(e) => setCategoryRenameDraft(e.target.value)} disabled={!canManageCurrentWorkspace} />
            <button className="btn-secondary" onClick={() => void renameCategory()} disabled={loading || !canManageCurrentWorkspace}>
              {CONTENT_PROFILE_COPY.renameButton}
            </button>
            <button className="btn-secondary" onClick={() => void repairCategories()} disabled={loading || !canManageCurrentWorkspace}>
              {CONTENT_PROFILE_COPY.repairButton}
            </button>
            <button
              className="btn-secondary"
              style={{ color: 'var(--error)', borderColor: 'var(--error)' }}
              onClick={() => void deleteCategory()}
              disabled={loading || !canManageCurrentWorkspace || selectedCategory === DEFAULT_CATEGORY}
              title={
                !canManageCurrentWorkspace
                  ? CONTENT_PROFILE_COPY.readOnlyMessage
                  : selectedCategory === DEFAULT_CATEGORY
                    ? CONTENT_PROFILE_COPY.deleteDefaultTitle
                    : CONTENT_PROFILE_COPY.deleteTitle
              }
            >
              {CONTENT_PROFILE_COPY.deleteButton}
            </button>
          </div>
          {selectedCategory === DEFAULT_CATEGORY ? (
            <p style={{ marginTop: 'var(--space-2)', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              {CONTENT_PROFILE_COPY.defaultProfileNote}
            </p>
          ) : null}
        </section>

        <section id="content-profile-prompt-settings" className="card page-section-card">
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{CONTENT_PROFILE_COPY.channelColorsSummary}</summary>
            <div style={{ marginTop: "var(--space-3)" }}>
          {accounts.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)' }}>{CONTENT_PROFILE_COPY.noConnectedChannels}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-3)' }}>
              {accounts.map((account) => {
                const color = getChannelColor(account.channelId, channelColors);
                return (
                  <article
                    key={`color-${account.channelId}`}
                    style={{
                      border: `1px solid ${hexToRgba(color, 0.4)}`,
                      background: hexToRgba(color, 0.08),
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                      <strong style={{ fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.channelTitle}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {account.channelId}
                      </span>
                    </div>
                    <input
                      type="color"
                      value={color}
                      onChange={(event) =>
                        setChannelColors((prev) => ({
                          ...prev,
                          [account.channelId]: event.target.value,
                        }))
                      }
                      aria-label={`${account.channelTitle} 색상`}
                      title={`${account.channelTitle} 색상`}
                      disabled={!canManageCurrentWorkspace}
                      style={{ width: 32, height: 28, border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer' }}
                    />
                  </article>
                );
              })}
            </div>
          )}
            </div>
          </details>
        </section>

        <section className="card page-section-card">
          <h2 className="page-section-title">{CONTENT_PROFILE_COPY.externalConnectionTitle}</h2>
          <p className="page-section-description">
            {CONTENT_PROFILE_COPY.externalConnectionDescription}
          </p>
          <div style={{ marginTop: 'var(--space-3)' }}>
            {canManageCurrentWorkspace ? (
              <a href={authUrl} className="btn-secondary">{CONTENT_PROFILE_COPY.connectYoutubeButton}</a>
            ) : (
              <button type="button" className="btn-secondary" disabled title={CONTENT_PROFILE_COPY.readOnlyMessage}>
                {CONTENT_PROFILE_COPY.connectYoutubeButton}
              </button>
            )}
          </div>
        </section>

        <section className="card page-section-card">
          <h2 className="page-section-title">{CONTENT_PROFILE_COPY.mappingTitle}</h2>
          <details style={{ background: 'var(--bg-app)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{CONTENT_PROFILE_COPY.mappingSummary}</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              {categoryOptions.map((item) => (
                <div key={item.key} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <label htmlFor={`content-profile-channel-mapping-${item.key}`} style={{ fontSize: '0.875rem', fontWeight: 500 }}>{item.label}</label>
                  <select
                    id={`content-profile-channel-mapping-${item.key}`}
                    className="input-field"
                    style={{ fontSize: '0.875rem' }}
                    value={categoryChannels[item.key] || ""}
                    disabled={!canManageCurrentWorkspace}
                    onChange={(e) =>
                      setCategoryChannels((prev) => ({
                        ...prev,
                        [item.key]: e.target.value,
                      }))
                    }
                  >
                    <option value="">(미설정)</option>
                    {accounts.map((acc) => (
                      <option key={`${item.key}-${acc.channelId}`} value={acc.channelId}>
                        {acc.channelTitle}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div style={{ marginTop: 'var(--space-2)' }}>
                <button className="btn-primary" onClick={() => void saveMappings()} disabled={loading || !canManageCurrentWorkspace}>
                  {CONTENT_PROFILE_COPY.mappingSaveButton}
                </button>
              </div>
            </div>
          </details>
        </section>

        <section className="card page-section-card">
          <details
            open={presetDetailsOpen}
            onToggle={(event) => setPresetDetailsOpen(event.currentTarget.open)}
          >
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{CONTENT_PROFILE_COPY.presetSummary}</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: "var(--space-3)" }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <label htmlFor="content-profile-preset-profile-select" style={{ fontWeight: 600, fontSize: '0.875rem' }}>{CONTENT_PROFILE_COPY.selectedProfilePresetLabel}</label>
              <select
                id="content-profile-preset-profile-select"
                className="input-field"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(normalizeCategory(e.target.value) || DEFAULT_CATEGORY)}
              >
                {categoryOptions.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <section id="fixed-character-profiles" className="page-mascot-settings-section">
              <div className="page-section-copy">
                <h3 className="page-section-title">AI 이미지 고정 캐릭터</h3>
                <p className="page-section-description">
                  수동·자동 AI 이미지에서 프로젝트 전체에 적용할 캐릭터 후보를 저장합니다. 제작 화면에서 한 명을 직접 선택합니다.
                </p>
              </div>
              <fieldset
                disabled={!canEditSelectedCategory || loading || fixedCharacterSaving}
                style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", border: 0, padding: 0, margin: 0 }}
              >
                {fixedCharacterProfilesDraft.map((profile, index) => (
                  <article
                    key={profile.characterId}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--space-2)",
                      padding: "var(--space-3)",
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      background: "var(--surface)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", alignItems: "center" }}>
                      <strong>{profile.displayName?.trim() || `고정 캐릭터 ${index + 1}`}</strong>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          setFixedCharacterProfilesDraft((current) =>
                            current.filter((item) => item.characterId !== profile.characterId)
                          )
                        }
                      >
                        삭제
                      </button>
                    </div>
                    <span className="page-field-help">고정 ID: {profile.characterId}</span>
                    <label className="page-field-stack">
                      <span className="page-field-label">이름</span>
                      <input
                        className="input-field"
                        value={profile.displayName || ""}
                        onChange={(event) =>
                          setFixedCharacterProfilesDraft((current) =>
                            current.map((item) =>
                              item.characterId === profile.characterId
                                ? { ...item, displayName: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </label>
                    <label className="page-field-stack">
                      <span className="page-field-label">고정 외형 설명</span>
                      <textarea
                        className="input-field page-mascot-textarea"
                        value={profile.identityPrompt || ""}
                        onChange={(event) =>
                          setFixedCharacterProfilesDraft((current) =>
                            current.map((item) =>
                              item.characterId === profile.characterId
                                ? { ...item, identityPrompt: event.target.value }
                                : item
                            )
                          )
                        }
                        placeholder="예: 짧은 검은 머리, 둥근 안경, 남색 재킷, 은색 손목시계"
                      />
                    </label>
                    <label className="page-field-stack">
                      <span className="page-field-label">기준 이미지 URL</span>
                      <input
                        className="input-field"
                        value={profile.anchorImageUrl || ""}
                        onChange={(event) =>
                          setFixedCharacterProfilesDraft((current) =>
                            current.map((item) =>
                              item.characterId === profile.characterId
                                ? { ...item, anchorImageUrl: event.target.value }
                                : item
                            )
                          )
                        }
                        placeholder="https://..."
                      />
                    </label>
                  </article>
                ))}
                {fixedCharacterProfilesDraft.length <= 0 ? (
                  <p className="page-field-help">
                    저장된 고정 캐릭터가 없습니다. 필요하면 추가한 뒤 제작 화면에서 사용할 한 명을 선택하세요.
                  </p>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setFixedCharacterProfilesDraft((current) => [...current, createFixedCharacterProfile(current)])
                    }
                  >
                    고정 캐릭터 추가
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void saveFixedCharacters()}
                    disabled={!fixedCharacterProfilesDirty || invalidFixedCharacterProfileCount > 0}
                  >
                    {fixedCharacterSaving ? "저장 중..." : "고정 캐릭터 저장"}
                  </button>
                </div>
                {invalidFixedCharacterProfileCount > 0 ? (
                  <p className="page-field-help" style={{ color: "var(--danger, #ef4444)" }}>
                    외형 설명 또는 기준 이미지가 없는 캐릭터가 {invalidFixedCharacterProfileCount}명 있습니다.
                  </p>
                ) : fixedCharacterProfilesDirty ? (
                  <p className="page-field-help">저장되지 않은 변경이 있습니다.</p>
                ) : null}
                {fixedCharacterStatus ? (
                  <p className="page-field-help" aria-live="polite">
                    {fixedCharacterStatus}
                  </p>
                ) : null}
              </fieldset>
            </section>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <label htmlFor="content-profile-prompt-template-select" style={{ fontWeight: 600, fontSize: '0.875rem' }}>프롬프트 템플릿</label>
              <select
                id="content-profile-prompt-template-select"
                className="input-field"
                value={promptTemplateId}
                onChange={(event) => setPromptTemplateId(normalizeStudioTemplateId(event.target.value))}
              >
                {PROMPT_TEMPLATE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                {CONTENT_PROFILE_COPY.promptTemplateHelp}
              </div>
            </div>
            <fieldset
              disabled={!canEditSelectedCategory || loading}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', border: 0, padding: 0, margin: 0 }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>기본 설명</label>
                <textarea className="input-field" style={{ minHeight: '100px' }} value={descriptionDraft} onChange={(e) => setDescriptionDraft(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>기본 태그(쉼표 구분)</label>
                <input className="input-field" value={tagsDraft} onChange={(e) => setTagsDraft(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>기본 TTS 보이스</label>
                <StudioVoicePicker
                  id="content-profile-tts-voice"
                  value={ttsVoiceIdDraft}
                  options={voiceOptions}
                  emptyLabel="기본 음성"
                  onChangeAction={setTtsVoiceIdDraft}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>기본 BGM</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: '0.875rem' }}>
                  <input type="checkbox" checked={bgmEnabledDraft} onChange={(e) => setBgmEnabledDraft(e.target.checked)} />
                  {CONTENT_PROFILE_COPY.bgmEnabledLabel}
                </label>
                <select
                  className="input-field"
                  value={bgmTrackIdDraft}
                  onChange={(e) => setBgmTrackIdDraft(e.target.value)}
                  disabled={!bgmEnabledDraft}
                >
                  {STUDIO_BGM_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                <label style={{ fontWeight: 600, fontSize: "0.875rem" }}>기본 믹스 프리셋</label>
                <select className="input-field" value={mixPresetIdDraft} onChange={(e) => setMixPresetIdDraft(normalizeStudioAudioMixPresetId(e.target.value))}>
                  {STUDIO_AUDIO_MIX_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <label style={{ fontWeight: 600, fontSize: "0.875rem" }}>기본 BGM 볼륨</label>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round(normalizePublishBgmVolume(bgmVolumeDraft) * 100)}
                    disabled={!bgmEnabledDraft}
                    onChange={(e) => setBgmVolumeDraft(normalizePublishBgmVolume(Number(e.target.value) / 100))}
                    aria-label="기본 BGM 볼륨"
                    style={{ flex: "1 1 220px" }}
                  />
                  <span style={{ minWidth: 48, fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                    {Math.round(normalizePublishBgmVolume(bgmVolumeDraft) * 100)}%
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                <label style={{ fontWeight: 600, fontSize: "0.875rem" }}>기본 제작 배속</label>
                <input
                  className="input-field"
                  type="number"
                  min="0.8"
                  max="3"
                  step="0.1"
                  value={normalizePublishPlaybackRate(playbackRateDraft)}
                  onChange={(e) => setPlaybackRateDraft(normalizePublishPlaybackRate(e.target.value))}
                  aria-label="기본 제작 배속"
                />
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                  새 작업의 나레이션 재생과 화면 타이밍에 적용됩니다. 영상별로는 스튜디오에서 임시 변경할 수 있습니다.
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <label style={{ fontWeight: 600, fontSize: "0.875rem" }}>기본 효과음(SFX)</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.875rem" }}>
                  <input type="checkbox" checked={sfxEnabledDraft} onChange={(e) => setSfxEnabledDraft(e.target.checked)} />
                  {CONTENT_PROFILE_COPY.sfxEnabledLabel}
                </label>
                <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                  SFX 마스터 게인 (dB)
                </label>
                <input
                  className="input-field"
                  type="number"
                  step="0.5"
                  min="-24"
                  max="12"
                  value={Number.isFinite(sfxMasterGainDbDraft) ? sfxMasterGainDbDraft : 2}
                  disabled={!sfxEnabledDraft}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (!Number.isFinite(next)) {
                      setSfxMasterGainDbDraft(0);
                      return;
                    }
                    setSfxMasterGainDbDraft(Math.max(-24, Math.min(12, next)));
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>템플릿 메모</label>
                <textarea
                  className="input-field"
                  style={{ minHeight: '140px' }}
                  value={templateNotesDraft}
                  onChange={(e) => setTemplateNotesDraft(e.target.value)}
                  placeholder={"예: 디딤 변호사\n- 차분하고 신뢰감 있는 톤 선호\n- 첫 멘트는 결론부터 시작\n- 과장 표현, 자극적 문구는 지양"}
                />
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  {CONTENT_PROFILE_COPY.templateNotesHelp}
                </div>
              </div>
              <section className="page-mascot-settings-section">
                <div className="page-section-copy">
                  <h3 className="page-section-title">AI 자동 생성 기본 스타일</h3>
                  <p className="page-section-description">
                    자동 생성 모드에서 사용할 기본 그림체와 톤입니다. 제작 화면에서 다른 스타일을 선택하면 해당 작업의 선택이 우선합니다.
                  </p>
                </div>
                <label className="page-field-stack">
                  <span className="page-field-label">스타일 기준 프롬프트</span>
                  <textarea
                    className="input-field page-mascot-textarea"
                    value={mascotPromptDraft}
                    onChange={(e) => setMascotPromptDraft(e.target.value)}
                    placeholder="예: clean editorial illustration, warm beige and mint palette, soft daylight, crisp linework"
                  />
                </label>
                <p className="page-field-help">
                  정사각형 1:1과 텍스트 금지는 생성 시스템이 항상 자동 적용합니다.
                </p>
              </section>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>대본 생성 프롬프트</label>
                <textarea
                  className="input-field"
                  style={{ minHeight: '200px' }}
                  value={topicToScriptPromptDraft}
                  onChange={(e) => setTopicToScriptPromptDraft(e.target.value)}
                />
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  사용 가능 토큰: {STUDIO_PROMPT_TEMPLATE_TOKENS.topicToScriptPrompt.join(", ")}. <code>{"{{topic}}"}</code>은 반드시 포함돼야 합니다.
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>스크립트 → JSON 프롬프트</label>
                <textarea
                  className="input-field"
                  style={{ minHeight: '220px' }}
                  value={scriptToJsonPromptDraft}
                  onChange={(e) => setScriptToJsonPromptDraft(e.target.value)}
                />
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  사용 가능 토큰: {STUDIO_PROMPT_TEMPLATE_TOKENS.scriptToJsonPrompt.join(", ")}. <code>{"{{script}}"}</code>는 반드시 포함돼야 합니다.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <button className="btn-primary" onClick={() => void saveCategoryPreset()} disabled={loading}>
                  프리셋 저장
                </button>
                <button className="btn-secondary" onClick={() => void resetCategoryPreset()} disabled={loading}>
                  기본값으로 초기화
                </button>
              </div>
            </fieldset>
            </div>
          </details>
        </section>

      </div>
  );
}
