"use client";

import Link from "next/link";
import { getStudioTemplateDefinition } from "./templates/template-registry";
import type { StudioTemplateId } from "../types";

type StudioTemplateQuickPickerPanelProps = {
  templateId: StudioTemplateId;
  detailsHref: string;
  disabled?: boolean;
  templateRequirementAlert?: string | null;
  onTemplateIdChangeAction: (value: StudioTemplateId) => void;
};

const TEMPLATE_OPTIONS: StudioTemplateId[] = ["default", "black", "fun-caption"];

export function StudioTemplateQuickPickerPanel({
  templateId,
  detailsHref,
  disabled = false,
  templateRequirementAlert,
  onTemplateIdChangeAction,
}: StudioTemplateQuickPickerPanelProps) {
  const activeTemplate = getStudioTemplateDefinition(templateId);

  return (
    <section className="card studio-input-module">
      <div className="studio-template-quick-picker-shell">
        <div className="studio-template-quick-picker-head">
          <div className="studio-template-quick-picker-copy">
            <div className="studio-template-quick-picker-title">템플릿 선택</div>
            <div className="studio-template-quick-picker-description">
              여기서는 템플릿만 빠르게 고릅니다. 자세한 설정은 별도 페이지에서 관리합니다.
            </div>
          </div>
          <Link href={detailsHref} className="btn-secondary">
            자세히 수정하기
          </Link>
        </div>

        <label className="studio-template-quick-picker-select-field">
          <span className="studio-template-quick-picker-select-label">현재 템플릿</span>
          <select
            className="input-field"
            value={templateId}
            onChange={(event) => onTemplateIdChangeAction(event.target.value as StudioTemplateId)}
            disabled={disabled}
          >
            {TEMPLATE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {getStudioTemplateDefinition(option).label}
              </option>
            ))}
          </select>
        </label>

        <div className="studio-template-quick-picker-summary-card">
          <div className="studio-template-quick-picker-summary-title">{activeTemplate.label}</div>
          <div className="studio-template-quick-picker-summary-copy">{activeTemplate.summary}</div>
          <div className="studio-template-quick-picker-summary-guide">{activeTemplate.inputGuide}</div>
        </div>

        {templateRequirementAlert ? (
          <div className="studio-template-warning-alert">
            {templateRequirementAlert}
          </div>
        ) : null}
      </div>
    </section>
  );
}
