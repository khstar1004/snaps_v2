import type { StudioGuidedFlowStep } from "./studio-guided-flow";

export type StudioGuidedStagePrimaryAction =
  | "go-to-image"
  | "prepare-images"
  | "prepare-incomplete-images"
  | "retry-failed-images"
  | "approve-images"
  | "go-to-caption-audio"
  | "go-to-review"
  | null;

export type StudioGuidedStagePresentation = {
  blocked: boolean;
  blockReason: string | null;
  recoveryStep: StudioGuidedFlowStep | null;
  recoveryLabel: string | null;
  primaryAction: StudioGuidedStagePrimaryAction;
  primaryLabel: string | null;
};

export type StudioGuidedStagePresentationInput = {
  step: StudioGuidedFlowStep;
  imageSource?: "crawl-only" | "manual-ai-prompt" | "auto-ai-generate";
  isJsonValid: boolean;
  hasPreparedSlides: boolean;
  imagesComplete?: boolean;
  imagePreparationHasFailures?: boolean;
  imageApproved: boolean;
};

function blocked(
  blockReason: string,
  recoveryStep: StudioGuidedFlowStep,
  recoveryLabel: string
): StudioGuidedStagePresentation {
  return {
    blocked: true,
    blockReason,
    recoveryStep,
    recoveryLabel,
    primaryAction: null,
    primaryLabel: null,
  };
}

function ready(
  primaryAction: StudioGuidedStagePrimaryAction,
  primaryLabel: string | null
): StudioGuidedStagePresentation {
  return {
    blocked: false,
    blockReason: null,
    recoveryStep: null,
    recoveryLabel: null,
    primaryAction,
    primaryLabel,
  };
}

export function resolveStudioGuidedStagePresentation(
  input: StudioGuidedStagePresentationInput
): StudioGuidedStagePresentation {
  if (input.step === 1) {
    return ready(input.isJsonValid ? "go-to-image" : null, input.isJsonValid ? "이미지 단계로" : null);
  }

  if (!input.isJsonValid) {
    return blocked("대본과 장면 구조를 먼저 준비해 주세요.", 1, "대본 단계로");
  }

  if (input.step === 2) {
    if (!input.hasPreparedSlides) {
      return ready(
        "prepare-images",
        input.imageSource === "manual-ai-prompt"
          ? "이미지 프롬프트 준비"
          : input.imageSource === "auto-ai-generate"
            ? "이미지 자동 생성"
            : "이미지 후보 준비"
      );
    }
    if (input.imagesComplete === false) {
      return input.imagePreparationHasFailures
        ? ready("retry-failed-images", "실패 장면 재시도")
        : ready("prepare-incomplete-images", "미완료 장면 준비");
    }
    if (!input.imageApproved && input.imageSource !== "auto-ai-generate") {
      return ready("approve-images", "후보 승인");
    }
    return ready("go-to-caption-audio", "자막·오디오 단계로");
  }

  if (!input.hasPreparedSlides) {
    return blocked("이미지 후보를 먼저 준비해 주세요.", 2, "이미지 단계로");
  }

  if (!input.imageApproved) {
    return blocked("이미지 확인을 먼저 완료해 주세요.", 2, "이미지 단계로");
  }

  if (input.step === 3) {
    return ready("go-to-review", "검수 시작");
  }

  return ready(null, null);
}
