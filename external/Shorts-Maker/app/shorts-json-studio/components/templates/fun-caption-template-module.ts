"use client";

import type { FunCaptionTemplateData } from "@/types/studio-template";
import {
  buildTemplateRequirementAlert,
  normalizeColor,
  toNumberInRange,
  toScale,
  type StudioTemplateModule,
} from "./template-module-types";

const FUN_CAPTION_TEMPLATE_DATA: FunCaptionTemplateData = {
  topCaptionScale: 1,
  mainCaptionScale: 1,
  topCaptionBgOpacity: 0.68,
  overlayStrength: 0.28,
  captionFeatureEnabled: true,
  overlayFeatureEnabled: true,
  cueMetadataEnabled: true,
  autoCaptionFxEnabled: true,
  overlayPreset: "none",
  overlayOpacity: 0.78,
  overlayScale: 1,
  overlayDensity: 0.8,
  overlayPlacement: "full",
  captionStyle: "neon-pink",
  animationPreset: "pop",
  topCaptionY: 22,
  mainCaptionY: 50,
  captionMaxWidth: 92,
  topCaptionAlign: "left",
  mainCaptionAlign: "center",
  mainCaptionColor: "#fff7fb",
  mainCaptionStrokeColor: "#ffffff",
  mainCaptionStrokeWidth: 1,
  mainCaptionGlow: 0.68,
  autoCaptionProfile: "hook",
  autoCaptionIntensity: 0.72,
  autoHighlightEnabled: true,
  autoHighlightColor: "#fde047",
  autoHighlightScale: 1.16,
  topCaptionTextColor: "#f8fafc",
  topCaptionBgColor: "#0f1723",
  captionLineHeight: 1.02,
  cueDurationSec: 1.1,
};

