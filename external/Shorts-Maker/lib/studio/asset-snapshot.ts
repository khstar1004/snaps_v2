import type { PreparedSlide, SlideMediaKind } from "@/types/studio-json";
import type { StudioRemotionVisualInput } from "@/types/studio-renderer";
import {
  STUDIO_ASSET_SNAPSHOT_VERSION,
  type StudioAssetRenderStage,
  type StudioAssetSnapshot,
  type StudioAssetSnapshotBranding,
  type StudioAssetSnapshotDraft,
} from "@/types/studio-snapshot";
import { normalizeStudioTemplateId, type StudioTemplatePayload } from "@/types/studio-template";
import { sanitizeStudioAssetSnapshotMedia } from "@/lib/studio/durable-snapshot-media";
import { parseStudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";

const SHORT_TEXT_LIMIT = 4_000;
const SCRIPT_TEXT_LIMIT = 200_000;
const JSON_TEXT_LIMIT = 500_000;
const JSON_OBJECT_LIMIT = 1_000_000;
const SLIDES_JSON_LIMIT = 2_500_000;
export const STUDIO_ASSET_SNAPSHOT_MAX_BYTES = 3 * 1024 * 1024;
const DANGEROUS_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asOptionalString(value: unknown, limit = SHORT_TEXT_LIMIT): string | undefined {
  if (typeof value !== "string") return undefined;
  const bounded = value.slice(0, limit);
  return bounded.trim() ? bounded : undefined;
}

function asOptionalUntruncatedString(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string" || value.length > limit) return undefined;
  return value.trim() ? value : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asOptionalNumber(value: unknown, min: number, max: number): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : undefined;
}

function cloneBoundedJsonObject(value: unknown): Record<string, unknown> | undefined {
  const row = asObject(value);
  if (!row) return undefined;
  try {
    const serialized = JSON.stringify(row);
    if (!serialized || serialized.length > JSON_OBJECT_LIMIT) return undefined;
    return cloneSafeJsonObject(JSON.parse(serialized));
  } catch {
    return undefined;
  }
}

function cloneSafeJsonObject(value: unknown): Record<string, unknown> | undefined {
  const row = asObject(value);
  if (!row) return undefined;
  const result = Object.create(null) as Record<string, unknown>;
  for (const [key, entry] of Object.entries(row)) {
    if (DANGEROUS_JSON_KEYS.has(key)) continue;
    result[key] = cloneSafeJsonValue(entry);
  }
  return result;
}

function cloneSafeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneSafeJsonValue).filter((item) => typeof item !== "undefined");
  }
  const row = asObject(value);
  return row ? cloneSafeJsonObject(row) : value;
}

function cloneSnapshotSlides(value: unknown): PreparedSlide[] | undefined {
  if (!Array.isArray(value) || value.length <= 0 || value.length > 1_000) return undefined;
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || new TextEncoder().encode(serialized).byteLength > SLIDES_JSON_LIMIT) return undefined;
    const cloned = JSON.parse(serialized) as unknown[];
    const slides = cloned.filter((item): item is PreparedSlide => Boolean(asObject(item)));
    return slides.length === cloned.length ? slides : undefined;
  } catch {
    return undefined;
  }
}

function mergeEditableAndRenderedSlides(
  editorSlides: PreparedSlide[] | undefined,
  renderedSlides: PreparedSlide[]
): PreparedSlide[] {
  if (!editorSlides || editorSlides.length !== renderedSlides.length) return renderedSlides;
  return renderedSlides.map((renderedSlide, index) => {
    const renderedFields = Object.fromEntries(
      Object.entries(renderedSlide).filter(([, fieldValue]) => fieldValue !== undefined)
    ) as Partial<PreparedSlide>;
    return {
      ...editorSlides[index],
      ...renderedFields,
    } as PreparedSlide;
  });
}

function isDurableSnapshotPayload(value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || new TextEncoder().encode(serialized).byteLength > STUDIO_ASSET_SNAPSHOT_MAX_BYTES) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function normalizeBranding(value: unknown): StudioAssetSnapshotBranding | undefined {
  const row = asObject(value);
  if (!row) return undefined;
  const headerTitle = asOptionalString(row.headerTitle);
  const headerColor = asOptionalString(row.headerColor, 64);
  const footerColor = asOptionalString(row.footerColor, 64);
  const fontFamily = asOptionalString(row.fontFamily, 256);
  if (!headerTitle || !headerColor || !footerColor || !fontFamily) return undefined;
  return {
    variant: "news",
    headerTitle,
    headerAccentText: asOptionalString(row.headerAccentText),
    headerColor,
    footerColor,
    infoLineText: asOptionalString(row.infoLineText) || "",
    fontFamily,
    imageRounded: typeof row.imageRounded === "boolean" ? row.imageRounded : true,
  };
}

