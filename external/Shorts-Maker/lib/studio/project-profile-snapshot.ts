import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { PublishCategory } from "@/lib/publish/types";
import { normalizeStudioTemplateId } from "@/types/studio-template";
import type { PublishCategoryTemplatePreset } from "@/types/publish-template-preset";
import { normalizeStudioCharacterProfiles } from "@/lib/studio/character-profiles";

export type StudioProjectProfileSnapshot = {
  version: 1;
  projectId: string;
  createdAt: string;
  contentProfile: {
    category: PublishCategory;
    label: string;
    metadataSnapshot: PublishMetadata | null;
  };
};

type ProjectContextLike = {
  projectId?: unknown;
  createdAt?: unknown;
  contentProfile?: {
    category?: unknown;
    label?: unknown;
    metadataSnapshot?: unknown;
  } | null;
};

const MAX_CATEGORY_LENGTH = 120;
const MAX_LABEL_LENGTH = 160;
const MAX_ID_LENGTH = 240;
const MAX_URL_LENGTH = 2_000;
const MAX_SHORT_TEXT_LENGTH = 1_000;
const MAX_PROMPT_LENGTH = 20_000;
const MAX_DESCRIPTION_LENGTH = 5_000;
const MAX_TAGS = 32;
const MAX_TAG_LENGTH = 80;
const MAX_TEMPLATE_JSON_DEPTH = 8;
const MAX_TEMPLATE_JSON_KEYS = 80;
const MAX_TEMPLATE_JSON_ARRAY_LENGTH = 80;
const MAX_TEMPLATE_JSON_STRING_LENGTH = 4_000;
const MAX_TEMPLATE_JSON_NODES = 600;
const DANGEROUS_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function compactString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function trimString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cloneJsonValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function boundedJsonClone(value: unknown): unknown {
  let nodeCount = 0;
  const visit = (item: unknown, depth: number): unknown => {
    nodeCount += 1;
    if (nodeCount > MAX_TEMPLATE_JSON_NODES) return undefined;
    if (depth > MAX_TEMPLATE_JSON_DEPTH) return undefined;
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number") return Number.isFinite(item) ? item : undefined;
    if (typeof item === "string") return item.slice(0, MAX_TEMPLATE_JSON_STRING_LENGTH);
    if (Array.isArray(item)) {
      const next = item.slice(0, MAX_TEMPLATE_JSON_ARRAY_LENGTH).map((entry) => visit(entry, depth + 1));
      return next.filter((entry) => typeof entry !== "undefined");
    }
    const record = asRecord(item);
    if (!record) return undefined;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, entry] of Object.entries(record).slice(0, MAX_TEMPLATE_JSON_KEYS)) {
      const safeKey = trimString(key, MAX_ID_LENGTH);
      if (DANGEROUS_JSON_KEYS.has(safeKey)) continue;
      if (!safeKey) continue;
      const next = visit(entry, depth + 1);
      if (typeof next !== "undefined") result[safeKey] = next;
    }
    return result;
  };
  return visit(value, 0);
}

function parseTemplatePreset(value: unknown): PublishCategoryTemplatePreset | null {
  const record = asRecord(value);
  if (!record) return null;
  const templateData = boundedJsonClone(record.templateData);
  const templateImageLayout = boundedJsonClone(record.templateImageLayout);
  const templateLayoutApplyRecord = asRecord(record.templateLayoutApply);
  if (!asRecord(templateData) || !asRecord(templateImageLayout) || !templateLayoutApplyRecord) return null;
  return {
    templateId: normalizeStudioTemplateId(record.templateId),
    templateData: templateData as PublishCategoryTemplatePreset["templateData"],
    templateImageEnabled: record.templateImageEnabled === true,
    templateImageUrl: trimString(record.templateImageUrl, MAX_URL_LENGTH),
    templateImageLayout: templateImageLayout as PublishCategoryTemplatePreset["templateImageLayout"],
    templateLayoutApply: {
      title: templateLayoutApplyRecord.title === true,
      body: templateLayoutApplyRecord.body === true,
      image: templateLayoutApplyRecord.image === true,
      info: templateLayoutApplyRecord.info === true,
    },
  };
}

