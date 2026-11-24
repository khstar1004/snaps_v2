"use client";

import { useEffect, useMemo, useState } from "react";
import { getStudioManagedFeatureLabel, getStudioTemplateFeatureToggles } from "@/types/studio-feature-document";
import type { StudioTemplateId, StudioTemplatePayload } from "../types";
import { createStudioTemplateData } from "./templates/template-registry";
import { getStudioTemplateDefinition } from "./templates/template-registry";

const TEMPLATE_BUNDLE_STORAGE_KEY = "studio-template-bundles-v1";

type StoredTemplateBundle = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  createdAt: string;
  publishCategory?: string | null;
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
};

type StarterTemplateBundle = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  recommendedCategories?: string[];
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
};

type TemplateBundleManagerPanelProps = {
  publishCategory?: string | null;
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  onApplyAction: (bundle: { templateId: StudioTemplateId; templateData: StudioTemplatePayload }) => void;
};

export function TemplateBundleManagerPanel({
  publishCategory,
  templateId,
  templateData,
  onApplyAction,
}: TemplateBundleManagerPanelProps) {
  const [bundleName, setBundleName] = useState("");
  const [bundleDescription, setBundleDescription] = useState("");
  const [selectedBundleId, setSelectedBundleId] = useState("");
  const [savedBundles, setSavedBundles] = useState<StoredTemplateBundle[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TEMPLATE_BUNDLE_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as StoredTemplateBundle[]) : [];
      setSavedBundles(Array.isArray(parsed) ? normalizeStoredTemplateBundles(parsed) : []);
    } catch {
      setSavedBundles([]);
    }
  }, []);

  const selectedBundle = useMemo(
    () => savedBundles.find((bundle) => bundle.id === selectedBundleId) || null,
    [savedBundles, selectedBundleId],
  );
  const orderedSavedBundles = useMemo(() => {
    const normalizedCategory = String(publishCategory || "").trim().toLowerCase();
    if (!normalizedCategory) return savedBundles;
    return [...savedBundles].sort((left, right) => {
      const leftScore = String(left.publishCategory || "").trim().toLowerCase() === normalizedCategory ? 1 : 0;
      const rightScore = String(right.publishCategory || "").trim().toLowerCase() === normalizedCategory ? 1 : 0;
      return rightScore - leftScore;
    });
  }, [publishCategory, savedBundles]);
  const starterBundles = useMemo<StarterTemplateBundle[]>(() => {
    const defaultTemplate = createStudioTemplateData("default");
    const blackTemplate = createStudioTemplateData("black");
    const funCaptionTemplate = createStudioTemplateData("fun-caption");
    return [
      {
        id: "starter-default-news",
        name: "기본 뉴스형",
        description: "원래 뉴스형 템플릿 그대로 빠르게 시작합니다.",
        tags: ["뉴스형", "기본형"],
        recommendedCategories: ["news", "economy", "issue"],
        templateId: "default",
        templateData: defaultTemplate,
      },
      {
        id: "starter-default-auto-body",
        name: "뉴스형 오토 본문",
        description: "뉴스형 화면은 그대로 두고 본문만 문장별 자막과 자동 강조를 켠 버전입니다.",
        tags: ["뉴스형", "자동강조", "문장별자막"],
        recommendedCategories: ["news", "economy", "issue"],
        templateId: "default",
        templateData: {
          ...defaultTemplate,
          cueMetadataEnabled: true,
          autoCaptionFxEnabled: true,
          autoCaptionProfile: "news",
          autoCaptionIntensity: 0.48,
          autoHighlightEnabled: true,
          autoHighlightColor: "#2563eb",
          autoHighlightScale: 1.08,
        },
      },
      {
        id: "starter-black-minimal",
        name: "블랙 미니멀",
        description: "블랙 템플릿에서 자동 효과를 끈 담백한 후킹형입니다.",
        tags: ["블랙", "미니멀", "후킹형"],
        recommendedCategories: ["entertainment", "issue", "shorts"],
        templateId: "black",
        templateData: {
          ...blackTemplate,
          cueMetadataEnabled: false,
          autoCaptionFxEnabled: false,
        },
      },
      {
        id: "starter-black-auto",
        name: "블랙 오토 후킹형",
        description: "블랙 템플릿에서 자동 강조를 켜고 하이라이트를 강하게 준 버전입니다.",
        tags: ["블랙", "자동강조", "후킹형"],
        recommendedCategories: ["entertainment", "issue", "shorts"],
        templateId: "black",
        templateData: {
          ...blackTemplate,
          cueMetadataEnabled: true,
          autoCaptionFxEnabled: true,
          autoCaptionIntensity: 0.72,
          autoHighlightScale: 1.18,
        },
      },
      {
        id: "starter-fun-caption-lite",
        name: "펀캡션 라이트",
        description: "자막은 쓰되 오버레이는 끈 깔끔한 밈형입니다.",
        tags: ["펀캡션", "라이트", "자막형"],
        recommendedCategories: ["entertainment", "meme", "shorts"],
        templateId: "fun-caption",
        templateData: {
          ...funCaptionTemplate,
          captionFeatureEnabled: true,
          overlayFeatureEnabled: false,
          cueMetadataEnabled: true,
          autoCaptionFxEnabled: true,
        },
      },
      {
        id: "starter-fun-caption-meme",
        name: "펀캡션 밈형",
        description: "장식 효과와 자동 강조를 모두 켠 강한 밈형입니다.",
        tags: ["펀캡션", "밈형", "오버레이"],
        recommendedCategories: ["meme", "entertainment", "shorts"],
        templateId: "fun-caption",
        templateData: {
          ...funCaptionTemplate,
          captionFeatureEnabled: true,
          overlayFeatureEnabled: true,
          cueMetadataEnabled: true,
          autoCaptionFxEnabled: true,
          overlayPreset: "hearts",
          overlayPlacement: "full",
          autoCaptionIntensity: 0.82,
        },
      },
      {
        id: "starter-fun-caption-media",
        name: "미디어 중심형",
        description: "자막과 장식 효과를 끄고 사진이나 영상 자체를 강조하는 시작점입니다.",
        tags: ["미디어중심", "자막없음", "영상형"],
        recommendedCategories: ["sports", "travel", "shorts"],
        templateId: "fun-caption",
        templateData: {
          ...funCaptionTemplate,
          captionFeatureEnabled: false,
          overlayFeatureEnabled: false,
          cueMetadataEnabled: false,
          autoCaptionFxEnabled: false,
        },
      },
    ];
  }, []);
  const recommendedStarterBundles = useMemo(() => {
    const normalizedCategory = String(publishCategory || "").trim().toLowerCase();
    if (!normalizedCategory) return starterBundles;
    const matched = starterBundles.filter((bundle) =>
      Array.isArray(bundle.recommendedCategories)
        ? bundle.recommendedCategories.some((category) => category.toLowerCase() === normalizedCategory)
        : false,
    );
    return matched.length > 0 ? matched : starterBundles;
  }, [publishCategory, starterBundles]);
  const activeFeatureToggles = getStudioTemplateFeatureToggles(templateId, templateData);
  const enabledFeatures = (Object.entries(activeFeatureToggles) as Array<[keyof typeof activeFeatureToggles, boolean]>)
    .filter(([, enabled]) => enabled)
    .map(([featureId]) => getStudioManagedFeatureLabel(featureId));

  const persistBundles = (next: StoredTemplateBundle[]) => {
    setSavedBundles(next);
    try {
      window.localStorage.setItem(TEMPLATE_BUNDLE_STORAGE_KEY, JSON.stringify(next.slice(0, 30)));
    } catch {
      return;
    }
  };

  return (
    <section className="studio-template-bundle-shell">
      <div className="studio-template-bundle-copy">
        <div className="studio-template-bundle-title">스타일 조합 저장</div>
        <div className="studio-template-bundle-description">
          지금 고른 템플릿, 켠 기능, 세부 설정을 한 묶음으로 저장해 둡니다. 자주 쓰는 조합을 다시 꺼내 쓸 때 편합니다.
        </div>
      </div>

      <div className="studio-template-bundle-card">
        <div className="studio-template-bundle-card-title">지금 조합</div>
        <div className="studio-template-bundle-card-description">
          템플릿: {getStudioTemplateDefinition(templateId).label}
        </div>
        <div className="studio-template-bundle-pill-row">
          <SummaryPill label="레이아웃" />
          {enabledFeatures.length > 0 ? enabledFeatures.map((label) => <SummaryPill key={label} label={label} />) : <SummaryPill label="추가 기능 없음" />}
          {publishCategory ? <SummaryPill label={`카테고리 ${publishCategory}`} /> : null}
        </div>
      </div>

      <div className="studio-template-bundle-save-row">
        <input
          className="input-field"
          value={bundleName}
          onChange={(event) => setBundleName(event.target.value)}
          placeholder="예: 블랙 후킹형 / 뉴스형 본문 강조 / 자막 없는 영상형"
        />
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            const trimmed = bundleName.trim();
            if (!trimmed) return;
            const generatedTags = Array.from(
              new Set([
                templateId,
                ...enabledFeatures,
                ...(publishCategory ? [publishCategory] : []),
              ]),
            );
            const nextBundle: StoredTemplateBundle = {
              id: `bundle-${Date.now()}`,
              name: trimmed,
              description: bundleDescription.trim(),
              tags: generatedTags,
              createdAt: new Date().toISOString(),
              publishCategory: publishCategory || null,
              templateId,
              templateData,
            };
            persistBundles([nextBundle, ...savedBundles]);
            setSelectedBundleId(nextBundle.id);
            setBundleName("");
            setBundleDescription("");
          }}
        >
          현재 조합 저장
        </button>
      </div>

      <input
        className="input-field"
        value={bundleDescription}
        onChange={(event) => setBundleDescription(event.target.value)}
        placeholder="이 조합을 언제 쓰는지 메모"
      />

      <div className="studio-template-bundle-select-row">
        <select
          className="input-field"
          value={selectedBundleId}
          onChange={(event) => setSelectedBundleId(event.target.value)}
        >
          <option value="">저장한 조합 선택</option>
          {orderedSavedBundles.map((bundle) => (
            <option key={bundle.id} value={bundle.id}>
              {bundle.publishCategory ? `[${bundle.publishCategory}] ${bundle.name}` : bundle.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-secondary"
          disabled={!selectedBundle}
          onClick={() => {
            if (!selectedBundle) return;
            onApplyAction({
              templateId: selectedBundle.templateId,
              templateData: selectedBundle.templateData,
            });
          }}
        >
          적용
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!selectedBundle}
          onClick={() => {
            if (!selectedBundle) return;
            persistBundles(savedBundles.filter((bundle) => bundle.id !== selectedBundle.id));
            setSelectedBundleId("");
          }}
        >
          삭제
        </button>
      </div>

      <div className="studio-template-bundle-card">
        <div className="studio-template-bundle-card-title">바로 시작용 추천 조합</div>
        <div className="studio-template-bundle-card-description">
          처음부터 다 만지지 않고 자주 쓰는 시작점을 바로 적용할 수 있습니다.
        </div>
        <div className="studio-template-bundle-starter-grid">
          {recommendedStarterBundles.map((bundle) => (
            <button
              key={bundle.id}
              type="button"
              className="btn-secondary studio-template-bundle-starter-button"
              onClick={() => onApplyAction({ templateId: bundle.templateId, templateData: bundle.templateData })}
            >
              <span className="studio-template-bundle-starter-name">{bundle.name}</span>
              <span className="studio-template-bundle-starter-description">{bundle.description}</span>
              <span className="studio-template-bundle-starter-template">
                {getStudioTemplateDefinition(bundle.templateId).label}
              </span>
              <span className="studio-template-bundle-pill-row">
                {bundle.tags.map((tag) => (
                  <SummaryPill key={`${bundle.id}-${tag}`} label={tag} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selectedBundle ? (
        <div className="studio-template-bundle-selected">
          <div className="studio-template-bundle-selected-title">선택한 조합</div>
          <div className="studio-template-bundle-selected-template">
            템플릿: {getStudioTemplateDefinition(selectedBundle.templateId).label}
          </div>
          {selectedBundle.description ? (
            <div className="studio-template-bundle-selected-description">
              {selectedBundle.description}
            </div>
          ) : null}
          <div className="studio-template-bundle-pill-row">
            {getBundleFeatureLabels(selectedBundle.templateId, selectedBundle.templateData).map((label) => (
              <SummaryPill key={`${selectedBundle.id}-${label}`} label={label} />
            ))}
            {selectedBundle.tags.map((tag) => (
              <SummaryPill key={`${selectedBundle.id}-tag-${tag}`} label={tag} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SummaryPill({ label }: { label: string }) {
  return (
    <span className="studio-template-bundle-pill">
      {label}
    </span>
  );
}

function getBundleFeatureLabels(templateId: StudioTemplateId, templateData: StudioTemplatePayload) {
  const toggles = getStudioTemplateFeatureToggles(templateId, templateData);
  const labels = ["레이아웃"];
  for (const [featureId, enabled] of Object.entries(toggles) as Array<[keyof typeof toggles, boolean]>) {
    if (enabled) {
      labels.push(getStudioManagedFeatureLabel(featureId));
    }
  }
  if (labels.length === 1) {
    labels.push("추가 기능 없음");
  }
  return labels;
}

function isTemplateBundle(value: unknown): value is StoredTemplateBundle {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string" &&
      typeof (value as { name?: unknown }).name === "string" &&
      typeof (value as { templateId?: unknown }).templateId === "string" &&
      (value as { templateData?: unknown }).templateData &&
      typeof (value as { templateData?: unknown }).templateData === "object",
  );
}

function normalizeStoredTemplateBundles(items: unknown[]): StoredTemplateBundle[] {
  return items
    .filter(isTemplateBundle)
    .map((item) => {
      const row = item as Partial<StoredTemplateBundle>;
      return {
        id: String(row.id || ""),
        name: String(row.name || ""),
        description: typeof row.description === "string" ? row.description : "",
        tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
        createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
        publishCategory: typeof row.publishCategory === "string" ? row.publishCategory : null,
        templateId: row.templateId as StudioTemplateId,
        templateData: row.templateData as StudioTemplatePayload,
      };
    });
}
