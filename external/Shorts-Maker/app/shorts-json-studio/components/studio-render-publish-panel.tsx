"use client";

import { PreflightSummaryBanner } from "@/components/preflight-summary-banner";
import type { StudioSfxAutoLevel } from "@/lib/studio/sfx-auto-tuning";
import { StudioOperationStatusCard } from "./studio-operation-status-card";

type StudioRenderPublishProgressTone = "pending" | "active" | "done" | "warning";

type StudioRenderPublishProgressStep = {
  key: string;
  label: string;
  description: string;
  tone: StudioRenderPublishProgressTone;
};

type StudioRenderPublishPanelProps = {
  busy: boolean;
  hasPreparedSlides: boolean;
  hasUploadedAsset: boolean;
  isJsonValid: boolean;
  showProgressCard?: boolean;
  showPrepareAction?: boolean;
  showPublishSection?: boolean;
  publishStepEnabled: boolean;
  studioPublishReady: boolean;
  studioScheduleReady: boolean;
  studioPublishIssueCount: number;
  studioScheduleIssueCount: number;
  quickScheduledAt: string;
  prepareButtonLabel: string;
  prepareDisabledReason?: string;
  sfxAutoLevel?: StudioSfxAutoLevel;
  canEditSelectedCategory: boolean;
  canPublishSelectedCategory: boolean;
  editPermissionMessage?: string;
  publishPermissionMessage?: string;
  renderStatus: string;
  onPrepareAction: () => void | Promise<unknown>;
  onSfxAutoLevelChangeAction?: (value: StudioSfxAutoLevel) => void;
  onQuickScheduledAtChangeAction: (value: string) => void;
  onPublishNowAction: () => void;
  onPublishScheduleAction: () => void;
};

function toProgressToneLabel(tone: StudioRenderPublishProgressTone): string {
  if (tone === "done") return "완료";
  if (tone === "active") return "진행중";
  if (tone === "warning") return "검토 필요";
  return "대기";
}

function parseBusyTask(status: string): "prepare" | "sfx" | "render" | "publish" | "schedule" | null {
  if (!status) return null;
  if (status.includes("예약 작업 등록")) return "schedule";
  if (status.includes("발행 작업 등록")) return "publish";
  if (status.includes("SFX")) return "sfx";
  if (status.includes("미리보기")) return "prepare";
  if (status.includes("확인본") || status.includes("최종")) return "render";
  return null;
}

