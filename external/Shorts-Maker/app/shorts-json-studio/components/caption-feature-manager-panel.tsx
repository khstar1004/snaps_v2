"use client";

import { useEffect, useMemo, useState } from "react";
import {
  analyzeStudioCaptionAutoCue,
  buildAutoCaptionCueOverrides,
  STUDIO_CAPTION_AUTO_PROFILE_OPTIONS,
  STUDIO_CAPTION_ANIMATION_PRESET_OPTIONS,
  STUDIO_CAPTION_STYLE_PRESET_OPTIONS,
} from "@/types/studio-caption";
import type { PreparedSlide } from "@/types/studio-json";
import type { FunCaptionTemplateData } from "@/types/studio-template";
import { StudioColorPickerField } from "@/components/studio-color-picker-field";
import type { TemplateBranding } from "../types";
import { StudioRemotionSlideThumbnail } from "./studio-remotion-preview";

const CAPTION_FEATURE_PRESET_STORAGE_KEY = "studio-caption-feature-presets-v1";

type StoredCaptionFeaturePreset = {
  id: string;
  name: string;
  createdAt: string;
  data: Pick<
    FunCaptionTemplateData,
    | "topCaptionScale"
    | "mainCaptionScale"
    | "topCaptionBgOpacity"
    | "captionStyle"
    | "animationPreset"
    | "mainCaptionColor"
    | "mainCaptionStrokeColor"
    | "mainCaptionStrokeWidth"
    | "mainCaptionGlow"
    | "autoCaptionProfile"
    | "autoCaptionIntensity"
    | "autoHighlightEnabled"
    | "autoHighlightColor"
    | "autoHighlightScale"
    | "topCaptionTextColor"
    | "topCaptionBgColor"
    | "captionLineHeight"
    | "cueDurationSec"
  >;
};

type CaptionFeatureManagerPanelProps = {
  value: FunCaptionTemplateData;
  onChangeAction: (value: FunCaptionTemplateData) => void;
  previewSlide?: PreparedSlide | null;
  branding?: TemplateBranding | null;
};

const FALLBACK_PREVIEW_BRANDING: TemplateBranding = {
  variant: "news",
  headerTitle: "Caption Feature",
  headerAccentText: "Preview",
  headerColor: "#111827",
  footerColor: "#111827",
  infoLineText: "sample | 00:12 | preview",
  fontFamily: '"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif',
  imageRounded: true,
};

