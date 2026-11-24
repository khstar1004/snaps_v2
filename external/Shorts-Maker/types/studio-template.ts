import type { StudioCaptionAutoProfileId } from "./studio-caption";
import type { StudioOverlayPlacement, StudioOverlayPresetId } from "./studio-overlay";

export const STUDIO_TEMPLATE_IDS = ["default", "black", "fun-caption"] as const;
export type StudioTemplateId = (typeof STUDIO_TEMPLATE_IDS)[number];

export const STUDIO_TEMPLATE_LABELS: Record<StudioTemplateId, string> = {
  default: "기본 템플릿 (default)",
  black: "Black 템플릿 (black)",
  "fun-caption": "펀캡션 템플릿 (fun-caption)",
};

export function normalizeStudioTemplateId(value: unknown): StudioTemplateId {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return STUDIO_TEMPLATE_IDS.includes(raw as StudioTemplateId) ? (raw as StudioTemplateId) : "default";
}

export function listStudioTemplateIds(): StudioTemplateId[] {
  return [...STUDIO_TEMPLATE_IDS];
}

export type DefaultTemplateData = {
  titleScale: number;
  bodyScale: number;
  cueMetadataEnabled: boolean;
  autoCaptionFxEnabled: boolean;
  autoCaptionProfile: StudioCaptionAutoProfileId;
  autoCaptionIntensity: number;
  autoHighlightEnabled: boolean;
  autoHighlightColor: string;
  autoHighlightScale: number;
  cueDurationSec: number;
};

export type BlackTemplateData = {
  accentColor: string;
  titleScale: number;
  bodyScale: number;
  mediaRadius: number;
  cueMetadataEnabled: boolean;
  autoCaptionFxEnabled: boolean;
  autoCaptionProfile: StudioCaptionAutoProfileId;
  autoCaptionIntensity: number;
  autoHighlightEnabled: boolean;
  autoHighlightColor: string;
  autoHighlightScale: number;
  cueDurationSec: number;
};

export type FunCaptionTemplateData = {
  topCaptionScale: number;
  mainCaptionScale: number;
  topCaptionBgOpacity: number;
  overlayStrength: number;
  captionFeatureEnabled: boolean;
  overlayFeatureEnabled: boolean;
  cueMetadataEnabled: boolean;
  autoCaptionFxEnabled: boolean;
  overlayPreset: StudioOverlayPresetId;
  overlayOpacity: number;
  overlayScale: number;
  overlayDensity: number;
  overlayPlacement: StudioOverlayPlacement;
  captionStyle: "neon-pink" | "flame-gold" | "bubble-pink" | "bold-yellow";
  animationPreset: "pop" | "slide-up" | "bounce" | "pulse";
  topCaptionY: number;
  mainCaptionY: number;
  captionMaxWidth: number;
  topCaptionAlign: "left" | "center";
  mainCaptionAlign: "left" | "center";
  mainCaptionColor: string;
  mainCaptionStrokeColor: string;
  mainCaptionStrokeWidth: number;
  mainCaptionGlow: number;
  autoCaptionProfile: StudioCaptionAutoProfileId;
  autoCaptionIntensity: number;
  autoHighlightEnabled: boolean;
  autoHighlightColor: string;
  autoHighlightScale: number;
  topCaptionTextColor: string;
  topCaptionBgColor: string;
  captionLineHeight: number;
  cueDurationSec: number;
};

export type StudioTemplateDataMap = {
  default: DefaultTemplateData;
  black: BlackTemplateData;
  "fun-caption": FunCaptionTemplateData;
};

export type StudioTemplatePayload = StudioTemplateDataMap[StudioTemplateId];

export type StudioTemplatePayloadFor<T extends StudioTemplateId> = StudioTemplateDataMap[T];
