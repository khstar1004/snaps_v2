import type { PublishCategory } from "@/lib/publish/types";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import type { CrawlMode, ImageSource, PreparedSlide, SlideMediaKind } from "@/types/studio-json";
import { normalizeStudioTemplateId as normalizeStudioTemplateIdValue } from "@/types/studio-template";
import type { StudioTemplateId, StudioTemplatePayload } from "@/types/studio-template";

export { normalizeStudioTemplateIdValue as normalizeStudioTemplateId };
export type { StudioTemplateId, StudioTemplatePayload } from "@/types/studio-template";

export const STUDIO_WORK_DRAFT_STORAGE_KEY = "studio-work-draft-v1";
export const STUDIO_WORK_HISTORY_STORAGE_KEY = "studio-work-history-v1";

export type TemplateBranding = {
  variant: "news";
  headerTitle: string;
  headerAccentText?: string;
  headerColor: string;
  footerColor: string;
  infoLineText: string;
  fontFamily: string;
  imageRounded: boolean;
};

export type LayoutRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type TemplateImageLayout = {
  headerTitleSlot: LayoutRect;
  headerAccentSlot: LayoutRect;
  titleSlot: LayoutRect;
  bodySlot: LayoutRect;
  imageSlot: LayoutRect;
  infoSlot: LayoutRect;
  headerTitleColor?: string;
  headerAccentColor?: string;
  titleColor: string;
  bodyColor: string;
  infoColor: string;
  titleAlign: "left" | "center" | "right";
  bodyAlign: "left" | "center" | "right";
  headerSize: number;
  titleSize: number;
  bodySize: number;
  infoSize: number;
  headerTitleWeight?: number;
  headerAccentWeight?: number;
  titleWeight?: number;
  bodyWeight?: number;
  infoWeight?: number;
};

export type TemplateLayoutApply = {
  title: boolean;
  body: boolean;
  image: boolean;
  info: boolean;
};

export type StudioPreselectedMediaSource = "library" | "session-upload";
export type StudioPreselectedMediaApplyMode = "spread" | "cycle-all";
export type StudioImageSearchSource = "crawl" | "library";
export const DEFAULT_STUDIO_IMAGE_SEARCH_SOURCE: StudioImageSearchSource = "crawl";

export type StudioPreselectedMediaItem = {
  id: string;
  source: StudioPreselectedMediaSource;
  title: string;
  imageUrl: string;
  mediaUrl?: string;
  mediaKind?: SlideMediaKind;
  assetId?: string;
  summary?: string;
  folderPath?: string;
  targetSlideIndex?: number;
  createdAtMs: number;
};

export type StudioLayoutPreset = {
  templateByCategory?: Record<
    string,
    {
      templateId?: StudioTemplateId;
      templateData?: StudioTemplatePayload;
      templateImageEnabled?: boolean;
      templateImageUrl?: string;
      templateImageLayout?: unknown;
      templateLayoutApply?: TemplateLayoutApply;
      templateLayoutJson?: string;
    }
  >;
  publishCategory?: PublishCategory;
  brandingDraft?: TemplateBranding;
  templateId?: StudioTemplateId;
  templateData?: StudioTemplatePayload;
  templateImageEnabled?: boolean;
  templateImageUrl?: string;
  templateImageLayout?: unknown;
  templateLayoutApply?: TemplateLayoutApply;
};

export type StudioWorkDraft = {
  workName?: string;
  topicText?: string;
  scriptText?: string;
  scriptMode?: "normal" | "dialogue";
  jsonText?: string;
  showJsonEditor?: boolean;
  imageSource?: ImageSource;
  imageSearchSource?: StudioImageSearchSource;
  crawlMode?: CrawlMode;
  slides?: PreparedSlide[];
  selectedPreviewGroupIndex?: number;
  preselectedMediaItems?: StudioPreselectedMediaItem[];
  preselectedMediaApplyMode?: StudioPreselectedMediaApplyMode;
  publishCategory?: PublishCategory;
  codexModel?: string;
  quickScheduledAt?: string;
  selectedVoiceId?: string;
  selectedQuoteVoiceId?: string;
  selectedMaleVoiceId?: string;
  selectedFemaleVoiceId?: string;
  selectedTypecastEmotionType?: string;
  selectedTypecastSpeed?: string;
  playbackRate?: number;
  bgmEnabled?: boolean;
  selectedBgmTrack?: string;
  bgmVolume?: number;
  mixPresetId?: string;
  sfxEnabled?: boolean;
  sfxMasterGainDb?: number;
  sfxAutoLevel?: "sparse" | "balanced" | "dense";
  videoUrl?: string;
  uploadedVideoUrl?: string;
  previewFrameDurationsSec?: number[];
  renderStatus?: string;
  lastDraftRenderFingerprint?: string;
  lastFinalRenderFingerprint?: string;
  lastRenderPreflightFingerprint?: string;
  voiceApprovalFingerprint?: string;
  imageApprovalFingerprint?: string;
  templateId?: StudioTemplateId;
  templateData?: StudioTemplatePayload;
  templateImageEnabled?: boolean;
  templateImageUrl?: string;
  templateImageLayout?: unknown;
  templateLayoutApply?: TemplateLayoutApply;
  projectProfileSnapshot?: StudioProjectProfileSnapshot;
};