const SAMPLE_PREVIEW_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="50%" stop-color="#334155"/>
          <stop offset="100%" stop-color="#164e63"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#g)"/>
      <circle cx="860" cy="280" r="180" fill="rgba(125,211,252,0.18)"/>
      <circle cx="220" cy="1520" r="220" fill="rgba(244,114,182,0.14)"/>
    </svg>`
  );

export function CaptionFeatureManagerPanel({ value, onChangeAction, previewSlide, branding }: CaptionFeatureManagerPanelProps) {
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [savedPresets, setSavedPresets] = useState<StoredCaptionFeaturePreset[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CAPTION_FEATURE_PRESET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredCaptionFeaturePreset[];
      if (Array.isArray(parsed)) {
        setSavedPresets(parsed.filter((item) => item && typeof item === "object" && typeof item.id === "string"));
      }
    } catch {
      return;
    }
  }, []);

  const selectedPreset = useMemo(
    () => savedPresets.find((preset) => preset.id === selectedPresetId) || null,
    [savedPresets, selectedPresetId]
  );
  const effectivePreviewSlide = useMemo<PreparedSlide>(
    () =>
      previewSlide || {
        title: "스피드가 방송 중 실망한 순간들이라는데",
        text: "순간들이라는데",
        lines: ["순간들이라는데", "진짜 상처였대요", "반응이 갈렸습니다"],
        layout: "photo+body",
        imageUrl: SAMPLE_PREVIEW_IMAGE,
        groupId: 0,
        stepIndex: 0,
      },
    [previewSlide]
  );
  const effectiveBranding = branding || FALLBACK_PREVIEW_BRANDING;
  const previewHasCurrentMedia = Boolean(previewSlide && (String(previewSlide.imageUrl || "").trim() || String(previewSlide.mediaUrl || "").trim()));

  const persistPresets = (next: StoredCaptionFeaturePreset[]) => {
    setSavedPresets(next);
    try {
      window.localStorage.setItem(CAPTION_FEATURE_PRESET_STORAGE_KEY, JSON.stringify(next));
    } catch {
      return;
    }
  };

  const captionFeatureData = pickCaptionFeatureData(value);

  return (
    <section className="studio-feature-asset-shell">
      <div className="studio-feature-asset-copy">
        <div className="studio-feature-asset-title">자막 꾸미기</div>
        <div className="studio-feature-asset-description">
          자막 모양과 움직임을 여기서 정합니다. 저장해두면 다른 템플릿에서도 다시 불러와 쓸 수 있습니다.
        </div>
      </div>

      <div className="studio-caption-feature-preview-card">
        <div className="studio-caption-feature-preview-copy">
          <div className="studio-feature-asset-card-title">애니메이션 미리보기</div>
          <div className="studio-feature-asset-card-description">
            지금 자막 설정이 실제 미리보기에서 어떻게 보이는지 확인합니다. 영상이든 사진이든 같은 방식으로 적용됩니다.
          </div>
          <div className="studio-caption-feature-preview-mode">
            {previewHasCurrentMedia ? "현재 스튜디오 슬라이드 기준 미리보기" : "샘플 사진 기준 미리보기"}
          </div>
        </div>
        <div className="studio-caption-feature-preview-thumb">
          <StudioRemotionSlideThumbnail
            slide={effectivePreviewSlide}
            branding={effectiveBranding}
            templateId="fun-caption"
            templateData={value}
            templateImageEnabled={false}
            templateImageUrl=""
          />
        </div>
      </div>

      <div className="studio-overlay-feature-grid">
        <TemplateSelectField
          label="자막 스타일"
          description="자막의 전체 분위기를 정합니다."
          value={value.captionStyle}
          onChange={(next) => onChangeAction({ ...value, captionStyle: next as FunCaptionTemplateData["captionStyle"] })}
          options={STUDIO_CAPTION_STYLE_PRESET_OPTIONS}
        />

        <TemplateSelectField
          label="자막 등장 방식"
          description="자막이 화면에 어떻게 나타날지 정합니다."
          value={value.animationPreset}
          onChange={(next) => onChangeAction({ ...value, animationPreset: next as FunCaptionTemplateData["animationPreset"] })}
          options={STUDIO_CAPTION_ANIMATION_PRESET_OPTIONS}
        />

        <TemplateSelectField
          label="자동 강조 방식"
          description="문장을 보고 어떤 느낌으로 자동 강조할지 정합니다."
          value={value.autoCaptionProfile}
          onChange={(next) => onChangeAction({ ...value, autoCaptionProfile: next as FunCaptionTemplateData["autoCaptionProfile"] })}
          options={STUDIO_CAPTION_AUTO_PROFILE_OPTIONS}
        />

        <TemplateRangeField
          label="자동 강조 강도"
          description="자동으로 튀게 보여주는 힘을 얼마나 줄지 정합니다."
          value={value.autoCaptionIntensity}
          min={0}
          max={1}
          step={0.05}
          onChange={(next) => onChangeAction({ ...value, autoCaptionIntensity: next })}
        />

        <TemplateToggleField
          label="중요 단어 자동 강조"
          description="문장 안에서 중요한 단어를 자동으로 더 눈에 띄게 만듭니다."
          checked={value.autoHighlightEnabled}
          onChange={(next) => onChangeAction({ ...value, autoHighlightEnabled: next })}
        />

        <TemplateColorField
          label="강조 색상"
          description="자동으로 강조된 단어에 들어갈 기본 색입니다."
          value={value.autoHighlightColor}
          onChange={(next) => onChangeAction({ ...value, autoHighlightColor: next })}
        />

        <TemplateRangeField
          label="강조 크기"
          description="강조된 단어가 기본 글자보다 얼마나 커질지 정합니다."
          value={value.autoHighlightScale}
          min={1}
          max={1.4}
          step={0.02}
          onChange={(next) => onChangeAction({ ...value, autoHighlightScale: next })}
        />

        <TemplateRangeField
          label="상단 캡션 크기"
          description="상단 작은 설명 자막의 크기입니다."
          value={value.topCaptionScale}
          min={0.7}
          max={1.4}
          step={0.05}
          onChange={(next) => onChangeAction({ ...value, topCaptionScale: next })}
        />

        <TemplateRangeField
          label="중앙 캡션 크기"
          description="중앙 큰 자막의 크기입니다."
          value={value.mainCaptionScale}
          min={0.7}
          max={1.5}
          step={0.05}
          onChange={(next) => onChangeAction({ ...value, mainCaptionScale: next })}
        />

        <TemplateRangeField
          label="상단 캡션 배경 투명도"
          description="상단 설명 자막 뒤 어두운 박스의 투명도입니다."
          value={value.topCaptionBgOpacity}
          min={0.2}
          max={0.95}
          step={0.05}
          onChange={(next) => onChangeAction({ ...value, topCaptionBgOpacity: next })}
        />

        <TemplateRangeField
          label="중앙 자막 줄간격"
          description="큰 자막 줄 간격입니다."
          value={value.captionLineHeight}
          min={0.85}
          max={1.5}
          step={0.05}
          onChange={(next) => onChangeAction({ ...value, captionLineHeight: next })}
        />

        <TemplateRangeField
          label="중앙 자막 외곽선 두께"
          description="큰 자막 외곽선 두께입니다."
          value={value.mainCaptionStrokeWidth}
          min={0}
          max={8}
          step={0.5}
          onChange={(next) => onChangeAction({ ...value, mainCaptionStrokeWidth: next })}
        />

        <TemplateRangeField
          label="중앙 자막 글로우"
          description="큰 자막 발광 강도입니다."
          value={value.mainCaptionGlow}
          min={0}
          max={1}
          step={0.05}
          onChange={(next) => onChangeAction({ ...value, mainCaptionGlow: next })}
        />

        <TemplateRangeField
          label="문장 바뀌는 속도"
          description="한 장면 안에서 다음 문장으로 넘어가는 시간입니다."
          value={value.cueDurationSec}
          min={0.35}
          max={3}
          step={0.05}
          onChange={(next) => onChangeAction({ ...value, cueDurationSec: next })}
        />

        <TemplateColorField
          label="상단 캡션 글자색"
          description="상단 작은 캡션 글자 색입니다."
          value={value.topCaptionTextColor}
          onChange={(next) => onChangeAction({ ...value, topCaptionTextColor: next })}
        />

        <TemplateColorField
          label="상단 캡션 배경색"
          description="상단 작은 캡션 박스 배경색입니다."
          value={value.topCaptionBgColor}
          onChange={(next) => onChangeAction({ ...value, topCaptionBgColor: next })}
        />

        <TemplateColorField
          label="중앙 자막 글자색"
          description="큰 자막 기본 글자색입니다."
          value={value.mainCaptionColor}
          onChange={(next) => onChangeAction({ ...value, mainCaptionColor: next })}
        />

        <TemplateColorField
          label="중앙 자막 외곽선 색"
          description="큰 자막 외곽선 색입니다."
          value={value.mainCaptionStrokeColor}
          onChange={(next) => onChangeAction({ ...value, mainCaptionStrokeColor: next })}
        />
      </div>

      <div className="studio-feature-asset-card">
        <div className="studio-feature-asset-card-title">자동 강조 예시</div>
        <div className="studio-feature-asset-card-description">
          따로 손대지 않으면 아래 같은 방식으로 자동 강조가 들어갑니다.
        </div>
        {["혼자 보기에도 민망한 애니", "치-됐어요!!", "반응이 갈렸습니다"].map((sampleText, sampleIndex) => {
          const analyzedCue = analyzeStudioCaptionAutoCue({
            text: sampleText,
            cueIndex: sampleIndex,
            cueCount: 3,
          });
          const sample = buildAutoCaptionCueOverrides({
            text: sampleText,
            cueIndex: sampleIndex,
            cueCount: 3,
            profile: value.autoCaptionProfile,
            intensity: value.autoCaptionIntensity,
          });
          return (
            <div key={sampleText} className="studio-caption-feature-rule-row">
              <strong>{sampleText}</strong>
              <div className="studio-caption-feature-rule-detail">
                tag={analyzedCue.tag}, style={sample.style || value.captionStyle}, anim={sample.animation || value.animationPreset}, exit=
                {sample.exitAnimation || "none"}, scale=
                {typeof sample.scale === "number" ? sample.scale.toFixed(2) : "default"}, glow=
                {typeof sample.glow === "number" ? sample.glow.toFixed(2) : "default"}
              </div>
              <div className="studio-caption-feature-rule-detail">
                highlight={analyzedCue.highlightWords.length > 0 ? analyzedCue.highlightWords.join(", ") : "none"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="studio-feature-asset-card">
        <div className="studio-feature-asset-card-title">자막 설정 저장</div>
        <div className="studio-feature-asset-card-description">
          지금 자막 모양과 움직임만 따로 저장합니다. 템플릿 모양이나 영상은 포함되지 않습니다.
        </div>
        <input
          className="input-field"
          value={presetName}
          onChange={(event) => setPresetName(event.target.value)}
          placeholder="예: 핑크 밈형 / 깔끔한 정보형 / 강한 후킹형"
        />
        <div className="studio-overlay-feature-action-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const nextName = presetName.trim();
              if (!nextName) return;
              const nextPreset: StoredCaptionFeaturePreset = {
                id: `${Date.now()}`,
                name: nextName,
                createdAt: new Date().toISOString(),
                data: captionFeatureData,
              };
              const next = [nextPreset, ...savedPresets].slice(0, 20);
              persistPresets(next);
              setSelectedPresetId(nextPreset.id);
              setPresetName("");
            }}
          >
            지금 설정 저장
          </button>
          <select className="input-field studio-caption-feature-select-input" value={selectedPresetId} onChange={(event) => setSelectedPresetId(event.target.value)}>
            <option value="">저장한 자막 설정 선택</option>
            {savedPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary"
            disabled={!selectedPreset}
            onClick={() => {
              if (!selectedPreset) return;
              onChangeAction({ ...value, ...selectedPreset.data });
            }}
          >
            적용
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!selectedPreset}
            onClick={() => {
              if (!selectedPreset) return;
              const next = savedPresets.filter((preset) => preset.id !== selectedPreset.id);
              persistPresets(next);
              setSelectedPresetId("");
            }}
          >
            삭제
          </button>
        </div>
      </div>
    </section>
  );
}

function pickCaptionFeatureData(value: FunCaptionTemplateData): StoredCaptionFeaturePreset["data"] {
  return {
    topCaptionScale: value.topCaptionScale,
    mainCaptionScale: value.mainCaptionScale,
    topCaptionBgOpacity: value.topCaptionBgOpacity,
    captionStyle: value.captionStyle,
    animationPreset: value.animationPreset,
    mainCaptionColor: value.mainCaptionColor,
    mainCaptionStrokeColor: value.mainCaptionStrokeColor,
    mainCaptionStrokeWidth: value.mainCaptionStrokeWidth,
    mainCaptionGlow: value.mainCaptionGlow,
    autoCaptionProfile: value.autoCaptionProfile,
    autoCaptionIntensity: value.autoCaptionIntensity,
    autoHighlightEnabled: value.autoHighlightEnabled,
    autoHighlightColor: value.autoHighlightColor,
    autoHighlightScale: value.autoHighlightScale,
    topCaptionTextColor: value.topCaptionTextColor,
    topCaptionBgColor: value.topCaptionBgColor,
    captionLineHeight: value.captionLineHeight,
    cueDurationSec: value.cueDurationSec,
  };
}

function TemplateRangeField({
  label,
  description,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="studio-template-static-field">
      <span className="studio-template-static-label">{label}</span>
      <span className="studio-template-static-field-description">{description}</span>
      <div className="studio-template-static-row">
        <input className="studio-template-static-range-input" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <input className="input-field studio-template-static-number-input" type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      </div>
    </label>
  );
}

function TemplateToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="studio-template-static-field">
      <span className="studio-template-static-label">{label}</span>
      <span className="studio-template-static-field-description">{description}</span>
      <label className="studio-template-static-checkbox-row">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        자동 강조 단어 켜기
      </label>
    </label>
  );
}

function TemplateSelectField({
  label,
  description,
  value,
  onChange,
  options,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="studio-template-static-field">
      <span className="studio-template-static-label">{label}</span>
      <span className="studio-template-static-field-description">{description}</span>
      <select className="input-field" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TemplateColorField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="studio-template-static-field">
      <span className="studio-template-static-label">{label}</span>
      <span className="studio-template-static-field-description">{description}</span>
      <StudioColorPickerField value={value} onChange={onChange} />
    </label>
  );
}
