"use client";

import dynamic from "next/dynamic";
import { type CSSProperties, type PointerEvent, type RefObject } from "react";
import { EDITABLE_RECT_SLOTS, type EditableRectSlotKey, type DragMode } from "@/app/layout-studio/layout-studio-interactions";
import type { LayoutRect, CategoryTemplatePreset, TemplateBranding, TemplateImageLayout } from "@/app/layout-studio/layout-studio-helpers";
import type { PreparedSlide } from "@/types/studio-json";

const StudioRemotionSlideThumbnail = dynamic(
  () => import("@/app/shorts-json-studio/components/studio-remotion-preview").then((mod) => mod.StudioRemotionSlideThumbnail),
  {
    ssr: false,
    loading: () => <div className="studio-layout-remotion-loading">미리보기 로딩 중</div>,
  }
);

type LayoutStudioWorkbenchCanvasPaneProps = {
  activeTemplatePreset: CategoryTemplatePreset;
  activeTemplateSupportsOverlayEditor: boolean;
  brandingDraft: TemplateBranding;
  canEditSelectedCategory: boolean;
  canvasZoomPercent: number;
  contextSlides: PreparedSlide[];
  displayTemplateImageLayout: TemplateImageLayout;
  fitCanvasZoom: () => void;
  handlePanelResizePointerDown: (side: "left" | "right") => (event: PointerEvent<HTMLButtonElement>) => void;
  handleSlotPointerDown: (slotKey: EditableRectSlotKey, mode: DragMode) => (event: PointerEvent<HTMLElement>) => void;
  handleStageViewportPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  isHandToolPressed: boolean;
  onNextPreviewSlide: () => void;
  onPreviousPreviewSlide: () => void;
  onSelectRectSlot: (slotKey: EditableRectSlotKey) => void;
  previewSlide: PreparedSlide;
  previewSlideIndex: number;
  previewSlides: PreparedSlide[];
  previewThumbnailKey: string;
  selectedRectSlot: EditableRectSlotKey;
  stageViewportRef: RefObject<HTMLDivElement | null>;
  previewStageRef: RefObject<HTMLDivElement | null>;
  zoomInCanvas: () => void;
  zoomOutCanvas: () => void;
};

function layoutRectStyle(rect: LayoutRect): CSSProperties {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
  };
}

