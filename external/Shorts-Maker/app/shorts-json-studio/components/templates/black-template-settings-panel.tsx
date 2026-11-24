"use client";

import { STUDIO_CAPTION_AUTO_PROFILE_OPTIONS } from "@/types/studio-caption";
import type { BlackTemplateData } from "@/types/studio-template";
import { StudioColorPickerField } from "@/components/studio-color-picker-field";

type BlackTemplateSettingsPanelProps = {
  value: BlackTemplateData;
  onChangeAction: (value: BlackTemplateData) => void;
};

export function BlackTemplateSettingsPanel({ value, onChangeAction }: BlackTemplateSettingsPanelProps) {
  return (
    <section className="studio-template-static-shell">
      <div className="studio-template-static-header">
        <div className="studio-template-static-title">Black 템플릿 설정</div>
        <div className="studio-template-static-description">
          제목-미디어-본문 구조는 유지하고 강조색, 글자 크기, 미디어 반경만 조정합니다.
        </div>
      </div>

      <label className="studio-template-static-field">
        <span className="studio-template-static-label">강조 제목 색상</span>
        <span className="studio-template-static-field-description">
          상단 제목에서 강조 단어에 적용되는 색상입니다.
        </span>
        <StudioColorPickerField value={value.accentColor} onChange={(next) => onChangeAction({ ...value, accentColor: next })} />
      </label>

      <TemplateRangeField
        label="제목 크기 배율"
        description="상단 후킹 제목의 비중을 조정합니다."
        value={value.titleScale}
        min={0.7}
        max={1.4}
        step={0.05}
        onChange={(next) => onChangeAction({ ...value, titleScale: next })}
      />

      <TemplateRangeField
        label="본문 크기 배율"
        description="하단 설명 문구의 크기를 조정합니다."
        value={value.bodyScale}
        min={0.7}
        max={1.4}
        step={0.05}
        onChange={(next) => onChangeAction({ ...value, bodyScale: next })}
      />

      <TemplateRangeField
        label="미디어 모서리"
        description="중앙 이미지/영상 영역의 둥근 정도를 조정합니다."
        value={value.mediaRadius}
        min={0}
        max={40}
        step={1}
        onChange={(next) => onChangeAction({ ...value, mediaRadius: next })}
      />

      <label className="studio-template-static-field">
        <span className="studio-template-static-label">자동 강조 방식</span>
        <span className="studio-template-static-field-description">
          아래 문장을 어떤 느낌으로 자동 강조할지 정합니다.
        </span>
        <select
          className="input-field"
          value={value.autoCaptionProfile}
          onChange={(event) => onChangeAction({ ...value, autoCaptionProfile: event.target.value as BlackTemplateData["autoCaptionProfile"] })}
        >
          {STUDIO_CAPTION_AUTO_PROFILE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <TemplateRangeField
        label="자동 강조 강도"
        description="아래 문장에서 중요한 부분을 얼마나 강하게 튀게 보여줄지 정합니다."
        value={value.autoCaptionIntensity}
        min={0}
        max={1}
        step={0.05}
        onChange={(next) => onChangeAction({ ...value, autoCaptionIntensity: next })}
      />

      <TemplateRangeField
        label="문장 바뀌는 속도"
        description="아래 문장이 여러 줄로 순서대로 나올 때 한 줄이 머무는 시간입니다."
        value={value.cueDurationSec}
        min={0.35}
        max={3}
        step={0.05}
        onChange={(next) => onChangeAction({ ...value, cueDurationSec: next })}
      />

      <label className="studio-template-static-field">
        <span className="studio-template-static-label">중요 단어 자동 강조</span>
        <span className="studio-template-static-field-description">
          핵심 단어를 강조색과 확대 효과로 보여줍니다.
        </span>
        <label className="studio-template-static-checkbox-row">
          <input
            type="checkbox"
            checked={value.autoHighlightEnabled}
            onChange={(event) => onChangeAction({ ...value, autoHighlightEnabled: event.target.checked })}
          />
          자동으로 강조하기
        </label>
      </label>

      <label className="studio-template-static-field">
        <span className="studio-template-static-label">강조 색상</span>
        <span className="studio-template-static-field-description">
          자동으로 고른 중요 단어에 들어갈 색상입니다.
        </span>
        <StudioColorPickerField value={value.autoHighlightColor} onChange={(next) => onChangeAction({ ...value, autoHighlightColor: next })} />
      </label>

      <TemplateRangeField
        label="강조 크기"
        description="강조된 단어가 기본 글자보다 얼마나 커질지 정합니다."
        value={value.autoHighlightScale}
        min={1}
        max={1.4}
        step={0.02}
        onChange={(next) => onChangeAction({ ...value, autoHighlightScale: next })}
      />
    </section>
  );
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
        <input
          className="input-field studio-template-static-number-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    </label>
  );
}
