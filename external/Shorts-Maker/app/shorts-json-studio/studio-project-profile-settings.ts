import {
  getPublishMetadata,
  type PublishMetadata,
} from "@/lib/publish/category-metadata";
import type { PublishCategory } from "@/lib/publish/types";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import type { PublishCategoryTemplatePreset } from "@/types/publish-template-preset";
import type { StudioTemplateId, StudioTemplatePayload } from "./types";

export const STUDIO_PROFILE_METADATA_TEMPLATE_ID: StudioTemplateId = "default";

export const STUDIO_PROJECT_PROFILE_SETTING_GROUP_IDS = [
  "voicePlayback",
  "bgm",
  "sfx",
  "template",
  "imageStyle",
  "publishing",
] as const;

export type StudioProjectProfileSettingGroupId = (typeof STUDIO_PROJECT_PROFILE_SETTING_GROUP_IDS)[number];

export type StudioProjectProfileSettingGroupMeta = {
  label: string;
  description: string;
  impact: string;
};

export const STUDIO_PROJECT_PROFILE_SETTING_GROUP_META: Record<
  StudioProjectProfileSettingGroupId,
  StudioProjectProfileSettingGroupMeta
> = {
  voicePlayback: {
    label: "음성·배속",
    description: "기본 나레이션 보이스와 전체 재생 배속입니다.",
    impact: "음성 승인을 다시 확인하고 결과 영상을 다시 생성해야 합니다.",
  },
  bgm: {
    label: "BGM",
    description: "BGM 사용 여부, 트랙, 믹스 프리셋과 볼륨입니다.",
    impact: "오디오 믹스가 바뀌므로 결과 영상을 다시 생성해야 합니다.",
  },
  sfx: {
    label: "효과음",
    description: "효과음 사용 여부와 전체 음량입니다.",
    impact: "효과음 믹스가 바뀌므로 결과 영상을 다시 생성해야 합니다.",
  },
  template: {
    label: "템플릿",
    description: "템플릿, 레이아웃, 이미지 슬롯과 운영 메모입니다.",
    impact: "화면 구성이 바뀌므로 결과 영상을 다시 생성해야 합니다.",
  },
  imageStyle: {
    label: "이미지 스타일",
    description: "이미지·캐릭터 외형을 유지하는 기준 프롬프트입니다.",
    impact: "이미지 기준이 바뀌므로 관련 이미지 승인을 다시 확인해야 합니다.",
  },
  publishing: {
    label: "운영·발행 정보",
    description: "설명, 태그, 대본·JSON 생성 프롬프트입니다.",
    impact: "다음 생성 요청과 발행 기본 정보에 적용됩니다.",
  },
};

export const STUDIO_PROJECT_PROFILE_SETTING_GROUPS: Array<
  { id: StudioProjectProfileSettingGroupId } & StudioProjectProfileSettingGroupMeta
> = STUDIO_PROJECT_PROFILE_SETTING_GROUP_IDS.map((id) => ({
  id,
  ...STUDIO_PROJECT_PROFILE_SETTING_GROUP_META[id],
}));

const GROUP_KEYS: Record<StudioProjectProfileSettingGroupId, Array<keyof PublishMetadata>> = {
  voicePlayback: ["ttsVoiceId", "playbackRate"],
  bgm: ["bgmEnabled", "bgmTrackId", "mixPresetId", "bgmVolume"],
  sfx: ["sfxEnabled", "sfxMasterGainDb"],
  template: ["templatePreset", "templateNotes"],
  imageStyle: [
    "mascotPrompt",
    "mascotName",
    "mascotDescription",
    "mascotStyle",
    "mascotTone",
    "mascotNegativePrompt",
    "mascotAnchorImageUrl",
    "mascotAnchorAssetId",
  ],
  publishing: ["description", "tags", "topicToScriptPrompt", "scriptToJsonPrompt"],
};

type EffectiveTemplatePresetLike = {
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageUrl: string;
  templateImageLayout: PublishCategoryTemplatePreset["templateImageLayout"];
  templateLayoutApply: PublishCategoryTemplatePreset["templateLayoutApply"];
  templateLayoutJson?: string;
};

export type BuildCurrentProjectPublishMetadataInput = {
  category: PublishCategory;
  baseMetadata?: PublishMetadata | null;
  projectProfileSnapshot?: StudioProjectProfileSnapshot | null;
  latestMetadata?: PublishMetadata | null;
  selectedVoiceId?: string;
  playbackRate?: number;
  bgmEnabled?: boolean;
  selectedBgmTrack?: string;
  bgmTrackId?: string;
  mixPresetId?: string;
  bgmVolume?: number;
  sfxEnabled?: boolean;
  sfxMasterGainDb?: number;
  effectiveTemplatePreset?: EffectiveTemplatePresetLike | PublishCategoryTemplatePreset | null;
  templateNotes?: string;
  templateNotesDraft?: string;
  imageStylePrompt?: string;
};

function cloneJsonValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function hasOwnKey<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function areStudioProjectProfileSettingsEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

export function diffPublishMetadataSettingGroups(
  left: PublishMetadata | null | undefined,
  right: PublishMetadata | null | undefined,
  category: PublishCategory
): StudioProjectProfileSettingGroupId[] {
  const resolvedLeft = cloneJsonValue(left || getPublishMetadata(category));
  const resolvedRight = cloneJsonValue(right || getPublishMetadata(category));
  return STUDIO_PROJECT_PROFILE_SETTING_GROUP_IDS.filter((groupId) =>
    GROUP_KEYS[groupId].some((key) => !areStudioProjectProfileSettingsEqual(resolvedLeft[key], resolvedRight[key]))
  );
}