export function LayoutStudioWorkbenchCanvasPane({
  activeTemplatePreset,
  activeTemplateSupportsOverlayEditor,
  brandingDraft,
  canEditSelectedCategory,
  canvasZoomPercent,
  contextSlides,
  displayTemplateImageLayout,
  fitCanvasZoom,
  handlePanelResizePointerDown,
  handleSlotPointerDown,
  handleStageViewportPointerDown,
  isHandToolPressed,
  onNextPreviewSlide,
  onPreviousPreviewSlide,
  onSelectRectSlot,
  previewSlide,
  previewSlideIndex,
  previewSlides,
  previewThumbnailKey,
  selectedRectSlot,
  stageViewportRef,
  previewStageRef,
  zoomInCanvas,
  zoomOutCanvas,
}: LayoutStudioWorkbenchCanvasPaneProps) {
  return (
    <>
      <section className="studio-layout-workbench-canvas">
        <div className="studio-layout-workbench-canvas-head">
          <div>
            <h2>캔버스</h2>
            <p>슬롯 박스를 드래그해 위치를 옮기고 우하단 핸들로 크기를 조절하세요. Ctrl+Z로 즉시 되돌릴 수 있습니다.</p>
          </div>
          <div className="studio-status-chip-row">
            <span className="studio-status-chip is-success">9:16 미리보기</span>
            <span className={`studio-status-chip${activeTemplateSupportsOverlayEditor ? " is-success" : " is-warning"}`}>
              {activeTemplateSupportsOverlayEditor ? "직접 편집 가능" : "구조형 템플릿"}
            </span>
            <span className="studio-status-chip">{contextSlides.length > 0 ? `실제 슬라이드 ${previewSlideIndex + 1}/${previewSlides.length}` : "샘플 프레임"}</span>
            {previewSlides.length > 1 ? (
              <>
                <button
                  type="button"
                  className="studio-popup-preview-nav-btn"
                  onClick={onPreviousPreviewSlide}
                  disabled={previewSlideIndex <= 0}
                >
                  이전
                </button>
                <button
                  type="button"
                  className="studio-popup-preview-nav-btn"
                  onClick={onNextPreviewSlide}
                  disabled={previewSlideIndex >= previewSlides.length - 1}
                >
                  다음
                </button>
              </>
            ) : null}
          </div>
          <div className="studio-layout-workbench-view-controls" role="group" aria-label="캔버스 보기 조절">
            <button type="button" className="btn-secondary" onClick={zoomOutCanvas}>
              축소
            </button>
            <button type="button" className="btn-secondary" onClick={fitCanvasZoom}>
              {canvasZoomPercent}%
            </button>
            <button type="button" className="btn-secondary" onClick={zoomInCanvas}>
              확대
            </button>
          </div>
        </div>

        <div
          ref={stageViewportRef}
          className={`studio-layout-workbench-stage-wrap${isHandToolPressed ? " is-hand-tool" : ""}`}
          onPointerDown={handleStageViewportPointerDown}
        >
          <div ref={previewStageRef} className="studio-popup-preview-stage studio-layout-workbench-stage">
            <StudioRemotionSlideThumbnail
              key={previewThumbnailKey}
              slide={previewSlide}
              branding={brandingDraft}
              templateId={activeTemplatePreset.templateId}
              templateData={activeTemplatePreset.templateData}
              templateImageEnabled={activeTemplatePreset.templateImageEnabled}
              templateImageUrl={activeTemplatePreset.templateImageUrl}
              templateImageLayout={displayTemplateImageLayout}
              templateLayoutApply={activeTemplatePreset.templateLayoutApply}
            />
            {activeTemplateSupportsOverlayEditor ? (
              <div className="studio-popup-preview-overlay">
                {EDITABLE_RECT_SLOTS.map((slot) => {
                  const rect = displayTemplateImageLayout[slot.key];
                  const isActive = selectedRectSlot === slot.key;
                  return (
                    <button
                      key={slot.key}
                      type="button"
                      className={`studio-slot-overlay-box${isActive ? " is-active" : ""}`}
                      style={layoutRectStyle(rect)}
                      disabled={!canEditSelectedCategory || isHandToolPressed}
                      onClick={() => onSelectRectSlot(slot.key)}
                      onPointerDown={handleSlotPointerDown(slot.key, "move")}
                    >
                      <span className="studio-slot-overlay-label">{slot.label}</span>
                      <span className="studio-slot-overlay-handle" onPointerDown={handleSlotPointerDown(slot.key, "resize")} />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        {activeTemplateSupportsOverlayEditor ? (
          <div className="studio-layout-editor-note">캔버스에서 드래그한 값과 우측 인스펙터 숫자 값은 동일한 preset으로 동기화됩니다.</div>
        ) : (
          <div className="studio-layout-editor-note is-warning">
            현재 템플릿은 구조형이라 슬롯 오버레이 편집값을 사용하지 않습니다. 템플릿 세부 설정을 중심으로 조정하세요.
          </div>
        )}

        <div className="studio-layout-workbench-canvas-footer">
          {contextSlides.length > 0
            ? "메인 스튜디오에서 보고 있던 실제 슬라이드를 그대로 이어받았습니다. 콘텐츠 프로필별 기본 템플릿을 현재 슬라이드 기준으로 맞춘 뒤 다시 돌아갈 수 있습니다."
            : "변경 내용은 임시 편집 상태로 유지됩니다. 상단 `저장` 버튼을 누르면 DB 기본값과 메인 스튜디오 연동용 로컬 작업 상태가 함께 갱신됩니다."}
        </div>
      </section>
      <button
        type="button"
        className="studio-layout-workbench-resizer"
        aria-label="오른쪽 인스펙터 너비 조절"
        title="드래그해서 오른쪽 인스펙터 너비 조절"
        onPointerDown={handlePanelResizePointerDown("right")}
      />
    </>
  );
}