export type StudioHistoryEntry = {
  id: string;
  label: string;
  createdAt: string;
  kind?: "auto" | "manual" | "restore-backup";
  reason?:
    | "manual_save"
    | "prepare"
    | "script_to_json"
    | "script_only"
    | "category_change"
    | "preset_save"
    | "title_edit"
    | "slide_image_edit"
    | "slide_image_upload"
    | "slide_library_apply"
    | "slide_candidate_apply"
    | "prepared_media_edit"
    | "slide_narration_edit"
    | "slide_delete"
    | "slide_add"
    | "slide_sfx_edit"
    | "restore_backup"
    | "unknown";
  summary?: string;
  changeTags?: string[];
  slideCount?: number;
  draft: StudioWorkDraft;
};

export type StudioHistoryState = {
  activeHistoryId: string | null;
  historyEntries: StudioHistoryEntry[];
};

export function cloneStudioWorkDraft(draft: StudioWorkDraft): StudioWorkDraft {
  if (typeof structuredClone === "function") {
    return structuredClone(draft || {}) as StudioWorkDraft;
  }
  return JSON.parse(JSON.stringify(draft || {})) as StudioWorkDraft;
}

function toSlideMediaKind(value: unknown): SlideMediaKind | undefined {
  return value === "image" || value === "video" || value === "animated_image" ? value : undefined;
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function serializeStudioPreselectedMediaItems(items: StudioPreselectedMediaItem[]): StudioPreselectedMediaItem[] {
  return items
    .map((item) =>
      item.source === "session-upload"
        ? {
            ...item,
            imageUrl: "",
            mediaUrl: undefined,
          }
        : {
            ...item,
          }
    )
    .slice(0, 24);
}

export function normalizeStudioPreselectedMediaItems(
  value: unknown,
  options?: { sessionRegistry?: Map<string, StudioPreselectedMediaItem> }
): StudioPreselectedMediaItem[] {
  if (!Array.isArray(value)) return [];
  const normalized: StudioPreselectedMediaItem[] = [];
  const seenIds = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = asNonEmptyString(row.id);
    if (!id || seenIds.has(id)) continue;
    const source: StudioPreselectedMediaSource = row.source === "session-upload" ? "session-upload" : "library";
    if (source === "session-upload") {
      const restored = options?.sessionRegistry?.get(id);
      if (restored) {
        normalized.push({
          ...restored,
          targetSlideIndex: Number.isFinite(Number(row.targetSlideIndex)) ? Math.max(0, Math.floor(Number(row.targetSlideIndex))) : restored.targetSlideIndex,
        });
        seenIds.add(id);
      }
      continue;
    }
    const imageUrl = asNonEmptyString(row.imageUrl);
    if (!imageUrl) continue;
    normalized.push({
      id,
      source,
      title: asNonEmptyString(row.title) || "선택 미디어",
      imageUrl,
      mediaUrl: asNonEmptyString(row.mediaUrl) || undefined,
      mediaKind: toSlideMediaKind(row.mediaKind),
      assetId: asNonEmptyString(row.assetId) || undefined,
      summary: asNonEmptyString(row.summary) || undefined,
      folderPath: asNonEmptyString(row.folderPath) || undefined,
      targetSlideIndex: Number.isFinite(Number(row.targetSlideIndex)) ? Math.max(0, Math.floor(Number(row.targetSlideIndex))) : undefined,
      createdAtMs: Number.isFinite(Number(row.createdAtMs)) ? Math.max(0, Math.floor(Number(row.createdAtMs))) : Date.now(),
    });
    seenIds.add(id);
  }
  return normalized.slice(0, 24);
}

export function normalizeStudioPreselectedMediaApplyMode(value: unknown): StudioPreselectedMediaApplyMode {
  return value === "cycle-all" ? "cycle-all" : "spread";
}

export function normalizeStudioImageSearchSource(value: unknown): StudioImageSearchSource {
  return value === "library" ? "library" : DEFAULT_STUDIO_IMAGE_SEARCH_SOURCE;
}
