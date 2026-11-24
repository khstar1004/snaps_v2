"use client";

import { useMemo, type RefObject } from "react";
import { toCategoryLabel } from "@/lib/publish/categories";
import type { StudioHistoryEntry, StudioWorkDraft } from "../types";

type StudioHistoryPanelProps = {
  historyEntries: StudioHistoryEntry[];
  activeHistoryId: string | null;
  selectedHistoryId: string | null;
  panelRef: RefObject<HTMLElement | null>;
  readOnly?: boolean;
  permissionMessage?: string;
  onSelectHistoryAction: (id: string) => void;
  onRestoreHistoryAction: (id: string) => void;
  onDeleteHistoryAction: (id: string) => void;
  onClearHistoryAction: () => void;
  onCloseAction: () => void;
};

function formatSavedAtLabel(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "시간 정보 없음";
  return new Date(timestamp).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDraftTitle(draft: StudioWorkDraft): string {
  if (typeof draft.jsonText === "string" && draft.jsonText.trim()) {
    try {
      const parsed = JSON.parse(draft.jsonText) as Record<string, unknown>;
      if (typeof parsed.title === "string" && parsed.title.trim()) return parsed.title.trim();
    } catch {
      // ignore broken json
    }
  }
  if (Array.isArray(draft.slides)) {
    const titledSlide = draft.slides.find((slide) => typeof slide?.title === "string" && slide.title.trim());
    if (titledSlide?.title) return titledSlide.title.trim();
  }
  return "";
}

function getDraftWorkName(draft: StudioWorkDraft): string {
  return typeof draft.workName === "string" ? draft.workName.trim() : "";
}

function resolveKindLabel(entry: StudioHistoryEntry): string {
  if (entry.kind === "manual") return "수동 저장";
  if (entry.kind === "restore-backup") return "안전 백업";
  return "자동 저장";
}

function resolveSectionTitle(kind: "manual" | "restore-backup" | "auto"): string {
  if (kind === "manual") return "중요 버전";
  if (kind === "restore-backup") return "복원 안전 백업";
  return "자동 저장";
}

function resolveSectionDescription(kind: "manual" | "restore-backup" | "auto"): string {
  if (kind === "manual") return "사용자가 직접 남긴 기준 버전";
  if (kind === "restore-backup") return "복원 전에 자동으로 보관한 상태";
  return "편집 흐름에 따라 자동 기록된 스냅샷";
}

function HistorySection(input: {
  kind: "manual" | "restore-backup" | "auto";
  entries: StudioHistoryEntry[];
  activeHistoryId: string | null;
  latestHistoryId: string | null;
  selectedHistoryId: string | null;
  onSelectHistoryAction: (id: string) => void;
}) {
  if (input.entries.length === 0) return null;
  return (
    <section className="studio-history-section">
      <div className="studio-history-section-header">
        <div>
          <strong>{resolveSectionTitle(input.kind)}</strong>
          <div>{resolveSectionDescription(input.kind)}</div>
        </div>
        <span className="studio-history-section-count">{input.entries.length}</span>
      </div>
      <div className="studio-history-list">
        {input.entries.map((entry) => {
          const isSelected = entry.id === input.selectedHistoryId;
          const badges = [
            entry.id === input.activeHistoryId ? "현재 기준" : null,
            entry.id === input.latestHistoryId ? "최근 저장" : null,
            resolveKindLabel(entry),
          ].filter((badge): badge is string => Boolean(badge));
          return (
            <button
              key={entry.id}
              type="button"
              className={`studio-history-row${isSelected ? " is-selected" : ""}`}
              onClick={() => input.onSelectHistoryAction(entry.id)}
            >
              <div className="studio-history-row-top">
                <div className="studio-history-row-copy">
                  <strong>{entry.label}</strong>
                  <span>{formatSavedAtLabel(entry.createdAt)}</span>
                </div>
                <div className="studio-history-badge-row">
                  {badges.map((badge) => (
                    <span key={badge} className="studio-history-badge">
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
              <div className="studio-history-row-summary">{entry.summary || "요약 정보 없음"}</div>
              {entry.changeTags && entry.changeTags.length > 0 ? (
                <div className="studio-history-chip-row">
                  {entry.changeTags.slice(0, 4).map((tag) => (
                    <span key={tag} className="studio-history-chip">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function StudioHistoryPanel({
  historyEntries,
  activeHistoryId,
  selectedHistoryId,
  panelRef,
  readOnly = false,
  permissionMessage,
  onSelectHistoryAction,
  onRestoreHistoryAction,
  onDeleteHistoryAction,
  onClearHistoryAction,
  onCloseAction,
}: StudioHistoryPanelProps) {
  const selectedEntry = historyEntries.find((entry) => entry.id === selectedHistoryId) || historyEntries[0] || null;
  const selectedDraftTitle = selectedEntry ? getDraftTitle(selectedEntry.draft) : "";
  const selectedWorkName = selectedEntry ? getDraftWorkName(selectedEntry.draft) : "";
  const latestHistoryId = historyEntries[0]?.id || null;
  const manualEntries = useMemo(() => historyEntries.filter((entry) => entry.kind === "manual"), [historyEntries]);
  const backupEntries = useMemo(() => historyEntries.filter((entry) => entry.kind === "restore-backup"), [historyEntries]);
  const autoEntries = useMemo(() => historyEntries.filter((entry) => entry.kind !== "manual" && entry.kind !== "restore-backup"), [historyEntries]);

  return (
    <>
      <div className="studio-history-backdrop" onClick={onCloseAction} aria-hidden="true" />
      <section id="studio-history" ref={panelRef} className="card studio-history-drawer" aria-label="버전 히스토리">
        <div className="studio-panel-header">
          <div>
            <h3 className="studio-history-title">버전 히스토리</h3>
            <div className="studio-history-subtitle">
              현재 draft를 복원 가능한 버전으로 관리합니다. 복원 시 지금 상태도 안전 백업으로 자동 저장됩니다.
            </div>
            {readOnly && permissionMessage ? (
              <div className="studio-history-permission">{permissionMessage}</div>
            ) : null}
          </div>
          <div className="studio-panel-actions">
            <button type="button" className="studio-history-fab studio-history-fab-secondary" onClick={onClearHistoryAction} disabled={readOnly || historyEntries.length === 0}>
              전체 비우기
            </button>
            <button type="button" className="studio-history-fab studio-history-fab-secondary" onClick={onCloseAction}>
              닫기
            </button>
          </div>
        </div>

        <div className="studio-history-overview">
          <div className="studio-history-overview-chip">전체 {historyEntries.length}</div>
          <div className="studio-history-overview-chip">중요 {manualEntries.length}</div>
          <div className="studio-history-overview-chip">자동 {autoEntries.length}</div>
          {historyEntries[0] ? <div className="studio-history-overview-chip">최근 저장 {formatSavedAtLabel(historyEntries[0].createdAt)}</div> : null}
        </div>

        {historyEntries.length === 0 ? (
          <div className="studio-history-empty">
            <strong>저장된 스냅샷이 없습니다.</strong>
            <span>prepare 이후나 슬라이드 편집 시 자동으로 쌓이고, 필요할 때는 현재 버전을 직접 저장할 수 있습니다.</span>
          </div>
        ) : (
          <div className="studio-history-split">
            <div className="studio-history-sidebar">
              <HistorySection
                kind="manual"
                entries={manualEntries}
                activeHistoryId={activeHistoryId}
                latestHistoryId={latestHistoryId}
                selectedHistoryId={selectedEntry?.id || null}
                onSelectHistoryAction={onSelectHistoryAction}
              />
              <HistorySection
                kind="restore-backup"
                entries={backupEntries}
                activeHistoryId={activeHistoryId}
                latestHistoryId={latestHistoryId}
                selectedHistoryId={selectedEntry?.id || null}
                onSelectHistoryAction={onSelectHistoryAction}
              />
              <HistorySection
                kind="auto"
                entries={autoEntries}
                activeHistoryId={activeHistoryId}
                latestHistoryId={latestHistoryId}
                selectedHistoryId={selectedEntry?.id || null}
                onSelectHistoryAction={onSelectHistoryAction}
              />
            </div>

            <div className="studio-history-detail">
              {selectedEntry ? (
                <>
                  <div className="studio-history-detail-header">
                    <div className="studio-history-badge-row">
                      <span className="studio-history-badge">{resolveKindLabel(selectedEntry)}</span>
                      {selectedEntry.id === activeHistoryId ? <span className="studio-history-badge">현재 기준</span> : null}
                    </div>
                    <strong className="studio-history-detail-title">{selectedEntry.label}</strong>
                    <span className="studio-history-detail-time">{formatSavedAtLabel(selectedEntry.createdAt)}</span>
                  </div>

                  {selectedDraftTitle ? (
                    <div className="studio-history-detail-block">
                      <span className="studio-history-detail-label">영상 제목</span>
                      <strong>{selectedDraftTitle}</strong>
                    </div>
                  ) : null}

                  {selectedWorkName ? (
                    <div className="studio-history-detail-block">
                      <span className="studio-history-detail-label">작업 이름</span>
                      <strong>{selectedWorkName}</strong>
                    </div>
                  ) : null}

                  <div className="studio-history-detail-grid">
                    <div className="studio-history-detail-stat">
                      <span>카테고리</span>
                      <strong>{toCategoryLabel(selectedEntry.draft.publishCategory || "")}</strong>
                    </div>
                    <div className="studio-history-detail-stat">
                      <span>슬라이드</span>
                      <strong>{selectedEntry.slideCount ?? (Array.isArray(selectedEntry.draft.slides) ? selectedEntry.draft.slides.length : 0)}개</strong>
                    </div>
                    <div className="studio-history-detail-stat">
                      <span>변경 요약</span>
                      <strong>{selectedEntry.summary || "요약 정보 없음"}</strong>
                    </div>
                  </div>

                  {selectedEntry.changeTags && selectedEntry.changeTags.length > 0 ? (
                    <div className="studio-history-detail-block">
                      <span className="studio-history-detail-label">주요 변경</span>
                      <div className="studio-history-chip-row">
                        {selectedEntry.changeTags.map((tag) => (
                          <span key={tag} className="studio-history-chip">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="studio-history-detail-note">이 버전을 복원하면 현재 편집 상태를 먼저 안전 백업으로 남긴 뒤 복원합니다.</div>

                  <div className="studio-panel-actions">
                    <button type="button" className="studio-history-fab" onClick={() => onRestoreHistoryAction(selectedEntry.id)} disabled={readOnly}>
                      이 버전 복원
                    </button>
                    <button
                      type="button"
                      className="btn-secondary studio-history-action-btn"
                      onClick={() => onDeleteHistoryAction(selectedEntry.id)}
                      disabled={readOnly}
                    >
                      삭제
                    </button>
                  </div>
                </>
              ) : (
                <div className="studio-history-empty">
                  <strong>선택된 버전이 없습니다.</strong>
                  <span>왼쪽 목록에서 버전을 선택하면 세부 정보를 확인할 수 있습니다.</span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
