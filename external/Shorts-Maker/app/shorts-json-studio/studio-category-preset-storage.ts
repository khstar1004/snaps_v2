"use client";

import { normalizeCategory } from "@/lib/publish/categories";
import type { PublishCategory } from "@/lib/publish/types";
import { readScopedStorage, writeScopedStorage } from "@/lib/ui/scoped-storage";
import { normalizeStudioTemplateData } from "./components/templates/template-registry";
import {
  normalizeStudioTemplateId,
  type StudioTemplateId,
  type StudioTemplatePayload,
  type TemplateBranding,
  type TemplateImageLayout,
  type TemplateLayoutApply,
} from "./types";

export const STUDIO_EDITOR_PRESET_KEY = "studio-editor-preset-v1";

export type StoredCategoryTemplatePreset = {
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageUrl: string;
  templateImageLayout: TemplateImageLayout;
  templateLayoutApply: TemplateLayoutApply;
};

export type StoredCategoryBrandingPreset = {
  branding: TemplateBranding;
  updatedAt: number | null;
};

export type StoredCategoryPresetMeta = {
  hasBrandingPreset: boolean;
  hasTemplatePreset: boolean;
  brandingUpdatedAt: number | null;
  templateUpdatedAt: number | null;
};

export type PresetBrandingOverride = {
  category: PublishCategory;
  branding: TemplateBranding;
};

type TemplatePresetNormalizers = {
  normalizeTemplateImageLayout: (input: unknown) => TemplateImageLayout;
  normalizeTemplateLayoutApply: (input: unknown) => TemplateLayoutApply;
};

