"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { trackWorkflowEvent } from "@/lib/telemetry/client";
import type { PublishCategory } from "@/lib/publish/types";
import type { PreparedSlide } from "@/types/studio-json";
import type { StudioHistoryEntry, StudioWorkDraft } from "./types";
import type { StudioHistoryCaptureInput } from "./use-studio-history";
import { getSuggestedStudioWorkName, hasStudioWorkContent } from "./studio-history-panel-helpers";

export type HistoryCaptureScheduleOptions = {
  debounceMs?: number;
};

type PreviewTimingLike = {
  frameDurationsSec: number[];
} | null;

type UseStudioHistoryPanelStateInput = {
  activeHistoryId: string | null;
  captureHistory: (input: StudioHistoryCaptureInput) => string;
  clearHistory: () => void;
  deleteHistory: (id: string) => void;
  ensureEditPermission: (showAlert?: boolean) => boolean;
  historyDraft: StudioWorkDraft;
  historyEntries: StudioHistoryEntry[];
  jsonText: string;
  previewTiming: PreviewTimingLike;
  preselectedMediaItemCount: number;
  publishCategory: PublishCategory;
  publishTitle: string;
  renderStatus: string;
  restoreHistory: (id: string) => void;
  scriptText: string;
  setBrandingPanelOpen: Dispatch<SetStateAction<boolean>>;
  setWorkName: Dispatch<SetStateAction<string>>;
  slides: PreparedSlide[];
  topicText: string;
  uploadedVideoUrl: string | null;
  videoUrl: string | null;
  workName: string;
};

