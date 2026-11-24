"use client";

import type {
  CategoryTemplatePreset,
  LayoutRect,
  TemplateImageLayout,
  TemplateLayoutApply,
} from "@/app/layout-studio/layout-studio-helpers";
import { EDITABLE_RECT_SLOTS, type EditableRectSlotKey } from "@/app/layout-studio/layout-studio-interactions";
import type { InspectorSectionKey } from "@/app/layout-studio/layout-studio-inspector";
import { TemplateStaticSettingsPanel } from "@/app/shorts-json-studio/components/template-static-settings-panel";
import { StudioColorPickerField } from "@/components/studio-color-picker-field";

type RectFieldKey = "x" | "y" | "w" | "h";
type TemplateFontSizeKey = "titleSize" | "bodySize" | "headerSize" | "infoSize";
type TemplateFontWeightKey = "headerTitleWeight" | "headerAccentWeight" | "titleWeight" | "bodyWeight" | "infoWeight";
type TemplateColorKey = "headerTitleColor" | "headerAccentColor" | "titleColor" | "bodyColor" | "infoColor";
type TemplateAlignKey = "titleAlign" | "bodyAlign";
type SlotStyleBinding = {
  sizeKey?: TemplateFontSizeKey;
  weightKey?: TemplateFontWeightKey;
  colorKey?: TemplateColorKey;
  alignKey?: TemplateAlignKey;
};

const TEMPLATE_FONT_WEIGHT_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 400, label: "보통 400" },
  { value: 500, label: "중간 500" },
  { value: 600, label: "세미볼드 600" },
  { value: 700, label: "볼드 700" },
  { value: 800, label: "엑스트라볼드 800" },
  { value: 900, label: "블랙 900" },
];

const TEMPLATE_TEXT_COLOR_FIELDS: Array<{ key: TemplateColorKey; label: string }> = [
  { key: "headerTitleColor", label: "헤더 제목 색상" },
  { key: "headerAccentColor", label: "헤더 강조 색상" },
  { key: "titleColor", label: "제목 색상" },
  { key: "bodyColor", label: "본문 색상" },
  { key: "infoColor", label: "정보줄 색상" },
];

const TEMPLATE_TEXT_WEIGHT_FIELDS: Array<{ key: TemplateFontWeightKey; label: string }> = [
  { key: "headerTitleWeight", label: "헤더 제목 굵기" },
  { key: "headerAccentWeight", label: "헤더 강조 굵기" },
  { key: "titleWeight", label: "제목 굵기" },
  { key: "bodyWeight", label: "본문 굵기" },
  { key: "infoWeight", label: "정보줄 굵기" },
];

const TEMPLATE_LAYOUT_APPLY_OPTIONS: Array<{ key: keyof TemplateLayoutApply; label: string }> = [
  { key: "title", label: "제목 반영" },
  { key: "body", label: "본문 반영" },
  { key: "image", label: "이미지 반영" },
  { key: "info", label: "정보줄 반영" },
];

const TEMPLATE_FONT_SIZE_FIELDS: Array<{ key: TemplateFontSizeKey; label: string; min: number; max: number }> = [
  { key: "titleSize", label: "제목", min: 10, max: 52 },
  { key: "bodySize", label: "본문", min: 9, max: 36 },
  { key: "headerSize", label: "헤더", min: 10, max: 32 },
  { key: "infoSize", label: "정보줄", min: 8, max: 24 },
];

const TEMPLATE_ALIGN_FIELDS: Array<{ key: TemplateAlignKey; label: string }> = [
  { key: "titleAlign", label: "제목 정렬" },
  { key: "bodyAlign", label: "본문 정렬" },
];

function InspectorEmptyState({ onClearInspectorSearch }: { onClearInspectorSearch: () => void }) {
  return (
    <div className="studio-layout-inspector-empty">
      검색 결과가 없습니다.
      <button type="button" className="btn-secondary" onClick={onClearInspectorSearch}>
        검색 지우기
      </button>
    </div>
  );
}

