"use client";

import { useCallback, useMemo } from "react";
import { resolveAutoSfxCategoryIds } from "@/lib/studio/audio-options";
import type { PreparedSlide } from "@/types/studio-json";
import {
  buildStudioTemplateSampleSlide,
  getStudioTemplateDefinition,
  getTemplateRequirementAlert,
} from "./components/templates/template-registry";
import type { StudioTemplateId, StudioTemplatePayload, TemplateImageLayout, TemplateLayoutApply } from "./types";

type EffectiveCategoryTemplatePreset = {
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageUrl: string;
  templateImageLayout: TemplateImageLayout;
  templateLayoutApply: TemplateLayoutApply;
};

type UseStudioBrandingPanelViewModelInput = {
  brandingPanelPreviewIndex: number;
  closeBrandingPanel: () => void;
  displaySlides: PreparedSlide[];
  effectiveCategoryTemplatePreset: EffectiveCategoryTemplatePreset;
  generalSfxCategoryId: string;
  publishCategory: string;
  publishTitle: string;
  sfxCategories: Array<{ id: string }>;
  jsonText: string;
  toSafeFileNameAction: (name: string) => string;
};

export function useStudioBrandingPanelViewModel(input: UseStudioBrandingPanelViewModelInput) {
  const templateRequirementAlert = useMemo(
    () => getTemplateRequirementAlert(input.effectiveCategoryTemplatePreset.templateId, input.displaySlides),
    [input.displaySlides, input.effectiveCategoryTemplatePreset.templateId]
  );

  const activeTemplateDefinition = useMemo(
    () => getStudioTemplateDefinition(input.effectiveCategoryTemplatePreset.templateId),
    [input.effectiveCategoryTemplatePreset.templateId]
  );

  const captionFeaturePreviewSlide = useMemo(
    () =>
      input.displaySlides.find((slide) => String(slide.mediaUrl || "").trim() || String(slide.imageUrl || "").trim()) ||
      input.displaySlides[0] ||
      null,
    [input.displaySlides]
  );

  const brandingPanelPreviewSlides = useMemo(
    () =>
      input.displaySlides.length > 0
        ? input.displaySlides
        : [
            buildStudioTemplateSampleSlide(
              input.effectiveCategoryTemplatePreset.templateId,
              input.effectiveCategoryTemplatePreset.templateImageEnabled
                ? input.effectiveCategoryTemplatePreset.templateImageUrl || undefined
                : undefined
            ),
          ],
    [
      input.displaySlides,
      input.effectiveCategoryTemplatePreset.templateId,
      input.effectiveCategoryTemplatePreset.templateImageEnabled,
      input.effectiveCategoryTemplatePreset.templateImageUrl,
    ]
  );

  const brandingPanelPreviewUsesSample = input.displaySlides.length <= 0;

  const layoutStudioHref = useMemo(() => {
    const params = new URLSearchParams({
      category: input.publishCategory,
      templateId: input.effectiveCategoryTemplatePreset.templateId,
      slideIndex: String(
        Math.max(0, Math.min(input.brandingPanelPreviewIndex, Math.max(brandingPanelPreviewSlides.length - 1, 0)))
      ),
    });
    return `/layout-studio?${params.toString()}`;
  }, [
    brandingPanelPreviewSlides.length,
    input.brandingPanelPreviewIndex,
    input.effectiveCategoryTemplatePreset.templateId,
    input.publishCategory,
  ]);

  const templateManagerHref = useMemo(() => {
    const params = new URLSearchParams({
      category: input.publishCategory,
    });
    return `/shorts-json-studio/template-manager?${params.toString()}`;
  }, [input.publishCategory]);

  const fixedCharacterProfilesHref = useMemo(() => {
    const params = new URLSearchParams({
      tab: "contentProfile",
      category: input.publishCategory,
    });
    return `/settings?${params.toString()}#fixed-character-profiles`;
  }, [input.publishCategory]);

  const handleJumpToResultAction = useCallback(() => {
    input.closeBrandingPanel();
    if (typeof document === "undefined") return;
    document.getElementById("studio-result")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [input]);

  const downloadFileName = useMemo(() => {
    const title = input.publishTitle.trim() || "숏츠";
    return `${input.toSafeFileNameAction(title)}.mp4`;
  }, [input]);

  const autoSfxCategoryIds = useMemo(() => {
    return resolveAutoSfxCategoryIds(input.sfxCategories, input.generalSfxCategoryId);
  }, [input.generalSfxCategoryId, input.sfxCategories]);

  const sfxPlanSourceKey = useMemo(
    () =>
      JSON.stringify({
        jsonText: input.jsonText.trim(),
        publishCategory: input.publishCategory,
        sfxCategoryIds: autoSfxCategoryIds,
      }),
    [autoSfxCategoryIds, input.jsonText, input.publishCategory]
  );

  return {
    templateRequirementAlert,
    activeTemplateDefinition,
    captionFeaturePreviewSlide,
    brandingPanelPreviewSlides,
    brandingPanelPreviewUsesSample,
    layoutStudioHref,
    templateManagerHref,
    fixedCharacterProfilesHref,
    handleJumpToResultAction,
    downloadFileName,
    autoSfxCategoryIds,
    sfxPlanSourceKey,
  };
}
