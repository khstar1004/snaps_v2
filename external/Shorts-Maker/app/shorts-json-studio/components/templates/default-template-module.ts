"use client";

import type { DefaultTemplateData } from "@/types/studio-template";
import {
  buildTemplateRequirementAlert,
  normalizeColor,
  toNumberInRange,
  toScale,
  type StudioTemplateModule,
} from "./template-module-types";

const DEFAULT_TEMPLATE_DATA: DefaultTemplateData = {
  titleScale: 1,
  bodyScale: 1,
  cueMetadataEnabled: false,
  autoCaptionFxEnabled: false,
  autoCaptionProfile: "news",
  autoCaptionIntensity: 0.42,
  autoHighlightEnabled: true,
  autoHighlightColor: "#2563eb",
  autoHighlightScale: 1.08,
  cueDurationSec: 1.35,
};

export const defaultTemplateModule: StudioTemplateModule<"default"> = {
  id: "default",
  definition: {
    id: "default",
    label: "기본 템플릿",
    accent: "#d6a24a",
    description: "원래 쓰던 뉴스형 템플릿",
    summary: "상단 헤더, 제목, 정보줄, 본문, 이미지 구조를 유지합니다.",
    inputGuide: "제목은 큰 제목, 본문은 설명 글, 사진이나 영상은 본문 아래 자료 화면으로 들어갑니다.",
    layoutStudioHint: "기본 템플릿은 원래 뉴스형 구조를 유지합니다. 레이아웃 스튜디오에서 칸 위치와 글자 배치를 세밀하게 손볼 수 있습니다.",
    usesLegacyOverlayEditor: true,
    supportedFeatures: {
      captionFeature: false,
      overlayFeature: false,
      cueMetadata: true,
      autoCaptionFx: true,
    },
    requiredFields: ["title", "text"],
  },
  createTemplateData: () => ({ ...DEFAULT_TEMPLATE_DATA }),
  normalizeTemplateData: (value) => {
    const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    return {
      titleScale: toScale(row.titleScale, DEFAULT_TEMPLATE_DATA.titleScale),
      bodyScale: toScale(row.bodyScale, DEFAULT_TEMPLATE_DATA.bodyScale),
      cueMetadataEnabled: typeof row.cueMetadataEnabled === "boolean" ? row.cueMetadataEnabled : DEFAULT_TEMPLATE_DATA.cueMetadataEnabled,
      autoCaptionFxEnabled: typeof row.autoCaptionFxEnabled === "boolean" ? row.autoCaptionFxEnabled : DEFAULT_TEMPLATE_DATA.autoCaptionFxEnabled,
      autoCaptionProfile:
        row.autoCaptionProfile === "off" ||
        row.autoCaptionProfile === "reaction" ||
        row.autoCaptionProfile === "news" ||
        row.autoCaptionProfile === "hook"
          ? row.autoCaptionProfile
          : DEFAULT_TEMPLATE_DATA.autoCaptionProfile,
      autoCaptionIntensity: toNumberInRange(row.autoCaptionIntensity, DEFAULT_TEMPLATE_DATA.autoCaptionIntensity, 0, 1),
      autoHighlightEnabled: typeof row.autoHighlightEnabled === "boolean" ? row.autoHighlightEnabled : DEFAULT_TEMPLATE_DATA.autoHighlightEnabled,
      autoHighlightColor: normalizeColor(row.autoHighlightColor, DEFAULT_TEMPLATE_DATA.autoHighlightColor),
      autoHighlightScale: toNumberInRange(row.autoHighlightScale, DEFAULT_TEMPLATE_DATA.autoHighlightScale, 1, 1.3),
      cueDurationSec: toNumberInRange(row.cueDurationSec, DEFAULT_TEMPLATE_DATA.cueDurationSec, 0.35, 3),
    };
  },
  buildSampleSlide: (imageUrl) => ({
    title: "전여친 찾아갔다가 전과자?",
    text: "그 마음 이해해.\n위험하거나",
    lines: ["그 마음 이해해.", "위험하거나"],
    layout: "photo+body",
    imageUrl,
    groupId: 0,
    stepIndex: 0,
  }),
  getRequirementAlert: (slides) =>
    buildTemplateRequirementAlert("기본 템플릿", ["title", "text"], slides),
};
