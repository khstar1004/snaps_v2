"use client";

import { useEffect, useMemo, useState } from "react";
import { STUDIO_OVERLAY_PLACEMENT_OPTIONS, STUDIO_OVERLAY_PRESET_OPTIONS } from "@/types/studio-overlay";
import type { FunCaptionTemplateData } from "@/types/studio-template";

const OVERLAY_FEATURE_PRESET_STORAGE_KEY = "studio-overlay-feature-presets-v1";

type StoredOverlayFeaturePreset = {
  id: string;
  name: string;
  createdAt: string;
  data: Pick<
    FunCaptionTemplateData,
    | "overlayPreset"
    | "overlayPlacement"
    | "overlayOpacity"
    | "overlayScale"
    | "overlayDensity"
  >;
};

type OverlayFeatureManagerPanelProps = {
  value: FunCaptionTemplateData;
  onChangeAction: (value: FunCaptionTemplateData) => void;
};

export function OverlayFeatureManagerPanel({ value, onChangeAction }: OverlayFeatureManagerPanelProps) {
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [savedPresets, setSavedPresets] = useState<StoredOverlayFeaturePreset[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OVERLAY_FEATURE_PRESET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredOverlayFeaturePreset[];
      if (Array.isArray(parsed)) {
        setSavedPresets(parsed.filter((item) => item && typeof item === "object" && typeof item.id === "string"));
      }
    } catch {
      return;
    }
  }, []);

  const selectedPreset = useMemo(
    () => savedPresets.find((preset) => preset.id === selectedPresetId) || null,
    [savedPresets, selectedPresetId],
  );

  const persistPresets = (next: StoredOverlayFeaturePreset[]) => {
    setSavedPresets(next);
    try {
      window.localStorage.setItem(OVERLAY_FEATURE_PRESET_STORAGE_KEY, JSON.stringify(next));
    } catch {
      return;
    }
  };

  const overlayFeatureData = pickOverlayFeatureData(value);

  return (
    <section className="studio-feature-asset-shell">
      <div className="studio-feature-asset-copy">
        <div className="studio-feature-asset-title">장식 효과 꾸미기</div>
        <div className="studio-feature-asset-description">
          하트, 불꽃 같은 장식 효과를 여기서 정합니다. 사진과 영상 모두 같은 방식으로 적용됩니다.
        </div>
      </div>

      <div className="studio-overlay-feature-grid">
        <TemplateSelectField
          label="효과 종류"
          description="어떤 장식 효과를 쓸지 정합니다."
          value={value.overlayPreset}
          onChange={(next) => onChangeAction({ ...value, overlayPreset: next as FunCaptionTemplateData["overlayPreset"] })}
          options={STUDIO_OVERLAY_PRESET_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
            description: option.description,
          }))}
        />

        <TemplateSelectField
          label="효과 위치"
          description="장식 효과가 주로 보일 위치입니다."
          value={value.overlayPlacement}
          onChange={(next) => onChangeAction({ ...value, overlayPlacement: next as FunCaptionTemplateData["overlayPlacement"] })}
          options={STUDIO_OVERLAY_PLACEMENT_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
            description: option.label,
          }))}
        />

        <TemplateRangeField
          label="효과 진하기"
          description="장식 효과가 얼마나 진하게 보일지 정합니다."
          value={value.overlayOpacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(next) => onChangeAction({ ...value, overlayOpacity: next })}
        />

        <TemplateRangeField
          label="효과 크기"
          description="장식 효과가 얼마나 크게 보일지 정합니다."
          value={value.overlayScale}
          min={0.45}
          max={1.8}
          step={0.05}
          onChange={(next) => onChangeAction({ ...value, overlayScale: next })}
        />

        <TemplateRangeField
          label="효과 개수"
          description="화면에 얼마나 많이 깔릴지 정합니다."
          value={value.overlayDensity}
          min={0.25}
          max={1.6}
          step={0.05}
          onChange={(next) => onChangeAction({ ...value, overlayDensity: next })}
        />
      </div>

      <div className="studio-feature-asset-card">
        <div className="studio-feature-asset-card-title">장식 효과 저장</div>
        <div className="studio-feature-asset-card-description">
          지금 만든 장식 효과 조합을 저장해두고 다른 영상에서도 다시 쓸 수 있습니다.
        </div>
        <div className="studio-overlay-feature-action-row">
          <input
            className="input-field studio-overlay-feature-name-input"
            placeholder="예: 핑크 하트 / 강한 불꽃"
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const trimmed = presetName.trim();
              if (!trimmed) return;
              const nextPreset: StoredOverlayFeaturePreset = {
                id: `overlay-${Date.now()}`,
                name: trimmed,
                createdAt: new Date().toISOString(),
                data: overlayFeatureData,
              };
              persistPresets([nextPreset, ...savedPresets]);
              setSelectedPresetId(nextPreset.id);
              setPresetName("");
            }}
          >
            지금 설정 저장
          </button>
        </div>

        <div className="studio-overlay-feature-select-row">
          <select
            className="input-field studio-overlay-feature-select-input"
            value={selectedPresetId}
            onChange={(event) => setSelectedPresetId(event.target.value)}
          >
            <option value="">저장한 장식 효과 선택</option>
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

function pickOverlayFeatureData(
  value: FunCaptionTemplateData,
): Pick<
  FunCaptionTemplateData,
  "overlayPreset" | "overlayPlacement" | "overlayOpacity" | "overlayScale" | "overlayDensity"
> {
  return {
    overlayPreset: value.overlayPreset,
    overlayPlacement: value.overlayPlacement,
    overlayOpacity: value.overlayOpacity,
    overlayScale: value.overlayScale,
    overlayDensity: value.overlayDensity,
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
  options: Array<{ value: string; label: string; description: string }>;
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
      <span className="studio-overlay-feature-option-description">
        {options.find((option) => option.value === value)?.description || ""}
      </span>
    </label>
  );
}
