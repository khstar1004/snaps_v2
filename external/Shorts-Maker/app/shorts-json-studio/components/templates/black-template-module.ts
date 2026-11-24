"use client";

import type { BlackTemplateData } from "@/types/studio-template";
import {
  buildTemplateRequirementAlert,
  normalizeColor,
  toNumberInRange,
  toScale,
  type StudioTemplateModule,
} from "./template-module-types";

const BLACK_TEMPLATE_DATA: BlackTemplateData = {
  accentColor: "#ffe03e",
  titleScale: 1,
  bodyScale: 1,
  mediaRadius: 14,
  cueMetadataEnabled: true,
  autoCaptionFxEnabled: true,
  autoCaptionProfile: "hook",
  autoCaptionIntensity: 0.58,
  autoHighlightEnabled: true,
  autoHighlightColor: "#ffe03e",
  autoHighlightScale: 1.12,
  cueDurationSec: 1.2,
};

export const blackTemplateModule: StudioTemplateModule<"black"> = {
  id: "black",
  definition: {
    id: "black",
    label: "Black 템플릿",
    accent: "#ffe14a",
    description: "검정 배경의 제목-미디어-본문 숏폼 템플릿",
    summary: "상단 후킹 제목, 중앙 미디어, 하단 본문으로 구성됩니다.",
    inputGuide: "위에는 제목, 가운데에는 사진이나 영상, 아래에는 본문이 들어갑니다.",
    layoutStudioHint: "Black 템플릿은 구조가 정해진 편입니다. 템플릿 선택과 미리보기, 자막 강조 설정을 중심으로 만지면 됩니다.",
    usesLegacyOverlayEditor: false,
    supportedFeatures: {
      captionFeature: false,
      overlayFeature: false,
      cueMetadata: true,
      autoCaptionFx: true,
    },
    requiredFields: ["title", "text", "imageOrMedia"],
  },
  createTemplateData: () => ({ ...BLACK_TEMPLATE_DATA }),
  normalizeTemplateData: (value) => {
    const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    return {
      accentColor: normalizeColor(row.accentColor, BLACK_TEMPLATE_DATA.accentColor),
      titleScale: toScale(row.titleScale, BLACK_TEMPLATE_DATA.titleScale),
      bodyScale: toScale(row.bodyScale, BLACK_TEMPLATE_DATA.bodyScale),
      mediaRadius: toNumberInRange(row.mediaRadius, BLACK_TEMPLATE_DATA.mediaRadius, 0, 40),
      cueMetadataEnabled: typeof row.cueMetadataEnabled === "boolean" ? row.cueMetadataEnabled : BLACK_TEMPLATE_DATA.cueMetadataEnabled,
      autoCaptionFxEnabled: typeof row.autoCaptionFxEnabled === "boolean" ? row.autoCaptionFxEnabled : BLACK_TEMPLATE_DATA.autoCaptionFxEnabled,
      autoCaptionProfile:
        row.autoCaptionProfile === "off" ||
        row.autoCaptionProfile === "reaction" ||
        row.autoCaptionProfile === "news" ||
        row.autoCaptionProfile === "hook"
          ? row.autoCaptionProfile
          : BLACK_TEMPLATE_DATA.autoCaptionProfile,
      autoCaptionIntensity: toNumberInRange(row.autoCaptionIntensity, BLACK_TEMPLATE_DATA.autoCaptionIntensity, 0, 1),
      autoHighlightEnabled: typeof row.autoHighlightEnabled === "boolean" ? row.autoHighlightEnabled : BLACK_TEMPLATE_DATA.autoHighlightEnabled,
      autoHighlightColor: normalizeColor(row.autoHighlightColor, BLACK_TEMPLATE_DATA.autoHighlightColor),
      autoHighlightScale: toNumberInRange(row.autoHighlightScale, BLACK_TEMPLATE_DATA.autoHighlightScale, 1, 1.4),
      cueDurationSec: toNumberInRange(row.cueDurationSec, BLACK_TEMPLATE_DATA.cueDurationSec, 0.35, 3),
    };
  },
  buildSampleSlide: (imageUrl) => ({
    title: "혼자 보기에도 민망한 애니",
    text: "알면 의외로 혼자 보기 민망한 장면만 정리했습니다.",
    lines: ["알면 의외로", "혼자 보기 민망한", "장면만 정리했습니다."],
    layout: "photo+body",
    imageUrl,
    groupId: 0,
    stepIndex: 0,
  }),
  getRequirementAlert: (slides) =>
    buildTemplateRequirementAlert("Black 템플릿", ["title", "text", "imageOrMedia"], slides),
};