export function StudioRenderPublishPanel({
  busy,
  hasPreparedSlides,
  hasUploadedAsset,
  isJsonValid,
  showProgressCard = true,
  showPrepareAction = true,
  showPublishSection = true,
  publishStepEnabled,
  studioPublishReady,
  studioScheduleReady,
  studioPublishIssueCount,
  studioScheduleIssueCount,
  quickScheduledAt,
  prepareButtonLabel,
  prepareDisabledReason,
  sfxAutoLevel = "balanced",
  canEditSelectedCategory,
  canPublishSelectedCategory,
  editPermissionMessage,
  publishPermissionMessage,
  renderStatus,
  onPrepareAction,
  onSfxAutoLevelChangeAction,
  onQuickScheduledAtChangeAction,
  onPublishNowAction,
  onPublishScheduleAction,
}: StudioRenderPublishPanelProps) {
  void sfxAutoLevel;
  void onSfxAutoLevelChangeAction;
  const normalizedRenderStatus = renderStatus.trim();
  const busyTask = busy ? parseBusyTask(normalizedRenderStatus) : null;
  const isPrepareBusy = busyTask === "prepare";
  const isSfxBusy = busyTask === "sfx";
  const isRenderBusy = busyTask === "render";
  const isPublishBusy = busyTask === "publish";
  const isScheduleBusy = busyTask === "schedule";
  const hasPublishSuccessMessage = normalizedRenderStatus.includes("완료: 기존 업로드 자산으로");
  const preflightReady = studioPublishReady && studioScheduleReady;

  const progressSteps: StudioRenderPublishProgressStep[] = [
    {
      key: "prepare",
      label: "미리보기 준비",
      description: "슬라이드 생성과 SFX 배정까지 마치면 다음 단계가 열립니다.",
      tone: isPrepareBusy || isSfxBusy ? "active" : hasPreparedSlides ? "done" : canEditSelectedCategory ? "pending" : "warning",
    },
    {
      key: "asset",
      label: "최종 업로드 영상",
      description: hasUploadedAsset ? "발행 가능한 최종 MP4 업로드 자산이 준비되었습니다." : "확인본/최종 영상 제작 후 업로드 자산을 확보해 주세요.",
      tone: isRenderBusy ? "active" : hasUploadedAsset ? "done" : hasPreparedSlides ? "pending" : "warning",
    },
    {
      key: "preflight",
      label: "발행 점검",
      description: !hasUploadedAsset
        ? "최종 업로드 영상이 있어야 발행 점검을 완료할 수 있습니다."
        : preflightReady
          ? "즉시/예약 발행 점검 항목이 모두 통과되었습니다."
          : `즉시 ${studioPublishIssueCount}건, 예약 ${studioScheduleIssueCount}건 점검 필요`,
      tone: !hasUploadedAsset ? "pending" : preflightReady ? "done" : "warning",
    },
    {
      key: "publish",
      label: "즉시/예약 발행",
      description: hasPublishSuccessMessage ? "발행 요청이 접수되었습니다. 발행 이력을 확인해 주세요." : "점검 통과 후 지금 발행 또는 예약 발행을 선택하세요.",
      tone: isPublishBusy || isScheduleBusy ? "active" : hasPublishSuccessMessage ? "done" : !hasUploadedAsset ? "pending" : preflightReady ? "pending" : "warning",
    },
  ];
  const doneStepCount = progressSteps.filter((step) => step.tone === "done").length;
  const activeStep = progressSteps.find((step) => step.tone === "active");
  const publishNowLabel = isPublishBusy ? "즉시 발행 등록 중..." : busy ? "다른 작업 진행 중" : "지금 발행";
  const publishScheduleLabel = isScheduleBusy ? "예약 발행 등록 중..." : busy ? "다른 작업 진행 중" : "예약 발행";
  const prepareDisabled = !canEditSelectedCategory || busy || !isJsonValid || Boolean(prepareDisabledReason);

  return (
    <section className="card studio-render-publish-shell">
      {showProgressCard ? (
        <section className="studio-render-publish-progress-card" aria-live="polite">
          <div className="studio-render-publish-progress-head">
            <strong>진행 현황</strong>
            <span className="studio-render-publish-progress-count">
              완료 {doneStepCount}/{progressSteps.length}
            </span>
          </div>
          <ol className="studio-render-publish-progress-list">
            {progressSteps.map((step) => (
              <li key={step.key} className={`studio-render-publish-progress-item is-${step.tone}`}>
                <span className="studio-render-publish-progress-dot" aria-hidden="true" />
                <div className="studio-render-publish-progress-copy">
                  <div className="studio-render-publish-progress-title-row">
                    <strong>{step.label}</strong>
                    <span>{toProgressToneLabel(step.tone)}</span>
                  </div>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <StudioOperationStatusCard
            busy={busy}
            status={normalizedRenderStatus}
            label="현재 작업"
            idleTitle={activeStep ? `${activeStep.label} 대기 중` : "진행 대기 중"}
            idleDescription="미리보기 만들기부터 발행까지 각 단계의 현재 상태를 여기에서 바로 보여줍니다."
          />
          {showPrepareAction && !showPublishSection ? (
            <div className="studio-render-publish-progress-actions">
              <button
                type="button"
                className="btn-secondary studio-render-publish-prepare-btn"
                onClick={onPrepareAction}
                disabled={prepareDisabled}
                title={prepareDisabledReason || undefined}
              >
                {busy ? "작업 중..." : prepareButtonLabel}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {showPublishSection ? (
        <>
          <h3 className="studio-render-publish-section-title">5. 발행</h3>
          <div className="studio-render-publish-body">
            {!canEditSelectedCategory && editPermissionMessage ? (
              <div className="warn studio-render-publish-warn">
                {editPermissionMessage}
              </div>
            ) : null}
            {!canPublishSelectedCategory && publishPermissionMessage ? (
              <div className="warn studio-render-publish-warn">
                {publishPermissionMessage}
              </div>
            ) : null}
            {!hasUploadedAsset ? (
              <div className="warn studio-render-publish-warn">
                아직 최종 업로드 영상이 없습니다. 확인본 검토 후 `최종 영상 제작하기`를 먼저 완료해 주세요.
              </div>
            ) : null}
            {hasUploadedAsset ? (
              <details className="studio-render-publish-preflight">
                <summary className="studio-render-publish-summary">발행 점검 보기</summary>
                <div className="studio-render-publish-preflight-body">
                  <PreflightSummaryBanner
                    publishReady={studioPublishReady}
                    scheduleReady={studioScheduleReady}
                    publishCount={studioPublishIssueCount}
                    scheduleCount={studioScheduleIssueCount}
                    publishLabel="즉시 발행"
                    scheduleLabel="예약 발행"
                  />
                </div>
              </details>
            ) : null}
            <div className="studio-render-publish-action-stack">
              {showPrepareAction ? (
                <button
                  type="button"
                  className="btn-secondary studio-render-publish-prepare-btn"
                  onClick={onPrepareAction}
                  disabled={prepareDisabled}
                  title={prepareDisabledReason || undefined}
                >
                  {busy ? "작업 중..." : prepareButtonLabel}
                </button>
              ) : null}
              <button
                type="button"
                className="btn-primary studio-render-publish-primary-btn"
                onClick={onPublishNowAction}
                disabled={busy || !hasUploadedAsset || !studioPublishReady || !canPublishSelectedCategory}
              >
                {publishNowLabel}
              </button>
              <details>
                <summary className="studio-render-publish-summary">예약 발행 설정</summary>
                <div className="studio-render-publish-schedule-body">
                  <input
                    type="datetime-local"
                    className="input-field"
                    value={quickScheduledAt}
                    onChange={(event) => onQuickScheduledAtChangeAction(event.target.value)}
                    disabled={!publishStepEnabled || !canPublishSelectedCategory}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={onPublishScheduleAction}
                    disabled={busy || !hasUploadedAsset || !studioScheduleReady || !canPublishSelectedCategory}
                  >
                    {publishScheduleLabel}
                  </button>
                </div>
              </details>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
