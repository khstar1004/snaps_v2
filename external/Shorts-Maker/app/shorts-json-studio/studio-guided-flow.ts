import { resolveStudioGuidedStagePresentation } from "./studio-guided-stage-presentation";

export type StudioGuidedFlowStep = 1 | 2 | 3 | 4;

export function clampStudioGuidedFlowStep(value: number): StudioGuidedFlowStep {
  if (!Number.isFinite(value)) return 1;
  if (value <= 1) return 1;
  if (value >= 4) return 4;
  return Math.floor(value) as StudioGuidedFlowStep;
}

export function mapBeginnerStepIndexToGuidedFlowStep(beginnerStepIndex: number): StudioGuidedFlowStep {
  if (beginnerStepIndex <= 1) return 1;
  if (beginnerStepIndex === 2) return 2;
  if (beginnerStepIndex === 3) return 2;
  return 4;
}

export function resolveStudioGuidedFlowStepBlockReason(input: {
  step: StudioGuidedFlowStep;
  isJsonValid: boolean;
  hasPreparedSlides: boolean;
  imageApproved: boolean;
}): string | null {
  return resolveStudioGuidedStagePresentation({
    ...input,
    step: clampStudioGuidedFlowStep(input.step),
  }).blockReason;
}

export function resolveSyncedStudioGuidedFlowStep(input: {
  currentStep: StudioGuidedFlowStep;
  derivedStep: StudioGuidedFlowStep;
}): StudioGuidedFlowStep {
  const clampedCurrent = clampStudioGuidedFlowStep(input.currentStep);
  const clampedDerived = clampStudioGuidedFlowStep(input.derivedStep);
  if (clampedDerived > clampedCurrent) {
    const isStepOneToPreviewOnly = clampedCurrent === 1 && clampedDerived === 2;
    if (!isStepOneToPreviewOnly) return clampedDerived;
  }
  if (clampedCurrent !== input.currentStep) return clampedCurrent;
  return input.currentStep;
}
