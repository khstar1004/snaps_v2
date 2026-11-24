"use client";

import Link from "next/link";
import { type RefObject } from "react";
import { LAYOUT_STUDIO_SHORTCUT_ITEMS, type LayoutStudioCommandAction } from "./layout-studio-commands";

export type LayoutStudioWorkbenchHeaderProps = {
  previewCategoryLabel: string;
  activeTemplateLabel: string;
  selectedSlotLabel: string;
  hasPendingPresetChanges: boolean;
  message: string;
  hasErrorMessage: boolean;
  selectedCategoryPermissionMessage: string | null;
  canEditSelectedCategory: boolean;
  loading: boolean;
  undoCount: number;
  redoCount: number;
  isFocusMode: boolean;
  showShortcutGuide: boolean;
  showCommandPalette: boolean;
  commandInputRef: RefObject<HTMLInputElement | null>;
  commandQuery: string;
  filteredCommandActions: LayoutStudioCommandAction[];
  onUndo: () => void;
  onRedo: () => void;
  onSaveTemplate: () => void;
  onToggleFocusMode: () => void;
  onToggleShortcutGuide: () => void;
  onOpenCommandPalette: () => void;
  onCloseCommandPalette: () => void;
  onResetWorkbenchLayout: () => void;
  onCommandQueryChange: (query: string) => void;
  onRunCommandAction: (actionId: string) => void;
};

export function LayoutStudioWorkbenchHeader({
  previewCategoryLabel,
  activeTemplateLabel,
  selectedSlotLabel,
  hasPendingPresetChanges,
  message,
  hasErrorMessage,
  selectedCategoryPermissionMessage,
  canEditSelectedCategory,
  loading,
  undoCount,
  redoCount,
  isFocusMode,
  showShortcutGuide,
  showCommandPalette,
  commandInputRef,
  commandQuery,
  filteredCommandActions,
  onUndo,
  onRedo,
  onSaveTemplate,
  onToggleFocusMode,
  onToggleShortcutGuide,
  onOpenCommandPalette,
  onCloseCommandPalette,
  onResetWorkbenchLayout,
  onCommandQueryChange,
  onRunCommandAction,
}: LayoutStudioWorkbenchHeaderProps) {
  return (
    <>
      <section className="card studio-layout-workbench-header">
        <div className="studio-layout-workbench-header-row">
          <div className="studio-layout-workbench-header-copy">
            <h1>레이아웃 스튜디오</h1>
            <p>콘텐츠 프로필별 기본 템플릿 형식을 관리하고, 템플릿별 기준 레이아웃을 큰 화면에서 바로 조정할 수 있습니다.</p>
          </div>
          <div className="studio-layout-workbench-header-actions">
            <button className="btn-secondary" type="button" onClick={onUndo} disabled={!canEditSelectedCategory || undoCount === 0}>
              되돌리기 (Ctrl+Z)
            </button>
            <button className="btn-secondary" type="button" onClick={onRedo} disabled={!canEditSelectedCategory || redoCount === 0}>
              다시하기 (Ctrl+Y)
            </button>
            <button className="btn-primary" type="button" onClick={onSaveTemplate} disabled={loading || !canEditSelectedCategory || !hasPendingPresetChanges}>
              저장
            </button>
            <button className="btn-secondary" type="button" onClick={onToggleFocusMode}>
              {isFocusMode ? "패널 복원 (Shift+\\)" : "집중 모드 (Shift+\\)"}
            </button>
            <button className="btn-secondary" type="button" onClick={onToggleShortcutGuide}>
              단축키 (?)
            </button>
            <button className="btn-secondary" type="button" onClick={onOpenCommandPalette}>
              커맨드 (Ctrl+K)
            </button>
            <button className="btn-secondary" type="button" onClick={onResetWorkbenchLayout}>
              패널 초기화
            </button>
            <Link href="/settings?tab=contentProfile" className="btn-secondary">
              설정 홈
            </Link>
            <Link href="/settings?tab=contentProfile" className="btn-secondary">
              채널 매핑
            </Link>
          </div>
        </div>
        <div className="studio-layout-workbench-summary">
          현재 콘텐츠 프로필 <strong>{previewCategoryLabel}</strong> · 현재 선택 템플릿 <strong>{activeTemplateLabel}</strong> · 현재 선택 슬롯 <strong>{selectedSlotLabel}</strong>
          {" · "}
          <strong>{hasPendingPresetChanges ? "미저장 변경 있음" : "저장 완료 상태"}</strong>
        </div>
      </section>

      {message ? <div className={`studio-layout-workbench-banner${hasErrorMessage ? " is-error" : ""}`}>{message}</div> : null}
      {selectedCategoryPermissionMessage ? <div className="studio-layout-workbench-banner">{selectedCategoryPermissionMessage}</div> : null}

      {showShortcutGuide ? (
        <section className="studio-layout-shortcut-panel">
          <h2>워크벤치 단축키</h2>
          <div className="studio-layout-shortcut-grid">
            {LAYOUT_STUDIO_SHORTCUT_ITEMS.map((item) => (
              <div key={item.id} className="studio-layout-shortcut-item">
                <kbd>{item.keys}</kbd>
                <span>{item.description}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {showCommandPalette ? (
        <div className="studio-layout-command-overlay" role="presentation" onClick={onCloseCommandPalette}>
          <section
            className="studio-layout-command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="커맨드 팔레트"
            onClick={(event) => event.stopPropagation()}
          >
            <label className="studio-layout-command-input-wrap" htmlFor="layout-studio-command-input">
              <input
                id="layout-studio-command-input"
                ref={commandInputRef}
                className="input-field"
                value={commandQuery}
                onChange={(event) => onCommandQueryChange(event.target.value)}
                placeholder="작업 입력 (예: 저장, 확대, 집중 모드)"
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const firstAction = filteredCommandActions.find((item) => !item.disabled);
                  if (!firstAction) return;
                  onRunCommandAction(firstAction.id);
                }}
              />
            </label>
            <div className="studio-layout-command-list">
              {filteredCommandActions.length === 0 ? (
                <div className="studio-layout-command-empty">일치하는 작업이 없습니다.</div>
              ) : (
                filteredCommandActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="studio-layout-command-item"
                    disabled={action.disabled}
                    onClick={() => onRunCommandAction(action.id)}
                  >
                    <span>{action.label}</span>
                    <small>{action.hint}</small>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