type ElementPanelProps = {
  activeTemplateSupportsOverlayEditor: boolean;
  canEditSelectedCategory: boolean;
  hasElementInspectorResult: boolean;
  isInspectorSectionVisible: (sectionKey: InspectorSectionKey) => boolean;
  rectNudgeStep: number;
  selectedRect: LayoutRect;
  selectedRectSlot: EditableRectSlotKey;
  selectedSlotColorValue: string;
  selectedSlotFontMeta: { min: number; max: number; label: string } | null;
  selectedSlotFontSizeValue?: number;
  selectedSlotFontWeightMeta: { label: string } | null;
  selectedSlotFontWeightValue: number;
  selectedSlotHasTypographyControls: boolean;
  selectedSlotLabel: string;
  selectedSlotStyleBinding: SlotStyleBinding;
  selectedSlotTextAlignValue?: "left" | "center" | "right";
  showElementGeometrySection: boolean;
  showElementSlotsSection: boolean;
  showElementTypographySection: boolean;
  slotRectClipboard: boolean;
  toggleInspectorSection: (sectionKey: InspectorSectionKey) => void;
  onAlignSelectedSlotRect: (axis: "x" | "y", mode: "start" | "center" | "end") => void;
  onClearInspectorSearch: () => void;
  onCopySelectedSlotRect: () => void;
  onNudgeTemplateRectField: (slotKey: EditableRectSlotKey, field: RectFieldKey, delta: number) => void;
  onPasteSelectedSlotRect: () => void;
  onResetSelectedSlotRect: () => void;
  onSelectRectSlot: (slotKey: EditableRectSlotKey) => void;
  onSetTemplateFontSize: (key: TemplateFontSizeKey, raw: string) => void;
  onSetTemplateFontWeight: (key: TemplateFontWeightKey, raw: string) => void;
  onSetTemplateLayoutAlign: (key: TemplateAlignKey, raw: string) => void;
  onSetTemplateLayoutColor: (key: TemplateColorKey, value: string) => void;
  onSetTemplateRectField: (slotKey: EditableRectSlotKey, field: RectFieldKey, value: string) => void;
};

