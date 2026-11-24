import { DEFAULT_PUBLISH_CATEGORY_OPTIONS, normalizeCategory, toCategoryLabel } from "@/lib/publish/categories";
import type { PublishCategory } from "@/lib/publish/types";
import {
  createStudioTemplateData,
  normalizeStudioTemplateData,
} from "@/app/shorts-json-studio/components/templates/template-registry";
import {
  normalizeStudioTemplateId,
  type StudioTemplateId,
  type StudioTemplatePayload,
} from "@/app/shorts-json-studio/types";

export const STUDIO_EDITOR_PRESET_KEY = "studio-editor-preset-v1";
export const LAYOUT_STUDIO_RECENT_CUSTOMERS_KEY = "layout-studio-recent-customers-v1";
export const DEFAULT_CATEGORY = DEFAULT_PUBLISH_CATEGORY_OPTIONS[0]?.key || "default";

export type LayoutRect = { x: number; y: number; w: number; h: number };
export type TemplateLayoutApply = { title: boolean; body: boolean; image: boolean; info: boolean };
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

export type TemplateBranding = {
  variant: "news";
  headerTitle: string;
  headerAccentText: string;
  headerColor: string;
  footerColor: string;
  infoLineText: string;
  fontFamily: string;
  imageRounded: boolean;
};

export type CategoryTemplatePreset = {
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageUrl: string;
  templateImageLayout: TemplateImageLayout;
  templateLayoutApply: TemplateLayoutApply;
  templateLayoutJson: string;
};

export type StudioEditorPreset = {
  publishCategory?: string;
  brandingDraft?: TemplateBranding;
  templateId?: StudioTemplateId;
  templateData?: StudioTemplatePayload;
  templateImageEnabled?: boolean;
  templateImageUrl?: string;
  templateImageLayout?: unknown;
  templateLayoutApply?: unknown;
  templateLayoutJson?: string;
  templateByCategory?: Record<string, unknown>;
};

export type EditorHistorySnapshot = {
  publishCategory: PublishCategory;
  brandingDraft: TemplateBranding;
  templateNotesByCategory: Record<PublishCategory, string>;
  templatePresetByCategory: Record<PublishCategory, CategoryTemplatePreset>;
};

export const LEGACY_GENERIC_TEMPLATE_IMAGE_LAYOUT: TemplateImageLayout = {
  headerTitleSlot: { x: 0.09, y: 0.018, w: 0.62, h: 0.04 },
  headerAccentSlot: { x: 0.62, y: 0.018, w: 0.28, h: 0.04 },
  titleSlot: { x: 0.08, y: 0.08, w: 0.84, h: 0.14 },
  bodySlot: { x: 0.08, y: 0.72, w: 0.84, h: 0.2 },
  imageSlot: { x: 0.08, y: 0.24, w: 0.84, h: 0.44 },
  infoSlot: { x: 0.08, y: 0.66, w: 0.84, h: 0.05 },
  headerTitleColor: "#ffffff",
  headerAccentColor: "rgba(255,255,255,0.9)",
  titleColor: "#ffffff",
  bodyColor: "#ffffff",
  infoColor: "rgba(255,255,255,0.92)",
  titleAlign: "center",
  bodyAlign: "center",
  headerSize: 17,
  titleSize: 46,
  bodySize: 26,
  infoSize: 15,
};

export const DEFAULT_TEMPLATE_IMAGE_LAYOUT: TemplateImageLayout = {
  headerTitleSlot: { x: 0.09, y: 0.018, w: 0.62, h: 0.04 },
  headerAccentSlot: { x: 0.62, y: 0.018, w: 0.28, h: 0.04 },
  titleSlot: { x: 0.09, y: 0.1, w: 0.82, h: 0.07 },
  bodySlot: { x: 0.09, y: 0.25, w: 0.82, h: 0.18 },
  imageSlot: { x: 0.09, y: 0.47, w: 0.82, h: 0.38 },
  infoSlot: { x: 0.09, y: 0.152, w: 0.82, h: 0.03 },
  headerTitleColor: "#ffffff",
  headerAccentColor: "rgba(255,255,255,0.9)",
  titleColor: "#ffffff",
  bodyColor: "#ffffff",
  infoColor: "rgba(255,255,255,0.92)",
  titleAlign: "center",
  bodyAlign: "center",
  headerSize: 17,
  titleSize: 46,
  bodySize: 26,
  infoSize: 15,
};

export const DEFAULT_LAYOUT_APPLY: TemplateLayoutApply = { title: true, body: true, image: true, info: true };

export const DEFAULT_BRANDING: TemplateBranding = {
  variant: "news",
  headerTitle: "쇼츠뉴스",
  headerAccentText: "핵심 브리핑",
  headerColor: "#1b3f8f",
  footerColor: "rgba(27,63,143,0.9)",
  infoLineText: "채널 | 01:22 | 조회 15634",
  fontFamily: '"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif',
  imageRounded: true,
};

export function toCustomerTemplatePresetKey(category: PublishCategory, templateId: StudioTemplateId): string {
  return `${category}::${templateId}`;
}

