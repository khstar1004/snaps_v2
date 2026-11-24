import type { PublishCategory } from "@/lib/publish/types";
import { DEFAULT_PUBLISH_CATEGORIES } from "@/lib/publish/categories";

export type TemplateBrandingSettings = {
  headerTitle: string;
  headerAccentText: string;
  headerColor: string;
  footerColor: string;
  infoLineText: string;
  fontFamily: string;
  imageRounded: boolean;
};

const FALLBACK_TEMPLATE_BRANDING: TemplateBrandingSettings = {
  headerTitle: "쇼츠뉴스",
  headerAccentText: "핵심 브리핑",
  headerColor: "#1b3f8f",
  footerColor: "rgba(27,63,143,0.9)",
  infoLineText: "채널 | 01:22 | 조회 15634",
  fontFamily: '"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif',
  imageRounded: true,
};

const DEFAULT_BRANDING_BY_CATEGORY: Record<string, TemplateBrandingSettings> = {
  conservative: {
    headerTitle: "한국뉴스",
    headerAccentText: "팩트체크",
    headerColor: "#0f3fa8",
    footerColor: "rgba(15,63,168,0.9)",
    infoLineText: "ㅇㅇ | 01:22 | 조회 15634",
    fontFamily: '"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif',
    imageRounded: true,
  },
  progressive: {
    headerTitle: "공신뉴스",
    headerAccentText: "팩트체크",
    headerColor: "#a82525",
    footerColor: "rgba(168,37,37,0.9)",
    infoLineText: "ㅇㅇ | 01:22 | 조회 15634",
    fontFamily: '"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif',
    imageRounded: true,
  },
};

export function getDefaultTemplateBranding(category: PublishCategory): TemplateBrandingSettings {
  return DEFAULT_BRANDING_BY_CATEGORY[category] || FALLBACK_TEMPLATE_BRANDING;
}

export function listDefaultTemplateBrandings(): Record<PublishCategory, TemplateBrandingSettings> {
  const result: Record<PublishCategory, TemplateBrandingSettings> = {};
  for (const category of DEFAULT_PUBLISH_CATEGORIES) {
    result[category] = getDefaultTemplateBranding(category);
  }
  return result;
}
