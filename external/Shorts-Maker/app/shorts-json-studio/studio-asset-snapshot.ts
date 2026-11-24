import {
  cloneStudioWorkDraft,
  normalizeStudioPreselectedMediaItems,
  serializeStudioPreselectedMediaItems,
  type StudioWorkDraft,
  type TemplateBranding,
} from "./types";
import {
  STUDIO_ASSET_SNAPSHOT_VERSION,
  type StudioAssetRenderStage,
  type StudioAssetSnapshot,
  type StudioAssetSnapshotBranding,
  type StudioAssetSnapshotDraft,
} from "@/types/studio-snapshot";
import type { PreparedSlide } from "@/types/studio-json";
import { sanitizeStudioAssetSnapshotMedia } from "@/lib/studio/durable-snapshot-media";
import { parseStudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";

type SnapshotObject = Record<string, unknown>;

export type RestoredStudioAssetSnapshot = {
  draft: StudioWorkDraft;
  brandingDraft?: TemplateBranding;
  renderStage: StudioAssetRenderStage | null;
  createdAtMs: number | null;
};

function asObject(value: unknown): SnapshotObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as SnapshotObject) : null;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asPreparedSlides(value: unknown): PreparedSlide[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const slides = value.filter((item): item is PreparedSlide => Boolean(asObject(item)));
  return slides.length > 0 ? slides : undefined;
}

function asBranding(value: unknown): TemplateBranding | undefined {
  const row = asObject(value);
  if (!row) return undefined;
  const headerTitle = asNonEmptyString(row.headerTitle);
  const headerColor = asNonEmptyString(row.headerColor);
  const footerColor = asNonEmptyString(row.footerColor);
  const fontFamily = asNonEmptyString(row.fontFamily);
  if (!headerTitle || !headerColor || !footerColor || !fontFamily) return undefined;
  return {
    variant: "news",
    headerTitle,
    headerAccentText: asNonEmptyString(row.headerAccentText),
    headerColor,
    footerColor,
    infoLineText: typeof row.infoLineText === "string" ? row.infoLineText : "",
    fontFamily,
    imageRounded: typeof row.imageRounded === "boolean" ? row.imageRounded : true,
  };
}

function copySnapshotDraft(value: unknown): StudioWorkDraft | null {
  const row = asObject(value);
  if (!row) return null;
  const draft: StudioWorkDraft = {};

  const stringKeys = [
    "workName",
    "topicText",
    "scriptText",
    "jsonText",
    "codexModel",
    "quickScheduledAt",
    "selectedVoiceId",
    "selectedQuoteVoiceId",
    "selectedMaleVoiceId",
    "selectedFemaleVoiceId",
    "selectedTypecastEmotionType",
    "selectedTypecastSpeed",
    "selectedBgmTrack",
    "mixPresetId",
    "renderStatus",
    "lastDraftRenderFingerprint",
    "lastFinalRenderFingerprint",
    "lastRenderPreflightFingerprint",
    "voiceApprovalFingerprint",
    "imageApprovalFingerprint",
    "templateImageUrl",
  ] as const;
  for (const key of stringKeys) {
    if (typeof row[key] === "string") draft[key] = row[key];
  }

  const booleanKeys = ["showJsonEditor", "bgmEnabled", "sfxEnabled", "templateImageEnabled"] as const;
  for (const key of booleanKeys) {
    if (typeof row[key] === "boolean") draft[key] = row[key];
  }

  if (row.scriptMode === "normal" || row.scriptMode === "dialogue") draft.scriptMode = row.scriptMode;
  if (row.imageSource === "crawl-only" || row.imageSource === "manual-ai-prompt" || row.imageSource === "auto-ai-generate") {
    draft.imageSource = row.imageSource;
  }
  if (row.imageSearchSource === "crawl" || row.imageSearchSource === "library") draft.imageSearchSource = row.imageSearchSource;
  if (row.crawlMode === "auto" || row.crawlMode === "fun" || row.crawlMode === "stock") draft.crawlMode = row.crawlMode;
  if (row.preselectedMediaApplyMode === "spread" || row.preselectedMediaApplyMode === "cycle-all") {
    draft.preselectedMediaApplyMode = row.preselectedMediaApplyMode;
  }
  if (typeof row.publishCategory === "string" && row.publishCategory.trim()) draft.publishCategory = row.publishCategory;
  if (row.sfxAutoLevel === "sparse" || row.sfxAutoLevel === "balanced" || row.sfxAutoLevel === "dense") {
    draft.sfxAutoLevel = row.sfxAutoLevel;
  }
  if (typeof row.templateId === "string") draft.templateId = row.templateId as StudioWorkDraft["templateId"];

  const playbackRate = asFiniteNumber(row.playbackRate);
  if (playbackRate !== undefined) draft.playbackRate = playbackRate;
  const bgmVolume = asFiniteNumber(row.bgmVolume);
  if (bgmVolume !== undefined) draft.bgmVolume = Math.max(0, Math.min(1, bgmVolume));
  const sfxMasterGainDb = asFiniteNumber(row.sfxMasterGainDb);
  if (sfxMasterGainDb !== undefined) draft.sfxMasterGainDb = sfxMasterGainDb;

  const slides = asPreparedSlides(row.slides);
  if (slides) draft.slides = slides;
  const previewFrameDurationsSec = Array.isArray(row.previewFrameDurationsSec)
    ? row.previewFrameDurationsSec.map(asFiniteNumber).filter((value): value is number => value !== undefined)
    : [];
  if (previewFrameDurationsSec.length > 0) draft.previewFrameDurationsSec = previewFrameDurationsSec;
  if (Array.isArray(row.preselectedMediaItems)) {
    const libraryItems = normalizeStudioPreselectedMediaItems(row.preselectedMediaItems).filter(
      (item) => item.source === "library"
    );
    if (libraryItems.length > 0) draft.preselectedMediaItems = libraryItems;
  }
  if (asObject(row.templateData)) draft.templateData = row.templateData as StudioWorkDraft["templateData"];
  if (asObject(row.templateImageLayout)) draft.templateImageLayout = row.templateImageLayout;
  if (asObject(row.templateLayoutApply)) draft.templateLayoutApply = row.templateLayoutApply as StudioWorkDraft["templateLayoutApply"];

  return draft;
}