function readStoredEditorPreset(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = readScopedStorage(STUDIO_EDITOR_PRESET_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function readStoredTemplatePresetForCategory(
  category: PublishCategory,
  normalizers: TemplatePresetNormalizers
): StoredCategoryTemplatePreset | null {
  const parsed = readStoredEditorPreset();
  const templateByCategory = parsed.templateByCategory;
  if (templateByCategory && typeof templateByCategory === "object") {
    const matchedEntry = Object.entries(templateByCategory).find(([key]) => normalizeCategory(key) === category)?.[1];
    if (matchedEntry && typeof matchedEntry === "object") {
      const row = matchedEntry as Record<string, unknown>;
      const normalizedId = normalizeStudioTemplateId(row.templateId);
      return {
        templateId: normalizedId,
        templateData: normalizeStudioTemplateData(normalizedId, row.templateData),
        templateImageEnabled: Boolean(row.templateImageEnabled),
        templateImageUrl: typeof row.templateImageUrl === "string" ? row.templateImageUrl : "",
        templateImageLayout: normalizers.normalizeTemplateImageLayout(row.templateImageLayout),
        templateLayoutApply: normalizers.normalizeTemplateLayoutApply(row.templateLayoutApply),
      };
    }
  }
  const presetCategory = normalizeCategory(parsed.publishCategory);
  if (presetCategory && presetCategory === category) {
    const normalizedId = normalizeStudioTemplateId(parsed.templateId);
    return {
      templateId: normalizedId,
      templateData: normalizeStudioTemplateData(normalizedId, parsed.templateData),
      templateImageEnabled: Boolean(parsed.templateImageEnabled),
      templateImageUrl: typeof parsed.templateImageUrl === "string" ? parsed.templateImageUrl : "",
      templateImageLayout: normalizers.normalizeTemplateImageLayout(parsed.templateImageLayout),
      templateLayoutApply: normalizers.normalizeTemplateLayoutApply(parsed.templateLayoutApply),
    };
  }
  return null;
}

export function readStoredBrandingPresetForCategory(category: PublishCategory): StoredCategoryBrandingPreset | null {
  const parsed = readStoredEditorPreset();
  const brandingByCategory = parsed.brandingByCategory;
  if (brandingByCategory && typeof brandingByCategory === "object") {
    const matchedEntry = Object.entries(brandingByCategory).find(([key]) => normalizeCategory(key) === category)?.[1];
    if (matchedEntry && typeof matchedEntry === "object") {
      const row = matchedEntry as Record<string, unknown>;
      if (row.branding && typeof row.branding === "object") {
        return {
          branding: row.branding as TemplateBranding,
          updatedAt: Number.isFinite(Number(row.updatedAt)) ? Number(row.updatedAt) : null,
        };
      }
    }
  }
  const presetCategory = normalizeCategory(parsed.publishCategory);
  if (presetCategory && presetCategory === category && parsed.brandingDraft && typeof parsed.brandingDraft === "object") {
    return {
      branding: parsed.brandingDraft as TemplateBranding,
      updatedAt: null,
    };
  }
  return null;
}

export function readStoredPresetMetaForCategory(category: PublishCategory): StoredCategoryPresetMeta {
  const parsed = readStoredEditorPreset();
  const templateByCategory = parsed.templateByCategory && typeof parsed.templateByCategory === "object" ? parsed.templateByCategory : null;
  const brandingByCategory = parsed.brandingByCategory && typeof parsed.brandingByCategory === "object" ? parsed.brandingByCategory : null;
  const templateEntry = templateByCategory
    ? Object.entries(templateByCategory).find(([key]) => normalizeCategory(key) === category)?.[1]
    : null;
  const brandingEntry = brandingByCategory
    ? Object.entries(brandingByCategory).find(([key]) => normalizeCategory(key) === category)?.[1]
    : null;
  const presetCategory = normalizeCategory(parsed.publishCategory);
  return {
    hasBrandingPreset: Boolean(brandingEntry) || Boolean(presetCategory && presetCategory === category && parsed.brandingDraft),
    hasTemplatePreset:
      Boolean(templateEntry) ||
      Boolean(
        presetCategory &&
          presetCategory === category &&
          (parsed.templateId || parsed.templateImageLayout || parsed.templateImageUrl || typeof parsed.templateImageEnabled === "boolean")
      ),
    brandingUpdatedAt:
      brandingEntry && typeof brandingEntry === "object" && Number.isFinite(Number((brandingEntry as Record<string, unknown>).updatedAt))
        ? Number((brandingEntry as Record<string, unknown>).updatedAt)
        : null,
    templateUpdatedAt:
      templateEntry && typeof templateEntry === "object" && Number.isFinite(Number((templateEntry as Record<string, unknown>).updatedAt))
        ? Number((templateEntry as Record<string, unknown>).updatedAt)
        : null,
  };
}

export function persistStudioEditorPresetForCategory(input: {
  category: PublishCategory;
  branding: TemplateBranding;
  templatePreset: StoredCategoryTemplatePreset;
}): void {
  if (typeof window === "undefined") return;
  try {
    const parsed = readStoredEditorPreset();
    const templateByCategory =
      parsed.templateByCategory && typeof parsed.templateByCategory === "object"
        ? { ...(parsed.templateByCategory as Record<string, unknown>) }
        : {};
    const brandingByCategory =
      parsed.brandingByCategory && typeof parsed.brandingByCategory === "object"
        ? { ...(parsed.brandingByCategory as Record<string, unknown>) }
        : {};
    const updatedAt = Date.now();
    templateByCategory[input.category] = {
      ...(templateByCategory[input.category] && typeof templateByCategory[input.category] === "object"
        ? (templateByCategory[input.category] as Record<string, unknown>)
        : {}),
      templateId: input.templatePreset.templateId,
      templateData: input.templatePreset.templateData,
      templateImageEnabled: input.templatePreset.templateImageEnabled,
      templateImageUrl: input.templatePreset.templateImageUrl,
      templateImageLayout: input.templatePreset.templateImageLayout,
      templateLayoutApply: input.templatePreset.templateLayoutApply,
      templateLayoutJson: JSON.stringify(input.templatePreset.templateImageLayout, null, 2),
      updatedAt,
    };
    brandingByCategory[input.category] = {
      branding: input.branding,
      updatedAt,
    };
    writeScopedStorage(
      STUDIO_EDITOR_PRESET_KEY,
      JSON.stringify({
        ...parsed,
        publishCategory: input.category,
        brandingDraft: input.branding,
        templateId: input.templatePreset.templateId,
        templateData: input.templatePreset.templateData,
        templateImageEnabled: input.templatePreset.templateImageEnabled,
        templateImageUrl: input.templatePreset.templateImageUrl,
        templateImageLayout: input.templatePreset.templateImageLayout,
        templateLayoutApply: input.templatePreset.templateLayoutApply,
        templateByCategory,
        brandingByCategory,
      })
    );
  } catch {
    return;
  }
}

export function formatStudioPresetSavedAtLabel(value: number | null): string {
  if (!value || !Number.isFinite(value)) return "방금 저장되지 않았습니다.";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function resolveCategoryBranding(
  category: PublishCategory,
  input: {
    presetBrandingOverride: PresetBrandingOverride | null;
    categoryBrandingMap: Record<PublishCategory, TemplateBranding>;
    defaultBrandingByCategory: Record<PublishCategory, TemplateBranding>;
    brandingDraft: TemplateBranding;
  }
): TemplateBranding {
  const overrideBranding =
    input.presetBrandingOverride && input.presetBrandingOverride.category === category
      ? input.presetBrandingOverride.branding
      : null;
  return overrideBranding || input.categoryBrandingMap[category] || input.defaultBrandingByCategory[category] || input.brandingDraft;
}

export function isSameTemplateBranding(left: TemplateBranding, right: TemplateBranding): boolean {
  return (
    left.headerTitle === right.headerTitle &&
    (left.headerAccentText || "") === (right.headerAccentText || "") &&
    left.headerColor === right.headerColor &&
    left.footerColor === right.footerColor &&
    left.infoLineText === right.infoLineText &&
    left.fontFamily === right.fontFamily &&
    left.imageRounded === right.imageRounded
  );
}
