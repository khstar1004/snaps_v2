"use client";

import type {
  StudioRenderPreflightIssue,
  StudioRenderPreflightSummary,
} from "../studio-render-preflight";
import {
  getRenderPreflightIssueFixTarget,
  getRenderPreflightIssueLocationLabel,
} from "../studio-render-preflight-navigation";

type StudioRenderPreflightPanelProps = {
  summary: StudioRenderPreflightSummary;
  hasRun: boolean;
  hasDraftVideo: boolean;
  hasFinalVideo: boolean;
  draftIsCurrent: boolean;
  finalIsCurrent: boolean;
  onFixIssueAction?: (issue: StudioRenderPreflightIssue) => void;
};

function toInputStateLabel(exists: boolean, current: boolean): string {
  if (!exists) return "없음";
  return current ? "현재 입력과 일치" : "다시 제작 필요";
}

export function StudioRenderPreflightPanel({
  summary,
  hasRun,
  hasDraftVideo,
  hasFinalVideo,
  draftIsCurrent,
  finalIsCurrent,
  onFixIssueAction,
}: StudioRenderPreflightPanelProps) {
  const stateTone = !hasRun
    ? "pending"
    : summary.counts.blocker > 0
      ? "blocked"
      : summary.counts.warning > 0
        ? "warning"
        : "ready";
  const stateLabel = !hasRun
    ? "검사 전"
    : summary.counts.blocker > 0
      ? `차단 ${summary.counts.blocker}건`
      : summary.counts.warning > 0
        ? `통과 · 경고 ${summary.counts.warning}건`
        : "통과";

  return (
    <section className="studio-render-preflight-card" aria-live="polite">
      <div className="studio-render-preflight-head">
        <div>
          <h3>렌더 사전검사</h3>
          <p>현재 확인본과 같은 입력만 최종 MP4로 넘깁니다.</p>
        </div>
        <span className={`studio-render-preflight-badge is-${stateTone}`}>{stateLabel}</span>
      </div>

      <div className="studio-render-input-state-grid">
        <div>
          <span>1차 확인본</span>
          <strong>{toInputStateLabel(hasDraftVideo, draftIsCurrent)}</strong>
        </div>
        <div>
          <span>최종 영상</span>
          <strong>{toInputStateLabel(hasFinalVideo, finalIsCurrent)}</strong>
        </div>
      </div>

      {!hasRun ? (
        <div className="studio-render-preflight-empty">
          최신 확인본을 검토한 뒤 아래의 렌더 사전검사 실행 버튼을 눌러 차단 항목과 경고를 확인하세요.
        </div>
      ) : summary.issues.length > 0 ? (
        <ol className="studio-render-preflight-issue-list">
          {summary.issues.map((issue, index) => {
            const fixTarget = getRenderPreflightIssueFixTarget(issue);
            const locationLabel = getRenderPreflightIssueLocationLabel(issue);
            return (
              <li
                key={`${issue.code}:${issue.slideIndex ?? ""}:${issue.segmentIndex ?? ""}:${index}`}
                className={`is-${issue.severity}`}
              >
                <div className="studio-render-preflight-issue-meta">
                  <span>{issue.severity === "blocker" ? "차단" : "경고"}</span>
                  <span>{locationLabel}</span>
                </div>
                <p>{issue.message}</p>
                {onFixIssueAction ? (
                  <button
                    type="button"
                    className="btn-secondary studio-render-preflight-fix-action"
                    onClick={() => onFixIssueAction(issue)}
                    aria-label={`${locationLabel} 이슈를 ${fixTarget.label}`}
                    title={`${fixTarget.locationLabel} 위치를 ${fixTarget.label}`}
                  >
                    {fixTarget.label}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="studio-render-preflight-ready">차단 항목과 경고가 없습니다. 최종 렌더를 시작할 수 있습니다.</div>
      )}
    </section>
  );
}
