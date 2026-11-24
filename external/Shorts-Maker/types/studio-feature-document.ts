import type { BlackTemplateData, DefaultTemplateData, FunCaptionTemplateData, StudioTemplateId, StudioTemplatePayload } from "./studio-template";

export type StudioTemplateSupportedFeatures = {
  captionFeature: boolean;
  overlayFeature: boolean;
  cueMetadata: boolean;
  autoCaptionFx: boolean;
};

export type StudioManagedFeatureId = keyof StudioTemplateSupportedFeatures;
export type StudioTemplateFeatureToggleState = Record<StudioManagedFeatureId, boolean>;

export type StudioCaptionFeatureDocument = {
  stylePreset: FunCaptionTemplateData["captionStyle"];
  animationPreset: FunCaptionTemplateData["animationPreset"];
  topCaptionScale: number;
  mainCaptionScale: number;
  topCaptionBgOpacity: number;
  mainCaptionColor: string;
  mainCaptionStrokeColor: string;
  mainCaptionStrokeWidth: number;
  mainCaptionGlow: number;
  topCaptionTextColor: string;
  topCaptionBgColor: string;
  captionLineHeight: number;
  cueDurationSec: number;
  autoCaptionProfile: FunCaptionTemplateData["autoCaptionProfile"];
  autoCaptionIntensity: number;
  autoHighlightEnabled: boolean;
  autoHighlightColor: string;
  autoHighlightScale: number;
};

export type StudioOverlayFeatureDocument = {
  preset: FunCaptionTemplateData["overlayPreset"];
  placement: FunCaptionTemplateData["overlayPlacement"];
  opacity: number;
  scale: number;
  density: number;
};

function isFunCaptionTemplateData(value: StudioTemplatePayload): value is FunCaptionTemplateData {
  return (
    typeof value === "object" &&
    value !== null &&
    "captionStyle" in value &&
    "animationPreset" in value &&
    "overlayPreset" in value
  );
}

function isDefaultTemplateData(value: StudioTemplatePayload): value is DefaultTemplateData {
  return (
    typeof value === "object" &&
    value !== null &&
    "titleScale" in value &&
    "bodyScale" in value &&
    "autoCaptionProfile" in value
  );
}

export function getStudioManagedFeatureLabel(featureId: StudioManagedFeatureId): string {
  switch (featureId) {
    case "captionFeature":
      return "자막 feature";
    case "overlayFeature":
      return "오버레이 feature";
    case "cueMetadata":
      return "cue metadata";
    case "autoCaptionFx":
      return "auto FX";
    default:
      return featureId;
  }
}

function isBlackTemplateData(value: StudioTemplatePayload): value is BlackTemplateData {
  return (
    typeof value === "object" &&
    value !== null &&
    "accentColor" in value &&
    "autoCaptionProfile" in value
  );
}

