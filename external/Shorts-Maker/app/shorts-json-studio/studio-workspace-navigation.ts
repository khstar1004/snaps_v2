import type { PreparedSlide } from "@/types/studio-json";
import { buildStudioPreviewSlideGroups } from "./studio-preview-panel-helpers";
import type { StudioGuidedFlowStep } from "./studio-guided-flow";
import type { StudioRenderPreflightIssue } from "./studio-render-preflight";

export type StudioWorkspaceNavigationTone = "neutral" | "success" | "warning" | "error";

export type StudioWorkspaceNavigationItem = {
  key: string;
  groupIndex: number;
  indexes: number[];
  representativeIndex: number;
  title: string;
  detail: string;
  statusLabel: string;
  tone: StudioWorkspaceNavigationTone;
};

export type StudioWorkspaceNavigationInput = {
  step: StudioGuidedFlowStep;
  slides: PreparedSlide[];
  imageApproved: boolean;
  preflightIssues: StudioRenderPreflightIssue[];
};

export type StudioWorkspaceNavigationSlideSourceInput = {
  preparedSlides: PreparedSlide[];
  scriptJsonText: string;
};

export type StudioWorkspaceIssueGroup = {
  targetStep: StudioRenderPreflightIssue["targetStep"];
  label: string;
  issues: StudioRenderPreflightIssue[];
};

const STUDIO_WORKSPACE_ISSUE_TARGETS: Array<{
  targetStep: StudioRenderPreflightIssue["targetStep"];
  label: string;
}> = [
  { targetStep: "script", label: "대본" },
  { targetStep: "audio", label: "음성" },
  { targetStep: "image", label: "이미지" },
  { targetStep: "caption_audio", label: "자막·오디오" },
  { targetStep: "review_render", label: "검수·렌더" },
];

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasVisualAsset(slide: PreparedSlide): boolean {
  if (hasText(slide.imageUrl) || hasText(slide.resolvedImageUrl) || hasText(slide.mediaUrl)) return true;
  return (slide.imageBeats || []).some(
    (beat) => hasText(beat?.imageUrl) || hasText(beat?.resolvedImageUrl) || hasText(beat?.mediaUrl)
  );
}

export function resolveStudioWorkspaceNavigationSlides(
  input: StudioWorkspaceNavigationSlideSourceInput
): PreparedSlide[] {
  if (input.preparedSlides.length > 0) return input.preparedSlides;
  try {
    const parsed = JSON.parse(input.scriptJsonText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const slides = (parsed as Record<string, unknown>).slides;
    if (!Array.isArray(slides)) return [];
    return slides.filter(
      (slide): slide is PreparedSlide =>
        Boolean(slide) && typeof slide === "object" && !Array.isArray(slide)
    );
  } catch {
    return [];
  }
}

export function groupStudioWorkspaceIssuesByTarget(
  issues: StudioRenderPreflightIssue[]
): StudioWorkspaceIssueGroup[] {
  return STUDIO_WORKSPACE_ISSUE_TARGETS.flatMap(({ targetStep, label }) => {
    const groupedIssues = issues.filter((issue) => issue.targetStep === targetStep);
    return groupedIssues.length > 0 ? [{ targetStep, label, issues: groupedIssues }] : [];
  });
}

function getLineCount(slides: PreparedSlide[]): number {
  return slides.reduce((total, slide) => {
    if (Array.isArray(slide.dialogueSegments) && slide.dialogueSegments.length > 0) {
      return total + slide.dialogueSegments.length;
    }
    if (Array.isArray(slide.lines) && slide.lines.length > 0) {
      return total + slide.lines.filter((line) => hasText(line)).length;
    }
    return total + (hasText(slide.narrationText) || hasText(slide.text) ? 1 : 0);
  }, 0);
}

function getSfxCount(slides: PreparedSlide[]): number {
  return slides.reduce((total, slide) => {
    const cueCount = slide.sfxCue?.enabled ? 1 : 0;
    const plannedCount = (slide.sfxPlan || []).filter((cue) => cue?.enabled !== false && hasText(cue?.tag)).length;
    return total + Math.max(cueCount, plannedCount);
  }, 0);
}

function resolveStatus(input: {
  step: StudioGuidedFlowStep;
  slides: PreparedSlide[];
  imageApproved: boolean;
  issues: StudioRenderPreflightIssue[];
}): Pick<StudioWorkspaceNavigationItem, "statusLabel" | "tone"> {
  if (input.step === 1) return { statusLabel: "구조 있음", tone: "success" };
  if (input.step === 2) {
    const hasCompleteVisuals = input.slides.length > 0 && input.slides.every(hasVisualAsset);
    if (!hasCompleteVisuals) return { statusLabel: "생성 필요", tone: "error" };
    return input.imageApproved
      ? { statusLabel: "이미지 승인", tone: "success" }
      : { statusLabel: "이미지 검수", tone: "warning" };
  }
  if (input.step === 3) {
    const sfxCount = getSfxCount(input.slides);
    return sfxCount > 0
      ? { statusLabel: `효과음 ${sfxCount}개`, tone: "success" }
      : { statusLabel: "효과음 없음", tone: "neutral" };
  }
  const blockerCount = input.issues.filter((issue) => issue.severity === "blocker").length;
  if (blockerCount > 0) return { statusLabel: `차단 ${blockerCount}개`, tone: "error" };
  if (input.issues.length > 0) return { statusLabel: `경고 ${input.issues.length}개`, tone: "warning" };
  return { statusLabel: "문제 없음", tone: "success" };
}

export function buildStudioWorkspaceNavigationItems(
  input: StudioWorkspaceNavigationInput
): StudioWorkspaceNavigationItem[] {
  return buildStudioPreviewSlideGroups(input.slides).map((group, groupIndex) => {
    const groupSlides = group.indexes
      .map((index) => input.slides[index])
      .filter((slide): slide is PreparedSlide => Boolean(slide));
    const representativeSlide = input.slides[group.representativeIndex] || groupSlides[0];
    const issues = input.preflightIssues.filter(
      (issue) => typeof issue.slideIndex === "number" && group.indexes.includes(issue.slideIndex)
    );
    const lineCount = getLineCount(groupSlides);
    const frameCount = group.indexes.length;
    const status = resolveStatus({
      step: input.step,
      slides: groupSlides,
      imageApproved: input.imageApproved,
      issues,
    });

    return {
      key: group.key,
      groupIndex,
      indexes: group.indexes,
      representativeIndex: group.representativeIndex,
      title: String(representativeSlide?.title || "").trim() || `장면 ${groupIndex + 1}`,
      detail: `${lineCount}개 라인${frameCount > 1 ? ` · ${frameCount}개 화면` : ""}`,
      ...status,
    };
  });
}

export function findStudioWorkspaceGroupIndexForSlide(
  items: StudioWorkspaceNavigationItem[],
  slideIndex: number | undefined
): number | null {
  if (typeof slideIndex !== "number" || !Number.isInteger(slideIndex)) return null;
  const item = items.find((candidate) => candidate.indexes.includes(slideIndex));
  return item?.groupIndex ?? null;
}
