"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { PublishCategory } from "@/lib/publish/types";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import { StudioAdvancedSettingsPanel } from "./studio-advanced-settings-panel";
import { StudioAudioSettingsPanel } from "./studio-audio-settings-panel";
import { StudioBrandingTemplatePanel } from "./studio-branding-template-panel";
import { StudioHistoryPanel } from "./studio-history-panel";
import { StudioMemeLibraryPanel } from "./studio-meme-library-panel";
import { StudioPreselectedMediaPanel } from "./studio-preselected-media-panel";
import { StudioPreviewPanel } from "./studio-preview-panel";
import { StudioRenderPublishPanel } from "./studio-render-publish-panel";
import { StudioResultPanel } from "./studio-result-panel";
import { StudioScriptJsonPanel } from "./studio-script-json-panel";
import { StudioProjectSettingsDrawer } from "./studio-project-settings-drawer";
import { StudioTemplateQuickPickerPanel } from "./studio-template-quick-picker-panel";
import {
  clampStudioGuidedFlowStep,
  mapBeginnerStepIndexToGuidedFlowStep,
  resolveStudioGuidedFlowStepBlockReason,
  resolveSyncedStudioGuidedFlowStep,
  type StudioGuidedFlowStep,
} from "../studio-guided-flow";
import { hasRenderableMedia, type StudioRenderPreflightIssue } from "../studio-render-preflight";
import type { StudioChangeImpactSummary } from "../studio-change-impact";
import { mapRenderPreflightTargetStepToGuidedFlowStep } from "../studio-render-preflight-navigation";
import {
  resolveStudioProjectContextSummary,
  type StudioProjectContextSummary,
} from "../studio-project-context-summary";
import {
  resolveStudioAutosavePresentation,
  type StudioAutosaveState,
} from "../studio-autosave-status";
import type { StudioTemplateId } from "../types";
import {
  buildStudioWorkspaceNavigationItems,
  findStudioWorkspaceGroupIndexForSlide,
  groupStudioWorkspaceIssuesByTarget,
  resolveStudioWorkspaceNavigationSlides,
} from "../studio-workspace-navigation";
import { resolveStudioGuidedStagePresentation } from "../studio-guided-stage-presentation";

type CodexUsageState = {
  inputTokens: number;
  outputTokens: number;
};

type RenderUsageState = {
  ttsChars: number;
  renderSeconds: number;
};

type StudioProjectProfileSyncProps = Required<
  Pick<
    ComponentProps<typeof StudioProjectSettingsDrawer>,
    | "profileToProjectGroupIds"
    | "projectToProfileGroupIds"
    | "hasProfileSnapshot"
    | "syncBusy"
    | "syncMessage"
    | "onRefreshProfileAction"
    | "onApplyProfileGroupsAction"
    | "onSaveProjectGroupsAction"
  >
>;

const STUDIO_AUDIO_EDITOR_TABS = ["script", "sfx"] as const;

const STUDIO_GUIDED_STAGES = [
  {
    step: 1 as StudioGuidedFlowStep,
    label: "대본",
    title: "대본",
  },
  {
    step: 2 as StudioGuidedFlowStep,
    label: "이미지",
    title: "이미지",
  },
  {
    step: 3 as StudioGuidedFlowStep,
    label: "자막·오디오",
    title: "자막·오디오",
  },
  {
    step: 4 as StudioGuidedFlowStep,
    label: "검수·렌더",
    title: "검수·렌더",
  },
] satisfies ReadonlyArray<{
  step: StudioGuidedFlowStep;
  label: string;
  title: string;
}>;