function hasRestorableContent(draft: StudioWorkDraft): boolean {
  return Boolean(
    (Array.isArray(draft.slides) && draft.slides.length > 0) ||
      asNonEmptyString(draft.jsonText) ||
      asNonEmptyString(draft.scriptText)
  );
}

/**
 * Builds the client half of a V2 render snapshot. Editable slide metadata is
 * preserved here because the render-only visual payload intentionally omits
 * candidate, prompt, image-beat, and SFX editing fields. Timings and asset
 * URLs are still injected by the server after upload.
 */
export function buildStudioAssetSnapshot(input: {
  stage: StudioAssetRenderStage;
  createdAtMs?: number;
  draft: StudioWorkDraft;
  slides: PreparedSlide[];
  brandingDraft?: TemplateBranding | null;
}): StudioAssetSnapshot {
  const clonedDraft = cloneStudioWorkDraft(input.draft);
  const {
    slides: _draftSlides,
    previewFrameDurationsSec: _previewFrameDurationsSec,
    videoUrl: _videoUrl,
    uploadedVideoUrl: _uploadedVideoUrl,
    preselectedMediaItems,
    ...compactDraft
  } = clonedDraft;
  const editableSlides = cloneStudioWorkDraft({ slides: input.slides }).slides || [];
  const serializedMediaItems = serializeStudioPreselectedMediaItems(preselectedMediaItems || [])
    .filter((item) => item.source === "library")
    .map((item) => ({ ...item, source: "library" as const }));

  const snapshot: StudioAssetSnapshot = {
    version: STUDIO_ASSET_SNAPSHOT_VERSION,
    renderStage: input.stage,
    createdAtMs: Math.max(0, Math.floor(input.createdAtMs ?? Date.now())),
    draft: {
      ...(compactDraft as StudioAssetSnapshotDraft),
      ...(editableSlides.length > 0 ? { slides: editableSlides } : {}),
      ...(serializedMediaItems.length > 0 ? { preselectedMediaItems: serializedMediaItems } : {}),
    },
    ...(input.brandingDraft
      ? { brandingDraft: { ...input.brandingDraft } as StudioAssetSnapshotBranding }
      : {}),
  };
  return sanitizeStudioAssetSnapshotMedia(snapshot).snapshot;
}

/**
 * Converts a durable asset snapshot into the category-scoped local studio
 * draft. V2 is preferred; the former top-level snapshot shape is accepted for
 * older assets when it still contains meaningful editing content.
 */
export function restoreStudioWorkDraftFromAssetSnapshot(input: {
  snapshot: StudioAssetSnapshot | null | undefined;
  assetUrl: string;
  fallbackPublishCategory?: string;
}): RestoredStudioAssetSnapshot | null {
  const row = asObject(input.snapshot);
  const assetUrl = asNonEmptyString(input.assetUrl);
  if (!row || !assetUrl) return null;

  const nestedDraft = asObject(row.draft);
  const isV2 = Number(row.version) === STUDIO_ASSET_SNAPSHOT_VERSION && Boolean(nestedDraft);
  if (nestedDraft && !isV2) return null;
  if (isV2 && row.renderStage !== "draft" && row.renderStage !== "final") return null;
  const sourceDraft = isV2 && nestedDraft ? nestedDraft : row;
  const draft = copySnapshotDraft(sourceDraft);
  if (!draft) return null;
  if (!isV2 && !draft.workName && asNonEmptyString(row.title)) draft.workName = String(row.title);
  if (!hasRestorableContent(draft)) return null;

  const renderStage: StudioAssetRenderStage =
    row.renderStage === "draft" || row.renderStage === "final" ? row.renderStage : "final";
  draft.publishCategory = asNonEmptyString(input.fallbackPublishCategory) || asNonEmptyString(draft.publishCategory) || "default";
  const projectProfileSnapshot = parseStudioProjectProfileSnapshot(sourceDraft.projectProfileSnapshot, {
    expectedCategory: draft.publishCategory,
  });
  if (projectProfileSnapshot) draft.projectProfileSnapshot = projectProfileSnapshot;
  draft.videoUrl = assetUrl;
  draft.uploadedVideoUrl = renderStage === "final" ? assetUrl : undefined;
  const nonDurableMediaRemoved = sourceDraft?.nonDurableMediaRemoved === true;
  if (!asNonEmptyString(draft.renderStatus) || nonDurableMediaRemoved) {
    draft.renderStatus =
      renderStage === "final"
        ? "보관함의 최종 렌더 스냅샷을 열었습니다. 필요하면 음성을 다시 생성해 재렌더할 수 있습니다."
        : "보관함의 렌더 스냅샷을 열었습니다. 필요하면 음성을 다시 생성해 재렌더할 수 있습니다.";
    if (nonDurableMediaRemoved) {
      draft.renderStatus += " 이번 제작에만 있던 임시 이미지는 저장되지 않아 다시 연결해야 합니다.";
    }
  }

  const createdAtMs = asFiniteNumber(row.createdAtMs);
  return {
    draft,
    brandingDraft: asBranding(row.brandingDraft),
    renderStage,
    createdAtMs: createdAtMs === undefined ? null : Math.max(0, Math.floor(createdAtMs)),
  };
}
