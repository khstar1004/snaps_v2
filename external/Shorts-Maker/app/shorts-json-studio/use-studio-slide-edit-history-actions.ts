"use client";

import { useCallback } from "react";
import type { ImageSelectionCandidate, SfxTag } from "@/types/studio-json";
import type { HistoryCaptureScheduleOptions } from "./use-studio-history-panel-state";

type SlideLibraryAssetInput = {
  imageUrl: string;
  mediaUrl?: string;
  mediaKind?: "image" | "video" | "animated_image";
  assetId?: string;
  title?: string;
};

type SlideSfxCueInput = {
  enabled: boolean;
  tag: SfxTag;
  gainDb?: number;
  offsetMs?: number;
  source?: "auto" | "manual";
} | null;

type UseStudioSlideEditHistoryActionsInput = {
  ensureEditPermission: (showAlert?: boolean) => boolean;
  historyInputDebounceMs: number;
  handleTitleChangeAction: (value: string) => void;
  handleSlideAddAction: (index: number) => void;
  handleSlideDeleteAction: (index: number) => void;
  handleSlideImageFileChangeAction: (index: number, file: File | null) => Promise<void>;
  handleSlideImageUrlChangeAction: (index: number, value: string) => void;
  handleSlideLibraryAssetApplyAction: (index: number, asset: SlideLibraryAssetInput) => void;
  handleSlideImageCandidateApplyAction: (index: number, candidate: ImageSelectionCandidate) => void;
  handleSlideNarrationTextChangeAction: (index: number, value: string) => void;
  handleSlideSfxCueChangeAction: (index: number, cue: SlideSfxCueInput) => void;
  handleSlideTitleChangeAction: (index: number, value: string) => void;
  handleSlideVoiceChangeAction: (index: number, value: string) => void;
  scheduleHistoryCapture: (label: string, options?: HistoryCaptureScheduleOptions) => void;
};

export function useStudioSlideEditHistoryActions(input: UseStudioSlideEditHistoryActionsInput) {
  const scheduleDebouncedHistoryCapture = useCallback(
    (label: string) => {
      input.scheduleHistoryCapture(label, { debounceMs: input.historyInputDebounceMs });
    },
    [input.historyInputDebounceMs, input.scheduleHistoryCapture]
  );

  const handleTitleChange = useCallback(
    (value: string) => {
      if (!input.ensureEditPermission(false)) return;
      scheduleDebouncedHistoryCapture("제목 수정");
      input.handleTitleChangeAction(value);
    },
    [input.ensureEditPermission, input.handleTitleChangeAction, scheduleDebouncedHistoryCapture]
  );

  const handleSlideImageUrlChange = useCallback(
    (index: number, value: string) => {
      if (!input.ensureEditPermission(false)) return;
      scheduleDebouncedHistoryCapture(`슬라이드 ${index + 1} 이미지 수정`);
      input.handleSlideImageUrlChangeAction(index, value);
    },
    [input.ensureEditPermission, input.handleSlideImageUrlChangeAction, scheduleDebouncedHistoryCapture]
  );

  const handleSlideTitleChange = useCallback(
    (index: number, value: string) => {
      if (!input.ensureEditPermission(false)) return;
      scheduleDebouncedHistoryCapture(`슬라이드 ${index + 1} 제목 수정`);
      input.handleSlideTitleChangeAction(index, value);
    },
    [input.ensureEditPermission, input.handleSlideTitleChangeAction, scheduleDebouncedHistoryCapture]
  );

  const handleSlideImageFileChange = useCallback(
    async (index: number, file: File | null) => {
      if (!input.ensureEditPermission()) return;
      input.scheduleHistoryCapture(`슬라이드 ${index + 1} 이미지 업로드`);
      await input.handleSlideImageFileChangeAction(index, file);
    },
    [input.ensureEditPermission, input.handleSlideImageFileChangeAction, input.scheduleHistoryCapture]
  );

  const handleSlideLibraryAssetApply = useCallback(
    (index: number, asset: SlideLibraryAssetInput) => {
      if (!input.ensureEditPermission(false)) return;
      input.scheduleHistoryCapture(`슬라이드 ${index + 1} 라이브러리 자산 적용`);
      input.handleSlideLibraryAssetApplyAction(index, asset);
    },
    [input.ensureEditPermission, input.handleSlideLibraryAssetApplyAction, input.scheduleHistoryCapture]
  );

  const handleSlideImageCandidateApply = useCallback(
    (index: number, candidate: ImageSelectionCandidate) => {
      if (!input.ensureEditPermission(false)) return;
      input.scheduleHistoryCapture(`슬라이드 ${index + 1} 후보 선택`);
      input.handleSlideImageCandidateApplyAction(index, candidate);
    },
    [input.ensureEditPermission, input.handleSlideImageCandidateApplyAction, input.scheduleHistoryCapture]
  );

  const handleSlideNarrationTextChange = useCallback(
    (index: number, value: string) => {
      if (!input.ensureEditPermission(false)) return;
      scheduleDebouncedHistoryCapture(`슬라이드 ${index + 1} 대본 수정`);
      input.handleSlideNarrationTextChangeAction(index, value);
    },
    [input.ensureEditPermission, input.handleSlideNarrationTextChangeAction, scheduleDebouncedHistoryCapture]
  );

  const handleSlideVoiceChange = useCallback(
    (index: number, value: string) => {
      if (!input.ensureEditPermission(false)) return;
      input.scheduleHistoryCapture(`슬라이드 ${index + 1} 음성 변경`);
      input.handleSlideVoiceChangeAction(index, value);
    },
    [input.ensureEditPermission, input.handleSlideVoiceChangeAction, input.scheduleHistoryCapture]
  );

  const handleSlideDelete = useCallback(
    (index: number) => {
      if (!input.ensureEditPermission()) return;
      input.scheduleHistoryCapture(`슬라이드 ${index + 1} 삭제`);
      input.handleSlideDeleteAction(index);
    },
    [input.ensureEditPermission, input.handleSlideDeleteAction, input.scheduleHistoryCapture]
  );

  const handleSlideAdd = useCallback(
    (index: number) => {
      if (!input.ensureEditPermission()) return;
      input.scheduleHistoryCapture(`슬라이드 ${index + 1} 뒤에 추가`);
      input.handleSlideAddAction(index);
    },
    [input.ensureEditPermission, input.handleSlideAddAction, input.scheduleHistoryCapture]
  );

  const handleSlideSfxCueChange = useCallback(
    (index: number, cue: SlideSfxCueInput) => {
      if (!input.ensureEditPermission(false)) return;
      scheduleDebouncedHistoryCapture(`슬라이드 ${index + 1} SFX 수정`);
      input.handleSlideSfxCueChangeAction(index, cue);
    },
    [input.ensureEditPermission, input.handleSlideSfxCueChangeAction, scheduleDebouncedHistoryCapture]
  );

  return {
    handleTitleChange,
    handleSlideImageUrlChange,
    handleSlideTitleChange,
    handleSlideImageFileChange,
    handleSlideLibraryAssetApply,
    handleSlideImageCandidateApply,
    handleSlideNarrationTextChange,
    handleSlideVoiceChange,
    handleSlideDelete,
    handleSlideAdd,
    handleSlideSfxCueChange,
  };
}