export function useStudioHistoryPanelState(input: UseStudioHistoryPanelStateInput) {
  const {
    activeHistoryId,
    captureHistory,
    clearHistory,
    deleteHistory,
    ensureEditPermission,
    historyDraft,
    historyEntries,
    jsonText,
    previewTiming,
    preselectedMediaItemCount,
    publishCategory,
    publishTitle,
    renderStatus,
    restoreHistory,
    scriptText,
    setBrandingPanelOpen,
    setWorkName,
    slides,
    topicText,
    uploadedVideoUrl,
    videoUrl,
    workName,
  } = input;
  const [historyPanelVisible, setHistoryPanelVisible] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const pendingHistoryLabelRef = useRef<string | null>(null);
  const pendingHistoryReadyRef = useRef(false);
  const pendingHistoryTimerRef = useRef<number | null>(null);
  const [historyCaptureRevision, setHistoryCaptureRevision] = useState(0);

  useEffect(() => {
    if (historyEntries.length === 0) {
      setSelectedHistoryId(null);
      return;
    }
    if (selectedHistoryId && historyEntries.some((entry) => entry.id === selectedHistoryId)) return;
    setSelectedHistoryId(
      activeHistoryId && historyEntries.some((entry) => entry.id === activeHistoryId)
        ? activeHistoryId
        : historyEntries[0]?.id || null
    );
  }, [activeHistoryId, historyEntries, selectedHistoryId]);

  const closeHistoryPanel = useCallback(() => {
    setHistoryPanelVisible(false);
  }, []);

  const openHistoryPanel = useCallback(
    (preferredHistoryId?: string | null) => {
      setBrandingPanelOpen(false);
      setHistoryPanelVisible(true);
      setSelectedHistoryId((current) => {
        if (preferredHistoryId) return preferredHistoryId;
        if (current && historyEntries.some((entry) => entry.id === current)) return current;
        if (activeHistoryId && historyEntries.some((entry) => entry.id === activeHistoryId)) {
          return activeHistoryId;
        }
        return historyEntries[0]?.id || null;
      });
    },
    [activeHistoryId, historyEntries, setBrandingPanelOpen]
  );

  const toggleHistoryPanel = useCallback(() => {
    if (historyPanelVisible) {
      closeHistoryPanel();
      return;
    }
    openHistoryPanel();
  }, [closeHistoryPanel, historyPanelVisible, openHistoryPanel]);

  const selectHistorySnapshot = useCallback((snapshotId: string) => {
    setSelectedHistoryId(snapshotId);
  }, []);

  const clearSelectedHistorySnapshot = useCallback(() => {
    setSelectedHistoryId(null);
  }, []);

  const scheduleHistoryCapture = useCallback((label: string, options?: HistoryCaptureScheduleOptions) => {
    pendingHistoryLabelRef.current = label.trim() || "자동 저장";
    if (pendingHistoryTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(pendingHistoryTimerRef.current);
      pendingHistoryTimerRef.current = null;
    }

    const debounceMs = Math.max(0, Math.round(Number(options?.debounceMs) || 0));
    if (debounceMs > 0 && typeof window !== "undefined") {
      pendingHistoryTimerRef.current = window.setTimeout(() => {
        pendingHistoryTimerRef.current = null;
        pendingHistoryReadyRef.current = true;
        setHistoryCaptureRevision((current) => current + 1);
      }, debounceMs);
      return;
    }

    pendingHistoryReadyRef.current = true;
    setHistoryCaptureRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    return () => {
      if (pendingHistoryTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(pendingHistoryTimerRef.current);
        pendingHistoryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingHistoryReadyRef.current || !pendingHistoryLabelRef.current) return;
    const label = pendingHistoryLabelRef.current;
    pendingHistoryReadyRef.current = false;
    pendingHistoryLabelRef.current = null;
    captureHistory(label);
  }, [captureHistory, historyCaptureRevision]);

  const hasCurrentWorkContent = useMemo(
    () =>
      hasStudioWorkContent({
        topicText,
        scriptText,
        jsonText,
        slides,
        preselectedMediaItemCount,
        previewTiming,
        videoUrl,
        uploadedVideoUrl,
        renderStatus,
      }),
    [
      jsonText,
      preselectedMediaItemCount,
      previewTiming,
      renderStatus,
      scriptText,
      slides,
      topicText,
      uploadedVideoUrl,
      videoUrl,
    ]
  );

  const getSuggestedWorkName = useCallback(
    () =>
      getSuggestedStudioWorkName({
        workName,
        publishTitle,
        slides,
        topicText,
        scriptText,
        publishCategory,
      }),
    [publishCategory, publishTitle, scriptText, slides, topicText, workName]
  );

  const handleSaveCurrentSnapshot = useCallback(() => {
    if (!ensureEditPermission()) return;
    if (!hasCurrentWorkContent) {
      alert("저장할 작업 내용이 없습니다.");
      return;
    }
    const snapshotWorkName = workName.trim() || getSuggestedWorkName();
    const snapshotId = captureHistory({
      label: `수동 저장 · ${snapshotWorkName}`,
      kind: "manual",
      reason: "manual_save",
      draftOverride: {
        ...historyDraft,
        workName: snapshotWorkName,
      },
    });
    if (!workName.trim()) {
      setWorkName(snapshotWorkName);
    }
    setSelectedHistoryId(snapshotId);
  }, [captureHistory, ensureEditPermission, getSuggestedWorkName, hasCurrentWorkContent, historyDraft, setWorkName, workName]);

  const confirmSaveBeforeResettingCurrentProject = useCallback(() => {
    if (!hasCurrentWorkContent) return true;
    if (typeof window === "undefined") {
      const fallbackWorkName = getSuggestedWorkName();
      captureHistory({
        label: `수동 저장 · ${fallbackWorkName}`,
        kind: "manual",
        reason: "manual_save",
        draftOverride: {
          ...historyDraft,
          workName: fallbackWorkName,
        },
      });
      setWorkName(fallbackWorkName);
      return true;
    }

    const shouldSave = window.confirm(
      "현재 프로젝트를 저장한 뒤 초기화할까요?\n확인을 누르면 작업 이름을 입력하고 저장합니다."
    );
    if (shouldSave) {
      const promptedWorkName = window.prompt("저장할 작업 이름을 입력해 주세요.", getSuggestedWorkName());
      if (promptedWorkName === null) return false;
      const normalizedWorkName = promptedWorkName.trim();
      if (!normalizedWorkName) {
        alert("작업 이름을 입력해 주세요.");
        return false;
      }
      captureHistory({
        label: `수동 저장 · ${normalizedWorkName}`,
        kind: "manual",
        reason: "manual_save",
        draftOverride: {
          ...historyDraft,
          workName: normalizedWorkName,
        },
      });
      setWorkName(normalizedWorkName);
      return true;
    }

    return window.confirm(
      "저장하지 않고 현재 프로젝트를 초기화할까요?\n현재 프로젝트의 이어쓰기 초안과 렌더 결과가 삭제됩니다."
    );
  }, [captureHistory, getSuggestedWorkName, hasCurrentWorkContent, historyDraft, setWorkName]);

  const handleRestoreHistorySnapshot = useCallback(
    (snapshotId: string) => {
      if (!ensureEditPermission()) return;
      const target = historyEntries.find((entry) => entry.id === snapshotId);
      trackWorkflowEvent({
        name: "snapshot_restore_clicked",
        page: "studio",
        stage: "history",
        status: "success",
      });
      if (!target) {
        trackWorkflowEvent({
          name: "snapshot_restore_failed",
          page: "studio",
          stage: "history",
          status: "failure",
          detail: "snapshot_not_found",
        });
        return;
      }
      restoreHistory(snapshotId);
      setSelectedHistoryId(snapshotId);
      trackWorkflowEvent({
        name: "snapshot_restore_succeeded",
        page: "studio",
        stage: "history",
        status: "success",
        detail: `${target.label}, created_at=${target.createdAt}`,
      });
    },
    [ensureEditPermission, historyEntries, restoreHistory]
  );

  const handleDeleteHistorySnapshot = useCallback(
    (snapshotId: string) => {
      if (!ensureEditPermission()) return;
      deleteHistory(snapshotId);
      setSelectedHistoryId((current) => (current === snapshotId ? null : current));
    },
    [deleteHistory, ensureEditPermission]
  );

  const handleClearHistory = useCallback(() => {
    if (!ensureEditPermission()) return;
    clearHistory();
    setSelectedHistoryId(null);
  }, [clearHistory, ensureEditPermission]);

  return {
    historyPanelVisible,
    selectedHistoryId,
    openHistoryPanel,
    toggleHistoryPanel,
    closeHistoryPanel,
    selectHistorySnapshot,
    clearSelectedHistorySnapshot,
    scheduleHistoryCapture,
    handleSaveCurrentSnapshot,
    confirmSaveBeforeResettingCurrentProject,
    handleRestoreHistorySnapshot,
    handleDeleteHistorySnapshot,
    handleClearHistory,
  };
}