export function getStudioCaptionFeatureDocument(
  templateId: StudioTemplateId,
  templateData: StudioTemplatePayload | undefined,
): StudioCaptionFeatureDocument | null {
  if (templateId === "default" && templateData && isDefaultTemplateData(templateData)) {
    return {
      stylePreset: "bold-yellow",
      animationPreset: "slide-up",
      topCaptionScale: 1,
      mainCaptionScale: templateData.bodyScale,
      topCaptionBgOpacity: 0,
      mainCaptionColor: "#27272a",
      mainCaptionStrokeColor: "#ffffff",
      mainCaptionStrokeWidth: 0,
      mainCaptionGlow: Math.min(0.56, 0.18 + templateData.autoCaptionIntensity * 0.24),
      topCaptionTextColor: "#18181b",
      topCaptionBgColor: "#ffffff",
      captionLineHeight: 1.65,
      cueDurationSec: templateData.cueDurationSec,
      autoCaptionProfile: templateData.autoCaptionProfile,
      autoCaptionIntensity: templateData.autoCaptionIntensity,
      autoHighlightEnabled: templateData.autoHighlightEnabled,
      autoHighlightColor: templateData.autoHighlightColor,
      autoHighlightScale: templateData.autoHighlightScale,
    };
  }

  if (templateId === "fun-caption" && templateData && isFunCaptionTemplateData(templateData)) {
    return {
      stylePreset: templateData.captionStyle,
      animationPreset: templateData.animationPreset,
      topCaptionScale: templateData.topCaptionScale,
      mainCaptionScale: templateData.mainCaptionScale,
      topCaptionBgOpacity: templateData.topCaptionBgOpacity,
      mainCaptionColor: templateData.mainCaptionColor,
      mainCaptionStrokeColor: templateData.mainCaptionStrokeColor,
      mainCaptionStrokeWidth: templateData.mainCaptionStrokeWidth,
      mainCaptionGlow: templateData.mainCaptionGlow,
      topCaptionTextColor: templateData.topCaptionTextColor,
      topCaptionBgColor: templateData.topCaptionBgColor,
      captionLineHeight: templateData.captionLineHeight,
      cueDurationSec: templateData.cueDurationSec,
      autoCaptionProfile: templateData.autoCaptionProfile,
      autoCaptionIntensity: templateData.autoCaptionIntensity,
      autoHighlightEnabled: templateData.autoHighlightEnabled,
      autoHighlightColor: templateData.autoHighlightColor,
      autoHighlightScale: templateData.autoHighlightScale,
    };
  }

  if (templateId === "black" && templateData && isBlackTemplateData(templateData)) {
    return {
      stylePreset: "bold-yellow",
      animationPreset: "slide-up",
      topCaptionScale: 1,
      mainCaptionScale: templateData.bodyScale,
      topCaptionBgOpacity: 0,
      mainCaptionColor: "#ffffff",
      mainCaptionStrokeColor: "#111111",
      mainCaptionStrokeWidth: 0,
      mainCaptionGlow: Math.min(0.72, 0.24 + templateData.autoCaptionIntensity * 0.34),
      topCaptionTextColor: "#ffffff",
      topCaptionBgColor: "#000000",
      captionLineHeight: 1.28,
      cueDurationSec: templateData.cueDurationSec,
      autoCaptionProfile: templateData.autoCaptionProfile,
      autoCaptionIntensity: templateData.autoCaptionIntensity,
      autoHighlightEnabled: templateData.autoHighlightEnabled,
      autoHighlightColor: templateData.autoHighlightColor,
      autoHighlightScale: templateData.autoHighlightScale,
    };
  }

  return null;
}

export function getStudioOverlayFeatureDocument(
  templateId: StudioTemplateId,
  templateData: StudioTemplatePayload | undefined,
): StudioOverlayFeatureDocument | null {
  if (templateId !== "fun-caption" || !templateData || !isFunCaptionTemplateData(templateData)) {
    return null;
  }

  return {
    preset: templateData.overlayPreset,
    placement: templateData.overlayPlacement,
    opacity: templateData.overlayOpacity,
    scale: templateData.overlayScale,
    density: templateData.overlayDensity,
  };
}

export function getStudioTemplateFeatureToggles(
  templateId: StudioTemplateId,
  templateData: StudioTemplatePayload | undefined,
): StudioTemplateFeatureToggleState {
  if (templateId === "default" && templateData && isDefaultTemplateData(templateData)) {
    return {
      captionFeature: false,
      overlayFeature: false,
      cueMetadata: templateData.cueMetadataEnabled,
      autoCaptionFx: templateData.autoCaptionFxEnabled,
    };
  }

  if (templateId === "fun-caption" && templateData && isFunCaptionTemplateData(templateData)) {
    return {
      captionFeature: templateData.captionFeatureEnabled,
      overlayFeature: templateData.overlayFeatureEnabled,
      cueMetadata: templateData.cueMetadataEnabled,
      autoCaptionFx: templateData.autoCaptionFxEnabled,
    };
  }

  if (templateId === "black" && templateData && isBlackTemplateData(templateData)) {
    return {
      captionFeature: false,
      overlayFeature: false,
      cueMetadata: templateData.cueMetadataEnabled,
      autoCaptionFx: templateData.autoCaptionFxEnabled,
    };
  }

  return {
    captionFeature: false,
    overlayFeature: false,
    cueMetadata: false,
    autoCaptionFx: false,
  };
}

