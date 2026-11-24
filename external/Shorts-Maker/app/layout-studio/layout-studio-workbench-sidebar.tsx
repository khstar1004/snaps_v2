"use client";

import { StudioColorPickerField } from "@/components/studio-color-picker-field";
import type { TemplateBranding } from "@/app/layout-studio/layout-studio-helpers";

export type LayoutStudioWorkbenchSidebarTab = "branding" | "notes";

const FONT_FAMILY_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "프리텐다드", value: '"Pretendard Variable", "Pretendard", sans-serif' },
  { label: "스포카 한 산스", value: '"Spoqa Han Sans Neo", "Pretendard", sans-serif' },
  { label: "Noto Sans KR", value: '"Noto Sans KR", "Pretendard", sans-serif' },
  { label: "맑은 고딕", value: '"Malgun Gothic", "Pretendard", sans-serif' },
];

type LayoutStudioWorkbenchSidebarProps = {
  activeSidebarTab: LayoutStudioWorkbenchSidebarTab;
  canEditSelectedCategory: boolean;
  loading: boolean;
  previewCategoryLabel: string;
  activeTemplateLabel: string;
  brandingDraft: TemplateBranding;
  templateNotesDraft: string;
  onSidebarTabChange: (tab: LayoutStudioWorkbenchSidebarTab) => void;
  onBrandingDraftChange: (patch: Partial<TemplateBranding>) => void;
  onSaveCategoryBranding: () => void;
  onTemplateNotesChange: (value: string) => void;
  onSaveTemplateNotes: () => void;
};

export function LayoutStudioWorkbenchSidebar({
  activeSidebarTab,
  canEditSelectedCategory,
  loading,
  previewCategoryLabel,
  activeTemplateLabel,
  brandingDraft,
  templateNotesDraft,
  onSidebarTabChange,
  onBrandingDraftChange,
  onSaveCategoryBranding,
  onTemplateNotesChange,
  onSaveTemplateNotes,
}: LayoutStudioWorkbenchSidebarProps) {
  return (
    <aside className="assets-folder-sidebar studio-layout-workbench-sidebar">
      <div className="studio-layout-workbench-sidebar-head">
        <h2>편집 패널</h2>
        <p>선택은 상단에서, 여기는 값 입력과 저장만 담당합니다.</p>
      </div>
      <div className="studio-template-tab-row studio-layout-workbench-tab-row" role="tablist" aria-label="좌측 패널 탭">
        {([
          { key: "branding", label: "브랜딩" },
          { key: "notes", label: "메모" },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeSidebarTab === tab.key}
            className={`studio-template-tab${activeSidebarTab === tab.key ? " is-active" : ""}`}
            onClick={() => onSidebarTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="studio-layout-workbench-sidebar-scroll">
        {activeSidebarTab === "branding" ? (
          <section className="studio-layout-workbench-panel studio-layout-workbench-panel-compact">
            <div className="studio-layout-workbench-panel-head">
              <h2 className="studio-layout-workbench-section-title">브랜딩 빠른 편집</h2>
              <p>
                <strong>{previewCategoryLabel}</strong> · <strong>{activeTemplateLabel}</strong>
              </p>
            </div>
            <fieldset disabled={!canEditSelectedCategory || loading} className="studio-branding-fieldset-reset studio-layout-workbench-field-stack">
              <div className="studio-layout-workbench-compact-grid">
                <label className="studio-layout-workbench-field">
                  <span>헤더 제목</span>
                  <input
                    className="input-field"
                    value={brandingDraft.headerTitle}
                    onChange={(event) => onBrandingDraftChange({ headerTitle: event.target.value })}
                  />
                </label>
                <label className="studio-layout-workbench-field">
                  <span>헤더 강조</span>
                  <input
                    className="input-field"
                    value={brandingDraft.headerAccentText}
                    onChange={(event) => onBrandingDraftChange({ headerAccentText: event.target.value })}
                  />
                </label>
              </div>

              <label className="studio-layout-workbench-field">
                <span>정보 줄 형식</span>
                <input
                  className="input-field"
                  value={brandingDraft.infoLineText}
                  onChange={(event) => onBrandingDraftChange({ infoLineText: event.target.value })}
                />
              </label>

              <div className="studio-layout-workbench-compact-grid">
                <label className="studio-layout-workbench-field">
                  <span>폰트</span>
                  <select
                    className="input-field"
                    value={brandingDraft.fontFamily}
                    onChange={(event) => onBrandingDraftChange({ fontFamily: event.target.value })}
                  >
                    {FONT_FAMILY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="studio-layout-workbench-field">
                  <span>이미지 모서리</span>
                  <label className="studio-branding-checkbox">
                    <input
                      type="checkbox"
                      checked={brandingDraft.imageRounded}
                      onChange={(event) => onBrandingDraftChange({ imageRounded: event.target.checked })}
                    />
                    둥근 모서리 적용
                  </label>
                </div>
              </div>

              <details className="studio-layout-workbench-mini-details">
                <summary>폰트 직접 입력</summary>
                <input
                  className="input-field"
                  value={brandingDraft.fontFamily}
                  onChange={(event) => onBrandingDraftChange({ fontFamily: event.target.value })}
                  placeholder='예: "Pretendard Variable", "Pretendard", sans-serif'
                />
              </details>

              <div className="studio-layout-workbench-inline-grid">
                <label className="studio-layout-workbench-field">
                  <span>헤더 색상</span>
                  <StudioColorPickerField value={brandingDraft.headerColor} onChange={(next) => onBrandingDraftChange({ headerColor: next })} />
                </label>
                <label className="studio-layout-workbench-field">
                  <span>푸터 색상</span>
                  <StudioColorPickerField value={brandingDraft.footerColor} onChange={(next) => onBrandingDraftChange({ footerColor: next })} />
                </label>
              </div>
            </fieldset>

            <div className="studio-layout-workbench-action-row">
              <button className="btn-secondary" onClick={onSaveCategoryBranding} disabled={loading}>
                프로필 브랜딩 저장
              </button>
            </div>
          </section>
        ) : null}

        {activeSidebarTab === "notes" ? (
          <section className="studio-layout-workbench-panel studio-layout-workbench-panel-compact">
            <h2 className="studio-layout-workbench-section-title">운영 메모</h2>
            <fieldset disabled={!canEditSelectedCategory || loading} className="studio-branding-fieldset-reset studio-layout-workbench-field-stack">
              <textarea
                className="input-field studio-branding-notes-textarea"
                value={templateNotesDraft}
                onChange={(event) => onTemplateNotesChange(event.target.value)}
                placeholder={"예: 디딤 변호사\n- 차분하고 신뢰감 있는 톤\n- 첫 멘트는 결론 먼저\n- 과장/선정적 표현 금지"}
              />
              <div className="studio-layout-workbench-action-row">
                <button className="btn-secondary" onClick={onSaveTemplateNotes} disabled={loading}>
                  프로필 메모 저장
                </button>
              </div>
            </fieldset>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
