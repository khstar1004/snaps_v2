"use client";

import type { StudioManagedFeatureId } from "@/types/studio-feature-document";
import {
  getStudioManagedFeatureLabel,
  getStudioTemplateFeatureToggles,
  updateStudioTemplateFeatureToggle,
} from "@/types/studio-feature-document";
import type { PreparedSlide } from "@/types/studio-json";
import type { StudioTemplateId, StudioTemplatePayload } from "../types";
import type { TemplateBranding } from "../types";
import { FeatureAssetManagerPanel } from "./feature-asset-manager-panel";
import { TemplateBundleManagerPanel } from "./template-bundle-manager-panel";
import { TemplateStaticSettingsPanel } from "./template-static-settings-panel";
import { BlackTemplatePreview } from "./templates/black-template";
import { DefaultTemplatePreview } from "./templates/default-template";
import { FunCaptionTemplatePreview } from "./templates/fun-caption-template";
import { getStudioTemplateDefinition, STUDIO_TEMPLATE_DEFINITIONS } from "./templates/template-registry";

type TemplateManagerPanelProps = {
  value: StudioTemplateId;
  templateData?: StudioTemplatePayload;
  scriptMode?: string | boolean | null;
  publishCategory?: string | null;
  previewSlide?: PreparedSlide | null;
  brandingPreview?: TemplateBranding | null;
  onChangeAction: (value: StudioTemplateId) => void;
  onTemplateDataChangeAction?: (value: StudioTemplatePayload) => void;
};

const TEMPLATE_OPTIONS = [
  STUDIO_TEMPLATE_DEFINITIONS.default,
  STUDIO_TEMPLATE_DEFINITIONS.black,
  STUDIO_TEMPLATE_DEFINITIONS["fun-caption"],
];