export type StudioDesktopWorkspaceShellProps = {
  advancedSettingsPanelProps: ComponentProps<typeof StudioAdvancedSettingsPanel>;
  beginnerStepIndex: number;
  brandingFabRef: RefObject<HTMLButtonElement | null>;
  brandingPanelOpen: boolean;
  brandingPanelProps: ComponentProps<typeof StudioBrandingTemplatePanel>;
  brandingPanelRef: RefObject<HTMLElement | null>;
  canEditSelectedCategory: boolean;
  changeImpactSummary: StudioChangeImpactSummary;
  closeBrandingPanel: () => void;
  closeHistoryPanel: () => void;
  codexLocalReady: boolean;
  codexOauthConnected: boolean;
  codexOauthMode: "oauth" | "local_codex_bridge";
  codexOauthStatus: string;
  codexUsage: CodexUsageState | null;
  handleDisconnectCodexOauth: () => void | Promise<void>;
  hasFinalVideo: boolean;
  hasPreparedSlides: boolean;
  hasRenderedVideo: boolean;
  imageApproved: boolean;
  historyFabRef: RefObject<HTMLButtonElement | null>;
  historyPanelProps: ComponentProps<typeof StudioHistoryPanel>;
  historyPanelVisible: boolean;
  memeLibraryPanelProps: ComponentProps<typeof StudioMemeLibraryPanel>;
  onApproveImageAction: () => void;
  onOpenLayoutStudioAction: () => boolean;
  openHistoryPanel: () => void;
  preparePanelProps: ComponentProps<typeof StudioRenderPublishPanel>;
  preselectedMediaPanelProps: ComponentProps<typeof StudioPreselectedMediaPanel>;
  previewPanelProps: ComponentProps<typeof StudioPreviewPanel>;
  profileSnapshotLabel?: string;
  projectName: string;
  projectProfileLabel?: string;
  projectProfileSnapshot?: StudioProjectProfileSnapshot | null;
  projectProfileSyncProps: StudioProjectProfileSyncProps;
  autosaveState: StudioAutosaveState;
  onAutosaveRetryAction: () => void;
  publishCategory: PublishCategory;
  isJsonValid: boolean;
  resultPanelProps: ComponentProps<typeof StudioResultPanel>;
  resultPublishPanelProps: ComponentProps<typeof StudioRenderPublishPanel>;
  renderUsage: RenderUsageState | null;
  scriptJsonPanelProps: ComponentProps<typeof StudioScriptJsonPanel>;
  templateQuickPickerProps: ComponentProps<typeof StudioTemplateQuickPickerPanel>;
  toggleBrandingPanel: () => void;
  toggleHistoryPanel: () => void;
  categoryOptions: Array<{ value: PublishCategory; label: string }>;
  mappedChannelId: string;
  mappedChannelTitle: string;
  busy: boolean;
  layoutStudioHref: string;
  templateId: StudioTemplateId;
  templateLabel: string;
  onProjectNameChangeAction: (value: string) => void;
  onSaveCurrentAction?: () => void | Promise<void>;
  onResetWorkspaceAction?: () => void | Promise<void>;
};

export function resolveStudioProfileSnapshotLabel(input: {
  profileSnapshotLabel?: string;
  projectProfileLabel?: string;
  publishCategory: PublishCategory;
  categoryOptions: Array<{ value: PublishCategory; label: string }>;
}): string {
  const profileSnapshotLabel = String(input.profileSnapshotLabel || "").trim();
  if (profileSnapshotLabel) return profileSnapshotLabel;
  const projectProfileLabel = String(input.projectProfileLabel || "").trim();
  if (projectProfileLabel) return projectProfileLabel;
  return input.categoryOptions.find((option) => option.value === input.publishCategory)?.label || input.publishCategory;
}

