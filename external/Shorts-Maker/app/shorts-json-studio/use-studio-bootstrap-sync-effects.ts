"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { fetchStudioSfxCatalog } from "@/lib/api/studio-client";
import { DEFAULT_PUBLISH_CATEGORY_OPTIONS } from "@/lib/publish/categories";
import { trackWorkflowEvent } from "@/lib/telemetry/client";
import { getScopedStorageKey } from "@/lib/ui/scoped-storage";
import type { PublishCategory } from "@/lib/publish/types";
import type { StudioSfxCategoryOption } from "@/lib/studio/audio-options";
import type { TemplateBranding } from "./types";
import { STUDIO_EDITOR_PRESET_KEY } from "./studio-category-preset-storage";

const DEFAULT_CATEGORY = DEFAULT_PUBLISH_CATEGORY_OPTIONS[0]?.key || "default";

export type UseStudioBootstrapSyncEffectsArgs = {
  categoryOptions: Array<{ value: PublishCategory; label?: string }>;
  publishCategory: PublishCategory;
  setPublishCategory: Dispatch<SetStateAction<PublishCategory>>;
  categoryBrandingMap: Record<PublishCategory, TemplateBranding>;
  setSavedBrandingSnapshotByCategory: Dispatch<SetStateAction<Record<string, TemplateBranding>>>;
  videoUrl: string | null;
  setRenderNeedsRefresh: Dispatch<SetStateAction<boolean>>;
  studioStepperEnabled: boolean;
  codexModel: string;
  setCodexModel: Dispatch<SetStateAction<string>>;
  setLayoutPresetVersion: Dispatch<SetStateAction<number>>;
  setSfxCategories: Dispatch<SetStateAction<StudioSfxCategoryOption[]>>;
  refreshCategoryMetadata: (category: PublishCategory) => Promise<unknown>;
};

export function useStudioBootstrapSyncEffects({
  categoryOptions,
  publishCategory,
  setPublishCategory,
  categoryBrandingMap,
  setSavedBrandingSnapshotByCategory,
  videoUrl,
  setRenderNeedsRefresh,
  studioStepperEnabled,
  codexModel,
  setCodexModel,
  setLayoutPresetVersion,
  setSfxCategories,
  refreshCategoryMetadata,
}: UseStudioBootstrapSyncEffectsArgs): void {
  useEffect(() => {
    if (categoryOptions.some((item) => item.value === publishCategory)) return;
    // Keep restored category even if categoryOptions bootstrap is delayed or partial.
    if (publishCategory) return;
    const first = categoryOptions[0]?.value || DEFAULT_CATEGORY;
    setPublishCategory(first);
  }, [categoryOptions, publishCategory, setPublishCategory]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refreshPresetVersion = () => setLayoutPresetVersion((prev) => prev + 1);
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== getScopedStorageKey(STUDIO_EDITOR_PRESET_KEY)) return;
      refreshPresetVersion();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", refreshPresetVersion);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", refreshPresetVersion);
    };
  }, [setLayoutPresetVersion]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refreshCurrentProfile = () => {
      if (document.visibilityState === "hidden") return;
      void refreshCategoryMetadata(publishCategory).catch(() => undefined);
    };
    // Same-tab App Router navigation may not emit focus or pageshow after returning from settings.
    refreshCurrentProfile();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshCurrentProfile();
    };
    window.addEventListener("focus", refreshCurrentProfile);
    window.addEventListener("pageshow", refreshCurrentProfile);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshCurrentProfile);
      window.removeEventListener("pageshow", refreshCurrentProfile);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [publishCategory, refreshCategoryMetadata]);

  useEffect(() => {
    setSavedBrandingSnapshotByCategory((prev) => {
      const next = { ...prev };
      for (const [category, branding] of Object.entries(categoryBrandingMap)) {
        next[category] = branding;
      }
      return next;
    });
  }, [categoryBrandingMap, setSavedBrandingSnapshotByCategory]);

  useEffect(() => {
    if (!videoUrl) return;
    setRenderNeedsRefresh(false);
  }, [setRenderNeedsRefresh, videoUrl]);

  useEffect(() => {
    trackWorkflowEvent({
      name: "page_view",
      page: "studio",
      stage: "studio",
      status: "success",
      detail: studioStepperEnabled ? "studio_stepper_v1:on" : "studio_stepper_v1:off",
    });
  }, [studioStepperEnabled]);

  useEffect(() => {
    if (!codexModel) return;
    setCodexModel("");
  }, [codexModel, setCodexModel]);

  useEffect(() => {
    let cancelled = false;
    const loadSfxCategories = async () => {
      try {
        const data = await fetchStudioSfxCatalog();
        if (cancelled) return;
        setSfxCategories(Array.isArray(data.categories) ? data.categories : []);
      } catch {
        if (!cancelled) {
          setSfxCategories([]);
        }
      }
    };
    const timer = window.setTimeout(() => {
      void loadSfxCategories();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [setSfxCategories]);
}
