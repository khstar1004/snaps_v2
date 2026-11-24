"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { DEFAULT_PUBLISH_CATEGORY_OPTIONS, normalizeCategory } from "@/lib/publish/categories";
import type { PublishCategory } from "@/lib/publish/types";
import { readScopedStorage, writeScopedStorage } from "@/lib/ui/scoped-storage";
import type { PreparedSlide } from "@/types/studio-json";
import { TemplateManagerPanel } from "../components/template-manager-panel";
import {
  buildStudioTemplateSampleSlide,
  createStudioTemplateData,
  getTemplateRequirementAlert,
  normalizeStudioTemplateData,
} from "../components/templates/template-registry";
import {
  type StudioTemplateId,
  type StudioTemplatePayload,
  type TemplateBranding,
  type TemplateLayoutApply,
} from "../types";
import { readStoredStudioDraft, writeStoredStudioDraft } from "../storage";

const STUDIO_EDITOR_PRESET_KEY = "studio-editor-preset-v1";
const DEFAULT_CATEGORY = DEFAULT_PUBLISH_CATEGORY_OPTIONS[0]?.key || "default";

type StoredCategoryTemplatePreset = {
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled?: boolean;
  templateImageUrl?: string;
  templateImageLayout?: unknown;
  templateLayoutApply?: unknown;
};

