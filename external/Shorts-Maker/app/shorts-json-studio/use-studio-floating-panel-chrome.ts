"use client";

import { useCallback, useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";

type UseStudioFloatingPanelChromeInput = {
  brandingFabRef: RefObject<HTMLButtonElement | null>;
  brandingPanelOpen: boolean;
  brandingPanelRef: RefObject<HTMLElement | null>;
  closeHistoryPanel: () => void;
  historyFabRef: RefObject<HTMLButtonElement | null>;
  historyPanelRef: RefObject<HTMLElement | null>;
  historyPanelVisible: boolean;
  setBrandingPanelOpen: Dispatch<SetStateAction<boolean>>;
};

export function useStudioFloatingPanelChrome(input: UseStudioFloatingPanelChromeInput) {
  const closeBrandingPanel = useCallback(() => {
    input.setBrandingPanelOpen(false);
  }, [input.setBrandingPanelOpen]);

  const openBrandingPanel = useCallback(() => {
    input.closeHistoryPanel();
    input.setBrandingPanelOpen(true);
  }, [input.closeHistoryPanel, input.setBrandingPanelOpen]);

  const toggleBrandingPanel = useCallback(() => {
    input.setBrandingPanelOpen((prev) => {
      const next = !prev;
      if (next) {
        input.closeHistoryPanel();
      }
      return next;
    });
  }, [input.closeHistoryPanel, input.setBrandingPanelOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (input.brandingPanelOpen) {
        input.setBrandingPanelOpen(false);
      }
      if (input.historyPanelVisible) {
        input.closeHistoryPanel();
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (
        input.brandingPanelOpen &&
        input.brandingPanelRef.current &&
        !input.brandingPanelRef.current.contains(target) &&
        (!input.brandingFabRef.current || !input.brandingFabRef.current.contains(target))
      ) {
        input.setBrandingPanelOpen(false);
      }

      if (
        input.historyPanelVisible &&
        input.historyPanelRef.current &&
        !input.historyPanelRef.current.contains(target) &&
        (!input.historyFabRef.current || !input.historyFabRef.current.contains(target))
      ) {
        input.closeHistoryPanel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [
    input.brandingFabRef,
    input.brandingPanelOpen,
    input.brandingPanelRef,
    input.closeHistoryPanel,
    input.historyFabRef,
    input.historyPanelRef,
    input.historyPanelVisible,
    input.setBrandingPanelOpen,
  ]);

  return {
    closeBrandingPanel,
    openBrandingPanel,
    toggleBrandingPanel,
  };
}
