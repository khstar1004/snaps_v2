import type { StudioGuidedFlowStep } from "./studio-guided-flow";
import type { StudioRenderPreflightIssue, StudioRenderPreflightTargetStep } from "./studio-render-preflight";

export type StudioRenderPreflightIssueFixTarget = {
  step: StudioGuidedFlowStep;
  label: string;
  locationLabel: string;
};

export function mapRenderPreflightTargetStepToGuidedFlowStep(
  targetStep: StudioRenderPreflightTargetStep
): StudioGuidedFlowStep {
  if (targetStep === "script") return 1;
  if (targetStep === "audio") return 1;
  if (targetStep === "image") return 2;
  if (targetStep === "caption_audio") return 3;
  return 4;
}

export function getRenderPreflightTargetStepLabel(targetStep: StudioRenderPreflightTargetStep): string {
  if (targetStep === "script") return "대본";
  if (targetStep === "audio") return "음성";
  if (targetStep === "image") return "이미지";
  if (targetStep === "caption_audio") return "자막·오디오";
  return "검수·렌더";
}

export function getRenderPreflightIssueLocationLabel(issue: StudioRenderPreflightIssue): string {
  const parts = [getRenderPreflightTargetStepLabel(issue.targetStep)];
  if (typeof issue.slideIndex === "number") parts.push(`슬라이드 ${issue.slideIndex + 1}`);
  if (typeof issue.segmentIndex === "number") parts.push(`문장 ${issue.segmentIndex + 1}`);
  return parts.join(" · ");
}

export function getRenderPreflightIssueFixTarget(issue: StudioRenderPreflightIssue): StudioRenderPreflightIssueFixTarget {
  const step = mapRenderPreflightTargetStepToGuidedFlowStep(issue.targetStep);
  const locationLabel = getRenderPreflightIssueLocationLabel(issue);
  return {
    step,
    label: `${step}단계 ${getRenderPreflightTargetStepLabel(issue.targetStep)}에서 수정`,
    locationLabel,
  };
}
