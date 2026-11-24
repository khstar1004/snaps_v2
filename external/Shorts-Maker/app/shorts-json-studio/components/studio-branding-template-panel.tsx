"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import type { PreparedSlide } from "@/types/studio-json";
import { StudioColorPickerField } from "@/components/studio-color-picker-field";
import type { StudioTemplateId, StudioTemplatePayload, TemplateBranding, TemplateImageLayout, TemplateLayoutApply } from "../types";
import { StudioRemotionSlideThumbnail } from "./studio-remotion-preview";
import { TemplateManagerPanel } from "./template-manager-panel";
import { TemplateStaticSettingsPanel } from "./template-static-settings-panel";

type ActiveTab = "branding" | "layout" | "notes";
type CompareSnapshot = {
  branding: TemplateBranding;
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageUrl: string;
  templateImageLayout: TemplateImageLayout;
  templateLayoutApply: TemplateLayoutApply;
};

type StudioBrandingTemplatePanelProps = {
  categoryLabel: string;
  branding: TemplateBranding;
  previewSlides: PreparedSlide[];
  previewUsesSample: boolean;
  templateId: StudioTemplateId;
  templateData: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageUrl: string;
  templateImageLayout: TemplateImageLayout;
  templateLayoutApply: TemplateLayoutApply;
  templateLayoutHint: string;
  templateRequirementAlert: string | null;
  localPresetSummary: string;
  brandingDbDirty: boolean;
  renderStateLabel: string;
  renderStateTone: "neutral" | "warning" | "success";
  brandingSaveBusy: boolean;
  templateNotes: string;
  templateNotesSaveBusy: boolean;
  statusMessage: string;
  readOnly?: boolean;
  permissionMessage?: string;
  onPreviewSlideIndexChangeAction?: (index: number) => void;
  onBrandingChangeAction: (value: Partial<TemplateBranding>) => void;
  onTemplateIdChangeAction: (value: StudioTemplateId) => void;
  onTemplateDataChangeAction: (value: StudioTemplatePayload) => void;
  onTemplateImageEnabledChangeAction: (checked: boolean) => void;
  onTemplateImageUrlChangeAction: (value: string) => void;
  onTemplateImageFileChangeAction: (file: File | null) => void;
  onTemplateLayoutApplyChangeAction: (field: keyof TemplateLayoutApply, checked: boolean) => void;
  onTemplateFontSizeChangeAction: (field: "headerSize" | "titleSize" | "bodySize" | "infoSize", value: string) => void;
  onTemplateLayoutColorChangeAction: (field: "titleColor" | "bodyColor" | "infoColor", value: string) => void;
  onSaveBrandingAction: () => void;
  onTemplateNotesChangeAction: (value: string) => void;
  onSaveTemplateNotesAction: () => void;
  onResetCurrentCategoryAction: () => void;
  onJumpToResultAction: () => void;
};

const APPLY_SCOPE_OPTIONS: Array<{ key: keyof TemplateLayoutApply; label: string }> = [
  { key: "title", label: "제목 반영" },
  { key: "body", label: "본문 반영" },
  { key: "image", label: "이미지 반영" },
  { key: "info", label: "정보줄 반영" },
];

const FONT_SIZE_OPTIONS: Array<{ key: "headerSize" | "titleSize" | "bodySize" | "infoSize"; label: string; min: number; max: number }> = [
  { key: "headerSize", label: "헤더", min: 10, max: 32 },
  { key: "titleSize", label: "제목", min: 10, max: 52 },
  { key: "bodySize", label: "본문", min: 9, max: 36 },
  { key: "infoSize", label: "정보줄", min: 8, max: 24 },
];

const TEMPLATE_COLOR_OPTIONS: Array<{ key: "titleColor" | "bodyColor" | "infoColor"; label: string }> = [
  { key: "titleColor", label: "제목 색상" },
  { key: "bodyColor", label: "본문 색상" },
  { key: "infoColor", label: "정보줄 색상" },
];

function getStatusToneClass(tone: StudioBrandingTemplatePanelProps["renderStateTone"]): string {
  if (tone === "success") return " is-success";
  if (tone === "warning") return " is-warning";
  return "";
}

