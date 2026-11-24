"use client";

import type { PublishCategory } from "@/lib/publish/types";

export type LayoutStudioWorkbenchContextOption = {
  key: PublishCategory;
  label: string;
};

export type LayoutStudioWorkbenchTemplateOption = {
  id: string;
  label: string;
};

type LayoutStudioWorkbenchContextBarProps = {
  categoryCount: number;
  customerPickerValue: string;
  customerSearchQuery: string;
  selectedTemplateId: string;
  publishCategory: PublishCategory;
  recentCustomerOptions: LayoutStudioWorkbenchContextOption[];
  visibleCustomerOptions: LayoutStudioWorkbenchContextOption[];
  templateOptions: LayoutStudioWorkbenchTemplateOption[];
  onCustomerPickerValueChange: (value: string) => void;
  onCustomerSearchQueryChange: (value: string) => void;
  onCustomerPickerSubmit: () => void;
  onPublishCategoryChange: (category: PublishCategory) => void;
  onTemplateChange: (templateId: string) => void;
};

export function LayoutStudioWorkbenchContextBar({
  categoryCount,
  customerPickerValue,
  customerSearchQuery,
  selectedTemplateId,
  publishCategory,
  recentCustomerOptions,
  visibleCustomerOptions,
  templateOptions,
  onCustomerPickerValueChange,
  onCustomerSearchQueryChange,
  onCustomerPickerSubmit,
  onPublishCategoryChange,
  onTemplateChange,
}: LayoutStudioWorkbenchContextBarProps) {
  return (
    <div className="studio-layout-workbench-context-bar">
      <label className="studio-layout-workbench-context-field" htmlFor="layout-studio-customer-picker">
        <span>콘텐츠 프로필</span>
        <input
          className="input-field"
          value={customerSearchQuery}
          onChange={(event) => onCustomerSearchQueryChange(event.target.value)}
          placeholder={`콘텐츠 프로필 ${categoryCount}개 중 검색`}
        />
        <select
          id="layout-studio-customer-select"
          className="input-field"
          value={publishCategory}
          onChange={(event) => onPublishCategoryChange(event.target.value as PublishCategory)}
        >
          {visibleCustomerOptions.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
        <div className="studio-layout-workbench-context-input-row">
          <input
            id="layout-studio-customer-picker"
            className="input-field"
            value={customerPickerValue}
            onChange={(event) => onCustomerPickerValueChange(event.target.value)}
            onBlur={onCustomerPickerSubmit}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onCustomerPickerSubmit();
            }}
            placeholder="목록에 없으면 프로필 키 직접 입력"
          />
          <button className="btn-secondary" type="button" onClick={onCustomerPickerSubmit}>
            프로필 열기
          </button>
        </div>
        {recentCustomerOptions.length > 0 ? (
          <div className="studio-layout-workbench-recent-row">
            {recentCustomerOptions.map((item) => (
              <button
                key={item.key}
                type="button"
                className="studio-layout-workbench-recent-chip"
                onClick={() => onPublishCategoryChange(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        <small>
          콘텐츠 프로필 목록은 각 프로필의 내부 식별자를 기준으로 관리됩니다. 총 {categoryCount}개 프로필을 불러왔고, 최근 프로필은 위에서 빠르게 다시 열 수 있습니다.
        </small>
      </label>
      <label className="studio-layout-workbench-context-field" htmlFor="layout-studio-template-picker">
        <span>템플릿</span>
        <select
          id="layout-studio-template-picker"
          className="input-field"
          value={selectedTemplateId}
          onChange={(event) => onTemplateChange(event.target.value)}
        >
          {templateOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <small>현재 콘텐츠 프로필 안에서 어떤 템플릿 기본형을 손보는지 여기서 바로 바꿉니다.</small>
      </label>
    </div>
  );
}
