"use client";

import { useMemo } from "react";
import type { PreparedSlide } from "@/types/studio-json";

type PreviewTimingState = {
  slides: PreparedSlide[];
  frameDurationsSec: number[];
} | null;

type ProgressStep = {
  key: "input" | "preview" | "draft" | "final" | "library";
  label: string;
  done: boolean;
};

export type StudioRenderPrimaryAction = {
  kind: "prepare" | "render_draft" | "run_preflight" | "fix_blockers" | "render_final" | "complete";
  label: string;
  disabled: boolean;
  disabledReason?: string;
};

type UseStudioRenderPublishViewModelInput = {
  applyPublishTitleToSlidesAction: (slides: PreparedSlide[], publishTitle: string) => PreparedSlide[];
  displaySlides: PreparedSlide[];
  explodeSlidesForPopAction: (slides: PreparedSlide[]) => PreparedSlide[];
  hasUploadedAsset: boolean;
  isJsonValid: boolean;
  finalNeedsRefresh: boolean;
  previewTiming: PreviewTimingState;
  publishTitle: string;
  renderNeedsRefresh: boolean;
  slides: PreparedSlide[];
  uploadedVideoUrl: string | null;
  videoUrl: string | null;
};

export function resolveStudioRenderReadiness(input: {
  renderNeedsRefresh: boolean;
  finalNeedsRefresh: boolean;
  uploadedVideoUrl: string | null;
  videoUrl: string | null;
}) {
  const hasDraftVideo = Boolean(input.videoUrl);
  const hasFinalVideo = Boolean(input.uploadedVideoUrl);
  const draftIsCurrent = hasDraftVideo && !input.renderNeedsRefresh;
  const finalIsCurrent = hasFinalVideo && !input.finalNeedsRefresh;
  return {
    hasDraftVideo,
    hasFinalVideo,
    draftIsCurrent,
    finalIsCurrent,
    hasRenderedVideo: draftIsCurrent || finalIsCurrent,
  };
}

export function resolveStudioRenderStageCopy(input: {
  hasDraftVideo: boolean;
  hasFinalVideo: boolean;
  renderNeedsRefresh: boolean;
  finalNeedsRefresh: boolean;
}): { label: string; description: string } {
  if (input.renderNeedsRefresh && input.hasFinalVideo) {
    return {
      label: "확인본·최종 영상 다시 필요",
      description: "대본·음성·이미지 또는 효과음이 변경되었습니다. 이전 결과는 비교용으로 유지되며, 현재 내용으로 1차 확인본부터 다시 검수하세요.",
    };
  }
  if (input.renderNeedsRefresh && input.hasDraftVideo) {
    return {
      label: "확인본 다시 필요",
      description: "설정이 변경되어 기존 확인본은 최신 상태가 아닙니다. 1차 확인본을 다시 제작해 변경 내용을 검수하세요.",
    };
  }
  if (input.finalNeedsRefresh && input.hasFinalVideo) {
    return {
      label: "최종 영상 다시 필요",
      description: "1차 확인본은 현재 내용과 일치합니다. 이전 최종본은 비교용으로 유지되며, 사전검사 후 BGM을 반영한 최종 영상만 다시 제작하세요.",
    };
  }
  if (input.hasFinalVideo) {
    return {
      label: "최종 영상 완료",
      description: "확인본 검수를 통과한 구성에 BGM까지 포함해 로컬 라이브러리에 등록된 최종 MP4입니다.",
    };
  }
  if (input.hasDraftVideo) {
    return {
      label: "1차 확인본 준비됨",
      description: "현재 영상은 나레이션, 자막, 배속, 효과음이 적용된 확인본입니다. 컨펌 후 BGM까지 포함한 최종 영상 제작을 진행하세요.",
    };
  }
  return {
    label: "확인본 대기",
    description: "미리보기를 준비한 뒤 1차 확인본을 먼저 제작하면 나레이션, 자막, 배속, 효과음을 실제 MP4로 검토할 수 있습니다. BGM은 최종 렌더에서 합칩니다.",
  };
}

export function resolveStudioRenderPrimaryAction(input: {
  isJsonValid: boolean;
  hasPreparedSlides: boolean;
  hasDraftVideo: boolean;
  draftNeedsRefresh: boolean;
  preflightHasRun: boolean;
  preflightBlockerCount: number;
  hasFinalVideo: boolean;
  finalNeedsRefresh: boolean;
}): StudioRenderPrimaryAction {
  if (!input.isJsonValid || !input.hasPreparedSlides) {
    return {
      kind: "prepare",
      label: input.hasPreparedSlides ? "미리보기 다시 준비" : "미리보기 만들기",
      disabled: !input.isJsonValid,
      disabledReason: !input.isJsonValid ? "대본과 장면 구조를 먼저 준비해 주세요." : undefined,
    };
  }
  if (!input.hasDraftVideo || input.draftNeedsRefresh) {
    return {
      kind: "render_draft",
      label: input.hasDraftVideo ? "미리보기 업데이트" : "미리보기 만들기",
      disabled: false,
    };
  }
  if (!input.preflightHasRun) {
    return {
      kind: "run_preflight",
      label: "사전검사",
      disabled: false,
    };
  }
  if (input.preflightBlockerCount > 0) {
    return {
      kind: "fix_blockers",
      label: `차단 ${input.preflightBlockerCount}건 해결`,
      disabled: true,
      disabledReason: "차단 항목을 수정한 뒤 사전검사를 다시 실행해 주세요.",
    };
  }
  if (!input.hasFinalVideo || input.finalNeedsRefresh) {
    return {
      kind: "render_final",
      label: input.hasFinalVideo ? "최종 렌더 다시 시도" : "최종 렌더",
      disabled: false,
    };
  }
  return {
    kind: "complete",
    label: "완성 영상 보기",
    disabled: false,
  };
}