function normalizeSnapshotDraft(value: unknown): StudioAssetSnapshotDraft | null {
  const row = asObject(value);
  if (!row) return null;
  const templateId = normalizeStudioTemplateId(row.templateId);
  const templateData = cloneBoundedJsonObject(row.templateData) as StudioTemplatePayload | undefined;
  const imageSource =
    row.imageSource === "manual-ai-prompt" || row.imageSource === "auto-ai-generate" || row.imageSource === "crawl-only"
      ? row.imageSource
      : undefined;
  const scriptMode = row.scriptMode === "dialogue" || row.scriptMode === "normal" ? row.scriptMode : undefined;
  const imageSearchSource = row.imageSearchSource === "library" || row.imageSearchSource === "crawl" ? row.imageSearchSource : undefined;
  const crawlMode = row.crawlMode === "fun" || row.crawlMode === "stock" || row.crawlMode === "auto" ? row.crawlMode : undefined;
  const sfxAutoLevel =
    row.sfxAutoLevel === "sparse" || row.sfxAutoLevel === "dense" || row.sfxAutoLevel === "balanced"
      ? row.sfxAutoLevel
      : undefined;
  const preselectedMediaItems = Array.isArray(row.preselectedMediaItems)
    ? row.preselectedMediaItems
        .map((value) => {
          const item = asObject(value);
          if (!item || item.source !== "library") return null;
          const id = asOptionalString(item.id, 512);
          const imageUrl = asOptionalString(item.imageUrl, JSON_TEXT_LIMIT);
          if (!id || !imageUrl) return null;
          const mediaKind: SlideMediaKind | undefined =
            item.mediaKind === "video" || item.mediaKind === "animated_image" || item.mediaKind === "image"
              ? item.mediaKind
              : undefined;
          const targetSlideIndex = asOptionalNumber(item.targetSlideIndex, 0, 1_000);
          return {
            id,
            source: "library" as const,
            title: asOptionalString(item.title) || "선택 미디어",
            imageUrl,
            mediaUrl: asOptionalString(item.mediaUrl, JSON_TEXT_LIMIT),
            mediaKind,
            assetId: asOptionalString(item.assetId, 512),
            summary: asOptionalString(item.summary, SCRIPT_TEXT_LIMIT),
            folderPath: asOptionalString(item.folderPath, SCRIPT_TEXT_LIMIT),
            targetSlideIndex: targetSlideIndex === undefined ? undefined : Math.floor(targetSlideIndex),
            createdAtMs: Math.max(0, Math.floor(Number(item.createdAtMs) || 0)),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .slice(0, 24)
    : undefined;
  const hasSlides = Object.prototype.hasOwnProperty.call(row, "slides");
  const slides = cloneSnapshotSlides(row.slides);
  if (hasSlides && !slides) return null;
  const publishCategory = asOptionalString(row.publishCategory, 256);
  const projectProfileSnapshot = parseStudioProjectProfileSnapshot(row.projectProfileSnapshot, {
    expectedCategory: publishCategory,
  });

  return {
    workName: asOptionalString(row.workName),
    topicText: asOptionalString(row.topicText, SCRIPT_TEXT_LIMIT),
    scriptText: asOptionalString(row.scriptText, SCRIPT_TEXT_LIMIT),
    scriptMode,
    jsonText: asOptionalUntruncatedString(row.jsonText, JSON_TEXT_LIMIT),
    showJsonEditor: asOptionalBoolean(row.showJsonEditor),
    imageSource,
    imageSearchSource,
    crawlMode,
    slides,
    preselectedMediaItems,
    preselectedMediaApplyMode: row.preselectedMediaApplyMode === "cycle-all" ? "cycle-all" : row.preselectedMediaApplyMode === "spread" ? "spread" : undefined,
    publishCategory,
    codexModel: asOptionalString(row.codexModel, 256),
    quickScheduledAt: asOptionalString(row.quickScheduledAt, 256),
    selectedVoiceId: asOptionalString(row.selectedVoiceId, 512),
    selectedQuoteVoiceId: asOptionalString(row.selectedQuoteVoiceId, 512),
    selectedMaleVoiceId: asOptionalString(row.selectedMaleVoiceId, 512),
    selectedFemaleVoiceId: asOptionalString(row.selectedFemaleVoiceId, 512),
    selectedTypecastEmotionType: asOptionalString(row.selectedTypecastEmotionType, 256),
    selectedTypecastSpeed: asOptionalString(row.selectedTypecastSpeed, 64),
    playbackRate: asOptionalNumber(row.playbackRate, 0.8, 3),
    bgmEnabled: asOptionalBoolean(row.bgmEnabled),
    selectedBgmTrack: asOptionalString(row.selectedBgmTrack, 512),
    bgmVolume: asOptionalNumber(row.bgmVolume, 0, 1),
    mixPresetId: asOptionalString(row.mixPresetId, 256),
    sfxEnabled: asOptionalBoolean(row.sfxEnabled),
    sfxMasterGainDb: asOptionalNumber(row.sfxMasterGainDb, -24, 12),
    sfxAutoLevel,
    renderStatus: asOptionalString(row.renderStatus, SCRIPT_TEXT_LIMIT),
    lastDraftRenderFingerprint: asOptionalString(row.lastDraftRenderFingerprint, 256),
    lastFinalRenderFingerprint: asOptionalString(row.lastFinalRenderFingerprint, 256),
    lastRenderPreflightFingerprint: asOptionalString(row.lastRenderPreflightFingerprint, 256),
    voiceApprovalFingerprint: asOptionalString(row.voiceApprovalFingerprint, 256),
    imageApprovalFingerprint: asOptionalString(row.imageApprovalFingerprint, 256),
    templateId,
    templateData,
    templateImageEnabled: asOptionalBoolean(row.templateImageEnabled),
    templateImageUrl: asOptionalString(row.templateImageUrl, JSON_TEXT_LIMIT),
    templateImageLayout: cloneBoundedJsonObject(row.templateImageLayout),
    templateLayoutApply: cloneBoundedJsonObject(row.templateLayoutApply),
    projectProfileSnapshot: projectProfileSnapshot || undefined,
    nonDurableMediaRemoved: asOptionalBoolean(row.nonDurableMediaRemoved),
  };
}

export function normalizeStudioAssetSnapshotRequest(value: unknown): StudioAssetSnapshot | null {
  const rawRow = asObject(value);
  if (!rawRow || Number(rawRow.version) !== STUDIO_ASSET_SNAPSHOT_VERSION) return null;
  const row = asObject(sanitizeStudioAssetSnapshotMedia(rawRow as StudioAssetSnapshot).snapshot);
  if (!row) return null;
  const renderStage: StudioAssetRenderStage | null = row.renderStage === "draft" || row.renderStage === "final" ? row.renderStage : null;
  const draft = normalizeSnapshotDraft(row.draft);
  if (!renderStage || !draft) return null;
  return {
    version: STUDIO_ASSET_SNAPSHOT_VERSION,
    renderStage,
    createdAtMs: Math.max(0, Math.floor(Number(row.createdAtMs) || Date.now())),
    draft,
    brandingDraft: normalizeBranding(row.brandingDraft),
  };
}

export function completeStudioAssetSnapshot(input: {
  snapshot: StudioAssetSnapshot | null | undefined;
  slides?: PreparedSlide[];
  visuals?: StudioRemotionVisualInput;
  frameDurationsSec: number[];
  assetUrl: string;
  publishCategory?: string;
}): StudioAssetSnapshot | null {
  const normalized = normalizeStudioAssetSnapshotRequest(input.snapshot);
  if (!normalized?.draft || !normalized.renderStage) return null;
  const renderedSlides = input.visuals?.slides || input.slides || [];
  const slides = mergeEditableAndRenderedSlides(normalized.draft.slides, renderedSlides);
  const frameDurationsSec = input.frameDurationsSec
    .slice(0, slides.length)
    .map((value) => Math.max(0.001, Number(value) || 0.001));
  const isFinal = normalized.renderStage === "final";
  const visuals = input.visuals;
  const publishCategory = asOptionalString(input.publishCategory, 256) || normalized.draft.publishCategory;
  const projectProfileSnapshot =
    normalized.draft.projectProfileSnapshot &&
    parseStudioProjectProfileSnapshot(normalized.draft.projectProfileSnapshot, { expectedCategory: publishCategory })
      ? normalized.draft.projectProfileSnapshot
      : undefined;
  const completed: StudioAssetSnapshot = {
    ...normalized,
    brandingDraft: visuals
      ? {
          variant: "news",
          headerTitle: visuals.branding.headerTitle,
          headerAccentText: visuals.branding.headerAccentText || undefined,
          headerColor: visuals.branding.headerColor,
          footerColor: visuals.branding.footerColor,
          infoLineText: visuals.branding.infoLineText,
          fontFamily: visuals.branding.fontFamily,
          imageRounded: visuals.branding.imageRounded,
        }
      : normalized.brandingDraft,
    draft: {
      ...normalized.draft,
      publishCategory,
      projectProfileSnapshot,
      slides,
      previewFrameDurationsSec: frameDurationsSec.length === slides.length ? frameDurationsSec : undefined,
      templateId: visuals?.templateId || normalized.draft.templateId,
      templateData: visuals?.templateData || normalized.draft.templateData,
      templateImageEnabled: visuals ? Boolean(visuals.templateImageEnabled) : normalized.draft.templateImageEnabled,
      templateImageUrl: visuals?.templateImageUrl || normalized.draft.templateImageUrl,
      templateImageLayout: visuals?.templateImageLayout || normalized.draft.templateImageLayout,
      templateLayoutApply: visuals?.templateLayoutApply || normalized.draft.templateLayoutApply,
      videoUrl: input.assetUrl,
      uploadedVideoUrl: isFinal ? input.assetUrl : undefined,
      renderStatus: isFinal
        ? "보관함의 최종 렌더 스냅샷을 열었습니다. 필요하면 음성을 다시 생성해 재렌더할 수 있습니다."
        : "보관함의 1차 확인본 스냅샷을 열었습니다. 필요하면 음성을 다시 생성해 재렌더할 수 있습니다.",
    },
  };
  const durableSnapshot = sanitizeStudioAssetSnapshotMedia(completed).snapshot;
  return isDurableSnapshotPayload(durableSnapshot) ? durableSnapshot : null;
}