export function updateStudioTemplateFeatureToggle(
  templateId: StudioTemplateId,
  templateData: StudioTemplatePayload,
  featureId: StudioManagedFeatureId,
  enabled: boolean,
): StudioTemplatePayload {
  if (templateId === "fun-caption" && isFunCaptionTemplateData(templateData)) {
    if (featureId === "captionFeature") return { ...templateData, captionFeatureEnabled: enabled };
    if (featureId === "overlayFeature") return { ...templateData, overlayFeatureEnabled: enabled };
    if (featureId === "cueMetadata") return { ...templateData, cueMetadataEnabled: enabled };
    if (featureId === "autoCaptionFx") return { ...templateData, autoCaptionFxEnabled: enabled };
  }

  if (templateId === "black" && isBlackTemplateData(templateData)) {
    if (featureId === "cueMetadata") return { ...templateData, cueMetadataEnabled: enabled };
    if (featureId === "autoCaptionFx") return { ...templateData, autoCaptionFxEnabled: enabled };
  }

  if (templateId === "default" && isDefaultTemplateData(templateData)) {
    if (featureId === "cueMetadata") return { ...templateData, cueMetadataEnabled: enabled };
    if (featureId === "autoCaptionFx") return { ...templateData, autoCaptionFxEnabled: enabled };
  }

  return templateData;
}

export function applyStudioCaptionFeatureDocument(
  templateId: StudioTemplateId,
  templateData: StudioTemplatePayload,
  document: StudioCaptionFeatureDocument,
): StudioTemplatePayload {
  if (templateId === "fun-caption" && isFunCaptionTemplateData(templateData)) {
    return {
      ...templateData,
      captionStyle: document.stylePreset,
      animationPreset: document.animationPreset,
      topCaptionScale: document.topCaptionScale,
      mainCaptionScale: document.mainCaptionScale,
      topCaptionBgOpacity: document.topCaptionBgOpacity,
      mainCaptionColor: document.mainCaptionColor,
      mainCaptionStrokeColor: document.mainCaptionStrokeColor,
      mainCaptionStrokeWidth: document.mainCaptionStrokeWidth,
      mainCaptionGlow: document.mainCaptionGlow,
      topCaptionTextColor: document.topCaptionTextColor,
      topCaptionBgColor: document.topCaptionBgColor,
      captionLineHeight: document.captionLineHeight,
      cueDurationSec: document.cueDurationSec,
      autoCaptionProfile: document.autoCaptionProfile,
      autoCaptionIntensity: document.autoCaptionIntensity,
      autoHighlightEnabled: document.autoHighlightEnabled,
      autoHighlightColor: document.autoHighlightColor,
      autoHighlightScale: document.autoHighlightScale,
    };
  }

  if (templateId === "black" && isBlackTemplateData(templateData)) {
    return {
      ...templateData,
      bodyScale: document.mainCaptionScale,
      cueDurationSec: document.cueDurationSec,
      autoCaptionProfile: document.autoCaptionProfile,
      autoCaptionIntensity: document.autoCaptionIntensity,
      autoHighlightEnabled: document.autoHighlightEnabled,
      autoHighlightColor: document.autoHighlightColor,
      autoHighlightScale: document.autoHighlightScale,
    };
  }

  if (templateId === "default" && isDefaultTemplateData(templateData)) {
    return {
      ...templateData,
      bodyScale: document.mainCaptionScale,
      cueDurationSec: document.cueDurationSec,
      autoCaptionProfile: document.autoCaptionProfile,
      autoCaptionIntensity: document.autoCaptionIntensity,
      autoHighlightEnabled: document.autoHighlightEnabled,
      autoHighlightColor: document.autoHighlightColor,
      autoHighlightScale: document.autoHighlightScale,
    };
  }

  return templateData;
}

export function applyStudioOverlayFeatureDocument(
  templateId: StudioTemplateId,
  templateData: StudioTemplatePayload,
  document: StudioOverlayFeatureDocument,
): StudioTemplatePayload {
  if (templateId === "fun-caption" && isFunCaptionTemplateData(templateData)) {
    return {
      ...templateData,
      overlayPreset: document.preset,
      overlayPlacement: document.placement,
      overlayOpacity: document.opacity,
      overlayScale: document.scale,
      overlayDensity: document.density,
    };
  }

  return templateData;
}