export const funCaptionTemplateModule: StudioTemplateModule<"fun-caption"> = {
  id: "fun-caption",
  definition: {
    id: "fun-caption",
    label: "펀캡션 템플릿",
    accent: "#7dd3fc",
    description: "재밌는 영상 위에 자막과 더빙을 얹는 밈형 숏폼 템플릿",
    summary: "상단 작은 설명 캡션, 중앙 큰 후킹 자막, 전체 배경 영상 구조입니다.",
    inputGuide: "위에는 작은 설명 자막, 가운데에는 큰 자막, 뒤에는 사진이나 영상이 들어갑니다.",
    layoutStudioHint: "펀캡션은 배경 영상이나 사진, 자막 톤, 장식 효과가 핵심입니다. 칸 편집보다 자막과 미디어 선택을 중심으로 보면 됩니다.",
    usesLegacyOverlayEditor: false,
    supportedFeatures: {
      captionFeature: true,
      overlayFeature: true,
      cueMetadata: true,
      autoCaptionFx: true,
    },
    requiredFields: ["title", "text", "imageOrMedia"],
  },
  createTemplateData: () => ({ ...FUN_CAPTION_TEMPLATE_DATA }),
  normalizeTemplateData: (value) => {
    const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    return {
      topCaptionScale: toScale(row.topCaptionScale, FUN_CAPTION_TEMPLATE_DATA.topCaptionScale),
      mainCaptionScale: toScale(row.mainCaptionScale, FUN_CAPTION_TEMPLATE_DATA.mainCaptionScale),
      topCaptionBgOpacity: toNumberInRange(row.topCaptionBgOpacity, FUN_CAPTION_TEMPLATE_DATA.topCaptionBgOpacity, 0.2, 0.95),
      overlayStrength: toNumberInRange(row.overlayStrength, FUN_CAPTION_TEMPLATE_DATA.overlayStrength, 0, 0.8),
      captionFeatureEnabled: typeof row.captionFeatureEnabled === "boolean" ? row.captionFeatureEnabled : FUN_CAPTION_TEMPLATE_DATA.captionFeatureEnabled,
      overlayFeatureEnabled: typeof row.overlayFeatureEnabled === "boolean" ? row.overlayFeatureEnabled : FUN_CAPTION_TEMPLATE_DATA.overlayFeatureEnabled,
      cueMetadataEnabled: typeof row.cueMetadataEnabled === "boolean" ? row.cueMetadataEnabled : FUN_CAPTION_TEMPLATE_DATA.cueMetadataEnabled,
      autoCaptionFxEnabled: typeof row.autoCaptionFxEnabled === "boolean" ? row.autoCaptionFxEnabled : FUN_CAPTION_TEMPLATE_DATA.autoCaptionFxEnabled,
      overlayPreset:
        row.overlayPreset === "hearts" ||
        row.overlayPreset === "fire" ||
        row.overlayPreset === "spark" ||
        row.overlayPreset === "none"
          ? row.overlayPreset
          : FUN_CAPTION_TEMPLATE_DATA.overlayPreset,
      overlayOpacity: toNumberInRange(row.overlayOpacity, FUN_CAPTION_TEMPLATE_DATA.overlayOpacity, 0, 1),
      overlayScale: toNumberInRange(row.overlayScale, FUN_CAPTION_TEMPLATE_DATA.overlayScale, 0.45, 1.8),
      overlayDensity: toNumberInRange(row.overlayDensity, FUN_CAPTION_TEMPLATE_DATA.overlayDensity, 0.25, 1.6),
      overlayPlacement:
        row.overlayPlacement === "center" || row.overlayPlacement === "bottom" || row.overlayPlacement === "full"
          ? row.overlayPlacement
          : FUN_CAPTION_TEMPLATE_DATA.overlayPlacement,
      captionStyle:
        row.captionStyle === "flame-gold" ||
        row.captionStyle === "bubble-pink" ||
        row.captionStyle === "bold-yellow" ||
        row.captionStyle === "neon-pink"
          ? row.captionStyle
          : FUN_CAPTION_TEMPLATE_DATA.captionStyle,
      animationPreset:
        row.animationPreset === "slide-up" ||
        row.animationPreset === "bounce" ||
        row.animationPreset === "pulse" ||
        row.animationPreset === "pop"
          ? row.animationPreset
          : FUN_CAPTION_TEMPLATE_DATA.animationPreset,
      topCaptionY: toNumberInRange(row.topCaptionY, FUN_CAPTION_TEMPLATE_DATA.topCaptionY, 0, 140),
      mainCaptionY: toNumberInRange(row.mainCaptionY, FUN_CAPTION_TEMPLATE_DATA.mainCaptionY, 18, 82),
      captionMaxWidth: toNumberInRange(row.captionMaxWidth, FUN_CAPTION_TEMPLATE_DATA.captionMaxWidth, 45, 100),
      topCaptionAlign: row.topCaptionAlign === "center" ? "center" : "left",
      mainCaptionAlign: row.mainCaptionAlign === "left" ? "left" : "center",
      mainCaptionColor: normalizeColor(row.mainCaptionColor, FUN_CAPTION_TEMPLATE_DATA.mainCaptionColor),
      mainCaptionStrokeColor: normalizeColor(row.mainCaptionStrokeColor, FUN_CAPTION_TEMPLATE_DATA.mainCaptionStrokeColor),
      mainCaptionStrokeWidth: toNumberInRange(row.mainCaptionStrokeWidth, FUN_CAPTION_TEMPLATE_DATA.mainCaptionStrokeWidth, 0, 8),
      mainCaptionGlow: toNumberInRange(row.mainCaptionGlow, FUN_CAPTION_TEMPLATE_DATA.mainCaptionGlow, 0, 1),
      autoCaptionProfile:
        row.autoCaptionProfile === "off" ||
        row.autoCaptionProfile === "reaction" ||
        row.autoCaptionProfile === "news" ||
        row.autoCaptionProfile === "hook"
          ? row.autoCaptionProfile
          : FUN_CAPTION_TEMPLATE_DATA.autoCaptionProfile,
      autoCaptionIntensity: toNumberInRange(row.autoCaptionIntensity, FUN_CAPTION_TEMPLATE_DATA.autoCaptionIntensity, 0, 1),
      autoHighlightEnabled: typeof row.autoHighlightEnabled === "boolean" ? row.autoHighlightEnabled : FUN_CAPTION_TEMPLATE_DATA.autoHighlightEnabled,
      autoHighlightColor: normalizeColor(row.autoHighlightColor, FUN_CAPTION_TEMPLATE_DATA.autoHighlightColor),
      autoHighlightScale: toNumberInRange(row.autoHighlightScale, FUN_CAPTION_TEMPLATE_DATA.autoHighlightScale, 1, 1.4),
      topCaptionTextColor: normalizeColor(row.topCaptionTextColor, FUN_CAPTION_TEMPLATE_DATA.topCaptionTextColor),
      topCaptionBgColor: normalizeColor(row.topCaptionBgColor, FUN_CAPTION_TEMPLATE_DATA.topCaptionBgColor),
      captionLineHeight: toNumberInRange(row.captionLineHeight, FUN_CAPTION_TEMPLATE_DATA.captionLineHeight, 0.85, 1.5),
      cueDurationSec: toNumberInRange(row.cueDurationSec, FUN_CAPTION_TEMPLATE_DATA.cueDurationSec, 0.35, 3),
    };
  },
  buildSampleSlide: (imageUrl) => ({
    title: "스피드가 방송 중 실망한 순간들이라는데",
    text: "순간들이라는데",
    lines: ["순간들이라는데", "진짜 상처였대요", "반응이 갈렸습니다"],
    layout: "photo+body",
    imageUrl,
    mediaUrl: imageUrl,
    mediaKind: imageUrl && /\.(mp4|webm|mov)(\\?|#|$)/i.test(imageUrl) ? "video" : undefined,
    groupId: 0,
    stepIndex: 0,
  }),
  getRequirementAlert: (slides) =>
    buildTemplateRequirementAlert("펀캡션 템플릿", ["title", "text", "imageOrMedia"], slides),
};