function StudioTemplateManagerPageContent() {
  const searchParams = useSearchParams();
  const requestedCategory = normalizeCategory(searchParams.get("category")) || DEFAULT_CATEGORY;
  const [publishCategory, setPublishCategory] = useState<PublishCategory>(requestedCategory);
  const [templatePreset, setTemplatePreset] = useState<StoredCategoryTemplatePreset>({
    templateId: "default",
    templateData: createStudioTemplateData("default"),
    templateImageEnabled: false,
    templateImageUrl: "",
  });
  const [previewSlide, setPreviewSlide] = useState<PreparedSlide | null>(null);
  const [brandingPreview, setBrandingPreview] = useState<TemplateBranding | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const nextCategory = normalizeCategory(searchParams.get("category")) || DEFAULT_CATEGORY;
    setPublishCategory(nextCategory);
    const editorPreset = readStoredEditorPreset();
    const storedTemplate = readStoredTemplatePresetForCategory(nextCategory, editorPreset);
    setTemplatePreset(
      storedTemplate || {
        templateId: "default",
        templateData: createStudioTemplateData("default"),
        templateImageEnabled: false,
        templateImageUrl: "",
      },
    );

    const currentDraft = readCurrentDraft(nextCategory);
    setPreviewSlide(pickPreviewSlide(currentDraft?.slides, storedTemplate?.templateId || "default", storedTemplate?.templateImageUrl));
    setBrandingPreview(
      currentDraft?.brandingDraft && typeof currentDraft.brandingDraft === "object"
        ? (currentDraft.brandingDraft as TemplateBranding)
        : editorPreset.brandingDraft && typeof editorPreset.brandingDraft === "object"
          ? (editorPreset.brandingDraft as TemplateBranding)
          : null,
    );
    setHydrated(true);
  }, [searchParams]);

  useEffect(() => {
    if (!hydrated) return;
    persistTemplatePresetForCategory(publishCategory, templatePreset);
    persistCurrentDraftTemplate(publishCategory, templatePreset);
  }, [hydrated, publishCategory, templatePreset]);

  const templateRequirementAlert = useMemo(
    () => getTemplateRequirementAlert(templatePreset.templateId, [previewSlide || buildStudioTemplateSampleSlide(templatePreset.templateId)]),
    [previewSlide, templatePreset.templateId],
  );

  const backHref = useMemo(() => {
    const params = new URLSearchParams({ category: publishCategory });
    return `/shorts-json-studio?${params.toString()}`;
  }, [publishCategory]);

  return (
    <AppLayout>
      <div className="page-shell">
        <section className="page-section">
          <div className="card studio-template-manager-page-card">
            <div className="studio-template-manager-page-head">
              <div className="studio-template-manager-page-copy">
                <h1 className="studio-template-manager-page-title">템플릿 관리</h1>
                <div className="studio-template-manager-page-description">
                  템플릿 선택, 기능 켜기, 저장한 기능 불러오기, 스타일 조합 저장을 이 페이지에서 관리합니다.
                </div>
              </div>
              <Link href={backHref} className="btn-secondary">
                제작으로 돌아가기
              </Link>
            </div>

            <TemplateManagerPanel
              value={templatePreset.templateId}
              templateData={templatePreset.templateData}
              publishCategory={publishCategory}
              scriptMode={null}
              previewSlide={previewSlide}
              brandingPreview={brandingPreview}
              onChangeAction={(value) =>
                setTemplatePreset((current) => ({
                  ...current,
                  templateId: value,
                  templateData: current.templateId === value ? current.templateData : createStudioTemplateData(value),
                }))
              }
              onTemplateDataChangeAction={(value) =>
                setTemplatePreset((current) => ({
                  ...current,
                  templateData: value,
                }))
              }
            />

            {templateRequirementAlert ? (
              <div className="studio-template-warning-alert">
                {templateRequirementAlert}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

export default function StudioTemplateManagerPage() {
  return (
    <Suspense fallback={null}>
      <StudioTemplateManagerPageContent />
    </Suspense>
  );
}

function readStoredEditorPreset(): Record<string, unknown> {
  try {
    const raw = readScopedStorage(STUDIO_EDITOR_PRESET_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readStoredTemplatePresetForCategory(category: PublishCategory, parsed: Record<string, unknown>): StoredCategoryTemplatePreset | null {
  const templateByCategory = parsed.templateByCategory;
  if (templateByCategory && typeof templateByCategory === "object") {
    const matchedEntry = Object.entries(templateByCategory).find(([key]) => normalizeCategory(key) === category)?.[1];
    if (matchedEntry && typeof matchedEntry === "object") {
      const row = matchedEntry as Record<string, unknown>;
      const normalizedId = row.templateId === "black" || row.templateId === "fun-caption" ? row.templateId : "default";
      return {
        templateId: normalizedId,
        templateData: normalizeStudioTemplateData(normalizedId, row.templateData),
        templateImageEnabled: Boolean(row.templateImageEnabled),
        templateImageUrl: typeof row.templateImageUrl === "string" ? row.templateImageUrl : "",
        templateImageLayout: row.templateImageLayout,
        templateLayoutApply: row.templateLayoutApply,
      };
    }
  }
  return null;
}

function readCurrentDraft(category: PublishCategory): Record<string, unknown> | null {
  try {
    const parsed = readStoredStudioDraft(category) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function pickPreviewSlide(slides: unknown, templateId: StudioTemplateId, imageUrl?: string) {
  if (Array.isArray(slides)) {
    const match = slides.find((slide) => slide && typeof slide === "object") as PreparedSlide | undefined;
    if (match) return match;
  }
  return buildStudioTemplateSampleSlide(templateId, imageUrl);
}

function persistTemplatePresetForCategory(category: PublishCategory, templatePreset: StoredCategoryTemplatePreset) {
  try {
    const parsed = readStoredEditorPreset();
    const templateByCategory =
      parsed.templateByCategory && typeof parsed.templateByCategory === "object"
        ? { ...(parsed.templateByCategory as Record<string, unknown>) }
        : {};
    templateByCategory[category] = {
      ...(templateByCategory[category] && typeof templateByCategory[category] === "object"
        ? (templateByCategory[category] as Record<string, unknown>)
        : {}),
      templateId: templatePreset.templateId,
      templateData: templatePreset.templateData,
      templateImageEnabled: Boolean(templatePreset.templateImageEnabled),
      templateImageUrl: templatePreset.templateImageUrl || "",
      templateImageLayout: templatePreset.templateImageLayout,
      templateLayoutApply: templatePreset.templateLayoutApply,
      updatedAt: Date.now(),
    };
    writeScopedStorage(
      STUDIO_EDITOR_PRESET_KEY,
      JSON.stringify({
        ...parsed,
        publishCategory: category,
        templateId: templatePreset.templateId,
        templateData: templatePreset.templateData,
        templateImageEnabled: Boolean(templatePreset.templateImageEnabled),
        templateImageUrl: templatePreset.templateImageUrl || "",
        templateImageLayout: templatePreset.templateImageLayout,
        templateLayoutApply: templatePreset.templateLayoutApply,
        templateByCategory,
      }),
    );
  } catch {
    return;
  }
}

function persistCurrentDraftTemplate(category: PublishCategory, templatePreset: StoredCategoryTemplatePreset) {
  try {
    const currentDraft = readCurrentDraft(category) || {};
    writeStoredStudioDraft(category, {
      ...currentDraft,
      publishCategory: category,
      templateId: templatePreset.templateId,
      templateData: templatePreset.templateData,
      templateImageEnabled: Boolean(templatePreset.templateImageEnabled),
      templateImageUrl: templatePreset.templateImageUrl || "",
      templateImageLayout: templatePreset.templateImageLayout,
      templateLayoutApply: templatePreset.templateLayoutApply as TemplateLayoutApply | undefined,
    });
  } catch {
    return;
  }
}
