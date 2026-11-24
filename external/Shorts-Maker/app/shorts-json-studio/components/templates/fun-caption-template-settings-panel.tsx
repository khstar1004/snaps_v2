"use client";

import type { FunCaptionTemplateData } from "@/types/studio-template";

type FunCaptionTemplateSettingsPanelProps = {
  value: FunCaptionTemplateData;
  onChangeAction: (value: FunCaptionTemplateData) => void;
};

export function FunCaptionTemplateSettingsPanel({ value, onChangeAction }: FunCaptionTemplateSettingsPanelProps) {
  return (
    <section className="studio-template-static-shell">
      <div className="studio-template-static-header">
        <div className="studio-template-static-title">펀캡션 템플릿 설정</div>
        <div className="studio-template-static-description">
          이 영역은 화면 배치와 배경 분위기만 다룹니다. 자막 모양과 움직임은 아래 `자막 꾸미기`에서 따로 만집니다.
        </div>
      </div>

      <TemplateRangeField
        label="배경 딤 강도"
        description="영상이나 사진 위에 깔리는 어두운 막의 진하기입니다."
        value={value.overlayStrength}
        min={0}
        max={0.8}
        step={0.05}
        onChange={(next) => onChangeAction({ ...value, overlayStrength: next })}
      />

      <TemplateRangeField
        label="상단 캡션 Y 위치"
        description="위쪽 작은 문장이 나오는 높이입니다."
        value={value.topCaptionY}
        min={0}
        max={140}
        step={1}
        onChange={(next) => onChangeAction({ ...value, topCaptionY: next })}
      />

      <TemplateRangeField
        label="중앙 캡션 Y 위치"
        description="가운데 큰 문장이 나오는 높이입니다."
        value={value.mainCaptionY}
        min={18}
        max={82}
        step={1}
        onChange={(next) => onChangeAction({ ...value, mainCaptionY: next })}
      />

      <TemplateRangeField
        label="자막 최대 너비"
        description="가운데 큰 문장이 화면에서 차지할 수 있는 최대 너비입니다."
        value={value.captionMaxWidth}
        min={45}
        max={100}
        step={1}
        onChange={(next) => onChangeAction({ ...value, captionMaxWidth: next })}
      />

      <TemplateSelectField
        label="상단 캡션 정렬"
        description="위쪽 작은 문장을 왼쪽에 둘지 가운데 둘지 정합니다."
        value={value.topCaptionAlign}
        onChange={(next) => onChangeAction({ ...value, topCaptionAlign: next as FunCaptionTemplateData["topCaptionAlign"] })}
        options={[
          { value: "left", label: "왼쪽" },
          { value: "center", label: "가운데" },
        ]}
      />

      <TemplateSelectField
        label="중앙 캡션 정렬"
        description="가운데 큰 문장을 왼쪽에 둘지 가운데 둘지 정합니다."
        value={value.mainCaptionAlign}
        onChange={(next) => onChangeAction({ ...value, mainCaptionAlign: next as FunCaptionTemplateData["mainCaptionAlign"] })}
        options={[
          { value: "center", label: "가운데" },
          { value: "left", label: "왼쪽" },
        ]}
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