export function resolveStudioProfileMetadataForComparison(
  metadata: PublishMetadata,
  implicitTemplatePreset: PublishCategoryTemplatePreset
): PublishMetadata {
  if (metadata.templatePreset) return cloneJsonValue(metadata);
  return {
    ...cloneJsonValue(metadata),
    templatePreset: cloneJsonValue(implicitTemplatePreset),
  };
}

export function mergePublishMetadataSettingGroups(input: {
  category: PublishCategory;
  base: PublishMetadata | null | undefined;
  source: PublishMetadata | null | undefined;
  groups: readonly StudioProjectProfileSettingGroupId[];
}): PublishMetadata {
  const base = cloneJsonValue(input.base || getPublishMetadata(input.category));
  const source = cloneJsonValue(input.source || getPublishMetadata(input.category));
  const selectedGroups = new Set<StudioProjectProfileSettingGroupId>(input.groups);

  for (const groupId of STUDIO_PROJECT_PROFILE_SETTING_GROUP_IDS) {
    if (!selectedGroups.has(groupId)) continue;
    for (const key of GROUP_KEYS[groupId]) {
      if (hasOwnKey(source, key)) {
        (base as Record<keyof PublishMetadata, PublishMetadata[keyof PublishMetadata]>)[key] = source[key];
      } else {
        delete (base as Record<keyof PublishMetadata, PublishMetadata[keyof PublishMetadata]>)[key];
      }
    }
  }

  return base;
}

export function resolveStudioProjectProfileSyncInvalidation(
  groups: readonly StudioProjectProfileSettingGroupId[]
): {
  imageApproval: boolean;
  renderedAsset: boolean;
} {
  const selectedGroups = new Set(groups);
  return {
    imageApproval: selectedGroups.has("imageStyle"),
    renderedAsset: groups.some((groupId) => groupId !== "publishing"),
  };
}

export function mergeStudioProjectProfileSnapshotGroups(input: {
  snapshot: StudioProjectProfileSnapshot;
  category: PublishCategory;
  source: PublishMetadata;
  groups: readonly StudioProjectProfileSettingGroupId[];
  profileLabel?: string;
}): StudioProjectProfileSnapshot {
  if (input.snapshot.contentProfile.category !== input.category) return input.snapshot;
  return {
    ...input.snapshot,
    contentProfile: {
      ...input.snapshot.contentProfile,
      label: input.profileLabel?.trim() || input.snapshot.contentProfile.label,
      metadataSnapshot: mergePublishMetadataSettingGroups({
        category: input.category,
        base: input.snapshot.contentProfile.metadataSnapshot,
        source: input.source,
        groups: input.groups,
      }),
    },
  };
}

function resolveCurrentProjectMetadataBase(input: BuildCurrentProjectPublishMetadataInput): PublishMetadata {
  return cloneJsonValue(
    input.baseMetadata ||
      input.projectProfileSnapshot?.contentProfile.metadataSnapshot ||
      input.latestMetadata ||
      getPublishMetadata(input.category)
  );
}

function toPublishTemplatePreset(
  preset: EffectiveTemplatePresetLike | PublishCategoryTemplatePreset | null | undefined
): PublishCategoryTemplatePreset | null {
  if (!preset) return null;
  const cloned = cloneJsonValue(preset);
  return {
    templateId: cloned.templateId,
    templateData: cloned.templateData,
    templateImageEnabled: cloned.templateImageEnabled,
    templateImageUrl: cloned.templateImageUrl,
    templateImageLayout: cloned.templateImageLayout,
    templateLayoutApply: cloned.templateLayoutApply,
    ...(typeof cloned.templateLayoutJson === "string" ? { templateLayoutJson: cloned.templateLayoutJson } : {}),
  };
}

export function buildCurrentProjectPublishMetadata(
  input: BuildCurrentProjectPublishMetadataInput
): PublishMetadata {
  const metadata = resolveCurrentProjectMetadataBase(input);

  if (typeof input.selectedVoiceId === "string") metadata.ttsVoiceId = input.selectedVoiceId;
  if (typeof input.playbackRate === "number" && Number.isFinite(input.playbackRate)) metadata.playbackRate = input.playbackRate;
  if (typeof input.bgmEnabled === "boolean") metadata.bgmEnabled = input.bgmEnabled;
  if (typeof input.bgmTrackId === "string") metadata.bgmTrackId = input.bgmTrackId;
  if (typeof input.selectedBgmTrack === "string") metadata.bgmTrackId = input.selectedBgmTrack;
  if (typeof input.mixPresetId === "string") metadata.mixPresetId = input.mixPresetId;
  if (typeof input.bgmVolume === "number" && Number.isFinite(input.bgmVolume)) metadata.bgmVolume = input.bgmVolume;
  if (typeof input.sfxEnabled === "boolean") metadata.sfxEnabled = input.sfxEnabled;
  if (typeof input.sfxMasterGainDb === "number" && Number.isFinite(input.sfxMasterGainDb)) {
    metadata.sfxMasterGainDb = input.sfxMasterGainDb;
  }
  if ("effectiveTemplatePreset" in input) metadata.templatePreset = toPublishTemplatePreset(input.effectiveTemplatePreset);
  if (typeof input.templateNotesDraft === "string") metadata.templateNotes = input.templateNotesDraft;
  if (typeof input.templateNotes === "string") metadata.templateNotes = input.templateNotes;
  if (typeof input.imageStylePrompt === "string") {
    const imageStylePrompt = input.imageStylePrompt.trim();
    if (imageStylePrompt) metadata.mascotPrompt = imageStylePrompt;
    else delete metadata.mascotPrompt;
  }

  return cloneJsonValue(metadata);
}
