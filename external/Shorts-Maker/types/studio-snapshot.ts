import type { ImageSource, PreparedSlide, PublishCategory, SlideMediaKind } from "@/types/studio-json";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import type { StudioTemplateId, StudioTemplatePayload } from "@/types/studio-template";

export const STUDIO_ASSET_SNAPSHOT_VERSION = 2 as const;

export type StudioAssetRenderStage = "draft" | "final";

export type StudioAssetSnapshotBranding = {
  variant: "news";
  headerTitle: string;
  headerAccentText?: string;
  headerColor: string;
  footerColor: string;
  infoLineText: string;
  fontFamily: string;
  imageRounded: boolean;
};

export type StudioAssetSnapshotDraft = {
  workName?: string;
  topicText?: string;
  scriptText?: string;
  scriptMode?: "normal" | "dialogue";
  jsonText?: string;
  showJsonEditor?: boolean;
  imageSource?: ImageSource;
  imageSearchSource?: "crawl" | "library";
  crawlMode?: "auto" | "fun" | "stock";
  slides?: PreparedSlide[];
  preselectedMediaItems?: Array<{
    id: string;
    source: "library";
    title: string;
    imageUrl: string;
    mediaUrl?: string;
    mediaKind?: SlideMediaKind;
    assetId?: string;
    summary?: string;
    folderPath?: string;
    targetSlideIndex?: number;
    createdAtMs: number;
  }>;
  preselectedMediaApplyMode?: "spread" | "cycle-all";
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
  templateLayoutApply?: unknown;
  projectProfileSnapshot?: StudioProjectProfileSnapshot;
  nonDurableMediaRemoved?: boolean;
};

/**
 * Durable editing state attached to a rendered video asset.
 *
 * V2 snapshots keep the draft under `draft`. The optional top-level fields are
 * retained only so assets written by the earlier experimental snapshot format
 * can still be reopened.
 */
export type StudioAssetSnapshot = {
  version?: number;
  renderStage?: StudioAssetRenderStage;
  createdAtMs?: number;
  draft?: StudioAssetSnapshotDraft;
  brandingDraft?: StudioAssetSnapshotBranding;

  // Legacy V1 fields.
  title?: string;
  topicText?: string;
  scriptText?: string;
  jsonText?: string;
  publishCategory?: PublishCategory;
  imageSource?: ImageSource;
  slides?: PreparedSlide[];
  selectedVoiceId?: string;
  bgmEnabled?: boolean;
  selectedBgmTrack?: string;
  templateImageEnabled?: boolean;
  templateImageUrl?: string;
  templateImageLayout?: unknown;
  templateLayoutApply?: unknown;
  quickScheduledAt?: string;
};