export function StudioDesktopWorkspaceShell({
  advancedSettingsPanelProps,
  beginnerStepIndex,
  brandingPanelProps,
  canEditSelectedCategory,
  changeImpactSummary,
  hasFinalVideo,
  hasPreparedSlides,
  hasRenderedVideo,
  imageApproved,
  historyPanelProps,
  historyPanelVisible,
  onApproveImageAction,
  onOpenLayoutStudioAction,
  preparePanelProps,
  preselectedMediaPanelProps,
  previewPanelProps,
  profileSnapshotLabel,
  projectName,
  projectProfileLabel,
  projectProfileSnapshot,
  projectProfileSyncProps,
  autosaveState,
  onAutosaveRetryAction,
  publishCategory,
  isJsonValid,
  resultPanelProps,
  scriptJsonPanelProps,
  toggleHistoryPanel,
  categoryOptions,
  busy,
  layoutStudioHref,
  templateId,
  templateLabel,
  onProjectNameChangeAction,
  onSaveCurrentAction,
  onResetWorkspaceAction,
}: StudioDesktopWorkspaceShellProps) {
  const resolvedProfileSnapshotLabel = resolveStudioProfileSnapshotLabel({
    profileSnapshotLabel,
    projectProfileLabel,
    publishCategory,
    categoryOptions,
  });
  const changedProfileGroupCount = new Set([
    ...projectProfileSyncProps.profileToProjectGroupIds,
    ...projectProfileSyncProps.projectToProfileGroupIds,
  ]).size;
  const derivedGuidedStep = mapBeginnerStepIndexToGuidedFlowStep(beginnerStepIndex);
  const [guidedStep, setGuidedStep] = useState<StudioGuidedFlowStep>(() => clampStudioGuidedFlowStep(derivedGuidedStep));
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const imagePrepareInFlightRef = useRef(false);
  const [imagePrepareBusy, setImagePrepareBusy] = useState(false);
  const [workspaceInspectorOpen, setWorkspaceInspectorOpen] = useState(false);
  const [selectedPreflightIssue, setSelectedPreflightIssue] = useState<StudioRenderPreflightIssue | null>(null);
  const projectSettingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const projectMoreRef = useRef<HTMLDetailsElement | null>(null);
  const stepRailRef = useRef<HTMLDivElement | null>(null);
  const stageHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const workspaceInspectorRef = useRef<HTMLElement | null>(null);
  const workspaceInspectorToggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setGuidedStep((current) => {
      return resolveSyncedStudioGuidedFlowStep({
        currentStep: current,
        derivedStep: derivedGuidedStep,
      });
    });
  }, [derivedGuidedStep]);

  useEffect(() => {
    if (!workspaceInspectorOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setWorkspaceInspectorOpen(false);
      window.requestAnimationFrame(() => workspaceInspectorToggleRef.current?.focus());
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [workspaceInspectorOpen]);

  const currentStage = STUDIO_GUIDED_STAGES.find((stage) => stage.step === guidedStep) || STUDIO_GUIDED_STAGES[0]!;
  const projectContextSummary: StudioProjectContextSummary = resolveStudioProjectContextSummary({
    workName: projectName,
    fallbackTitle: previewPanelProps.title,
    profileSnapshotLabel: resolvedProfileSnapshotLabel,
    projectProfileSnapshot,
    guidedStageLabel: currentStage.label,
    templateId,
    templateLabel,
  });
  const autosavePresentation = resolveStudioAutosavePresentation(autosaveState);

  const closeProjectSettings = useCallback(() => {
    setProjectSettingsOpen(false);
    window.requestAnimationFrame(() => projectSettingsButtonRef.current?.focus());
  }, []);

  const closeProjectMore = () => {
    if (projectMoreRef.current) projectMoreRef.current.open = false;
  };

  const goToGuidedStep = (step: StudioGuidedFlowStep, options?: { focusHeading?: boolean }) => {
    closeProjectMore();
    setGuidedStep(step);
    if (options?.focusHeading) {
      window.requestAnimationFrame(() => stageHeadingRef.current?.focus());
    }
  };

  const handlePrepareImages = async () => {
    if (imagePrepareInFlightRef.current || busy) return;
    imagePrepareInFlightRef.current = true;
    setImagePrepareBusy(true);
    try {
      await preparePanelProps.onPrepareAction();
    } finally {
      imagePrepareInFlightRef.current = false;
      setImagePrepareBusy(false);
    }
  };

  const stepDone = (step: StudioGuidedFlowStep): boolean => {
    if (step === 1) return isJsonValid;
    if (step === 2) return imageApproved;
    if (step === 3) return hasRenderedVideo;
    return hasFinalVideo;
  };

  const stepReviewStatus = (step: StudioGuidedFlowStep): string | null => {
    if (stepDone(step)) return "완료";
    if (step === 2) return "다시 필요";
    return null;
  };

  const stepBlockReason = (step: StudioGuidedFlowStep): string | null =>
    resolveStudioGuidedFlowStepBlockReason({
      step,
      isJsonValid,
      hasPreparedSlides,
      imageApproved,
    });

  const imagesComplete =
    previewPanelProps.slides.length > 0 &&
    previewPanelProps.slides.every(hasRenderableMedia);
  const imagePreparationHasFailures = previewPanelProps.warnings.some((warning) =>
    /실패|failed|error|찾지 못/u.test(String(warning || ""))
  );
  const currentStagePresentation = resolveStudioGuidedStagePresentation({
    step: guidedStep,
    imageSource: advancedSettingsPanelProps.imageSource,
    isJsonValid,
    hasPreparedSlides,
    imagesComplete,
    imagePreparationHasFailures,
    imageApproved,
  });
  const renderBlockerCount = resultPanelProps.renderPreflightSummary.counts.blocker;
  const visibleRenderBlockerCount = resultPanelProps.renderPreflightHasRun ? renderBlockerCount : 0;
  const workspaceNavigationSlides = useMemo(
    () =>
      resolveStudioWorkspaceNavigationSlides({
        preparedSlides: previewPanelProps.slides,
        scriptJsonText: scriptJsonPanelProps.jsonText,
      }),
    [previewPanelProps.slides, scriptJsonPanelProps.jsonText]
  );
  const renderPreflightIssues = resultPanelProps.renderPreflightSummary.issues;
  const groupedPreflightIssues = useMemo(
    () => groupStudioWorkspaceIssuesByTarget(renderPreflightIssues),
    [renderPreflightIssues]
  );
  const workspaceNavigationItems = useMemo(
    () =>
      buildStudioWorkspaceNavigationItems({
        step: guidedStep,
        slides: workspaceNavigationSlides,
        imageApproved,
        preflightIssues: resultPanelProps.renderPreflightSummary.issues,
      }),
    [
      guidedStep,
      imageApproved,
      resultPanelProps.renderPreflightSummary.issues,
      workspaceNavigationSlides,
    ]
  );
  const selectedWorkspaceGroupIndex = Math.min(
    Math.max(0, Number(previewPanelProps.selectedSlideGroupIndex) || 0),
    Math.max(0, workspaceNavigationItems.length - 1)
  );
  const selectedWorkspaceItem = workspaceNavigationItems[selectedWorkspaceGroupIndex] || null;
  const selectedWorkspaceSlide = selectedWorkspaceItem
    ? workspaceNavigationSlides[selectedWorkspaceItem.representativeIndex] || null
    : null;

  useEffect(() => {
    setSelectedPreflightIssue((current) => {
      if (!current) return null;
      const next =
        renderPreflightIssues.find(
          (issue) =>
            issue.code === current.code &&
            issue.slideIndex === current.slideIndex &&
            issue.segmentIndex === current.segmentIndex
        ) || null;
      if (
        next &&
        next.message === current.message &&
        next.severity === current.severity &&
        next.targetStep === current.targetStep
      ) {
        return current;
      }
      return next;
    });
  }, [renderPreflightIssues]);

  const selectWorkspaceGroup = (groupIndex: number) => {
    previewPanelProps.onSelectedSlideGroupIndexChangeAction?.(groupIndex);
  };

  const closeWorkspaceInspector = () => {
    setWorkspaceInspectorOpen(false);
    window.requestAnimationFrame(() => workspaceInspectorToggleRef.current?.focus());
  };

  const toggleWorkspaceInspector = () => {
    if (workspaceInspectorOpen) {
      closeWorkspaceInspector();
      return;
    }
    setWorkspaceInspectorOpen(true);
    window.requestAnimationFrame(() => workspaceInspectorRef.current?.focus());
  };

  const handleRenderPreflightIssueFix = (issue: StudioRenderPreflightIssue) => {
    const groupIndex = findStudioWorkspaceGroupIndexForSlide(workspaceNavigationItems, issue.slideIndex);
    if (groupIndex !== null) selectWorkspaceGroup(groupIndex);
    goToGuidedStep(mapRenderPreflightTargetStepToGuidedFlowStep(issue.targetStep), { focusHeading: true });
  };

  const selectRenderPreflightIssue = (issue: StudioRenderPreflightIssue) => {
    const groupIndex = findStudioWorkspaceGroupIndexForSlide(workspaceNavigationItems, issue.slideIndex);
    if (groupIndex !== null) selectWorkspaceGroup(groupIndex);
    setSelectedPreflightIssue(issue);
    setWorkspaceInspectorOpen(true);
    window.requestAnimationFrame(() => workspaceInspectorRef.current?.focus());
  };

  const handleStepRailKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentStep: StudioGuidedFlowStep
  ) => {
    let nextStep: StudioGuidedFlowStep | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextStep = clampStudioGuidedFlowStep(currentStep + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextStep = clampStudioGuidedFlowStep(currentStep - 1);
    } else if (event.key === "Home") {
      nextStep = 1;
    } else if (event.key === "End") {
      nextStep = 4;
    }
    if (nextStep === null || nextStep === currentStep) return;
    event.preventDefault();
    goToGuidedStep(nextStep);
    window.requestAnimationFrame(() => {
      stepRailRef.current
        ?.querySelector<HTMLButtonElement>(`[data-studio-guided-step="${nextStep}"]`)
        ?.focus();
    });
  };

  const renderImagePreparationTools = (): ReactNode => (
    <div className="studio-utility-rail studio-workspace-image-tools" aria-label="이미지 보조 도구">
      <details className="studio-utility-section">
        <summary>미디어 선배치</summary>
        <div className="studio-utility-section-body">
          <section className="card studio-input-module">
            <StudioPreselectedMediaPanel {...preselectedMediaPanelProps} />
          </section>
        </div>
      </details>
    </div>
  );

  const renderWorkspaceNavigator = (): ReactNode => {
    const navigatorTitle = guidedStep === 4 ? "품질 이슈" : "장면·라인 탐색기";

    return (
      <aside className="studio-workspace-navigator" aria-label={navigatorTitle}>
        <div className="studio-workspace-pane-header">
          <h3>{navigatorTitle}</h3>
          <span className="studio-workspace-pane-count">
            {guidedStep === 4 ? renderPreflightIssues.length : workspaceNavigationItems.length}
          </span>
        </div>

        {guidedStep === 4 ? (
          renderPreflightIssues.length > 0 ? (
            <div className="studio-workspace-issue-list">
              {groupedPreflightIssues.map((group) => (
                <section key={group.targetStep} className="studio-workspace-issue-group">
                  <h4>{group.label}</h4>
                  {group.issues.map((issue, index) => (
                    <button
                      key={`${issue.code}:${issue.slideIndex ?? "project"}:${issue.segmentIndex ?? "all"}:${index}`}
                      type="button"
                      className={`studio-workspace-issue-item is-${issue.severity}`}
                      onClick={() => selectRenderPreflightIssue(issue)}
                    >
                      <span>{issue.severity === "blocker" ? "차단" : "경고"}</span>
                      <strong>{issue.message}</strong>
                      <small>{typeof issue.slideIndex === "number" ? `장면 ${issue.slideIndex + 1}` : group.label}</small>
                    </button>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <div className="studio-workspace-pane-empty is-success">
              <strong>품질 이슈 없음</strong>
            </div>
          )
        ) : workspaceNavigationItems.length > 0 ? (
          <nav className="studio-workspace-scene-list" aria-label="장면 선택">
            {workspaceNavigationItems.map((item) => {
              const selected = item.groupIndex === selectedWorkspaceGroupIndex;
              return (
                <div key={item.key} className="studio-workspace-scene-group">
                  <button
                    type="button"
                    className={`studio-workspace-scene-item${selected ? " is-selected" : ""}`}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => selectWorkspaceGroup(item.groupIndex)}
                  >
                    <span className="studio-workspace-scene-number">{String(item.groupIndex + 1).padStart(2, "0")}</span>
                    <span className="studio-workspace-scene-copy">
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <span className={`studio-workspace-scene-status is-${item.tone}`}>{item.statusLabel}</span>
                  </button>
                </div>
              );
            })}
          </nav>
        ) : (
          <div className="studio-workspace-pane-empty">
            <strong>{isJsonValid ? "장면 없음" : "장면 구조 없음"}</strong>
          </div>
        )}
      </aside>
    );
  };

  const renderWorkspaceSelectionSummary = (): ReactNode => (
    <section className="studio-workspace-selection-card" aria-label="선택 장면 요약">
      <div className="studio-workspace-selection-label">선택 장면</div>
      <strong>{selectedWorkspaceItem?.title || "선택 없음"}</strong>
      {selectedWorkspaceItem ? <span>{selectedWorkspaceItem.detail}</span> : null}
      {selectedWorkspaceSlide ? (
        <p>
          {String(selectedWorkspaceSlide.narrationText || selectedWorkspaceSlide.text || selectedWorkspaceSlide.lines?.[0] || "")
            .trim()
            .slice(0, 120) || "장면 텍스트 없음"}
        </p>
      ) : null}
      {selectedWorkspaceItem ? (
        <span className={`studio-workspace-scene-status is-${selectedWorkspaceItem.tone}`}>
          {selectedWorkspaceItem.statusLabel}
        </span>
      ) : null}
    </section>
  );

  const renderWorkspaceInspector = (): ReactNode => (
    <aside
      id="studio-workspace-inspector"
      ref={workspaceInspectorRef}
      className="studio-workspace-inspector"
      aria-label="선택 항목 인스펙터"
      tabIndex={-1}
    >
      <div className="studio-workspace-pane-header studio-workspace-inspector-header">
        <h3>세부 설정</h3>
        <button type="button" className="btn-secondary" onClick={closeWorkspaceInspector}>
          닫기
        </button>
      </div>

      {guidedStep < 4 ? renderWorkspaceSelectionSummary() : null}

      {guidedStep === 2 ? (
        selectedWorkspaceSlide ? (
          <section className="studio-workspace-inspector-section" aria-label="선택 장면 이미지 세부 정보">
            <div className="studio-workspace-inspector-section-title">이미지 프롬프트</div>
            <p className="studio-workspace-inspector-help">
              {selectedWorkspaceSlide.manualImagePrompt?.finalPrompt ||
                selectedWorkspaceSlide.manualImagePrompt?.scenePrompt ||
                selectedWorkspaceSlide.imageRequest?.query ||
                "프롬프트 없음"}
            </p>
            <dl className="studio-workspace-local-detail">
              <div>
                <dt>후보</dt>
                <dd>{selectedWorkspaceSlide.imageSelection?.candidateOptions?.length || 0}개</dd>
              </div>
              <div>
                <dt>현재 이미지</dt>
                <dd>{hasRenderableMedia(selectedWorkspaceSlide) ? "선택됨" : "없음"}</dd>
              </div>
            </dl>
          </section>
        ) : (
          <div className="studio-workspace-inspector-note">
            <strong>장면을 선택해 주세요.</strong>
          </div>
        )
      ) : null}

      {guidedStep === 3 ? (
        selectedWorkspaceSlide ? (
          <section className="studio-workspace-inspector-section" aria-label="선택 장면 자막과 효과음">
            <div className="studio-workspace-inspector-section-title">자막·SFX cue</div>
            <dl className="studio-workspace-local-detail">
              <div>
                <dt>자막</dt>
                <dd>{selectedWorkspaceSlide.captionCues?.length || selectedWorkspaceSlide.lines.length}개</dd>
              </div>
              <div>
                <dt>효과음</dt>
                <dd>
                  {selectedWorkspaceSlide.sfxCue?.enabled
                    ? selectedWorkspaceSlide.sfxCue.tag
                    : (selectedWorkspaceSlide.sfxPlan || []).filter((cue) => cue.enabled !== false).length > 0
                      ? `${(selectedWorkspaceSlide.sfxPlan || []).filter((cue) => cue.enabled !== false).length}개`
                      : "없음"}
                </dd>
              </div>
            </dl>
          </section>
        ) : (
          <div className="studio-workspace-inspector-note">
            <strong>장면을 선택해 주세요.</strong>
          </div>
        )
      ) : null}

      {guidedStep === 4 ? (
        selectedPreflightIssue ? (
          <section className="studio-workspace-selection-card" aria-label="선택한 품질 이슈">
            <div className="studio-workspace-selection-label">
              {selectedPreflightIssue.severity === "blocker" ? "차단 이슈" : "경고"}
            </div>
            <strong>{selectedPreflightIssue.message}</strong>
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleRenderPreflightIssueFix(selectedPreflightIssue)}
            >
              해결 위치 열기
            </button>
          </section>
        ) : (
          <div className="studio-workspace-inspector-note">
            <strong>품질 이슈를 선택해 주세요.</strong>
          </div>
        )
      ) : null}
    </aside>
  );

  const renderCurrentStage = (): ReactNode => {
    if (guidedStep === 1) {
      return (
        <section id="studio-input" className="studio-primary-flow">
          <StudioScriptJsonPanel {...scriptJsonPanelProps} sectionScope="script" />
          <details className="studio-guided-settings-disclosure">
            <summary>음성 설정</summary>
            <StudioAdvancedSettingsPanel {...advancedSettingsPanelProps} sectionScope="voice" />
            <div className="studio-advanced-speed-card">
              <div className="studio-advanced-speed-head">
                <label htmlFor="studio-guided-playback-rate" className="studio-advanced-speed-label">제작 배속</label>
                <span className="studio-advanced-speed-value">{resultPanelProps.playbackRate.toFixed(1)}x</span>
              </div>
              <input
                id="studio-guided-playback-rate"
                className="studio-advanced-speed-range"
                type="range"
                min="0.8"
                max="3"
                step="0.1"
                value={resultPanelProps.playbackRate}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) resultPanelProps.onPlaybackRateChangeAction(next);
                }}
                disabled={busy || resultPanelProps.canEditSelectedCategory === false}
              />
              <div className="studio-advanced-speed-presets">
                {[1, 1.2, 1.5, 1.8, 2.2, 2.6, 3].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`studio-advanced-speed-chip${Math.abs(resultPanelProps.playbackRate - preset) < 0.05 ? " is-active" : ""}`}
                    onClick={() => resultPanelProps.onPlaybackRateChangeAction(preset)}
                    disabled={busy || resultPanelProps.canEditSelectedCategory === false}
                  >
                    {preset.toFixed(1)}x
                  </button>
                ))}
              </div>
            </div>
            <StudioScriptJsonPanel {...scriptJsonPanelProps} sectionScope="voice" />
          </details>
          {currentStagePresentation.primaryAction === "go-to-image" ? (
            <div className="studio-guided-primary-action">
              <button type="button" className="btn-primary" onClick={() => goToGuidedStep(2)}>
                {currentStagePresentation.primaryLabel}
              </button>
            </div>
          ) : null}
        </section>
      );
    }

    if (guidedStep === 2) {
      return (
        <section id="studio-preview" className="studio-stage-shell">
          <details className="studio-guided-settings-disclosure">
            <summary>이미지 설정</summary>
            <StudioAdvancedSettingsPanel {...advancedSettingsPanelProps} sectionScope="image" />
            {(advancedSettingsPanelProps.imageSource === "manual-ai-prompt" ||
              advancedSettingsPanelProps.imageSource === "auto-ai-generate") &&
            !scriptJsonPanelProps.hasFixedCharacterProfile ? (
              <StudioScriptJsonPanel {...scriptJsonPanelProps} sectionScope="image" />
            ) : null}
            {renderImagePreparationTools()}
          </details>
          {hasPreparedSlides ? (
            <StudioPreviewPanel
              {...previewPanelProps}
              panelHeading="장면 이미지"
              imageOnlyEditMode
              showPrepareAction={false}
              onAdvanceToRenderAction={undefined}
            />
          ) : null}
          {preparePanelProps.renderStatus ? (
            <div className="studio-guided-operation-status" role="status" aria-live="polite">
              {preparePanelProps.renderStatus}
            </div>
          ) : null}
          <div className="studio-guided-primary-action">
            <button
              type="button"
              className="btn-primary"
              disabled={
                busy ||
                imagePrepareBusy ||
                !preparePanelProps.canEditSelectedCategory ||
                ((
                  currentStagePresentation.primaryAction === "prepare-images" ||
                  currentStagePresentation.primaryAction === "prepare-incomplete-images" ||
                  currentStagePresentation.primaryAction === "retry-failed-images"
                ) &&
                  Boolean(preparePanelProps.prepareDisabledReason))
              }
              title={
                currentStagePresentation.primaryAction === "prepare-images" ||
                currentStagePresentation.primaryAction === "prepare-incomplete-images" ||
                currentStagePresentation.primaryAction === "retry-failed-images"
                  ? preparePanelProps.prepareDisabledReason
                  : undefined
              }
              onClick={() => {
                if (
                  currentStagePresentation.primaryAction === "prepare-images" ||
                  currentStagePresentation.primaryAction === "prepare-incomplete-images" ||
                  currentStagePresentation.primaryAction === "retry-failed-images"
                ) {
                  void handlePrepareImages();
                  return;
                }
                if (currentStagePresentation.primaryAction === "approve-images") {
                  onApproveImageAction();
                  return;
                }
                if (currentStagePresentation.primaryAction === "go-to-caption-audio") {
                  goToGuidedStep(3);
                }
              }}
            >
              {imagePrepareBusy ? "이미지 준비 중..." : currentStagePresentation.primaryLabel}
            </button>
          </div>
        </section>
      );
    }

    if (guidedStep === 3) {
      return (
        <section id="studio-preview" className="studio-stage-shell">
          <StudioPreviewPanel
            {...previewPanelProps}
            panelHeading="장면별 자막·효과음"
            imageOnlyEditMode={false}
            initialEditorTab="sfx"
            visibleEditorTabs={STUDIO_AUDIO_EDITOR_TABS}
            onAdvanceToRenderAction={undefined}
          />
          <StudioAudioSettingsPanel
            openByDefault
            busy={resultPanelProps.busy}
            hasPreparedSlides={resultPanelProps.hasPreparedSlides}
            canEditSelectedCategory={resultPanelProps.canEditSelectedCategory !== false}
            bgmEnabled={resultPanelProps.bgmEnabled}
            selectedBgmTrack={resultPanelProps.selectedBgmTrack}
            bgmVolume={resultPanelProps.bgmVolume}
            mixPresetId={resultPanelProps.mixPresetId}
            sfxEnabled={resultPanelProps.sfxEnabled}
            sfxMasterGainDb={resultPanelProps.sfxMasterGainDb}
            sfxAutoLevel={resultPanelProps.sfxAutoLevel}
            onAutoPlanSfxAction={resultPanelProps.onAutoPlanSfxAction}
            onBgmEnabledChangeAction={resultPanelProps.onBgmEnabledChangeAction}
            onBgmTrackChangeAction={resultPanelProps.onBgmTrackChangeAction}
            onBgmVolumeChangeAction={resultPanelProps.onBgmVolumeChangeAction}
            onMixPresetChangeAction={resultPanelProps.onMixPresetChangeAction}
            onSfxEnabledChangeAction={resultPanelProps.onSfxEnabledChangeAction}
            onSfxMasterGainChangeAction={resultPanelProps.onSfxMasterGainChangeAction}
            onSfxAutoLevelChangeAction={resultPanelProps.onSfxAutoLevelChangeAction}
          />
          <div className="studio-guided-primary-action">
            <button type="button" className="btn-primary" onClick={() => goToGuidedStep(4)}>
              {currentStagePresentation.primaryLabel}
            </button>
          </div>
        </section>
      );
    }

    return (
      <section id="studio-result" className="studio-stage-shell">
        <StudioResultPanel
          {...resultPanelProps}
          panelHeading="4. 검수·렌더"
          showRenderPreflight={false}
          onRenderPreflightIssueFixAction={handleRenderPreflightIssueFix}
        />
      </section>
    );
  };

  return (
    <>
      <div className="studio-shell">
        <section className="studio-input-stage studio-minimal-workbench">
          {historyPanelVisible ? <StudioHistoryPanel {...historyPanelProps} /> : <div id="studio-history" />}

          <section className="card studio-minimal-workbench-bar">
            <div className="studio-minimal-workbench-bar-row">
              <div className="studio-minimal-workbench-project" aria-label="현재 프로젝트">
                <span>프로젝트</span>
                <strong title={projectContextSummary.projectName}>{projectContextSummary.projectName}</strong>
              </div>

              <div className="studio-minimal-workbench-field" aria-label="현재 프로필">
                <span>프로필</span>
                <div className="studio-minimal-profile-snapshot">
                  <strong>{resolvedProfileSnapshotLabel}</strong>
                </div>
              </div>

              <div
                className={`studio-minimal-autosave-status is-${autosavePresentation.tone}`}
              >
                <span aria-live="polite" role="status">{autosavePresentation.label}</span>
                {autosavePresentation.canRetry ? (
                  <button type="button" className="studio-minimal-autosave-retry" onClick={onAutosaveRetryAction}>
                    다시 저장
                  </button>
                ) : null}
              </div>

              <div className="studio-minimal-workbench-actions">
                <button
                  ref={projectSettingsButtonRef}
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    closeProjectMore();
                    setProjectSettingsOpen(true);
                    void Promise.resolve(projectProfileSyncProps.onRefreshProfileAction()).catch(() => undefined);
                  }}
                  aria-expanded={projectSettingsOpen}
                  aria-controls="studio-project-settings-drawer"
                >
                  프로젝트 설정
                </button>
                <details
                  ref={projectMoreRef}
                  className="studio-project-more"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) closeProjectMore();
                  }}
                >
                  <summary className="btn-secondary">더보기</summary>
                  <div className="studio-project-more-menu">
                    <button
                      type="button"
                      onClick={() => {
                        toggleHistoryPanel();
                        closeProjectMore();
                      }}
                    >
                      {historyPanelVisible ? "히스토리 닫기" : "히스토리"}
                    </button>
                    <button
                      type="button"
                      disabled={busy || !canEditSelectedCategory}
                      onClick={() => {
                        closeProjectMore();
                        void onSaveCurrentAction?.();
                      }}
                    >
                      버전 저장
                    </button>
                    <Link
                      href="/projects/new"
                      aria-disabled={busy}
                      onClick={(event) => {
                        if (busy) event.preventDefault();
                      }}
                    >
                      새 프로젝트
                    </Link>
                    <hr />
                    <button
                      type="button"
                      className="is-destructive"
                      disabled={busy || !canEditSelectedCategory}
                      onClick={() => {
                        closeProjectMore();
                        void onResetWorkspaceAction?.();
                      }}
                    >
                      프로젝트 초기화
                    </button>
                  </div>
                </details>
              </div>
            </div>

            {changedProfileGroupCount > 0 || changeImpactSummary.hasImpacts || visibleRenderBlockerCount > 0 ? (
              <div className="studio-minimal-workbench-summary-row" aria-label="프로젝트 상태 요약">
                {changedProfileGroupCount > 0 ? (
                  <span>프로필 변경 <strong>{changedProfileGroupCount}</strong></span>
                ) : null}
                {changeImpactSummary.hasImpacts ? (
                  <span className="is-warning">변경 영향 <strong>{changeImpactSummary.count}</strong></span>
                ) : null}
                {visibleRenderBlockerCount > 0 ? (
                  <span className="is-blocked">차단 오류 <strong>{visibleRenderBlockerCount}</strong></span>
                ) : null}
              </div>
            ) : null}

            <div ref={stepRailRef} className="studio-minimal-workbench-step-row" role="tablist" aria-label="제작 단계">
              {STUDIO_GUIDED_STAGES.map((stage) => {
                const blockReason = stepBlockReason(stage.step);
                const done = stepDone(stage.step);
                const current = stage.step === guidedStep;
                const stateClass = current
                  ? ` is-current${blockReason ? " is-blocked" : ""}`
                  : blockReason
                    ? " is-blocked"
                    : done
                      ? " is-done"
                      : " is-open";
                const statusLabel = blockReason ? "차단" : stepReviewStatus(stage.step);
                return (
                  <button
                    key={stage.step}
                    type="button"
                    className={`studio-minimal-workbench-step${stateClass}`}
                    onClick={() => goToGuidedStep(stage.step)}
                    onKeyDown={(event) => handleStepRailKeyDown(event, stage.step)}
                    data-studio-guided-step={stage.step}
                    aria-current={current ? "step" : undefined}
                    role="tab"
                    aria-selected={current}
                    title={blockReason || undefined}
                  >
                    <span>{stage.label}</span>
                    {statusLabel ? (
                      <span className="studio-minimal-workbench-step-status">{statusLabel}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card studio-minimal-workbench-stage-shell">
            <div className="studio-minimal-workbench-stage-head">
              <h2 ref={stageHeadingRef} className="studio-minimal-workbench-stage-title" tabIndex={-1}>{currentStage.title}</h2>
              <div className="studio-minimal-workbench-stage-head-actions">
                {!currentStagePresentation.blocked && guidedStep > 1 ? (
                  <button
                    ref={workspaceInspectorToggleRef}
                    type="button"
                    className="btn-secondary studio-workspace-inspector-toggle"
                    aria-expanded={workspaceInspectorOpen}
                    aria-controls="studio-workspace-inspector"
                    onClick={toggleWorkspaceInspector}
                  >
                    {workspaceInspectorOpen ? "세부 설정 닫기" : "세부 설정"}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="studio-minimal-workbench-stage-body">
              {currentStagePresentation.blocked ? (
                <section className="studio-guided-blocked-state" role="status">
                  <strong>{currentStagePresentation.blockReason}</strong>
                  {currentStagePresentation.recoveryStep && currentStagePresentation.recoveryLabel ? (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() =>
                        goToGuidedStep(currentStagePresentation.recoveryStep as StudioGuidedFlowStep, {
                          focusHeading: true,
                        })
                      }
                    >
                      {currentStagePresentation.recoveryLabel}
                    </button>
                  ) : null}
                </section>
              ) : (
                <div className={`studio-precision-workspace${workspaceInspectorOpen ? " is-inspector-open" : " is-inspector-collapsed"}${guidedStep === 1 ? " is-single-pane" : ""}`}>
                  {guidedStep === 1 ? null : renderWorkspaceNavigator()}
                  <section className="studio-workspace-main-pane" aria-label="주 작업영역">{renderCurrentStage()}</section>
                  {workspaceInspectorOpen ? (
                    <>
                      <button
                        type="button"
                        className="studio-workspace-inspector-backdrop"
                        aria-label="세부 설정 닫기"
                        onClick={closeWorkspaceInspector}
                      />
                      {renderWorkspaceInspector()}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </section>

          {changeImpactSummary.hasImpacts ? (
            <section className="studio-change-impact-bar is-warning" aria-label="변경 영향">
              <div className="studio-change-impact-copy">
                <strong>변경 영향 확인 필요</strong>
                <span aria-live="polite">{changeImpactSummary.description}</span>
              </div>
              <div className="studio-change-impact-actions" aria-label="영향 항목 바로가기">
                {changeImpactSummary.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => goToGuidedStep(item.targetStep, { focusHeading: true })}
                  >
                    {item.label} 보기
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      </div>

      <StudioProjectSettingsDrawer
        open={projectSettingsOpen}
        projectName={projectName}
        readOnly={!canEditSelectedCategory}
        summary={projectContextSummary}
        {...projectProfileSyncProps}
        projectTools={
          <>
            <StudioBrandingTemplatePanel {...brandingPanelProps} />
            <Link
              href={layoutStudioHref}
              target="_blank"
              rel="noreferrer"
              className={`btn-secondary studio-project-settings-layout-link${canEditSelectedCategory ? "" : " is-disabled"}`}
              onClick={(event) => {
                if (onOpenLayoutStudioAction()) return;
                event.preventDefault();
              }}
            >
              레이아웃 자세히 편집
            </Link>
          </>
        }
        onProjectNameChangeAction={onProjectNameChangeAction}
        onCloseAction={closeProjectSettings}
      />
    </>
  );
}
