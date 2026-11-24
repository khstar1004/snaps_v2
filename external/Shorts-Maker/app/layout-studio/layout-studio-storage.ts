"use client";

import { normalizeCategory } from "@/lib/publish/categories";
import type { PublishCategory } from "@/lib/publish/types";
import {
  createStudioTemplateData,
  normalizeStudioTemplateData,
} from "@/app/shorts-json-studio/components/templates/template-registry";
import type { StudioTemplateId } from "@/app/shorts-json-studio/types";
import {
  DEFAULT_CATEGORY,
  normalizeCategoryTemplatePreset,
  toCustomerTemplatePresetKey,
  type CategoryTemplatePreset,
  type StudioEditorPreset,
  type TemplateBranding,
} from "./layout-studio-helpers";

const MAX_RECENT_CUSTOMERS = 8;

function appendCategoryOption(
  target: Array<{ key: PublishCategory; label: string }>,
  category: PublishCategory | undefined
): void {
  if (!category || target.some((item) => item.key === category)) return;
  target.push({ key: category, label: category });
}

export type LayoutStudioStoredPresetHydration = {
  nextPublishCategory?: PublishCategory;
  brandingDraftPatch?: Partial<TemplateBranding>;
  categoryOptions: Array<{ key: PublishCategory; label: string }>;
  localPresetTemplateKeys: Record<string, boolean>;
  templatePresetByCategory?: Record<PublishCategory, CategoryTemplatePreset>;
  replaceTemplatePresetByCategory: boolean;
};

export function parseLayoutStudioRecentCustomerKeys(raw: string | null | undefined): PublishCategory[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => normalizeCategory(value))
      .filter((value): value is PublishCategory => Boolean(value))
      .slice(0, MAX_RECENT_CUSTOMERS);
  } catch {
    return [];
  }
}

export function getNextLayoutStudioRecentCustomerKeys(
  publishCategory: PublishCategory,
  previous: PublishCategory[]
): PublishCategory[] {
  return [publishCategory, ...previous.filter((item) => item !== publishCategory)].slice(0, MAX_RECENT_CUSTOMERS);
}

export function createRequestedLayoutStudioPresetPatch(input: {
  requestedCategory?: PublishCategory | null;
  requestedTemplateId?: StudioTemplateId | null;
}): Record<PublishCategory, CategoryTemplatePreset> | undefined {
  if (!input.requestedCategory || !input.requestedTemplateId) return undefined;
  return {
    [input.requestedCategory]: normalizeCategoryTemplatePreset({
      templateId: input.requestedTemplateId,
      templateData: createStudioTemplateData(input.requestedTemplateId),
    }),
  };
}

export function hydrateLayoutStudioStoredPreset(
  raw: string | null | undefined,
  input: {
    requestedCategory?: PublishCategory | null;
    requestedTemplateId?: StudioTemplateId | null;
  }
): LayoutStudioStoredPresetHydration | null {
  const requestedCategory = input.requestedCategory || undefined;
  const requestedTemplateId = input.requestedTemplateId || undefined;

  if (!raw) {
    return {
      nextPublishCategory: requestedCategory,
      categoryOptions: requestedCategory ? [{ key: requestedCategory, label: requestedCategory }] : [],
      localPresetTemplateKeys: {},
      templatePresetByCategory: createRequestedLayoutStudioPresetPatch({ requestedCategory, requestedTemplateId }),
      replaceTemplatePresetByCategory: false,
    };
  }

  let parsed: StudioEditorPreset;
  try {
    parsed = JSON.parse(raw) as StudioEditorPreset;
  } catch {
    return null;
  }

  const localPresetTemplateKeys: Record<string, boolean> = {};
  const categoryOptions: Array<{ key: PublishCategory; label: string }> = [];
  const presetCategory = normalizeCategory(parsed.publishCategory);
  const nextPublishCategory = requestedCategory || presetCategory || undefined;
  appendCategoryOption(categoryOptions, nextPublishCategory);

  const templatePresetByCategory: Record<PublishCategory, CategoryTemplatePreset> = {};
  if (parsed.templateByCategory && typeof parsed.templateByCategory === "object") {
    for (const [key, value] of Object.entries(parsed.templateByCategory)) {
      const category = normalizeCategory(key);
      if (!category) continue;
      const normalizedPreset = normalizeCategoryTemplatePreset(value);
      templatePresetByCategory[category] = normalizedPreset;
      localPresetTemplateKeys[toCustomerTemplatePresetKey(category, normalizedPreset.templateId)] = true;
      appendCategoryOption(categoryOptions, category);
    }
  }

  if (Object.keys(templatePresetByCategory).length === 0) {
    const fallbackCategory = nextPublishCategory || DEFAULT_CATEGORY;
    const fallbackPreset = normalizeCategoryTemplatePreset({
      templateId: requestedTemplateId || parsed.templateId,
      templateData: parsed.templateData,
      templateImageEnabled: parsed.templateImageEnabled,
      templateImageUrl: parsed.templateImageUrl,
      templateImageLayout: parsed.templateImageLayout,
      templateLayoutApply: parsed.templateLayoutApply,
      templateLayoutJson: parsed.templateLayoutJson,
    });
    templatePresetByCategory[fallbackCategory] = fallbackPreset;
    localPresetTemplateKeys[toCustomerTemplatePresetKey(fallbackCategory, fallbackPreset.templateId)] = true;
  }

  if (nextPublishCategory && requestedTemplateId && templatePresetByCategory[nextPublishCategory]) {
    templatePresetByCategory[nextPublishCategory] = {
      ...templatePresetByCategory[nextPublishCategory],
      templateId: requestedTemplateId,
      templateData: normalizeStudioTemplateData(
        requestedTemplateId,
        templatePresetByCategory[nextPublishCategory].templateData
      ),
    };
    localPresetTemplateKeys[toCustomerTemplatePresetKey(nextPublishCategory, requestedTemplateId)] = true;
  }

  return {
    nextPublishCategory,
    brandingDraftPatch: parsed.brandingDraft,
    categoryOptions,
    localPresetTemplateKeys,
    templatePresetByCategory,
    replaceTemplatePresetByCategory: true,
  };
}

export function serializeLayoutStudioStoredPreset(input: {
  publishCategory: PublishCategory;
  brandingDraft: TemplateBranding;
  activeTemplatePreset: CategoryTemplatePreset;
  templatePresetByCategory: Record<PublishCategory, CategoryTemplatePreset>;
}): string {
  const active = input.activeTemplatePreset;
  return JSON.stringify({
    publishCategory: input.publishCategory,
    brandingDraft: input.brandingDraft,
    templateId: active.templateId,
    templateData: active.templateData,
    templateImageEnabled: active.templateImageEnabled,
    templateImageUrl: active.templateImageUrl,
    templateImageLayout: active.templateImageLayout,
    templateLayoutApply: active.templateLayoutApply,
    templateLayoutJson: active.templateLayoutJson,
    templateByCategory: {
      ...input.templatePresetByCategory,
      [input.publishCategory]: active,
    },
  });
}
