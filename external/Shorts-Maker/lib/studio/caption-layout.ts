import type { StudioRenderTemplateImageLayout } from "@/types/studio-renderer";
import type { StudioTemplateId, StudioTemplatePayload } from "@/types/studio-template";

export const LEGACY_MAX_CAPTION_LINE_CHARACTERS = 12;
export const CAPTION_LAYOUT_RENDER_WIDTH_PX = 1080;
export const CAPTION_LAYOUT_SAFETY_RATIO = 0.95;

export type CaptionLayoutPolicy =
  | {
      mode: "character-count";
      maxCharacters: number;
    }
  | {
      mode: "render-width";
      maxWidthPx: number;
      fontSizePx: number;
    };

export type CaptionLayoutPolicyInput = {
  templateId?: StudioTemplateId | unknown;
  templateData?: StudioTemplatePayload | unknown;
  templateImageEnabled?: boolean | unknown;
  templateImageLayout?: StudioRenderTemplateImageLayout | unknown;
};

export const LEGACY_CAPTION_LAYOUT_POLICY: CaptionLayoutPolicy = {
  mode: "character-count",
  maxCharacters: LEGACY_MAX_CAPTION_LINE_CHARACTERS,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

export function estimateTextWidthPxApprox(text: string, fontPx: number): number {
  const safeFontPx = Math.max(1, Number(fontPx) || 1);
  return Array.from(String(text || "")).reduce((total, character) => {
    if (/\s/u.test(character)) return total + safeFontPx * 0.32;
    if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(character)) return total + safeFontPx;
    if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/u.test(character)) return total + safeFontPx * 0.98;
    if (/[A-Za-z0-9]/u.test(character)) return total + safeFontPx * 0.58;
    if (/[()[\]{}<>〈〉《》「」『』【】〔〕]/u.test(character)) return total + safeFontPx * 0.42;
    if (/[.,!?;:'"·…~\-_/，。！？：；]/u.test(character)) return total + safeFontPx * 0.42;
    return total + safeFontPx * 0.98;
  }, 0);
}

export function createCaptionLayoutPolicy(input: CaptionLayoutPolicyInput = {}): CaptionLayoutPolicy {
  if (input.templateId !== "default") return LEGACY_CAPTION_LAYOUT_POLICY;

  const layout = asRecord(input.templateImageLayout);
  const bodySlot = asRecord(layout?.bodySlot);
  if (!layout || !bodySlot) return LEGACY_CAPTION_LAYOUT_POLICY;

  const bodyWidthRatio = clampNumber(bodySlot.w, 0, 0.05, 1);
  if (bodyWidthRatio <= 0) return LEGACY_CAPTION_LAYOUT_POLICY;

  const templateData = asRecord(input.templateData);
  const bodySize = clampNumber(layout.bodySize, 26, 9, 36);
  const bodyScale = clampNumber(templateData?.bodyScale, 1, 0.7, 1.4);
  const fontSizePx = (bodySize * CAPTION_LAYOUT_RENDER_WIDTH_PX * bodyScale) / 270;
  const paddingBase = input.templateImageEnabled === true ? 8 : 6;
  const horizontalPaddingPx = (paddingBase * CAPTION_LAYOUT_RENDER_WIDTH_PX) / 270;
  const availableWidthPx = Math.max(
    1,
    bodyWidthRatio * CAPTION_LAYOUT_RENDER_WIDTH_PX - horizontalPaddingPx * 2,
  );

  return {
    mode: "render-width",
    fontSizePx,
    maxWidthPx: availableWidthPx * CAPTION_LAYOUT_SAFETY_RATIO,
  };
}

export function measureCaptionLine(text: string, policy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY): number {
  return policy.mode === "render-width"
    ? estimateTextWidthPxApprox(text, policy.fontSizePx)
    : Array.from(String(text || "")).length;
}

export function getCaptionLineBudget(policy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY): number {
  return policy.mode === "render-width" ? policy.maxWidthPx : policy.maxCharacters;
}

export function captionLineFits(text: string, policy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY): boolean {
  return measureCaptionLine(text, policy) <= getCaptionLineBudget(policy);
}

export function toCaptionPlanningLength(
  text: string,
  policy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): number {
  if (policy.mode === "character-count") return measureCaptionLine(text, policy);
  return (measureCaptionLine(text, policy) / policy.maxWidthPx) * LEGACY_MAX_CAPTION_LINE_CHARACTERS;
}

export function describeCaptionLayoutBudget(policy: CaptionLayoutPolicy): string {
  if (policy.mode === "character-count") {
    return `한 줄 최대 ${policy.maxCharacters}자(공백·괄호·한자 포함)`;
  }
  return `한 줄 폭 예산 ${Math.floor(policy.maxWidthPx)}px(글꼴 ${Math.round(policy.fontSizePx)}px, 안전 여백 적용)`;
}

export function buildCaptionTokenWidthPlan(tokens: string[], policy: CaptionLayoutPolicy): string {
  const unit = policy.mode === "render-width" ? "px" : "자";
  const entries = tokens.map((token, index) => `${index}:${Math.ceil(measureCaptionLine(token, policy))}${unit}`);
  const separatorWidth = Math.ceil(measureCaptionLine(" ", policy));
  return `토큰 폭(${unit}): ${entries.join(", ")}\n토큰 사이 공백 폭: ${separatorWidth}${unit}`;
}
