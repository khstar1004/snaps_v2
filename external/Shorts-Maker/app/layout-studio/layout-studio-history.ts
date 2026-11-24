"use client";

import { useCallback, useState, type MutableRefObject } from "react";
import {
  type EditorHistorySnapshot,
  serializeEditorHistorySnapshot,
} from "@/app/layout-studio/layout-studio-helpers";

const MAX_LAYOUT_STUDIO_HISTORY_ENTRIES = 80;

export function appendLayoutStudioHistorySnapshot(
  stack: EditorHistorySnapshot[],
  snapshot: EditorHistorySnapshot
): EditorHistorySnapshot[] {
  const snapshotSignature = serializeEditorHistorySnapshot(snapshot);
  const last = stack[stack.length - 1];
  if (last && serializeEditorHistorySnapshot(last) === snapshotSignature) {
    return stack;
  }
  return [...stack.slice(-(MAX_LAYOUT_STUDIO_HISTORY_ENTRIES - 1)), snapshot];
}

export function popLayoutStudioHistorySnapshot(
  stack: EditorHistorySnapshot[]
): { nextStack: EditorHistorySnapshot[]; snapshotToApply: EditorHistorySnapshot } | null {
  if (stack.length <= 0) return null;
  return {
    nextStack: stack.slice(0, -1),
    snapshotToApply: stack[stack.length - 1]!,
  };
}

type UseLayoutStudioEditorHistoryOptions = {
  applyHistorySnapshot: (snapshot: EditorHistorySnapshot) => void;
  canEditSelectedCategory: boolean;
  createHistorySnapshot: () => EditorHistorySnapshot;
  isApplyingHistoryRef: MutableRefObject<boolean>;
  selectedCategoryPermissionMessage: string;
  setHasPendingPresetChanges: (value: boolean) => void;
  setMessage: (value: string) => void;
};

export function useLayoutStudioEditorHistory(options: UseLayoutStudioEditorHistoryOptions) {
  const {
    applyHistorySnapshot,
    canEditSelectedCategory,
    createHistorySnapshot,
    isApplyingHistoryRef,
    selectedCategoryPermissionMessage,
    setHasPendingPresetChanges,
    setMessage,
  } = options;
  const [undoStack, setUndoStack] = useState<EditorHistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EditorHistorySnapshot[]>([]);

  const pushHistorySnapshot = useCallback(() => {
    if (isApplyingHistoryRef.current) return;
    const snapshot = createHistorySnapshot();
    setUndoStack((prev) => appendLayoutStudioHistorySnapshot(prev, snapshot));
    setRedoStack([]);
  }, [createHistorySnapshot, isApplyingHistoryRef]);

  const resetHistory = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const undoEditorChange = useCallback(() => {
    if (!canEditSelectedCategory) {
      setMessage(selectedCategoryPermissionMessage || "선택한 콘텐츠 프로필은 편집 권한이 없습니다.");
      return;
    }
    setUndoStack((prev) => {
      const transition = popLayoutStudioHistorySnapshot(prev);
      if (!transition) return prev;
      const current = createHistorySnapshot();
      isApplyingHistoryRef.current = true;
      setRedoStack((redoPrev) => appendLayoutStudioHistorySnapshot(redoPrev, current));
      applyHistorySnapshot(transition.snapshotToApply);
      queueMicrotask(() => {
        isApplyingHistoryRef.current = false;
      });
      setHasPendingPresetChanges(true);
      setMessage("이전 편집 상태로 되돌렸습니다. 저장 버튼을 눌러 확정하세요.");
      return transition.nextStack;
    });
  }, [
    applyHistorySnapshot,
    canEditSelectedCategory,
    createHistorySnapshot,
    isApplyingHistoryRef,
    selectedCategoryPermissionMessage,
    setHasPendingPresetChanges,
    setMessage,
  ]);

  const redoEditorChange = useCallback(() => {
    if (!canEditSelectedCategory) {
      setMessage(selectedCategoryPermissionMessage || "선택한 콘텐츠 프로필은 편집 권한이 없습니다.");
      return;
    }
    setRedoStack((prev) => {
      const transition = popLayoutStudioHistorySnapshot(prev);
      if (!transition) return prev;
      const current = createHistorySnapshot();
      isApplyingHistoryRef.current = true;
      setUndoStack((undoPrev) => appendLayoutStudioHistorySnapshot(undoPrev, current));
      applyHistorySnapshot(transition.snapshotToApply);
      queueMicrotask(() => {
        isApplyingHistoryRef.current = false;
      });
      setHasPendingPresetChanges(true);
      setMessage("되돌린 편집을 다시 적용했습니다. 저장 버튼을 눌러 확정하세요.");
      return transition.nextStack;
    });
  }, [
    applyHistorySnapshot,
    canEditSelectedCategory,
    createHistorySnapshot,
    isApplyingHistoryRef,
    selectedCategoryPermissionMessage,
    setHasPendingPresetChanges,
    setMessage,
  ]);

  return {
    pushHistorySnapshot,
    redoEditorChange,
    redoStack,
    resetHistory,
    undoEditorChange,
    undoStack,
  };
}
