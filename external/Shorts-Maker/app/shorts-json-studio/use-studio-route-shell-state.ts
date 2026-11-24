"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

const STUDIO_CODEX_AUTO_CONNECT_ATTEMPT_KEY = "studio-codex-auto-connect-attempted-v1";

export type UseStudioRouteShellStateArgs = {
  codexStatusLoaded: boolean;
  codexOauthConnected: boolean;
  setCodexOauthStatus: Dispatch<SetStateAction<string>>;
  setShowJsonEditor: Dispatch<SetStateAction<boolean>>;
};

export type UseStudioRouteShellStateResult = {
  isOnboardingMode: boolean;
};

export function parseStudioRouteShellMode(search: string): UseStudioRouteShellStateResult {
  const params = new URLSearchParams(search);
  return {
    isOnboardingMode: params.get("mode") === "onboarding",
  };
}

export function useStudioRouteShellState({
  codexStatusLoaded,
  codexOauthConnected,
  setCodexOauthStatus,
  setShowJsonEditor,
}: UseStudioRouteShellStateArgs): UseStudioRouteShellStateResult {
  const [isOnboardingMode, setIsOnboardingMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const { isOnboardingMode: nextOnboardingMode } = parseStudioRouteShellMode(window.location.search);
    setIsOnboardingMode(nextOnboardingMode);
  }, []);

  useEffect(() => {
    setShowJsonEditor(!isOnboardingMode);
  }, [isOnboardingMode, setShowJsonEditor]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("codex_oauth") || "";
    if (!oauthStatus) return;
    if (oauthStatus === "connected") {
      setCodexOauthStatus("Codex OAuth 연결이 완료되었습니다.");
    } else {
      setCodexOauthStatus(`Codex OAuth 상태: ${oauthStatus}`);
    }
  }, [setCodexOauthStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!codexStatusLoaded) return;
    if (codexOauthConnected) {
      window.sessionStorage.removeItem(STUDIO_CODEX_AUTO_CONNECT_ATTEMPT_KEY);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.has("codex_oauth")) return;
    const attempted = window.sessionStorage.getItem(STUDIO_CODEX_AUTO_CONNECT_ATTEMPT_KEY) === "1";
    if (attempted) return;
    window.sessionStorage.setItem(STUDIO_CODEX_AUTO_CONNECT_ATTEMPT_KEY, "1");
    window.location.assign("/api/auth/codex/start?next=/shorts-json-studio");
  }, [codexOauthConnected, codexStatusLoaded]);

  return {
    isOnboardingMode,
  };
}
