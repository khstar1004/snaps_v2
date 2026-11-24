import type { TemplateBrandingSettings } from "@/lib/publish/template-branding";
import type { PreparedSlide, SfxTag } from "@/types/studio-json";
import type { StudioAssetSnapshot } from "@/types/studio-snapshot";
import type { StudioTemplateId, StudioTemplatePayload } from "@/types/studio-template";

export type StudioRenderEngine = "client_wasm" | "server_native";

export type StudioRenderSfxCue = {
  cueId?: string;
  frameIndex?: number;
  startMs?: number;
  enabled?: boolean;
  tag: SfxTag;
  gainDb?: number;
  offsetMs?: number;
};

export type StudioRenderSfxCatalogCategory = {
  id: string;
  files: Array<{
    id?: string;
    path: string;
    defaultGainDb?: number;
  }>;
};

export type StudioRenderAudioOptions = {
  playbackRate?: number;
  bgmEnabled?: boolean;
  bgmPath?: string;
  mixPresetId?: string;
  bgmVolume?: number;
  sfxEnabled?: boolean;
  sfxMasterGainDb?: number;
  sfxCues?: StudioRenderSfxCue[];
  sfxCatalog?: StudioRenderSfxCatalogCategory[];
};

export type StudioRenderAudioDiagnostics = {
  mixPresetId: string;
  peakRisk: "low" | "medium" | "high";
  previewLoudnessIndex: number;
  finalLoudnessIndex: number;
  loudnessMismatchRatio: number;
  loudnessMismatchDelta: number;
  loudnessMismatchLevel: "low" | "medium" | "high";
  expectedSfxCues: number;
  effectiveSfxCues: number;
  expectedBgmEnabled: boolean;
  effectiveBgmEnabled: boolean;
};

export type StudioRenderMemoryBudget = {
  softLimitMb: number;
  hardLimitMb: number;
  estimatedMb: number;
  degradeLevel: "none" | "reduce_sfx" | "disable_bgm_sfx" | "blocked";
  degraded: boolean;
  blocked: boolean;
  softLimitExceeded: boolean;
  expectedSfxCues: number;
  maxSfxCues: number;
  expectedBgmEnabled: boolean;
  effectiveBgmEnabled: boolean;
  inputImageMb: number;
  inputNarrationMb: number;
};

export type StudioRenderNarrationSegment = {
  segmentId: string;
  groupId: number;
  audioBase64: string;
  /** Total segment duration, including pauseAfterMs when present. */
  durationMs: number;
  /** Explicit silence appended after the trimmed speech. Defaults to 0ms. */
  pauseAfterMs?: number;
  mimeType?: "audio/mpeg" | "audio/wav";
  format?: "mp3" | "wav";
  trimStartMs?: number;
  trimEndMs?: number;
};

export type StudioRenderNarrationInput =
  | {
      mode: "singleAudio";
      fullAudio: string;
      fullAudioMimeType?: "audio/mpeg" | "audio/wav";
      fullAudioFormat?: "mp3" | "wav";
    }
  | {
      mode: "segments";
      segments: StudioRenderNarrationSegment[];
      crossfadeMsByBoundary?: number[];
    }
  | {
      mode: "segmentsRef";
      narrationRef: string;
    };

export type StudioRenderLayoutRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type StudioRenderTemplateImageLayout = {
  headerTitleSlot: StudioRenderLayoutRect;
  headerAccentSlot: StudioRenderLayoutRect;
  titleSlot: StudioRenderLayoutRect;
  bodySlot: StudioRenderLayoutRect;
  imageSlot: StudioRenderLayoutRect;
  infoSlot: StudioRenderLayoutRect;
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

export type StudioRenderTemplateLayoutApply = {
  title: boolean;
  body: boolean;
  image: boolean;
  info: boolean;
};

export type StudioRenderTemplateId = StudioTemplateId;

export type StudioRemotionVisualInput = {
  slides: PreparedSlide[];
  branding: TemplateBrandingSettings;
  templateId?: StudioRenderTemplateId;
  templateData?: StudioTemplatePayload;
  templateImageEnabled?: boolean;
  templateImageUrl?: string;
  templateImageLayout?: StudioRenderTemplateImageLayout;
  templateLayoutApply?: StudioRenderTemplateLayoutApply;
};

export type StudioRemotionCompositionProps = StudioRemotionVisualInput & {
  frameDurationsSec: number[];
  durationInFrames: number;
  fps: number;
  playbackRate?: number;
};

export type StudioNativeRenderRequest = {
  fullAudio: string;
  narration?: StudioRenderNarrationInput;
  durationMs: number;
  frameDurationsSec: number[];
  audioOptions?: StudioRenderAudioOptions;
  visuals: StudioRemotionVisualInput;
  asset?: {
    title?: string;
    publishCategory?: string;
    studioSnapshot?: StudioAssetSnapshot;
  };
  meta?: {
    requestId?: string;
    selectedRenderer?: StudioRenderEngine;
    heavyJob?: boolean;
    estimatedMb?: number;
    fallbackAttempt?: number;
  };
};

export type StudioNativeRenderSuccessResponse = {
  ok: true;
  renderer: "server_native";
  uploadedAssetId: string;
  uploadedAssetUrl: string;
  studioSnapshotSaved: boolean;
  audioDiagnostics: StudioRenderAudioDiagnostics;
  memoryBudget: StudioRenderMemoryBudget;
  usage: {
    renderMs: number;
  };
};

export type StudioNativeRenderFailureResponse = {
  ok: false;
  renderer: "server_native";
  error: string;
  errorCode: string;
  retryable: boolean;
};

export type StudioNativeRenderResponse = StudioNativeRenderSuccessResponse | StudioNativeRenderFailureResponse;

export type StudioRenderJobStatus = "queued" | "processing" | "completed" | "failed";

export type StudioRenderJobRecord = {
  id: string;
  renderer: "server_native";
  status: StudioRenderJobStatus;
  createdAtMs: number;
  updatedAtMs: number;
  startedAtMs?: number;
  completedAtMs?: number;
  uploadedAssetId?: string;
  uploadedAssetUrl?: string;
  studioSnapshotSaved?: boolean;
  audioDiagnostics?: StudioRenderAudioDiagnostics;
  memoryBudget?: StudioRenderMemoryBudget;
  usage?: {
    renderMs: number;
  };
  error?: string;
  errorCode?: string;
  retryable?: boolean;
};

export type StudioRenderJobResponse = {
  ok: true;
  job: StudioRenderJobRecord;
};