export function useStudioRenderPublishViewModel(input: UseStudioRenderPublishViewModelInput) {
  const hasPreparedSlides = input.slides.length > 0;
  const {
    hasDraftVideo,
    hasFinalVideo: hasStoredFinalVideo,
    draftIsCurrent,
    finalIsCurrent,
    hasRenderedVideo,
  } = resolveStudioRenderReadiness(input);

  const previewPlayerSlides = useMemo(() => {
    if (input.previewTiming && input.previewTiming.slides.length > 0) {
      return input.applyPublishTitleToSlidesAction(input.previewTiming.slides, input.publishTitle);
    }
    return input.explodeSlidesForPopAction(input.displaySlides);
  }, [input]);

  const previewPlayerFrameDurations = useMemo(() => {
    if (!input.previewTiming || input.previewTiming.frameDurationsSec.length !== previewPlayerSlides.length) return undefined;
    return input.previewTiming.frameDurationsSec;
  }, [input.previewTiming, previewPlayerSlides.length]);

  const renderStateLabel = useMemo(() => {
    if (input.renderNeedsRefresh) return "렌더 다시 필요";
    if (input.finalNeedsRefresh && hasStoredFinalVideo) return "최종 영상 다시 필요";
    if (finalIsCurrent) return "최종 영상 최신";
    if (draftIsCurrent) return "확인본 준비됨";
    if (hasPreparedSlides) return "렌더 전";
    return "미리보기 전";
  }, [draftIsCurrent, finalIsCurrent, hasPreparedSlides, hasStoredFinalVideo, input.finalNeedsRefresh, input.renderNeedsRefresh]);

  const renderStateTone = useMemo<"neutral" | "warning" | "success">(() => {
    if (input.renderNeedsRefresh || (input.finalNeedsRefresh && hasStoredFinalVideo)) return "warning";
    if (finalIsCurrent) return "success";
    return "neutral";
  }, [finalIsCurrent, hasStoredFinalVideo, input.finalNeedsRefresh, input.renderNeedsRefresh]);

  const publishStepEnabled = input.hasUploadedAsset;
  const beginnerStepIndex = !input.isJsonValid ? 1 : !hasPreparedSlides ? 2 : !hasRenderedVideo ? 3 : !finalIsCurrent ? 4 : 5;
  const nextActionGuide = !input.isJsonValid
    ? "다음 행동: 대본을 입력하고 장면 구조를 만들어 주세요."
    : !hasPreparedSlides
      ? "다음 행동: 미리보기 만들기로 슬라이드를 준비하세요."
      : !hasRenderedVideo
        ? "다음 행동: 1차 확인본 제작하기를 눌러 나레이션, 자막, 배속, 효과음 확인용 영상을 만드세요."
        : !finalIsCurrent
          ? "다음 행동: 확인본을 검토하고 사전검사를 통과한 뒤 최종 MP4를 만드세요."
          : "다음 행동: 완성 영상을 재생하거나 라이브러리에서 다시 열어 보세요.";
  const prepareButtonLabel = hasPreparedSlides ? "미리보기 다시 만들기" : "미리보기 만들기";
  const renderButtonLabel = hasStoredFinalVideo
    ? "최종 영상 다시 제작하기"
    : hasRenderedVideo
      ? "최종 영상 제작하기"
      : hasDraftVideo
        ? "1차 확인본 다시 제작하기"
        : "1차 확인본 제작하기";
  const renderStageCopy = resolveStudioRenderStageCopy({
    hasDraftVideo,
    hasFinalVideo: hasStoredFinalVideo,
    renderNeedsRefresh: input.renderNeedsRefresh,
    finalNeedsRefresh: input.finalNeedsRefresh,
  });
  const renderStageLabel = renderStageCopy.label;
  const renderStageDescription = renderStageCopy.description;

  const progressSteps = useMemo<ProgressStep[]>(
    () => [
      { key: "input", label: "1. 입력", done: input.isJsonValid },
      { key: "preview", label: "2. 미리보기", done: hasPreparedSlides },
      { key: "draft", label: "3. 확인본", done: hasRenderedVideo },
      { key: "final", label: "4. 최종 영상", done: finalIsCurrent },
      { key: "library", label: "5. 라이브러리", done: finalIsCurrent },
    ],
    [finalIsCurrent, hasPreparedSlides, hasRenderedVideo, input.isJsonValid]
  );

  const activeProgressStep = useMemo(() => {
    const firstPending = progressSteps.find((step) => !step.done);
    return firstPending?.key || "library";
  }, [progressSteps]);

  return {
    hasPreparedSlides,
    hasRenderedVideo,
    hasFinalVideo: finalIsCurrent,
    previewPlayerSlides,
    previewPlayerFrameDurations,
    renderStateLabel,
    renderStateTone,
    publishStepEnabled,
    beginnerStepIndex,
    nextActionGuide,
    prepareButtonLabel,
    renderButtonLabel,
    renderStageLabel,
    renderStageDescription,
    progressSteps,
    activeProgressStep,
  };
}