function toSlideSummary(slide: PreparedSlide): string {
  const title = String(slide.title || "").trim();
  const body = String(slide.text || "").trim();
  const lines = Array.isArray(slide.lines) ? slide.lines.map((line) => String(line || "").trim()).filter(Boolean).join(" ") : "";
  const summary = body || lines || title || "현재 템플릿 상태를 바로 확인할 수 있습니다.";
  return summary.length > 96 ? `${summary.slice(0, 95)}...` : summary;
}

function isErrorStatus(message: string): boolean {
  return /오류|실패|error/i.test(message);
}

export function StudioBrandingTemplatePanel(props: StudioBrandingTemplatePanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("branding");
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);
  const [compareSnapshot, setCompareSnapshot] = useState<CompareSnapshot | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [fontDraft, setFontDraft] = useState(() => ({
    headerSize: props.templateImageLayout.headerSize,
    titleSize: props.templateImageLayout.titleSize,
    bodySize: props.templateImageLayout.bodySize,
    infoSize: props.templateImageLayout.infoSize,
  }));

  useEffect(() => {
    setPreviewSlideIndex((current) => Math.min(current, Math.max(props.previewSlides.length - 1, 0)));
  }, [props.previewSlides.length]);

  useEffect(() => {
    setFontDraft({
      headerSize: props.templateImageLayout.headerSize,
      titleSize: props.templateImageLayout.titleSize,
      bodySize: props.templateImageLayout.bodySize,
      infoSize: props.templateImageLayout.infoSize,
    });
  }, [
    props.templateImageLayout.bodySize,
    props.templateImageLayout.headerSize,
    props.templateImageLayout.infoSize,
    props.templateImageLayout.titleSize,
  ]);

  useEffect(() => {
    props.onPreviewSlideIndexChangeAction?.(previewSlideIndex);
  }, [previewSlideIndex, props.onPreviewSlideIndexChangeAction]);

  const currentPreviewSlide = props.previewSlides[previewSlideIndex] || props.previewSlides[0];
  const previewLabel = props.previewUsesSample ? "샘플 프레임" : `슬라이드 ${previewSlideIndex + 1}/${props.previewSlides.length}`;
  const previewTitle = String(currentPreviewSlide?.title || "").trim() || `${props.categoryLabel} 미리보기`;
  const previewSummary = currentPreviewSlide ? toSlideSummary(currentPreviewSlide) : "슬라이드가 아직 없습니다.";
  const previewTemplateImageLayout = useMemo(
    () => ({
      ...props.templateImageLayout,
      ...fontDraft,
    }),
    [fontDraft, props.templateImageLayout]
  );
  const primaryActionLabel =
    activeTab === "notes"
      ? props.templateNotesSaveBusy
        ? "메모 저장 중..."
        : "고객 메모 저장"
      : props.brandingSaveBusy
        ? "브랜딩 저장 중..."
        : props.brandingDbDirty
          ? "고객 브랜딩 저장"
          : "고객 브랜딩 반영 완료";
  const primaryActionDisabled =
    props.readOnly || (activeTab === "notes" ? props.templateNotesSaveBusy : props.brandingSaveBusy || !props.brandingDbDirty);
  const footerCopy =
    activeTab === "notes"
      ? "메모는 DB 저장을 눌러 고객 메타데이터에 반영합니다."
      : props.brandingDbDirty
        ? "브랜딩 문구와 색상은 로컬에 자동 저장된 상태입니다. DB 저장을 누르면 고객 기본값으로 확정됩니다."
        : "상단에서 크기와 색상을 빠르게 조정하고, 정밀 위치 수정은 우측 상단 `자세히 보기`에서 이어서 진행하면 됩니다.";

  const handlePreviewNavigate = (direction: -1 | 1) => {
    if (props.previewSlides.length <= 1) return;
    startTransition(() => {
      setPreviewSlideIndex((current) => Math.max(0, Math.min(props.previewSlides.length - 1, current + direction)));
    });
  };

  const updateFontDraft = (key: keyof typeof fontDraft, raw: string) => {
    const parsed = Number(raw);
    const option = FONT_SIZE_OPTIONS.find((item) => item.key === key);
    const fallback = props.templateImageLayout[key];
    const nextValue = Number.isFinite(parsed)
      ? Math.max(option?.min ?? 8, Math.min(option?.max ?? 52, Math.round(parsed)))
      : fallback;
    setFontDraft((current) => ({
      ...current,
      [key]: nextValue,
    }));
  };

  const commitFontDraft = (key: keyof typeof fontDraft) => {
    const nextValue = fontDraft[key];
    if (nextValue === props.templateImageLayout[key]) return;
    props.onTemplateFontSizeChangeAction(key, String(nextValue));
  };

  const handleCaptureSnapshot = () => {
    setCompareSnapshot({
      branding: { ...props.branding },
      templateId: props.templateId,
      templateData: props.templateData,
      templateImageEnabled: props.templateImageEnabled,
      templateImageUrl: props.templateImageUrl,
      templateImageLayout: { ...previewTemplateImageLayout },
      templateLayoutApply: { ...props.templateLayoutApply },
    });
    setCompareMode(true);
  };

  return (
    <div className="studio-branding-panel">
      <section className="studio-inline-status">
        <div className="studio-branding-status-stack">
          <div>
            <h3 className="studio-branding-title">브랜딩 / 템플릿</h3>
            <div className="studio-branding-subtitle">
              현재 고객: <strong>{props.categoryLabel}</strong>
            </div>
          </div>

          <div className="studio-status-chip-row">
            <span className="studio-status-chip is-success">로컬 자동 저장</span>
            <span className={`studio-status-chip${props.brandingDbDirty ? " is-warning" : " is-success"}`}>
              {props.brandingDbDirty ? "고객 브랜딩 저장 필요" : "고객 브랜딩 반영됨"}
            </span>
            <span className={`studio-status-chip${getStatusToneClass(props.renderStateTone)}`}>{props.renderStateLabel}</span>
          </div>

          <div className="studio-branding-summary">{props.localPresetSummary}</div>

          {props.templateRequirementAlert ? (
            <div className="studio-layout-editor-note is-warning">{props.templateRequirementAlert}</div>
          ) : null}

          {props.statusMessage ? (
            <div className={isErrorStatus(props.statusMessage) ? "studio-layout-editor-note is-warning" : "studio-branding-status"}>
              {props.statusMessage}
            </div>
          ) : null}

          {props.readOnly && props.permissionMessage ? (
            <div className="studio-branding-status">{props.permissionMessage}</div>
          ) : null}
        </div>
      </section>

      <section className="studio-branding-quick-shell">
        <div className="studio-branding-preview-card">
          <div className="studio-popup-preview-copy">
            <div className="studio-popup-preview-head">
              <span className="studio-popup-preview-status">{previewLabel}</span>
              <div className="studio-popup-preview-nav">
                <button
                  type="button"
                  className="studio-popup-preview-nav-btn"
                  onClick={() => handlePreviewNavigate(-1)}
                  disabled={props.previewSlides.length <= 1 || previewSlideIndex <= 0}
                >
                  이전
                </button>
                <button
                  type="button"
                  className="studio-popup-preview-nav-btn"
                  onClick={() => handlePreviewNavigate(1)}
                  disabled={props.previewSlides.length <= 1 || previewSlideIndex >= props.previewSlides.length - 1}
                >
                  다음
                </button>
              </div>
            </div>
            <div className="studio-popup-preview-title">{previewTitle}</div>
            <div className="studio-popup-preview-description">{previewSummary}</div>
            <div className="studio-layout-editor-hint-inline">
              {props.previewUsesSample
                ? "실제 슬라이드가 아직 없어서 템플릿 샘플 프레임으로 표시 중입니다."
                : "팝업에서는 결과를 크게 보면서 크기와 색상만 빠르게 조정합니다."}
            </div>
          </div>

          {compareMode && compareSnapshot ? (
            <div className="studio-branding-preview-compare-grid">
              <div className="studio-branding-preview-compare-item">
                <div className="studio-popup-preview-status">현재안</div>
                <div className="studio-branding-preview-stage">
                  {currentPreviewSlide ? (
                    <StudioRemotionSlideThumbnail
                      slide={currentPreviewSlide}
                      branding={props.branding}
                      templateId={props.templateId}
                      templateData={props.templateData}
                      templateImageEnabled={props.templateImageEnabled}
                      templateImageUrl={props.templateImageUrl}
                      templateImageLayout={previewTemplateImageLayout}
                      templateLayoutApply={props.templateLayoutApply}
                    />
                  ) : null}
                </div>
              </div>
              <div className="studio-branding-preview-compare-item">
                <div className="studio-popup-preview-status">기준안</div>
                <div className="studio-branding-preview-stage">
                  {currentPreviewSlide ? (
                    <StudioRemotionSlideThumbnail
                      slide={currentPreviewSlide}
                      branding={compareSnapshot.branding}
                      templateId={compareSnapshot.templateId}
                      templateData={compareSnapshot.templateData}
                      templateImageEnabled={compareSnapshot.templateImageEnabled}
                      templateImageUrl={compareSnapshot.templateImageUrl}
                      templateImageLayout={compareSnapshot.templateImageLayout}
                      templateLayoutApply={compareSnapshot.templateLayoutApply}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="studio-branding-preview-stage">
              {currentPreviewSlide ? (
                <StudioRemotionSlideThumbnail
                  slide={currentPreviewSlide}
                  branding={props.branding}
                  templateId={props.templateId}
                  templateData={props.templateData}
                  templateImageEnabled={props.templateImageEnabled}
                  templateImageUrl={props.templateImageUrl}
                  templateImageLayout={previewTemplateImageLayout}
                  templateLayoutApply={props.templateLayoutApply}
                />
              ) : null}
            </div>
          )}
        </div>

        <div className="studio-branding-quick-panel">
          <div className="studio-branding-section-title">빠른 조정</div>
          <div className="studio-branding-summary">
            자주 만지는 크기와 색상을 상단에 모았습니다. 브랜딩 탭에서는 문구와 폰트, 레이아웃 탭에서는 템플릿과 적용 범위만 다룹니다.
          </div>
          <fieldset
            disabled={props.readOnly}
            className="studio-branding-fieldset-reset"
          >
            <div className="studio-branding-quick-grid">
              {FONT_SIZE_OPTIONS.map((option) => (
                <label key={option.key} className="studio-branding-label">
                  <span className="studio-branding-label-caption">{option.label} 크기</span>
                  <div className="studio-branding-range-control">
                    <input
                      className="studio-branding-range-slider"
                      type="range"
                      min={option.min}
                      max={option.max}
                      step={1}
                      value={fontDraft[option.key]}
                      onChange={(event) => updateFontDraft(option.key, event.target.value)}
                      onPointerUp={() => commitFontDraft(option.key)}
                      onKeyUp={() => commitFontDraft(option.key)}
                    />
                    <input
                      className="input-field studio-branding-range-number"
                      type="number"
                      min={option.min}
                      max={option.max}
                      step={1}
                      value={fontDraft[option.key]}
                      onChange={(event) => updateFontDraft(option.key, event.target.value)}
                      onBlur={() => commitFontDraft(option.key)}
                    />
                  </div>
                </label>
              ))}

              <label className="studio-branding-label">
                <span className="studio-branding-label-caption">헤더 색상</span>
                <StudioColorPickerField
                  value={props.branding.headerColor}
                  onChange={(next) => props.onBrandingChangeAction({ headerColor: next })}
                  disabled={props.readOnly}
                />
              </label>

              <label className="studio-branding-label">
                <span className="studio-branding-label-caption">푸터 색상</span>
                <StudioColorPickerField
                  value={props.branding.footerColor}
                  onChange={(next) => props.onBrandingChangeAction({ footerColor: next })}
                  disabled={props.readOnly}
                />
              </label>

              {TEMPLATE_COLOR_OPTIONS.map((option) => (
                <label key={option.key} className="studio-branding-label">
                  <span className="studio-branding-label-caption">{option.label}</span>
                  <StudioColorPickerField
                    value={props.templateImageLayout[option.key]}
                    onChange={(next) => props.onTemplateLayoutColorChangeAction(option.key, next)}
                    disabled={props.readOnly}
                  />
                </label>
              ))}
            </div>

            <div className="studio-branding-quick-actions">
              <label className="studio-branding-checkbox">
                <input
                  type="checkbox"
                  checked={props.templateImageEnabled}
                  onChange={(event) => props.onTemplateImageEnabledChangeAction(event.target.checked)}
                />
                템플릿 이미지 사용
              </label>
              <button type="button" className="btn-secondary studio-branding-action-btn" onClick={handleCaptureSnapshot}>
                기준안 저장
              </button>
              <button
                type="button"
                className="btn-secondary studio-branding-action-btn"
                onClick={() => setCompareMode((current) => !current)}
                disabled={!compareSnapshot}
              >
                {compareMode ? "비교 끄기" : "비교 보기"}
              </button>
              <span className="studio-layout-editor-hint-inline">정밀 위치 수정과 JSON 편집은 우측 상단 `자세히 보기`에서 진행합니다.</span>
            </div>
          </fieldset>
        </div>
      </section>

      <div className="studio-template-tab-row">
        {([
          { key: "branding", label: "브랜딩" },
          { key: "layout", label: "레이아웃 설정" },
          { key: "notes", label: "템플릿 메모" },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`studio-template-tab${activeTab === tab.key ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "branding" ? (
        <div className="studio-branding-column">
          <section className="studio-layout-editor-section">
            <div className="studio-branding-section-title">고객 브랜딩</div>
            <fieldset disabled={props.readOnly} className="studio-branding-fieldset-reset">
              <div className="studio-form-grid">
                <label className="studio-branding-label">
                  <span className="studio-branding-label-caption">헤더 제목</span>
                  <input
                    className="input-field"
                    value={props.branding.headerTitle}
                    onChange={(event) => props.onBrandingChangeAction({ headerTitle: event.target.value })}
                    placeholder="쇼츠뉴스"
                  />
                </label>

                <label className="studio-branding-label">
                  <span className="studio-branding-label-caption">헤더 강조 텍스트</span>
                  <input
                    className="input-field"
                    value={props.branding.headerAccentText || ""}
                    onChange={(event) => props.onBrandingChangeAction({ headerAccentText: event.target.value })}
                    placeholder="핵심 브리핑"
                  />
                </label>

                <label className="studio-branding-label">
                  <span className="studio-branding-label-caption">정보 줄 형식</span>
                  <input
                    className="input-field"
                    value={props.branding.infoLineText}
                    onChange={(event) => props.onBrandingChangeAction({ infoLineText: event.target.value })}
                    placeholder="채널 | 01:22 | 조회 15634"
                  />
                </label>

                <label className="studio-branding-label">
                  <span className="studio-branding-label-caption">폰트 직접 입력</span>
                  <input
                    className="input-field"
                    value={props.branding.fontFamily}
                    onChange={(event) => props.onBrandingChangeAction({ fontFamily: event.target.value })}
                    placeholder='"Pretendard Variable", "Pretendard", -apple-system'
                  />
                </label>
              </div>

              <div className="studio-layout-editor-note">
                색상과 글자 크기는 상단 빠른 조정에서 바로 변경됩니다. 이 탭은 문구와 브랜딩 텍스트만 다룹니다.
              </div>

              <label className="studio-branding-checkbox">
                <input
                  type="checkbox"
                  checked={props.branding.imageRounded}
                  onChange={(event) => props.onBrandingChangeAction({ imageRounded: event.target.checked })}
                />
                이미지 모서리 라운드
              </label>

              <div className="studio-branding-notes-actions">
                <button type="button" className="btn-secondary studio-branding-action-btn" onClick={props.onResetCurrentCategoryAction}>
                  현재 고객 기본값 복원
                </button>
              </div>
            </fieldset>
          </section>
        </div>
      ) : null}

      {activeTab === "layout" ? (
        <div className="studio-layout-editor-shell">
          <fieldset disabled={props.readOnly} className="studio-branding-fieldset-reset">
            <section className="studio-layout-editor-section">
              <div className="studio-layout-editor-head">
                <div>
                  <div className="studio-branding-section-title">레이아웃 빠른 설정</div>
                  <div className="studio-layout-editor-hint-inline">{props.templateLayoutHint}</div>
                </div>
              </div>

              <label className="studio-branding-checkbox">
                <input
                  type="checkbox"
                  checked={props.templateImageEnabled}
                  onChange={(event) => props.onTemplateImageEnabledChangeAction(event.target.checked)}
                />
                템플릿 이미지 사용
              </label>

              <div className="studio-layout-editor-field-grid">
                <label className="studio-branding-label studio-branding-label-full">
                  <span className="studio-branding-label-caption">템플릿 이미지 URL</span>
                  <input
                    className="input-field"
                    value={props.templateImageUrl}
                    onChange={(event) => props.onTemplateImageUrlChangeAction(event.target.value)}
                    placeholder="https://..."
                  />
                </label>
              </div>

              <label className="studio-branding-label">
                <span className="studio-branding-label-caption">이미지 파일 업로드</span>
                <input
                  className="input-field"
                  type="file"
                  accept="image/*"
                  onChange={(event) => props.onTemplateImageFileChangeAction(event.target.files?.[0] || null)}
                />
              </label>

              <div className="studio-branding-layout-group">
                <span className="studio-branding-label-caption">적용 범위</span>
                <div className="studio-status-chip-row">
                  {APPLY_SCOPE_OPTIONS.map((option) => (
                    <label key={option.key} className="studio-status-chip">
                      <input
                        type="checkbox"
                        checked={props.templateLayoutApply[option.key]}
                        onChange={(event) => props.onTemplateLayoutApplyChangeAction(option.key, event.target.checked)}
                      />
                      <span className="studio-branding-option-label">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="studio-layout-editor-note">
                좌표, JSON, 슬롯 위치 수정은 팝업에서 제거했습니다. 우측 상단 `자세히 보기`에서 큰 화면 기준으로 편집하세요.
              </div>
            </section>

            <TemplateManagerPanel value={props.templateId} onChangeAction={props.onTemplateIdChangeAction} />

            <section className="studio-layout-editor-section">
              <div className="studio-layout-editor-head">
                <div>
                  <div className="studio-branding-section-title">템플릿 세부 설정</div>
                  <div className="studio-layout-editor-hint-inline">선택한 템플릿 전용 옵션은 여기에서만 빠르게 조정합니다.</div>
                </div>
              </div>
              <TemplateStaticSettingsPanel
                templateId={props.templateId}
                templateData={props.templateData}
                onChangeAction={props.onTemplateDataChangeAction}
              />
            </section>
          </fieldset>

          <section className="studio-layout-editor-section">
            <div className="studio-branding-section-title">다음 단계</div>
            <div className="studio-layout-editor-note">
              큰 화면 위치 편집이 끝나면 다시 팝업으로 돌아와 브랜딩 저장 여부만 확인하면 됩니다.
            </div>
            <div className="studio-branding-notes-actions">
              <button type="button" className="btn-secondary studio-branding-action-btn" onClick={props.onJumpToResultAction}>
                결과 영역으로 이동
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "notes" ? (
        <section className="studio-template-note-shell">
          <div className="studio-branding-notes-head">
            <div className="studio-branding-notes-title">템플릿 메모</div>
            <div className="studio-branding-notes-caption">
              고객별 운영 규칙, 금지 표현, 자주 쓰는 스타일 메모를 저장해 두세요.
            </div>
          </div>
          <div className="studio-template-note-hint">
            메모는 레이아웃 preset과 별개입니다. DB 저장을 눌러야 고객 메타데이터에 반영됩니다.
          </div>
          <fieldset disabled={props.readOnly} className="studio-branding-fieldset-reset">
            <textarea
              className="input-field studio-branding-notes-textarea"
              value={props.templateNotes}
              onChange={(event) => props.onTemplateNotesChangeAction(event.target.value)}
              placeholder="예: 헤더는 짧게, 정보줄은 채널 | 러닝타임 | 조회수 형식 유지"
            />
          </fieldset>
        </section>
      ) : null}

      <div className="studio-branding-footer-bar">
        <div className="studio-branding-footer-copy">{footerCopy}</div>
        <div className="studio-branding-footer-actions">
          <button
            type="button"
            className="btn-primary studio-branding-footer-btn"
            disabled={primaryActionDisabled}
            onClick={activeTab === "notes" ? props.onSaveTemplateNotesAction : props.onSaveBrandingAction}
          >
            {primaryActionLabel}
          </button>
          <button type="button" className="btn-secondary studio-branding-footer-btn" onClick={props.onJumpToResultAction}>
            결과 영역으로 이동
          </button>
        </div>
      </div>
    </div>
  );
}
