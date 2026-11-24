"use client";

import { TemplateManagerPanel } from "@/app/shorts-json-studio/components/template-manager-panel";
import type { CategoryTemplatePreset, LayoutRect, TemplateBranding } from "@/app/layout-studio/layout-studio-helpers";
import { EDITABLE_RECT_SLOTS, type EditableRectSlotKey } from "@/app/layout-studio/layout-studio-interactions";
import type { InspectorSectionKey } from "@/app/layout-studio/layout-studio-inspector";
import type { PublishCategory } from "@/lib/publish/types";
import type { PreparedSlide } from "@/types/studio-json";
import type { StudioTemplateId } from "@/types/studio-template";

type RectFieldKey = "x" | "y" | "w" | "h";

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

type GeometryPanelProps = {
  activeTemplateSupportsOverlayEditor: boolean;
  canEditSelectedCategory: boolean;
  hasGeometryInspectorResult: boolean;
  isInspectorSectionVisible: (sectionKey: InspectorSectionKey) => boolean;
  rectNudgeStep: number;
  selectedRect: LayoutRect;
  selectedRectSlot: EditableRectSlotKey;
  showGeometryFieldsSection: boolean;
  showGeometrySlotsSection: boolean;
  slotRectClipboard: boolean;
  toggleInspectorSection: (sectionKey: InspectorSectionKey) => void;
  onAlignSelectedSlotRect: (axis: "x" | "y", mode: "start" | "center" | "end") => void;
  onClearInspectorSearch: () => void;
  onCopySelectedSlotRect: () => void;
  onNudgeTemplateRectField: (slotKey: EditableRectSlotKey, field: RectFieldKey, delta: number) => void;
  onPasteSelectedSlotRect: () => void;
  onResetSelectedSlotRect: () => void;
  onSelectRectSlot: (slotKey: EditableRectSlotKey) => void;
  onSetRectNudgeStep: (value: number) => void;
  onSetTemplateRectField: (slotKey: EditableRectSlotKey, field: RectFieldKey, value: string) => void;
};

