"use client";

import { useCallback } from "react";

type RenderUsageState = {
  ttsChars: number;
  renderSeconds: number;
};

export type UseStudioPermissionActionsInput = {
  canEditSelectedCategory: boolean;
  canPublishSelectedCategory: boolean;
  setBrandingStatus: (value: string) => void;
  setRenderNeedsRefresh: (value: boolean) => void;
  setRenderStatus: (value: string) => void;
  setRenderUsage: (value: RenderUsageState | null) => void;
  setScriptToJsonStatus: (value: string) => void;
  setTopicToScriptStatus: (value: string) => void;
  studioEditPermissionMessage: string;
  studioPublishPermissionMessage: string;
};

export function useStudioPermissionActions(input: UseStudioPermissionActionsInput) {
  const notifyPermissionBlocked = useCallback(
    (message: string, options?: { alert?: boolean; kind?: "edit" | "publish" }) => {
      if (options?.kind !== "publish") {
        input.setTopicToScriptStatus(message);
        input.setScriptToJsonStatus(message);
        input.setBrandingStatus(message);
      }
      input.setRenderStatus(message);
      if (options?.alert && typeof window !== "undefined") {
        window.alert(message);
      }
    },
    [input]
  );

  const ensureEditPermission = useCallback(
    (alertUser = true) => {
      if (input.canEditSelectedCategory) return true;
      notifyPermissionBlocked(input.studioEditPermissionMessage, { alert: alertUser, kind: "edit" });
      return false;
    },
    [input.canEditSelectedCategory, input.studioEditPermissionMessage, notifyPermissionBlocked]
  );

  const ensurePublishPermission = useCallback(
    (alertUser = true) => {
      if (input.canPublishSelectedCategory) return true;
      notifyPermissionBlocked(input.studioPublishPermissionMessage, { alert: alertUser, kind: "publish" });
      return false;
    },
    [input.canPublishSelectedCategory, input.studioPublishPermissionMessage, notifyPermissionBlocked]
  );

  const markRenderedAssetAsDirty = useCallback(
    (message: string) => {
      input.setRenderNeedsRefresh(true);
      input.setRenderUsage(null);
      input.setRenderStatus(message);
    },
    [input]
  );

  return {
    ensureEditPermission,
    ensurePublishPermission,
    markRenderedAssetAsDirty,
    notifyPermissionBlocked,
  };
}