export function TemplateManagerPanel({
  value,
  templateData,
  scriptMode,
  publishCategory,
  previewSlide,
  brandingPreview,
  onChangeAction,
  onTemplateDataChangeAction,
}: TemplateManagerPanelProps) {
  const activeTemplate = getStudioTemplateDefinition(value);
  const scriptModeLabel = formatScriptModeLabel(scriptMode);
  const activeFeatureToggles = getStudioTemplateFeatureToggles(value, templateData);
  const activeManagedFeatures = (Object.entries(activeTemplate.supportedFeatures) as Array<[StudioManagedFeatureId, boolean]>)
    .filter(([, supported]) => supported)
    .map(([featureId]) => featureId);

  const handleFeatureToggle = (featureId: StudioManagedFeatureId, enabled: boolean) => {
    if (!templateData || !onTemplateDataChangeAction) return;
    onTemplateDataChangeAction(updateStudioTemplateFeatureToggle(value, templateData, featureId, enabled));
  };

  return (
    <section className="studio-template-manager-shell">
      <div className="studio-template-manager-head">
        <div className="studio-template-manager-copy">
          <div className="studio-template-manager-title">템플릿 관리</div>
          <div className="studio-template-manager-description">
            여기서 템플릿을 고르고, 필요한 기능만 켜고, 바로 아래에서 세부 설정까지 같이 만집니다.
          </div>
        </div>
        <div className="studio-template-manager-mode-pill">
          현재 모드: {scriptModeLabel}
        </div>
      </div>

      <div className="studio-template-manager-option-grid">
        {TEMPLATE_OPTIONS.map((option) => {
          const isActive = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChangeAction(option.id)}
              aria-pressed={isActive}
              className={`studio-template-manager-option${isActive ? " is-active" : ""}`}
            >
              <div className="studio-template-manager-option-top">
                <div className="studio-template-manager-option-name">
                  <span
                    aria-hidden="true"
                    className={`studio-template-manager-accent-dot is-${option.id}`}
                  />
                  <span>{option.label}</span>
                </div>
                <span className="studio-template-manager-option-state">{isActive ? "선택됨" : "선택 가능"}</span>
              </div>
              <div className="studio-template-manager-option-description">{option.description}</div>
              <div className="studio-template-manager-option-summary">{option.summary}</div>
              <div className="studio-template-manager-pill-row">
                {toFeaturePills(option.supportedFeatures).map((pill) => (
                  <span
                    key={`${option.id}-${pill}`}
                    className={`studio-template-manager-feature-pill${isActive ? " is-active" : ""}`}
                  >
                    {pill}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div className="studio-template-manager-preview">
        <div className="studio-template-manager-preview-copy">
          <div className={`studio-template-manager-preview-label is-${activeTemplate.id}`}>
            {activeTemplate.label}
          </div>
          <div className="studio-template-manager-preview-title">간단 미리보기</div>
          <div className="studio-template-manager-preview-description">
            선택 즉시 아래 미리보기와 설정 기준이 바뀝니다. 템플릿마다 쓰는 입력값이 다를 수 있습니다.
          </div>
          <div className="studio-template-manager-preview-description studio-template-manager-preview-guide">
            {activeTemplate.inputGuide}
          </div>
          <div className="studio-template-bundle-card studio-template-manager-preview-bundle-card">
            <div className="studio-template-bundle-card-title">이 템플릿에 넣는 내용</div>
            <div className="studio-template-bundle-pill-row">
              {getTemplateInputLabels(activeTemplate.id).map((label) => (
                <span key={`${activeTemplate.id}-${label}`} className="studio-template-bundle-pill">
                  {label}
                </span>
              ))}
            </div>
            <div className="studio-template-bundle-card-description studio-template-bundle-card-description-spaced">
              {getTemplateUsageHint(activeTemplate.id)}
            </div>
          </div>
          <div className="studio-template-bundle-card studio-template-manager-preview-bundle-card-secondary">
            <div className="studio-template-bundle-card-title">잘 맞는 쓰임새</div>
            <div className="studio-template-bundle-pill-row">
              {getTemplateUseCaseLabels(activeTemplate.id).map((label) => (
                <span key={`${activeTemplate.id}-use-${label}`} className="studio-template-bundle-pill">
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="studio-template-manager-feature-toggle-shell">
            <div className="studio-template-manager-feature-toggle-title">쓸 기능 고르기</div>
            {activeManagedFeatures.length > 0 ? (
              <>
                <div className="studio-template-manager-feature-toggle-description">
                  이 템플릿에서 쓸 기능만 켜세요. 아래에서 세부 모양과 움직임까지 이어서 바꿀 수 있습니다.
                </div>
                {activeManagedFeatures.map((featureId) => (
                  <label
                    key={`${activeTemplate.id}-${featureId}`}
                    className="studio-template-manager-feature-toggle-row"
                  >
                    <span className="studio-template-manager-feature-toggle-copy">
                      <span className="studio-template-manager-feature-toggle-label">
                        {getStudioManagedFeatureLabel(featureId)}
                      </span>
                      <span className="studio-template-manager-feature-toggle-help">
                        {getFeatureDescription(featureId)}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={activeFeatureToggles[featureId]}
                      disabled={!templateData || !onTemplateDataChangeAction}
                      onChange={(event) => handleFeatureToggle(featureId, event.target.checked)}
                      className="studio-template-manager-feature-toggle-checkbox"
                    />
                  </label>
                ))}
              </>
            ) : (
              <div className="studio-template-manager-feature-toggle-description">
                이 템플릿은 지금 별도 기능을 켜지 않아도 기본 레이아웃만으로 바로 쓸 수 있습니다.
              </div>
            )}
          </div>
        </div>

        <div className="studio-template-manager-preview-device">
          {value === "black" ? (
            <BlackTemplatePreview compact />
          ) : value === "fun-caption" ? (
            <FunCaptionTemplatePreview compact />
          ) : (
            <DefaultTemplatePreview compact />
          )}
        </div>
      </div>

      {templateData && onTemplateDataChangeAction ? (
        <div className="studio-template-manager-config-stack">
          <div className="studio-template-manager-config-note">
            아래에서 지금 고른 템플릿 설정, 저장해둔 기능, 추천 조합을 같이 만질 수 있습니다.
          </div>
          <FeatureAssetManagerPanel
            templateId={value}
            templateData={templateData}
            onChangeAction={onTemplateDataChangeAction}
          />
          <TemplateBundleManagerPanel
            publishCategory={publishCategory}
            templateId={value}
            templateData={templateData}
            onApplyAction={(bundle) => {
              onChangeAction(bundle.templateId);
              onTemplateDataChangeAction(bundle.templateData);
            }}
          />
          <TemplateStaticSettingsPanel
            templateId={value}
            templateData={templateData}
            previewSlide={previewSlide}
            branding={brandingPreview}
            onChangeAction={onTemplateDataChangeAction}
          />
        </div>
      ) : null}
    </section>
  );
}

function formatScriptModeLabel(value: string | boolean | null | undefined) {
  if (typeof value === "boolean") {
    return value ? "대화형" : "일반형";
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return "미설정";
}

function toFeaturePills(supportedFeatures: {
  captionFeature: boolean;
  overlayFeature: boolean;
  cueMetadata: boolean;
  autoCaptionFx: boolean;
}) {
  const pills = ["기본 레이아웃"];
  if (supportedFeatures.captionFeature) pills.push("자막 꾸미기");
  if (supportedFeatures.overlayFeature) pills.push("장식 효과");
  if (supportedFeatures.cueMetadata) pills.push("문장별 자막");
  if (supportedFeatures.autoCaptionFx) pills.push("자동 강조");
  return pills;
}

function getFeatureDescription(featureId: StudioManagedFeatureId) {
  switch (featureId) {
    case "captionFeature":
      return "자막을 화면 위에 얹을지 정합니다. 끄면 사진이나 영상 중심으로 보여줄 수 있습니다.";
    case "overlayFeature":
      return "하트, 불꽃, 반짝임 같은 장식 효과를 쓸지 정합니다.";
    case "cueMetadata":
      return "한 장면 안에서 문장별로 자막을 나눠서 보여줄지 정합니다.";
    case "autoCaptionFx":
      return "대본 내용을 보고 강조, 움직임, 하이라이트를 자동으로 붙일지 정합니다.";
    default:
      return "이 기능을 지금 템플릿에 포함할지 정합니다.";
  }
}

function getTemplateInputLabels(templateId: StudioTemplateId) {
  switch (templateId) {
    case "black":
      return ["제목", "사진 또는 영상", "본문"];
    case "fun-caption":
      return ["작은 설명 자막", "큰 자막", "배경 사진 또는 영상"];
    case "default":
    default:
      return ["제목", "본문", "사진 또는 영상", "정보줄"];
  }
}

function getTemplateUseCaseLabels(templateId: StudioTemplateId) {
  switch (templateId) {
    case "black":
      return ["후킹 쇼츠", "강한 제목형", "짧은 요약형"];
    case "fun-caption":
      return ["밈형 쇼츠", "영상 반응형", "자막 중심형"];
    case "default":
    default:
      return ["뉴스형", "정보 전달형", "설명형"];
  }
}

function getTemplateUsageHint(templateId: StudioTemplateId) {
  switch (templateId) {
    case "black":
      return "한눈에 꽂히는 제목과 가운데 미디어, 짧은 본문으로 빠르게 보여줄 때 적합합니다.";
    case "fun-caption":
      return "배경 사진이나 영상 위에 자막 톤과 장식 효과를 얹어 밈형 쇼츠를 만들 때 적합합니다.";
    case "default":
    default:
      return "기존 뉴스형 화면처럼 제목, 설명, 자료 화면을 안정적으로 정리해서 보여줄 때 적합합니다.";
  }
}