export function LayoutStudioGeometryInspectorPanel(props: GeometryPanelProps) {
  const {
    activeTemplateSupportsOverlayEditor,
    canEditSelectedCategory,
    hasGeometryInspectorResult,
    isInspectorSectionVisible,
    rectNudgeStep,
    selectedRect,
    selectedRectSlot,
    showGeometryFieldsSection,
    showGeometrySlotsSection,
    slotRectClipboard,
    toggleInspectorSection,
    onAlignSelectedSlotRect,
    onClearInspectorSearch,
    onCopySelectedSlotRect,
    onNudgeTemplateRectField,
    onPasteSelectedSlotRect,
    onResetSelectedSlotRect,
    onSelectRectSlot,
    onSetRectNudgeStep,
    onSetTemplateRectField,
  } = props;

  return (
    <section className={`studio-layout-editor-section${activeTemplateSupportsOverlayEditor ? "" : " studio-layout-workbench-disabled"}`}>
      <div className="studio-layout-editor-head">
        <div>
          <div className="studio-layout-workbench-section-title">슬롯 정밀 조정</div>
          <div className="studio-layout-editor-hint-inline">좌표 단위는 0~1 비율입니다.</div>
        </div>
        <label className="studio-layout-workbench-stepper">
          조절 단위
          <select className="input-field" value={String(rectNudgeStep)} onChange={(event) => onSetRectNudgeStep(Number(event.target.value))}>
            <option value="0.001">0.001</option>
            <option value="0.005">0.005</option>
            <option value="0.01">0.01</option>
          </select>
        </label>
      </div>

      {!hasGeometryInspectorResult ? (
        <InspectorEmptyState onClearInspectorSearch={onClearInspectorSearch} />
      ) : (
        <>
          {showGeometrySlotsSection ? (
            <section className="studio-layout-inspector-block">
              <button
                type="button"
                className="studio-layout-inspector-toggle"
                aria-expanded={isInspectorSectionVisible("geometrySlots")}
                onClick={() => toggleInspectorSection("geometrySlots")}
              >
                슬롯 선택 및 빠른 동작
              </button>
              {isInspectorSectionVisible("geometrySlots") ? (
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
                  <div className="studio-layout-editor-hint-inline">
                    단축키: 1~6 슬롯 선택 · [ ] 슬롯 순환 · 방향키 이동 · Shift+방향키 가속 · Ctrl/Cmd+C/V · Delete
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {showGeometryFieldsSection ? (
            <section className="studio-layout-inspector-block">
              <button
                type="button"
                className="studio-layout-inspector-toggle"
                aria-expanded={isInspectorSectionVisible("geometryFields")}
                onClick={() => toggleInspectorSection("geometryFields")}
              >
                X/Y/W/H 수치 편집
              </button>
              {isInspectorSectionVisible("geometryFields") ? (
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
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}

type AdvancedPanelProps = {
  activeTemplatePreset: CategoryTemplatePreset;
  brandingDraft: TemplateBranding;
  hasAdvancedInspectorResult: boolean;
  isInspectorSectionVisible: (sectionKey: InspectorSectionKey) => boolean;
  loading: boolean;
  previewSlide: PreparedSlide;
  publishCategory: PublishCategory;
  showAdvancedJsonSection: boolean;
  showAdvancedTemplateSection: boolean;
  templateRequirementAlert: string | null;
  toggleInspectorSection: (sectionKey: InspectorSectionKey) => void;
  onApplyTemplateLayoutJson: () => void;
  onClearInspectorSearch: () => void;
  onSetTemplateData: (value: unknown) => void;
  onSetTemplateId: (templateId: StudioTemplateId) => void;
  onSetTemplateLayoutJson: (value: string) => void;
};

export function LayoutStudioAdvancedInspectorPanel(props: AdvancedPanelProps) {
  const {
    activeTemplatePreset,
    brandingDraft,
    hasAdvancedInspectorResult,
    isInspectorSectionVisible,
    loading,
    previewSlide,
    publishCategory,
    showAdvancedJsonSection,
    showAdvancedTemplateSection,
    templateRequirementAlert,
    toggleInspectorSection,
    onApplyTemplateLayoutJson,
    onClearInspectorSearch,
    onSetTemplateData,
    onSetTemplateId,
    onSetTemplateLayoutJson,
  } = props;

  return (
    <section className="studio-layout-editor-section">
      {!hasAdvancedInspectorResult ? (
        <InspectorEmptyState onClearInspectorSearch={onClearInspectorSearch} />
      ) : (
        <>
          {showAdvancedTemplateSection ? (
            <section className="studio-layout-inspector-block">
              <button
                type="button"
                className="studio-layout-inspector-toggle"
                aria-expanded={isInspectorSectionVisible("advancedTemplateManager")}
                onClick={() => toggleInspectorSection("advancedTemplateManager")}
              >
                템플릿 관리
              </button>
              {isInspectorSectionVisible("advancedTemplateManager") ? (
                <div className="studio-layout-inspector-body">
                  <TemplateManagerPanel
                    value={activeTemplatePreset.templateId}
                    templateData={activeTemplatePreset.templateData}
                    scriptMode={null}
                    publishCategory={publishCategory}
                    previewSlide={previewSlide}
                    brandingPreview={brandingDraft}
                    onChangeAction={onSetTemplateId}
                    onTemplateDataChangeAction={onSetTemplateData}
                  />
                  <div className="studio-layout-editor-note">
                    상세 탭에서도 템플릿 선택, 쓸 기능 고르기, 저장한 조합 적용까지 한 번에 할 수 있습니다.
                  </div>
                  {templateRequirementAlert ? <div className="studio-layout-editor-note is-warning">{templateRequirementAlert}</div> : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {showAdvancedJsonSection ? (
            <section className="studio-layout-inspector-block">
              <button
                type="button"
                className="studio-layout-inspector-toggle"
                aria-expanded={isInspectorSectionVisible("advancedJson")}
                onClick={() => toggleInspectorSection("advancedJson")}
              >
                고급 JSON 편집
              </button>
              {isInspectorSectionVisible("advancedJson") ? (
                <div className="studio-layout-inspector-body">
                  <label className="studio-layout-workbench-field">
                    <span>템플릿 이미지 슬롯 JSON</span>
                    <textarea
                      className="input-field studio-layout-json-textarea"
                      value={activeTemplatePreset.templateLayoutJson}
                      onChange={(event) => onSetTemplateLayoutJson(event.target.value)}
                    />
                  </label>
                  <div className="studio-layout-workbench-action-row">
                    <button className="btn-secondary" onClick={onApplyTemplateLayoutJson} disabled={loading}>
                      JSON 속성 적용
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
