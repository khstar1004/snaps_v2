import { normalizePublishBgmVolume, normalizePublishPlaybackRate, type PublishMetadata } from "@/lib/publish/category-metadata";
import type { PublishCategory, VideoAssetRecord } from "@/lib/publish/types";
import { cloneStudioProjectProfileSnapshot, type StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import {
  cloneStudioWorkDraft,
  type StudioHistoryEntry,
  type StudioWorkDraft,
} from "@/app/shorts-json-studio/types";
import { createStudioTemplateData } from "@/app/shorts-json-studio/components/templates/template-registry";
import {
  DEFAULT_TEMPLATE_IMAGE_LAYOUT,
  DEFAULT_TEMPLATE_LAYOUT_APPLY,
} from "@/app/shorts-json-studio/studio-page-helpers";

export type PersonalV1InputMode = "topic" | "script";

export type PersonalV1ContentProfile = {
  category: PublishCategory;
  label: string;
};

export type PersonalV1NewProjectInput = {
  contentProfile: PersonalV1ContentProfile;
  inputMode: PersonalV1InputMode;
  text: string;
  workName?: string;
  metadataSnapshot?: PublishMetadata | null;
  projectProfileSnapshot?: StudioProjectProfileSnapshot | null;
};

export type PersonalV1ArchiveReason = "new_project_overwrite" | "category_draft_overwrite";

export type PersonalV1CategoryDraftSummary = {
  category: PublishCategory;
  label: string;
  draft: StudioWorkDraft;
  title: string;
  slideCount: number;
  hasVideo: boolean;
  updatedAt: number;
};

export type PersonalV1HistorySummary = {
  id: string;
  category: PublishCategory;
  label: string;
  historyLabel: string;
  createdAt: string;
  createdAtMs: number;
  title: string;
  slideCount: number;
  changeTags: string[];
  summary: string;
  draft: StudioWorkDraft;
};

export type PersonalV1VideoAssetSummary = {
  id: string;
  category: PublishCategory;
  label: string;
  title: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: number;
  deletedAt: number | null;
  asset: VideoAssetRecord;
};

export type PersonalV1CategoryDashboardSummary = {
  category: PublishCategory;
  label: string;
  draftCount: number;
  meaningfulDraftCount: number;
  historyCount: number;
  assetCount: number;
  latestActivityAt: number;
  latestDraft: PersonalV1CategoryDraftSummary | null;
  latestHistory: PersonalV1HistorySummary | null;
  latestAsset: PersonalV1VideoAssetSummary | null;
};

const DEFAULT_HISTORY_LIMIT = 50;

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toTimestamp(value: unknown): number {
  const numeric = finiteNumber(value);
  if (numeric !== null) return numeric;
  const text = trimString(value);
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cloneJsonValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function hasExplicitNullTemplatePreset(metadata: PublishMetadata): boolean {
  return Object.prototype.hasOwnProperty.call(metadata, "templatePreset") && metadata.templatePreset === null;
}

function applyDefaultTemplatePresetToDraft(draft: StudioWorkDraft): void {
  draft.templateId = "default";
  draft.templateData = createStudioTemplateData("default");
  draft.templateImageEnabled = false;
  draft.templateImageUrl = "";
  draft.templateImageLayout = cloneJsonValue(DEFAULT_TEMPLATE_IMAGE_LAYOUT);
  draft.templateLayoutApply = cloneJsonValue(DEFAULT_TEMPLATE_LAYOUT_APPLY);
}

function compactText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function firstNonEmptyPhysicalLine(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function createArchiveEntryId(createdAt: string): string {
  const timestamp = Date.parse(createdAt) || Date.now();
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `personal-v1-archive-${timestamp}-${crypto.randomUUID()}`;
  }
  return `personal-v1-archive-${timestamp}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveDraftTitle(draft: StudioWorkDraft | null | undefined): string {
  if (!draft) return "";
  const workName = trimString(draft.workName);
  if (workName) return workName;

  const jsonText = trimString(draft.jsonText);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      const title = trimString(parsed.title);
      if (title) return title;
    } catch {
      // Broken draft JSON should not prevent dashboard summaries.
    }
  }

  const slideTitle = Array.isArray(draft.slides)
    ? trimString(draft.slides.find((slide) => trimString(slide?.title))?.title)
    : "";
  return slideTitle || compactText(trimString(draft.topicText) || trimString(draft.scriptText), 48);
}

function resolveCategoryLabel(category: PublishCategory, categoryLabels?: Partial<Record<PublishCategory, string>>): string {
  return trimString(categoryLabels?.[category]) || category;
}

export function buildPersonalV1StudioWorkDraftSeed(input: PersonalV1NewProjectInput): StudioWorkDraft {
  const category = trimString(input.contentProfile.category);
  const text = trimString(input.text);
  const workName =
    trimString(input.workName) ||
    firstNonEmptyPhysicalLine(input.text) ||
    trimString(input.contentProfile.label) ||
    undefined;
  const metadata = input.metadataSnapshot || null;
  const draft: StudioWorkDraft = {
    workName,
    topicText: input.inputMode === "topic" ? text : "",
    scriptText: input.inputMode === "script" ? text : "",
    scriptMode: "normal",
    publishCategory: category,
  };
  if (input.projectProfileSnapshot) {
    draft.projectProfileSnapshot = cloneStudioProjectProfileSnapshot(input.projectProfileSnapshot);
  }

  if (metadata) {
    const voiceId = trimString(metadata.ttsVoiceId);
    const bgmTrackId = trimString(metadata.bgmTrackId);
    const mixPresetId = trimString(metadata.mixPresetId);
    const bgmVolume = finiteNumber(metadata.bgmVolume);
    const playbackRate = finiteNumber(metadata.playbackRate);
    const sfxGain = finiteNumber(metadata.sfxMasterGainDb);
    if (voiceId) draft.selectedVoiceId = voiceId;
    if (typeof metadata.bgmEnabled === "boolean") draft.bgmEnabled = metadata.bgmEnabled;
    if (bgmTrackId) draft.selectedBgmTrack = bgmTrackId;
    if (mixPresetId) draft.mixPresetId = mixPresetId;
    if (bgmVolume !== null) draft.bgmVolume = normalizePublishBgmVolume(bgmVolume);
    if (playbackRate !== null) draft.playbackRate = normalizePublishPlaybackRate(playbackRate);
    if (typeof metadata.sfxEnabled === "boolean") draft.sfxEnabled = metadata.sfxEnabled;
    if (sfxGain !== null) draft.sfxMasterGainDb = Math.max(-24, Math.min(12, sfxGain));
    if (metadata.templatePreset) {
      draft.templateId = metadata.templatePreset.templateId;
      draft.templateData = cloneJsonValue(metadata.templatePreset.templateData);
      draft.templateImageEnabled = metadata.templatePreset.templateImageEnabled;
      draft.templateImageUrl = metadata.templatePreset.templateImageUrl;
      draft.templateImageLayout = cloneJsonValue(metadata.templatePreset.templateImageLayout);
      draft.templateLayoutApply = cloneJsonValue(metadata.templatePreset.templateLayoutApply);
    } else if (hasExplicitNullTemplatePreset(metadata)) {
      applyDefaultTemplatePresetToDraft(draft);
    }
  }

  return draft;
}

export function isPersonalV1MeaningfulDraft(draft: StudioWorkDraft | null | undefined): boolean {
  if (!draft) return false;
  if (trimString(draft.workName)) return true;
  if (trimString(draft.topicText)) return true;
  if (trimString(draft.scriptText)) return true;
  if (trimString(draft.jsonText)) return true;
  if (Array.isArray(draft.slides) && draft.slides.length > 0) return true;
  if (Array.isArray(draft.preselectedMediaItems) && draft.preselectedMediaItems.length > 0) return true;
  if (trimString(draft.videoUrl) || trimString(draft.uploadedVideoUrl)) return true;
  return false;
}

export function buildPersonalV1HistoryArchiveEntryBeforeOverwrite(input: {
  currentDraft: StudioWorkDraft | null | undefined;
  nextDraft?: StudioWorkDraft | null;
  category: PublishCategory;
  categoryLabel?: string;
  now?: Date;
  id?: string;
  reason?: PersonalV1ArchiveReason;
}): StudioHistoryEntry | null {
  if (!isPersonalV1MeaningfulDraft(input.currentDraft)) return null;
  if (input.nextDraft && JSON.stringify(input.currentDraft || {}) === JSON.stringify(input.nextDraft || {})) return null;

  const createdAt = (input.now || new Date()).toISOString();
  const draft = cloneStudioWorkDraft({
    ...(input.currentDraft || {}),
    publishCategory: input.category,
  });
  const title = resolveDraftTitle(draft);
  const categoryLabel = trimString(input.categoryLabel);
  const fallbackLabel = categoryLabel ? `${categoryLabel} 이전 작업` : "이전 작업";

  return {
    id: input.id || createArchiveEntryId(createdAt),
    label: title ? `덮어쓰기 전 백업 · ${title}` : `덮어쓰기 전 백업 · ${fallbackLabel}`,
    createdAt,
    kind: "auto",
    reason: "category_change",
    summary: "새 작업 시작 전 현재 초안 백업",
    changeTags: [input.reason || "new_project_overwrite"],
    slideCount: Array.isArray(draft.slides) ? draft.slides.length : 0,
    draft,
  };
}

export function summarizePersonalV1CategoryDrafts(
  draftsByCategory: Partial<Record<PublishCategory, StudioWorkDraft | null | undefined>>,
  categoryLabels?: Partial<Record<PublishCategory, string>>
): PersonalV1CategoryDraftSummary[] {
  return Object.entries(draftsByCategory)
    .map(([category, draft]) => {
      if (!draft) return null;
      const normalizedDraft = cloneStudioWorkDraft({
        ...draft,
        publishCategory: category,
      });
      return {
        category,
        label: resolveCategoryLabel(category, categoryLabels),
        draft: normalizedDraft,
        title: resolveDraftTitle(normalizedDraft),
        slideCount: Array.isArray(normalizedDraft.slides) ? normalizedDraft.slides.length : 0,
        hasVideo: Boolean(trimString(normalizedDraft.videoUrl) || trimString(normalizedDraft.uploadedVideoUrl)),
        // StudioWorkDraft has no trustworthy updated-at field. Keep this unknown
        // instead of presenting schedule time or content presence as an edit time.
        updatedAt: 0,
      };
    })
    .filter((item): item is PersonalV1CategoryDraftSummary => Boolean(item))
    .sort((left, right) => {
      const meaningfulDelta = Number(isPersonalV1MeaningfulDraft(right.draft)) - Number(isPersonalV1MeaningfulDraft(left.draft));
      if (meaningfulDelta) return meaningfulDelta;
      const updatedDelta = right.updatedAt - left.updatedAt;
      if (updatedDelta) return updatedDelta;
      return left.label.localeCompare(right.label, "ko-KR");
    });
}

export function summarizePersonalV1HistoryEntries(
  entries: StudioHistoryEntry[],
  categoryLabels?: Partial<Record<PublishCategory, string>>,
  options?: { category?: PublishCategory; limit?: number }
): PersonalV1HistorySummary[] {
  const categoryFilter = trimString(options?.category);
  const limit = Math.max(0, Math.floor(options?.limit ?? DEFAULT_HISTORY_LIMIT));
  return entries
    .map((entry): PersonalV1HistorySummary | null => {
      const id = trimString(entry.id);
      if (!id) return null;
      const draft = entry.draft && typeof entry.draft === "object" ? cloneStudioWorkDraft(entry.draft) : {};
      const category = trimString(draft.publishCategory) || categoryFilter || "default";
      if (categoryFilter && category !== categoryFilter) return null;
      const createdAt = trimString(entry.createdAt) || new Date(0).toISOString();
      return {
        id,
        category,
        label: resolveCategoryLabel(category, categoryLabels),
        historyLabel: trimString(entry.label) || `버전 ${createdAt.slice(0, 19).replace("T", " ")}`,
        createdAt,
        createdAtMs: toTimestamp(createdAt),
        title: resolveDraftTitle(draft),
        slideCount: Number.isFinite(Number(entry.slideCount))
          ? Math.max(0, Math.floor(Number(entry.slideCount)))
          : Array.isArray(draft.slides)
            ? draft.slides.length
            : 0,
        changeTags: Array.isArray(entry.changeTags)
          ? entry.changeTags.filter((item): item is string => trimString(item).length > 0).slice(0, 6)
          : [],
        summary: trimString(entry.summary),
        draft,
      };
    })
    .filter((item): item is PersonalV1HistorySummary => Boolean(item))
    .sort((left, right) => right.createdAtMs - left.createdAtMs || left.historyLabel.localeCompare(right.historyLabel, "ko-KR"))
    .slice(0, limit);
}

export function summarizePersonalV1VideoAssets(
  assets: VideoAssetRecord[],
  categoryLabels?: Partial<Record<PublishCategory, string>>,
  options?: { category?: PublishCategory; includeDeleted?: boolean; limit?: number }
): PersonalV1VideoAssetSummary[] {
  const categoryFilter = trimString(options?.category);
  const includeDeleted = Boolean(options?.includeDeleted);
  const limit = Math.max(0, Math.floor(options?.limit ?? assets.length));
  return assets
    .map((asset): PersonalV1VideoAssetSummary | null => {
      const id = trimString(asset.id);
      if (!id) return null;
      const category = trimString(asset.publishCategory) || categoryFilter || "default";
      if (categoryFilter && category !== categoryFilter) return null;
      const deletedAt = finiteNumber(asset.deletedAt) ?? null;
      if (!includeDeleted && deletedAt !== null) return null;
      return {
        id,
        category,
        label: resolveCategoryLabel(category, categoryLabels),
        title: trimString(asset.title) || "Untitled video",
        url: trimString(asset.url),
        sizeBytes: Math.max(0, Math.floor(finiteNumber(asset.sizeBytes) ?? 0)),
        mimeType: trimString(asset.mimeType),
        createdAt: finiteNumber(asset.createdAt) ?? 0,
        deletedAt,
        asset: cloneJsonValue(asset),
      };
    })
    .filter((item): item is PersonalV1VideoAssetSummary => Boolean(item))
    .sort((left, right) => right.createdAt - left.createdAt || left.title.localeCompare(right.title, "ko-KR"))
    .slice(0, limit);
}

export function buildPersonalV1CategoryDashboardSummaries(input: {
  drafts?: PersonalV1CategoryDraftSummary[];
  history?: PersonalV1HistorySummary[];
  assets?: PersonalV1VideoAssetSummary[];
  categoryLabels?: Partial<Record<PublishCategory, string>>;
}): PersonalV1CategoryDashboardSummary[] {
  const drafts = input.drafts || [];
  const history = input.history || [];
  const assets = input.assets || [];
  const categories = new Set<PublishCategory>();
  for (const item of drafts) categories.add(item.category);
  for (const item of history) categories.add(item.category);
  for (const item of assets) categories.add(item.category);
  for (const category of Object.keys(input.categoryLabels || {})) categories.add(category);

  return Array.from(categories)
    .map((category) => {
      const categoryDrafts = drafts.filter((item) => item.category === category);
      const categoryHistory = history.filter((item) => item.category === category);
      const categoryAssets = assets.filter((item) => item.category === category);
      const latestDraft = categoryDrafts[0] || null;
      const latestHistory = categoryHistory[0] || null;
      const latestAsset = categoryAssets[0] || null;
      const latestActivityAt = Math.max(
        latestDraft?.updatedAt || 0,
        latestHistory?.createdAtMs || 0,
        latestAsset?.createdAt || 0
      );
      return {
        category,
        label: resolveCategoryLabel(category, input.categoryLabels),
        draftCount: categoryDrafts.length,
        meaningfulDraftCount: categoryDrafts.filter((item) => isPersonalV1MeaningfulDraft(item.draft)).length,
        historyCount: categoryHistory.length,
        assetCount: categoryAssets.length,
        latestActivityAt,
        latestDraft,
        latestHistory,
        latestAsset,
      };
    })
    .sort((left, right) => right.latestActivityAt - left.latestActivityAt || left.label.localeCompare(right.label, "ko-KR"));
}