function parseMetadataSnapshot(value: unknown): PublishMetadata | null {
  const record = asRecord(value);
  if (!record) return null;
  const metadata: PublishMetadata = {
    description: trimString(record.description, MAX_DESCRIPTION_LENGTH),
    tags: Array.isArray(record.tags)
      ? record.tags
          .map((tag) => compactString(tag, MAX_TAG_LENGTH))
          .filter(Boolean)
          .slice(0, MAX_TAGS)
      : [],
    ttsVoiceId: trimString(record.ttsVoiceId, MAX_ID_LENGTH),
    bgmEnabled: record.bgmEnabled === true,
    bgmTrackId: trimString(record.bgmTrackId, MAX_ID_LENGTH),
    mixPresetId: trimString(record.mixPresetId, MAX_ID_LENGTH),
    sfxEnabled: record.sfxEnabled === true,
    sfxMasterGainDb: finiteNumber(record.sfxMasterGainDb) ?? 0,
    templateNotes: trimString(record.templateNotes, MAX_SHORT_TEXT_LENGTH),
    topicToScriptPrompt: trimString(record.topicToScriptPrompt, MAX_PROMPT_LENGTH),
    scriptToJsonPrompt: trimString(record.scriptToJsonPrompt, MAX_PROMPT_LENGTH),
  };
  const bgmVolume = finiteNumber(record.bgmVolume);
  const playbackRate = finiteNumber(record.playbackRate);
  if (typeof bgmVolume !== "undefined") metadata.bgmVolume = bgmVolume;
  if (typeof playbackRate !== "undefined") metadata.playbackRate = playbackRate;
  if (Object.prototype.hasOwnProperty.call(record, "templatePreset") && record.templatePreset === null) {
    metadata.templatePreset = null;
  } else {
    const templatePreset = parseTemplatePreset(record.templatePreset);
    if (templatePreset) metadata.templatePreset = templatePreset;
  }

  const mascotPrompt = trimString(record.mascotPrompt, MAX_PROMPT_LENGTH);
  const mascotName = compactString(record.mascotName, MAX_SHORT_TEXT_LENGTH);
  const mascotDescription = trimString(record.mascotDescription, MAX_PROMPT_LENGTH);
  const mascotStyle = trimString(record.mascotStyle, MAX_PROMPT_LENGTH);
  const mascotTone = trimString(record.mascotTone, MAX_PROMPT_LENGTH);
  const mascotNegativePrompt = trimString(record.mascotNegativePrompt, MAX_PROMPT_LENGTH);
  const mascotAnchorImageUrl = trimString(record.mascotAnchorImageUrl, MAX_URL_LENGTH);
  const mascotAnchorAssetId = trimString(record.mascotAnchorAssetId, MAX_ID_LENGTH);
  const fixedCharacterProfiles = normalizeStudioCharacterProfiles(record.fixedCharacterProfiles);
  if (mascotPrompt) metadata.mascotPrompt = mascotPrompt;
  if (mascotName) metadata.mascotName = mascotName;
  if (mascotDescription) metadata.mascotDescription = mascotDescription;
  if (mascotStyle) metadata.mascotStyle = mascotStyle;
  if (mascotTone) metadata.mascotTone = mascotTone;
  if (mascotNegativePrompt) metadata.mascotNegativePrompt = mascotNegativePrompt;
  if (mascotAnchorImageUrl) metadata.mascotAnchorImageUrl = mascotAnchorImageUrl;
  if (mascotAnchorAssetId) metadata.mascotAnchorAssetId = mascotAnchorAssetId;
  if (fixedCharacterProfiles.length > 0) metadata.fixedCharacterProfiles = fixedCharacterProfiles;
  return metadata;
}

export function parseStudioProjectProfileSnapshot(
  input: unknown,
  options?: { expectedCategory?: PublishCategory }
): StudioProjectProfileSnapshot | null {
  if (input === null || typeof input === "undefined") return null;
  const record = asRecord(input);
  if (!record || record.version !== 1) return null;
  const profile = asRecord(record.contentProfile);
  if (!profile) return null;
  const projectId = trimString(record.projectId, MAX_ID_LENGTH);
  const createdAt = trimString(record.createdAt, MAX_ID_LENGTH);
  const category = trimString(profile.category, MAX_CATEGORY_LENGTH);
  const label = compactString(profile.label, MAX_LABEL_LENGTH);
  if (!projectId || !createdAt || !category || !label) return null;
  if (options?.expectedCategory && category !== options.expectedCategory) return null;
  return {
    version: 1,
    projectId,
    createdAt,
    contentProfile: {
      category,
      label,
      metadataSnapshot: parseMetadataSnapshot(profile.metadataSnapshot),
    },
  };
}

export function cloneStudioProjectProfileSnapshot(
  snapshot: StudioProjectProfileSnapshot
): StudioProjectProfileSnapshot {
  return cloneJsonValue(snapshot);
}

export function createStudioProjectProfileSnapshot(contextLike: ProjectContextLike): StudioProjectProfileSnapshot {
  const snapshot = parseStudioProjectProfileSnapshot(
    {
      version: 1,
      projectId: contextLike.projectId,
      createdAt: contextLike.createdAt,
      contentProfile: contextLike.contentProfile,
    },
    {
      expectedCategory:
        typeof contextLike.contentProfile?.category === "string" ? contextLike.contentProfile.category : undefined,
    }
  );
  if (!snapshot) {
    throw new Error("프로젝트 프로필 스냅샷을 만들 수 없습니다.");
  }
  return snapshot;
}
