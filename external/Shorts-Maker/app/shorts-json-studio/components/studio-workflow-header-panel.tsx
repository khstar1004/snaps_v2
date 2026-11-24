"use client";

type StudioWorkflowStep = {
  key: string;
  label: string;
  done: boolean;
};

type StudioWorkflowHeaderPanelProps = {
  nextActionGuide: string;
  progressSteps: StudioWorkflowStep[];
  activeProgressStep: string;
  onSaveCurrentAction: () => void;
  saveCurrentDisabled?: boolean;
  onResetWorkspaceAction: () => void;
  resetWorkspaceDisabled?: boolean;
};

export function StudioWorkflowHeaderPanel({
  nextActionGuide,
  progressSteps,
  activeProgressStep,
  onSaveCurrentAction,
  saveCurrentDisabled = false,
  onResetWorkspaceAction,
  resetWorkspaceDisabled = false,
}: StudioWorkflowHeaderPanelProps) {
  const doneStepCount = progressSteps.filter((step) => step.done).length;
  const nextActionText = nextActionGuide.replace(/^다음 행동:\s*/, "");

  return (
    <section className="card studio-workflow-header-shell">
      <div className="studio-workflow-header-top">
        <div className="studio-workflow-header-copy">
          <h1>쇼츠 스튜디오 작업 공간</h1>
          <p className="studio-workflow-header-description">입력, 미리보기, 렌더, 발행을 한 흐름으로 이어서 관리합니다.</p>
        </div>
        <div className="studio-workflow-header-top-side">
          <div className="studio-workflow-progress-summary">
            완료 {doneStepCount}/{progressSteps.length}
          </div>
          <div className="studio-panel-actions">
            <button type="button" className="btn-secondary" onClick={onSaveCurrentAction} disabled={saveCurrentDisabled}>
              현재 버전 저장
            </button>
            <button type="button" className="btn-secondary" onClick={onResetWorkspaceAction} disabled={resetWorkspaceDisabled}>
              새 작업 시작
            </button>
          </div>
        </div>
      </div>
      <div className="studio-workflow-step-row">
        {progressSteps.map((step) => {
          const isActive = step.key === activeProgressStep;
          return (
            <span
              key={step.key}
              className={`studio-workflow-step-pill${step.done ? " is-done" : isActive ? " is-active" : ""}`}
              aria-current={isActive ? "step" : undefined}
            >
              {step.label}
            </span>
          );
        })}
      </div>
      <div className="studio-workflow-next-guide">
        <strong>다음</strong>
        <span>{nextActionText}</span>
      </div>
    </section>
  );
}