export function LayoutStudioElementInspectorPanel(props: ElementPanelProps) {
  const {
    activeTemplateSupportsOverlayEditor,
    canEditSelectedCategory,
    hasElementInspectorResult,
    isInspectorSectionVisible,
    rectNudgeStep,
    selectedRect,
    selectedRectSlot,
    selectedSlotColorValue,
    selectedSlotFontMeta,
    selectedSlotFontSizeValue,
    selectedSlotFontWeightMeta,
    selectedSlotFontWeightValue,
    selectedSlotHasTypographyControls,
    selectedSlotLabel,
    selectedSlotStyleBinding,
    selectedSlotTextAlignValue,
    showElementGeometrySection,
    showElementSlotsSection,
    showElementTypographySection,
    slotRectClipboard,
    toggleInspectorSection,
    onAlignSelectedSlotRect,
    onClearInspectorSearch,
    onCopySelectedSlotRect,
    onNudgeTemplateRectField,
    onPasteSelectedSlotRect,
    onResetSelectedSlotRect,
    onSelectRectSlot,
    onSetTemplateFontSize,
    onSetTemplateFontWeight,
    onSetTemplateLayoutAlign,
    onSetTemplateLayoutColor,
    onSetTemplateRectField,
  } = props;

  return (
    <section className={`studio-layout-editor-section${activeTemplateSupportsOverlayEditor ? "" : " studio-layout-workbench-disabled"}`}>
      <div className="studio-layout-editor-head">
        <div>
          <div className="studio-layout-workbench-section-title">선택 요소 속성</div>
          <div className="studio-layout-editor-hint-inline">캔버스에서 선택한 요소의 위치/크기/텍스트 스타일을 바로 수정합니다.</div>
        </div>
        <span className="studio-layout-element-target">{selectedSlotLabel}</span>
      </div>

      {!hasElementInspectorResult ? (
        <InspectorEmptyState onClearInspectorSearch={onClearInspectorSearch} />
      ) : (
        <>
          {showElementSlotsSection ? (
            <section className="studio-layout-inspector-block">
              <button
                type="button"
                className="studio-layout-inspector-toggle"
                aria-expanded={isInspectorSectionVisible("elementSlots")}
                onClick={() => toggleInspectorSection("elementSlots")}
              >
                요소 선택
              </button>
              {isInspectorSectionVisible("elementSlots") ? (
                <div className="studio-layout-inspector-body">
                  <div className="studio-layout-editor-slot-grid">
                    {EDITABLE_RECT_SLOTS.map((slot) => (
                      <button
                        key={slot.key}
                        type="button"
                        className={`studio-layout-editor-slot-button${selectedRectSlot === slot.key ? " is-active" : ""}`}
                        onClick={() => onSelectRectSlot(slot.key)}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {showElementGeometrySection ? (
            <section className="studio-layout-inspector-block">
              <button
                type="button"
                className="studio-layout-inspector-toggle"
                aria-expanded={isInspectorSectionVisible("elementGeometry")}
                onClick={() => toggleInspectorSection("elementGeometry")}
              >
                위치 및 크기
              </button>
              {isInspectorSectionVisible("elementGeometry") ? (
                <div className="studio-layout-inspector-body">
                  <div className="studio-layout-editor-field-grid">
                    {(["x", "y", "w", "h"] as const).map((field) => (
                      <div key={field} className="studio-layout-editor-field">
                        <label>{field.toUpperCase()}</label>
                        <div className="studio-layout-editor-adjust-row">
                          <button
                            type="button"
                            className="btn-secondary studio-layout-workbench-mini-btn"
                            onClick={() => onNudgeTemplateRectField(selectedRectSlot, field, -rectNudgeStep)}
                          >
                            -{rectNudgeStep}
                          </button>
                          <input
                            className="input-field"
                            type="number"
                            min={field === "w" ? 0.05 : field === "h" ? 0.04 : 0}
                            max={1}
                            step={rectNudgeStep}
                            value={selectedRect[field]}
                            onChange={(event) => onSetTemplateRectField(selectedRectSlot, field, event.target.value)}
                          />
                          <button
                            type="button"
                            className="btn-secondary studio-layout-workbench-mini-btn"
                            onClick={() => onNudgeTemplateRectField(selectedRectSlot, field, rectNudgeStep)}
                          >
                            +{rectNudgeStep}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="studio-layout-workbench-action-row studio-layout-editor-quick-actions">
                    <button type="button" className="btn-secondary" onClick={onCopySelectedSlotRect}>
                      좌표 복사
                    </button>
                    <button type="button" className="btn-secondary" onClick={onPasteSelectedSlotRect} disabled={!slotRectClipboard || !canEditSelectedCategory}>
                      좌표 붙여넣기
                    </button>
                    <button type="button" className="btn-secondary" onClick={onResetSelectedSlotRect} disabled={!canEditSelectedCategory}>
                      기본 좌표
                    </button>
                  </div>
                  <div className="studio-layout-editor-align-row">
                    <button type="button" className="btn-secondary" onClick={() => onAlignSelectedSlotRect("x", "start")}>
                      왼쪽 정렬
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => onAlignSelectedSlotRect("x", "center")}>
                      가로 중앙
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => onAlignSelectedSlotRect("x", "end")}>
                      오른쪽 정렬
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => onAlignSelectedSlotRect("y", "start")}>
                      위쪽 정렬
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => onAlignSelectedSlotRect("y", "center")}>
                      세로 중앙
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => onAlignSelectedSlotRect("y", "end")}>
                      아래쪽 정렬
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {showElementTypographySection ? (
            <section className="studio-layout-inspector-block">
              <button
                type="button"
                className="studio-layout-inspector-toggle"
                aria-expanded={isInspectorSectionVisible("elementTypography")}
                onClick={() => toggleInspectorSection("elementTypography")}
              >
                텍스트 스타일
              </button>
              {isInspectorSectionVisible("elementTypography") ? (
                <div className="studio-layout-inspector-body">
                  {selectedSlotStyleBinding.sizeKey && selectedSlotFontMeta ? (
                    <label className="studio-branding-label">
                      <span className="studio-branding-label-caption">{selectedSlotFontMeta.label} 크기</span>
                      <input
                        className="input-field"
                        type="number"
                        min={selectedSlotFontMeta.min}
                        max={selectedSlotFontMeta.max}
                        step={1}
                        value={selectedSlotFontSizeValue ?? ""}
                        onChange={(event) => onSetTemplateFontSize(selectedSlotStyleBinding.sizeKey!, event.target.value)}
                      />
                    </label>
                  ) : null}
                  {selectedSlotStyleBinding.weightKey && selectedSlotFontWeightMeta ? (
                    <label className="studio-branding-label">
                      <span className="studio-branding-label-caption">{selectedSlotFontWeightMeta.label} 굵기</span>
                      <select
                        className="input-field"
                        value={selectedSlotFontWeightValue}
                        onChange={(event) => onSetTemplateFontWeight(selectedSlotStyleBinding.weightKey!, event.target.value)}
                      >
                        {TEMPLATE_FONT_WEIGHT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {selectedSlotStyleBinding.colorKey ? (
                    <label className="studio-branding-label">
                      <span className="studio-branding-label-caption">텍스트 색상</span>
                      <StudioColorPickerField value={selectedSlotColorValue} onChange={(next) => onSetTemplateLayoutColor(selectedSlotStyleBinding.colorKey!, next)} />
                    </label>
                  ) : null}
                  {selectedSlotStyleBinding.alignKey ? (
                    <label className="studio-branding-label">
                      <span className="studio-branding-label-caption">텍스트 정렬</span>
                      <select
                        className="input-field"
                        value={selectedSlotTextAlignValue ?? "center"}
                        onChange={(event) => onSetTemplateLayoutAlign(selectedSlotStyleBinding.alignKey!, event.target.value)}
                      >
                        <option value="left">왼쪽</option>
                        <option value="center">가운데</option>
                        <option value="right">오른쪽</option>
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {!selectedSlotHasTypographyControls ? (
            <div className="studio-layout-editor-note">선택한 요소는 텍스트 스타일(크기/굵기/색상/정렬) 항목이 없습니다.</div>
          ) : null}
        </>
      )}
    </section>
  );
}

type StylePanelProps = {
  activeTemplatePreset: CategoryTemplatePreset;
  hasStyleInspectorResult: boolean;
  isInspectorSectionVisible: (sectionKey: InspectorSectionKey) => boolean;
  previewTemplateImageLayout: TemplateImageLayout;
  showStyleAlignSection: boolean;
  showStyleApplySection: boolean;
  showStyleColorSection: boolean;
  showStyleFontSection: boolean;
  showStyleImageSection: boolean;
  showStyleTemplateSection: boolean;
  showStyleWeightSection: boolean;
  templateLayoutHint: string;
  templateRequirementAlert: string | null;
  toggleInspectorSection: (sectionKey: InspectorSectionKey) => void;
  onClearInspectorSearch: () => void;
  onSetActiveTemplateData: (value: unknown) => void;
  onSetTemplateFontSize: (key: TemplateFontSizeKey, raw: string) => void;
  onSetTemplateFontWeight: (key: TemplateFontWeightKey, raw: string) => void;
  onSetTemplateImageEnabled: (checked: boolean) => void;
  onSetTemplateLayoutAlign: (key: TemplateAlignKey, raw: string) => void;
  onSetTemplateLayoutApplyField: (field: keyof TemplateLayoutApply, checked: boolean) => void;
  onSetTemplateLayoutColor: (key: TemplateColorKey, value: string) => void;
  onTemplateImageFileChange: (file: File | null) => void;
  resolveTemplateColorValue: (key: TemplateColorKey) => string;
  resolveTemplateFontWeightValue: (key: TemplateFontWeightKey) => number;
};

export function LayoutStudioStyleInspectorPanel(props: StylePanelProps) {
  const {
    activeTemplatePreset,
    hasStyleInspectorResult,
    isInspectorSectionVisible,
    previewTemplateImageLayout,
    showStyleAlignSection,
    showStyleApplySection,
    showStyleColorSection,
    showStyleFontSection,
    showStyleImageSection,
    showStyleTemplateSection,
    showStyleWeightSection,
    templateLayoutHint,
    templateRequirementAlert,
    toggleInspectorSection,
    onClearInspectorSearch,
    onSetActiveTemplateData,
    onSetTemplateFontSize,
    onSetTemplateFontWeight,
    onSetTemplateImageEnabled,
    onSetTemplateLayoutAlign,
    onSetTemplateLayoutApplyField,
    onSetTemplateLayoutColor,
    onTemplateImageFileChange,
    resolveTemplateColorValue,
    resolveTemplateFontWeightValue,
  } = props;

  return (
    <section className="studio-layout-editor-section">
      <div className="studio-layout-editor-head">
        <div>
          <div className="studio-layout-workbench-section-title">레이아웃 옵션</div>
          <div className="studio-layout-editor-hint-inline">이미지 사용 여부, 폰트/색상, 적용 범위를 조정합니다.</div>
        </div>
      </div>

      {!hasStyleInspectorResult ? (
        <InspectorEmptyState onClearInspectorSearch={onClearInspectorSearch} />
      ) : (
        <>
          {showStyleImageSection ? (
            <section className="studio-layout-inspector-block">
              <button
                type="button"
                className="studio-layout-inspector-toggle"
                aria-expanded={isInspectorSectionVisible("styleImage")}
                onClick={() => toggleInspectorSection("styleImage")}
              >
                이미지 사용/업로드
              </button>
              {isInspectorSectionVisible("styleImage") ? (
                <div className="studio-layout-inspector-body">
                  <label className="studio-branding-checkbox">
                    <input
                      type="checkbox"
                      checked={activeTemplatePreset.templateImageEnabled}
                      onChange={(event) => onSetTemplateImageEnabled(event.target.checked)}
                    />
                    템플릿 이미지 사용
                  </label>

                  <label className="studio-layout-workbench-field">
                    <span>기본 이미지 업로드</span>
                    <input
                      className="input-field"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => onTemplateImageFileChange(event.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              ) : null}
            </section>
          ) : null}

          {showStyleApplySection ? (
            <section className="studio-layout-inspector-block">
              <button
                type="button"
                className="studio-layout-inspector-toggle"
                aria-expanded={isInspectorSectionVisible("styleApply")}
                onClick={() => toggleInspectorSection("styleApply")}
              >
                적용 범위
              </button>
              {isInspectorSectionVisible("styleApply") ? (
                <div className="studio-layout-inspector-body">
                  <div className="studio-branding-layout-group">
                    <div className="studio-status-chip-row">
                      {TEMPLATE_LAYOUT_APPLY_OPTIONS.map((option) => (
                        <label key={option.key} className="studio-status-chip">
                          <input
                            type="checkbox"
                            checked={activeTemplatePreset.templateLayoutApply[option.key]}
                            onChange={(event) => onSetTemplateLayoutApplyField(option.key, event.target.checked)}
                          />
                          <span className="studio-status-chip-label">{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {showStyleFontSection ? (
            <section className="studio-layout-inspector-block">
              <button
                type="button"
                className="studio-layout-inspector-toggle"
                aria-expanded={isInspectorSectionVisible("styleFontSize")}
                onClick={() => toggleInspectorSection("styleFontSize")}
              >
                폰트 크기
              </button>
              {isInspectorSectionVisible("styleFontSize") ? (
                <div className="studio-layout-inspector-body">
                  <div className="studio-layout-editor-font-grid">
                    {TEMPLATE_FONT_SIZE_FIELDS.map((field) => (
                      <label key={field.key} className="studio-branding-label">
                        <span className="studio-branding-label-caption">{field.label} 크기</span>
                        <input
                          className="input-field"
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={1}
                          value={previewTemplateImageLayout[field.key]}
                          onChange={(event) => onSetTemplateFontSize(field.key, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {showStyleWeightSection ? (
            <section className="studio-layout-inspector-block">
              <button
                type="button"
                className="studio-layout-inspector-toggle"
                aria-expanded={isInspectorSectionVisible("styleWeight")}
                onClick={() => toggleInspectorSection("styleWeight")}
              >
                텍스트 굵기
              </button>
              {isInspectorSectionVisible("styleWeight") ? (
                <div className="studio-layout-inspector-body">
                  <div className="studio-layout-editor-font-grid">
                    {TEMPLATE_TEXT_WEIGHT_FIELDS.map((field) => (
                      <label key={field.key} className="studio-branding-label">
                        <span className="studio-branding-label-caption">{field.label}</span>
                        <select
                          className="input-field"
                          value={resolveTemplateFontWeightValue(field.key)}
                          onChange={(event) => onSetTemplateFontWeight(field.key, event.target.value)}
                        >
                          {TEMPLATE_FONT_WEIGHT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {showStyleColorSection ? (
            <section className="studio-layout-inspector-block">
              <button
                type="button"
                className="studio-layout-inspector-toggle"
                aria-expanded={isInspectorSectionVisible("styleColor")}
                onClick={() => toggleInspectorSection("styleColor")}
              >
                텍스트 색상
              </button>
              {isInspectorSectionVisible("styleColor") ? (
                <div className="studio-layout-inspector-body">
                  <div className="studio-layout-editor-font-grid">
                    {TEMPLATE_TEXT_COLOR_FIELDS.map((field) => (
                      <label key={field.key} className="studio-branding-label">
                        <span className="studio-branding-label-caption">{field.label}</span>
                        <StudioColorPickerField value={resolveTemplateColorValue(field.key)} onChange={(next) => onSetTemplateLayoutColor(field.key, next)} />
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {showStyleAlignSection ? (
            <section className="studio-layout-inspector-block">
              <button
                type="button"
                className="studio-layout-inspector-toggle"
                aria-expanded={isInspectorSectionVisible("styleAlign")}
                onClick={() => toggleInspectorSection("styleAlign")}
              >
                텍스트 정렬
              </button>
              {isInspectorSectionVisible("styleAlign") ? (
                <div className="studio-layout-inspector-body">
                  <div className="studio-layout-editor-font-grid">
                    {TEMPLATE_ALIGN_FIELDS.map((field) => (
                      <label key={field.key} className="studio-branding-label">
                        <span className="studio-branding-label-caption">{field.label}</span>
                        <select
                          className="input-field"
                          value={previewTemplateImageLayout[field.key]}
                          onChange={(event) => onSetTemplateLayoutAlign(field.key, event.target.value)}
                        >
                          <option value="left">왼쪽</option>
                          <option value="center">가운데</option>
                          <option value="right">오른쪽</option>
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {showStyleTemplateSection ? (
            <section className="studio-layout-inspector-block">
              <button
                type="button"
                className="studio-layout-inspector-toggle"
                aria-expanded={isInspectorSectionVisible("styleTemplateOptions")}
                onClick={() => toggleInspectorSection("styleTemplateOptions")}
              >
                템플릿 세부 설정
              </button>
              {isInspectorSectionVisible("styleTemplateOptions") ? (
                <div className="studio-layout-inspector-body">
                  <TemplateStaticSettingsPanel
                    templateId={activeTemplatePreset.templateId}
                    templateData={activeTemplatePreset.templateData}
                    onChangeAction={onSetActiveTemplateData}
                  />
                  <div className="studio-layout-editor-note">{templateLayoutHint}</div>
                  {templateRequirementAlert ? <div className="studio-layout-editor-note is-warning">{templateRequirementAlert}</div> : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
