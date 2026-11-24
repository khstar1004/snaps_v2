"use client";

import { STUDIO_CAPTION_AUTO_PROFILE_OPTIONS } from "@/types/studio-caption";
import type { DefaultTemplateData } from "@/types/studio-template";
import { StudioColorPickerField } from "@/components/studio-color-picker-field";

type DefaultTemplateSettingsPanelProps = {
  value: DefaultTemplateData;
  onChangeAction: (value: DefaultTemplateData) => void;
};

export function DefaultTemplateSettingsPanel({ value, onChangeAction }: DefaultTemplateSettingsPanelProps) {
  return (
    <section className="studio-template-static-shell">
      <div className="studio-template-static-header">
        <div className="studio-template-static-title">기본 템플릿 설정</div>
        <div className="studio-template-static-description">
          원래 뉴스형 레이아웃은 유지하고 제목/본문 크기처럼 static 요소만 조정합니다.
        </div>
      </div>

      <TemplateRangeField
        label="제목 크기 배율"
        description="기사형 메인 제목만 키우거나 줄입니다."
        value={value.titleScale}
        min={0.7}
        max={1.4}
        step={0.05}
        onChange={(next) => onChangeAction({ ...value, titleScale: next })}
      />

      <TemplateRangeField
        label="본문 크기 배율"
        description="본문 문단과 요약 줄의 크기를 조정합니다."
        value={value.bodyScale}
        min={0.7}
        max={1.4}
        step={0.05}
        onChange={(next) => onChangeAction({ ...value, bodyScale: next })}
      />

      <label className="studio-template-static-field">
        <span className="studio-template-static-label">자동 강조 방식</span>
        <span className="studio-template-static-field-description">
          뉴스형 본문에서 어떤 느낌으로 자동 강조할지 정합니다.
        </span>
        <select
          className="input-field"
          value={value.autoCaptionProfile}
          onChange={(event) => onChangeAction({ ...value, autoCaptionProfile: event.target.value as DefaultTemplateData["autoCaptionProfile"] })}
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
        description="본문에서 중요한 부분을 얼마나 강하게 튀게 보여줄지 정합니다."
        value={value.autoCaptionIntensity}
        min={0}
        max={1}
        step={0.05}
        onChange={(next) => onChangeAction({ ...value, autoCaptionIntensity: next })}
      />

      <TemplateRangeField
        label="문장 바뀌는 속도"
        description="본문이 여러 문장으로 나올 때 한 문장이 머무는 시간입니다."
        value={value.cueDurationSec}
        min={0.35}
        max={3}
        step={0.05}
        onChange={(next) => onChangeAction({ ...value, cueDurationSec: next })}
      />

      <label className="studio-template-static-field">
        <span className="studio-template-static-label">중요 단어 자동 강조</span>
        <span className="studio-template-static-field-description">
          뉴스형 본문에서도 핵심 단어를 색상과 확대 효과로 보여줍니다.
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
          본문 자동 강조 단어에 적용되는 색상입니다.
        </span>
        <StudioColorPickerField value={value.autoHighlightColor} onChange={(next) => onChangeAction({ ...value, autoHighlightColor: next })} />
      </label>

      <TemplateRangeField
        label="강조 크기"
        description="강조된 단어가 기본 글자보다 얼마나 커질지 정합니다."
        value={value.autoHighlightScale}
        min={1}
        max={1.3}
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
