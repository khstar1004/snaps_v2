import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  clampStudioGuidedFlowStep,
  mapBeginnerStepIndexToGuidedFlowStep,
  resolveStudioGuidedFlowStepBlockReason,
  resolveSyncedStudioGuidedFlowStep,
} from "./studio-guided-flow";

test("mapBeginnerStepIndexToGuidedFlowStep routes rendered work to review and render", () => {
  assert.equal(mapBeginnerStepIndexToGuidedFlowStep(1), 1);
  assert.equal(mapBeginnerStepIndexToGuidedFlowStep(2), 2);
  assert.equal(mapBeginnerStepIndexToGuidedFlowStep(3), 2);
  assert.equal(mapBeginnerStepIndexToGuidedFlowStep(4), 4);
  assert.equal(mapBeginnerStepIndexToGuidedFlowStep(5), 4);
});

test("clampStudioGuidedFlowStep keeps step values inside the four-stage flow", () => {
  assert.equal(clampStudioGuidedFlowStep(-1), 1);
  assert.equal(clampStudioGuidedFlowStep(2.9), 2);
  assert.equal(clampStudioGuidedFlowStep(99), 4);
});

test("resolveStudioGuidedFlowStepBlockReason returns the earliest missing prerequisite", () => {
  const emptyProgress = {
    isJsonValid: false,
    hasPreparedSlides: false,
    imageApproved: false,
  };
  const jsonOnlyProgress = {
    isJsonValid: true,
    hasPreparedSlides: false,
    imageApproved: false,
  };
  const preparedProgress = {
    isJsonValid: true,
    hasPreparedSlides: true,
    imageApproved: false,
  };
  const readyProgress = {
    isJsonValid: true,
    hasPreparedSlides: true,
    imageApproved: true,
  };

  assert.equal(resolveStudioGuidedFlowStepBlockReason({ step: 1, ...emptyProgress }), null);
  assert.match(resolveStudioGuidedFlowStepBlockReason({ step: 2, ...emptyProgress }) || "", /대본과 장면 구조/u);
  assert.equal(resolveStudioGuidedFlowStepBlockReason({ step: 2, ...jsonOnlyProgress }), null);
  assert.match(resolveStudioGuidedFlowStepBlockReason({ step: 3, ...jsonOnlyProgress }) || "", /이미지 후보/u);
  assert.match(resolveStudioGuidedFlowStepBlockReason({ step: 3, ...preparedProgress }) || "", /이미지 확인/u);
  assert.equal(resolveStudioGuidedFlowStepBlockReason({ step: 4, ...readyProgress }), null);
});

test("resolveSyncedStudioGuidedFlowStep keeps JSON validation from auto-opening preview", () => {
  assert.equal(resolveSyncedStudioGuidedFlowStep({ currentStep: 1, derivedStep: 2 }), 1);
});

test("resolveSyncedStudioGuidedFlowStep still advances for saved higher-progress work", () => {
  assert.equal(resolveSyncedStudioGuidedFlowStep({ currentStep: 1, derivedStep: 3 }), 3);
  assert.equal(resolveSyncedStudioGuidedFlowStep({ currentStep: 2, derivedStep: 4 }), 4);
});

test("resolveSyncedStudioGuidedFlowStep keeps manually selected later stages when progress regresses", () => {
  assert.equal(resolveSyncedStudioGuidedFlowStep({ currentStep: 4, derivedStep: 1 }), 4);
  assert.equal(resolveSyncedStudioGuidedFlowStep({ currentStep: 3, derivedStep: 2 }), 3);
});

test("resolveSyncedStudioGuidedFlowStep does not clamp saved progress to prerequisites", () => {
  assert.equal(resolveSyncedStudioGuidedFlowStep({ currentStep: 4, derivedStep: 4 }), 4);
  assert.equal(resolveSyncedStudioGuidedFlowStep({ currentStep: 3, derivedStep: 4 }), 4);
});

test("StudioDesktopWorkspaceShell keeps every guided stage tab open", () => {
  const shellSource = readFileSync(new URL("./components/studio-mode-shells.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(shellSource, /resolveMaxReachableStudioGuidedFlowStep|maxReachableStep/u);
  assert.doesNotMatch(shellSource, /disabled=\{!reachable\}|is-locked/u);
  assert.match(shellSource, /onClick=\{\(\) => goToGuidedStep\(stage\.step\)\}/u);
  assert.match(shellSource, /const stateClass = current/u);
  assert.match(shellSource, /blockReason\s+\?\s+" is-blocked"\s+:\s+done/u);
  assert.match(shellSource, /"다시 필요"/u);
  assert.match(shellSource, /studio-guided-blocked-state/u);
  assert.match(shellSource, /resolveStudioGuidedStagePresentation/u);
});

test("StudioDesktopWorkspaceShell keeps image preparation on a dedicated action", () => {
  const shellSource = readFileSync(new URL("./components/studio-mode-shells.tsx", import.meta.url), "utf8");

  assert.match(shellSource, /const handlePrepareImages = async \(\) =>/u);
  assert.match(shellSource, /await preparePanelProps\.onPrepareAction\(\);/u);
  assert.match(shellSource, /"retry-failed-images"/u);
});

test("StudioDesktopWorkspaceShell keeps the inspector closed until selection or explicit opening", () => {
  const shellSource = readFileSync(new URL("./components/studio-mode-shells.tsx", import.meta.url), "utf8");

  assert.match(shellSource, /studio-precision-workspace/u);
  assert.match(shellSource, /studio-workspace-navigator/u);
  assert.match(shellSource, /studio-workspace-main-pane/u);
  assert.match(shellSource, /studio-workspace-inspector/u);
  assert.match(shellSource, /useState\(false\)/u);
  assert.doesNotMatch(shellSource, /window\.innerWidth >= 1440/u);
  assert.match(shellSource, /findStudioWorkspaceGroupIndexForSlide/u);
  assert.match(shellSource, /resolveStudioWorkspaceNavigationSlides/u);
  assert.match(shellSource, /aria-label="주 작업영역"/u);
});
