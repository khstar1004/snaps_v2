export type StudioAutosaveStatus = "loading" | "ready" | "saving" | "saved" | "error";

export type StudioAutosaveState = {
  status: StudioAutosaveStatus;
  savedAtMs: number;
  pendingVersion: number;
  savedVersion: number;
  errorMessage: string;
};

export type StudioAutosavePresentation = {
  label: string;
  tone: "neutral" | "saving" | "success" | "error";
  canRetry: boolean;
};

export type StudioAutosaveNavigationClickInput = {
  hasPendingDraft: boolean;
  defaultPrevented?: boolean;
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  origin: string;
  currentPathname: string;
  currentSearch: string;
  href: string;
  target?: string | null;
  download?: boolean;
};

export const INITIAL_STUDIO_AUTOSAVE_STATE: StudioAutosaveState = {
  status: "loading",
  savedAtMs: 0,
  pendingVersion: 0,
  savedVersion: 0,
  errorMessage: "",
};

export function createHydratedStudioAutosaveState(savedAtMs: number): StudioAutosaveState {
  const normalizedSavedAtMs = Number.isFinite(savedAtMs) && savedAtMs > 0 ? Math.floor(savedAtMs) : 0;
  return {
    status: normalizedSavedAtMs > 0 ? "saved" : "ready",
    savedAtMs: normalizedSavedAtMs,
    pendingVersion: 0,
    savedVersion: 0,
    errorMessage: "",
  };
}

export function markStudioAutosavePending(
  current: StudioAutosaveState,
  pendingVersion: number
): StudioAutosaveState {
  return {
    ...current,
    status: "saving",
    pendingVersion,
    errorMessage: "",
  };
}

export function resolveStudioAutosaveWriteSuccess(input: {
  current: StudioAutosaveState;
  writeVersion: number;
  latestVersion: number;
  savedAtMs: number;
}): StudioAutosaveState {
  if (input.writeVersion < input.latestVersion) {
    return {
      ...input.current,
      status: "saving",
      pendingVersion: input.latestVersion,
    };
  }
  return {
    status: "saved",
    savedAtMs: Math.max(0, Math.floor(input.savedAtMs)),
    pendingVersion: input.latestVersion,
    savedVersion: input.writeVersion,
    errorMessage: "",
  };
}

export function resolveStudioAutosaveWriteFailure(input: {
  current: StudioAutosaveState;
  pendingVersion: number;
  error: unknown;
}): StudioAutosaveState {
  const message = input.error instanceof Error ? input.error.message : String(input.error || "");
  return {
    ...input.current,
    status: "error",
    pendingVersion: input.pendingVersion,
    errorMessage: message || "자동 저장에 실패했습니다.",
  };
}

export function formatStudioAutosaveTime(savedAtMs: number): string {
  if (!Number.isFinite(savedAtMs) || savedAtMs <= 0) return "";
  return new Date(savedAtMs).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function resolveStudioAutosavePresentation(state: StudioAutosaveState): StudioAutosavePresentation {
  if (state.status === "loading") {
    return {
      label: "저장 상태 확인 중",
      tone: "neutral",
      canRetry: false,
    };
  }
  if (state.status === "saving") {
    return {
      label: "자동 저장 중",
      tone: "saving",
      canRetry: false,
    };
  }
  if (state.status === "saved") {
    const savedAtLabel = formatStudioAutosaveTime(state.savedAtMs);
    return {
      label: savedAtLabel ? `자동 저장됨 ${savedAtLabel}` : "자동 저장됨",
      tone: "success",
      canRetry: false,
    };
  }
  if (state.status === "error") {
    return {
      label: "자동 저장 실패",
      tone: "error",
      canRetry: true,
    };
  }
  return {
    label: "자동 저장 준비됨",
    tone: "neutral",
    canRetry: false,
  };
}

export function shouldInterceptStudioAutosaveNavigation(input: StudioAutosaveNavigationClickInput): boolean {
  if (!input.hasPendingDraft) return false;
  if (input.defaultPrevented) return false;
  if (typeof input.button === "number" && input.button !== 0) return false;
  if (input.metaKey || input.ctrlKey || input.shiftKey || input.altKey) return false;
  if (input.download) return false;
  const target = String(input.target || "").trim().toLowerCase();
  if (target && target !== "_self") return false;

  let url: URL;
  try {
    url = new URL(input.href, input.origin);
  } catch {
    return false;
  }
  if (url.origin !== input.origin) return false;
  if (url.pathname === input.currentPathname && url.search === input.currentSearch && url.hash) return false;
  return true;
}