export function mergeCategoryOptions(
  current: Array<{ key: PublishCategory; label: string }>,
  incoming: Array<{ key: PublishCategory; label: string }>
): Array<{ key: PublishCategory; label: string }> {
  const merged = new Map<PublishCategory, { key: PublishCategory; label: string }>();
  for (const item of [...current, ...incoming]) {
    const key = normalizeCategory(item.key);
    if (!key) continue;
    merged.set(key, {
      key,
      label: item.label || key,
    });
  }
  return Array.from(merged.values()).sort((left, right) => {
    const leftDefaultRank = left.key === DEFAULT_CATEGORY ? 0 : 1;
    const rightDefaultRank = right.key === DEFAULT_CATEGORY ? 0 : 1;
    if (leftDefaultRank !== rightDefaultRank) return leftDefaultRank - rightDefaultRank;
    return (left.label || left.key).localeCompare(right.label || right.key, "ko-KR", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export function createCategoryOptionsFromKeys(keys: Array<unknown>): Array<{ key: PublishCategory; label: string }> {
  return mergeCategoryOptions(
    [],
    keys
      .map((value) => normalizeCategory(value))
      .filter((value): value is PublishCategory => Boolean(value))
      .map((value) => ({
        key: value,
        label: toCategoryLabel(value),
      }))
  );
}

export function formatCustomerOptionLabel(input: { key: PublishCategory; label: string }): string {
  if (!input.label) return input.key;
  if (input.label === input.key) return input.label;
  return `${input.label} (${input.key})`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeOptionalFontWeight(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(100, Math.min(900, Math.round(parsed / 100) * 100));
}

export function sanitizeRect(input: unknown, fallback: LayoutRect): LayoutRect {
  if (!input || typeof input !== "object") return fallback;
  const row = input as Record<string, unknown>;
  const x = clamp01(Number(row.x));
  const y = clamp01(Number(row.y));
  const w = Math.max(0.05, Math.min(1, Number(row.w)));
  const h = Math.max(0.04, Math.min(1, Number(row.h)));
  return { x, y, w: Math.min(1 - x, w), h: Math.min(1 - y, h) };
}

export function cloneEditorHistorySnapshot(value: EditorHistorySnapshot): EditorHistorySnapshot {
  return JSON.parse(JSON.stringify(value)) as EditorHistorySnapshot;
}

export function serializeEditorHistorySnapshot(value: EditorHistorySnapshot): string {
  return JSON.stringify(value);
}

function isSameRectInput(input: unknown, target: LayoutRect): boolean {
  if (!input || typeof input !== "object") return false;
  const row = input as Record<string, unknown>;
  return Number(row.x) === target.x && Number(row.y) === target.y && Number(row.w) === target.w && Number(row.h) === target.h;
}

export function isLegacyGenericTemplateImageLayout(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const row = input as Record<string, unknown>;
  return (
    isSameRectInput(row.titleSlot, LEGACY_GENERIC_TEMPLATE_IMAGE_LAYOUT.titleSlot) &&
    isSameRectInput(row.bodySlot, LEGACY_GENERIC_TEMPLATE_IMAGE_LAYOUT.bodySlot) &&
    isSameRectInput(row.imageSlot, LEGACY_GENERIC_TEMPLATE_IMAGE_LAYOUT.imageSlot) &&
    isSameRectInput(row.infoSlot, LEGACY_GENERIC_TEMPLATE_IMAGE_LAYOUT.infoSlot)
  );
}

export function isLegacyDefaultNewsTemplateImageLayout(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const row = input as Record<string, unknown>;
  return (
    isSameRectInput(row.headerTitleSlot, { x: 0.09, y: 0.018, w: 0.42, h: 0.04 }) &&
    isSameRectInput(row.headerAccentSlot, { x: 0.62, y: 0.018, w: 0.28, h: 0.04 }) &&
    isSameRectInput(row.titleSlot, { x: 0.09, y: 0.1, w: 0.82, h: 0.07 }) &&
    isSameRectInput(row.bodySlot, { x: 0.09, y: 0.25, w: 0.82, h: 0.18 }) &&
    isSameRectInput(row.imageSlot, { x: 0.09, y: 0.47, w: 0.82, h: 0.38 }) &&
    isSameRectInput(row.infoSlot, { x: 0.09, y: 0.175, w: 0.82, h: 0.035 })
  );
}

export function serializeTemplateLayoutForEditor(layout: TemplateImageLayout): string {
  const { imageSlot: _imageSlot, ...editableLayout } = layout;
  return JSON.stringify(editableLayout, null, 2);
}

export function normalizeTemplateImageLayout(input: unknown): TemplateImageLayout {
  const baseRow = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const row =
    isLegacyGenericTemplateImageLayout(input) || isLegacyDefaultNewsTemplateImageLayout(input)
      ? {
          ...baseRow,
          headerTitleSlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerTitleSlot,
          headerAccentSlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerAccentSlot,
          titleSlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.titleSlot,
          bodySlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.bodySlot,
          imageSlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.imageSlot,
          infoSlot: DEFAULT_TEMPLATE_IMAGE_LAYOUT.infoSlot,
        }
      : baseRow;
  const titleAlign = row.titleAlign === "left" || row.titleAlign === "right" ? row.titleAlign : "center";
  const bodyAlign = row.bodyAlign === "left" || row.bodyAlign === "right" ? row.bodyAlign : "center";
  const legacyInfoSize = Math.max(8, Math.min(24, Number(row.infoSize) || DEFAULT_TEMPLATE_IMAGE_LAYOUT.infoSize));
  return {
    headerTitleSlot: sanitizeRect(row.headerTitleSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerTitleSlot),
    headerAccentSlot: sanitizeRect(row.headerAccentSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerAccentSlot),
    titleSlot: sanitizeRect(row.titleSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.titleSlot),
    bodySlot: sanitizeRect(row.bodySlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.bodySlot),
    imageSlot: sanitizeRect(row.imageSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.imageSlot),
    infoSlot: sanitizeRect(row.infoSlot, DEFAULT_TEMPLATE_IMAGE_LAYOUT.infoSlot),
    headerTitleColor:
      typeof row.headerTitleColor === "string" && row.headerTitleColor.trim()
        ? row.headerTitleColor.trim()
        : DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerTitleColor,
    headerAccentColor:
      typeof row.headerAccentColor === "string" && row.headerAccentColor.trim()
        ? row.headerAccentColor.trim()
        : DEFAULT_TEMPLATE_IMAGE_LAYOUT.headerAccentColor,
    titleColor: typeof row.titleColor === "string" && row.titleColor.trim() ? row.titleColor.trim() : DEFAULT_TEMPLATE_IMAGE_LAYOUT.titleColor,
    bodyColor: typeof row.bodyColor === "string" && row.bodyColor.trim() ? row.bodyColor.trim() : DEFAULT_TEMPLATE_IMAGE_LAYOUT.bodyColor,
    infoColor: typeof row.infoColor === "string" && row.infoColor.trim() ? row.infoColor.trim() : DEFAULT_TEMPLATE_IMAGE_LAYOUT.infoColor,
    titleAlign,
    bodyAlign,
    headerSize: Math.max(10, Math.min(32, Number(row.headerSize) || legacyInfoSize + 2)),
    titleSize: Math.max(10, Math.min(52, Number(row.titleSize) || DEFAULT_TEMPLATE_IMAGE_LAYOUT.titleSize)),
    bodySize: Math.max(9, Math.min(36, Number(row.bodySize) || DEFAULT_TEMPLATE_IMAGE_LAYOUT.bodySize)),
    infoSize: legacyInfoSize,
    headerTitleWeight: normalizeOptionalFontWeight(row.headerTitleWeight),
    headerAccentWeight: normalizeOptionalFontWeight(row.headerAccentWeight),
    titleWeight: normalizeOptionalFontWeight(row.titleWeight),
    bodyWeight: normalizeOptionalFontWeight(row.bodyWeight),
    infoWeight: normalizeOptionalFontWeight(row.infoWeight),
  };
}

export function normalizeTemplateLayoutApply(input: unknown): TemplateLayoutApply {
  if (!input || typeof input !== "object") return DEFAULT_LAYOUT_APPLY;
  const row = input as Record<string, unknown>;
  return {
    title: Boolean(row.title),
    body: Boolean(row.body),
    image: Boolean(row.image),
    info: Boolean(row.info),
  };
}

export function createDefaultCategoryTemplatePreset(): CategoryTemplatePreset {
  return {
    templateId: "default",
    templateData: createStudioTemplateData("default"),
    templateImageEnabled: false,
    templateImageUrl: "",
    templateImageLayout: DEFAULT_TEMPLATE_IMAGE_LAYOUT,
    templateLayoutApply: DEFAULT_LAYOUT_APPLY,
    templateLayoutJson: serializeTemplateLayoutForEditor(DEFAULT_TEMPLATE_IMAGE_LAYOUT),
  };
}

export function normalizeCategoryTemplatePreset(input: unknown): CategoryTemplatePreset {
  const row = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const templateId = normalizeStudioTemplateId(row.templateId);
  const templateImageLayout = normalizeTemplateImageLayout(row.templateImageLayout);
  let templateLayoutJson = serializeTemplateLayoutForEditor(templateImageLayout);
  if (typeof row.templateLayoutJson === "string" && row.templateLayoutJson.trim()) {
    try {
      templateLayoutJson = serializeTemplateLayoutForEditor(
        normalizeTemplateImageLayout(JSON.parse(row.templateLayoutJson) as unknown)
      );
    } catch {
      templateLayoutJson = row.templateLayoutJson;
    }
  }
  return {
    templateId,
    templateData: normalizeStudioTemplateData(templateId, row.templateData),
    templateImageEnabled: Boolean(row.templateImageEnabled),
    templateImageUrl: typeof row.templateImageUrl === "string" ? row.templateImageUrl : "",
    templateImageLayout,
    templateLayoutApply: normalizeTemplateLayoutApply(row.templateLayoutApply),
    templateLayoutJson,
  };
}
