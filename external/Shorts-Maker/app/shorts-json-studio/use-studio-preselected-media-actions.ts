"use client";

import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { StudioPreselectedMediaApplyMode, StudioPreselectedMediaItem } from "./types";

type UpdateResult = {
  changed: boolean;
  items: StudioPreselectedMediaItem[];
};

type UseStudioPreselectedMediaActionsInput = {
  ensureEditPermission: (showAlert?: boolean) => boolean;
  preselectedMediaApplyMode: StudioPreselectedMediaApplyMode;
  preselectedMediaSessionRegistryRef: MutableRefObject<Map<string, StudioPreselectedMediaItem>>;
  scheduleHistoryCapture: (label: string) => void;
  setPreselectedMediaApplyMode: Dispatch<SetStateAction<StudioPreselectedMediaApplyMode>>;
  setPreselectedMediaItems: Dispatch<SetStateAction<StudioPreselectedMediaItem[]>>;
};

function toPreselectedMediaKey(item: StudioPreselectedMediaItem): string {
  return `${item.source}:${item.assetId || item.id}`;
}

export function appendUniquePreselectedMediaItems(
  current: StudioPreselectedMediaItem[],
  itemsToAppend: StudioPreselectedMediaItem[],
  maxItems = 24
): StudioPreselectedMediaItem[] {
  const next = [...current];
  const existingKeys = new Set(current.map(toPreselectedMediaKey));

  for (const item of itemsToAppend) {
    const key = toPreselectedMediaKey(item);
    if (existingKeys.has(key)) continue;
    next.push(item);
    existingKeys.add(key);
  }

  return next.slice(0, maxItems);
}

export function updatePreselectedMediaTargetSlide(
  current: StudioPreselectedMediaItem[],
  itemId: string,
  targetSlideIndex: number | null
): UpdateResult {
  let changed = false;
  const nextTarget = typeof targetSlideIndex === "number" ? targetSlideIndex : undefined;
  const items = current.map((item) => {
    if (item.id !== itemId) return item;
    if ((item.targetSlideIndex ?? undefined) === nextTarget) return item;
    changed = true;
    return {
      ...item,
      targetSlideIndex: nextTarget,
    };
  });

  return { changed, items };
}

export function movePreselectedMediaItem(
  current: StudioPreselectedMediaItem[],
  itemId: string,
  direction: -1 | 1
): UpdateResult {
  const index = current.findIndex((item) => item.id === itemId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
    return { changed: false, items: current };
  }

  const items = current.slice();
  const [target] = items.splice(index, 1);
  items.splice(nextIndex, 0, target);
  return { changed: true, items };
}

export function reorderPreselectedMediaItem(
  current: StudioPreselectedMediaItem[],
  itemId: string,
  toIndex: number
): UpdateResult {
  const fromIndex = current.findIndex((item) => item.id === itemId);
  if (fromIndex < 0) return { changed: false, items: current };

  const nextIndex = Math.max(0, Math.min(current.length - 1, toIndex));
  if (fromIndex === nextIndex) return { changed: false, items: current };

  const items = current.slice();
  const [target] = items.splice(fromIndex, 1);
  items.splice(nextIndex, 0, target);
  return { changed: true, items };
}

function syncPreselectedMediaSessionRegistry(
  registry: Map<string, StudioPreselectedMediaItem>,
  items: StudioPreselectedMediaItem[]
): void {
  registry.clear();
  for (const item of items) {
    if (item.source !== "session-upload") continue;
    registry.set(item.id, item);
  }
}

export function useStudioPreselectedMediaActions(input: UseStudioPreselectedMediaActionsInput) {
  const handleAppendPreselectedMediaItems = useCallback(
    (itemsToAppend: StudioPreselectedMediaItem[]) => {
      if (!input.ensureEditPermission(false)) return;
      if (itemsToAppend.length <= 0) return;

      const hasSessionUpload = itemsToAppend.some((item) => item.source === "session-upload");
      input.scheduleHistoryCapture(hasSessionUpload ? "미리 선택 미디어 추가 · 임시 업로드" : "미리 선택 미디어 추가 · 저장 자산");

      input.setPreselectedMediaItems((current) => {
        const next = appendUniquePreselectedMediaItems(current, itemsToAppend);
        syncPreselectedMediaSessionRegistry(input.preselectedMediaSessionRegistryRef.current, next);
        return next;
      });
    },
    [input.ensureEditPermission, input.preselectedMediaSessionRegistryRef, input.scheduleHistoryCapture, input.setPreselectedMediaItems]
  );

  const handleRemovePreselectedMediaItem = useCallback(
    (itemId: string) => {
      if (!input.ensureEditPermission(false)) return;
      input.scheduleHistoryCapture("미리 선택 미디어 제거");
      input.setPreselectedMediaItems((current) => {
        const next = current.filter((item) => item.id !== itemId);
        syncPreselectedMediaSessionRegistry(input.preselectedMediaSessionRegistryRef.current, next);
        return next;
      });
    },
    [input.ensureEditPermission, input.preselectedMediaSessionRegistryRef, input.scheduleHistoryCapture, input.setPreselectedMediaItems]
  );

  const handlePreselectedMediaTargetSlideChange = useCallback(
    (itemId: string, targetSlideIndex: number | null) => {
      if (!input.ensureEditPermission(false)) return;
      let changed = false;
      input.setPreselectedMediaItems((current) => {
        const result = updatePreselectedMediaTargetSlide(current, itemId, targetSlideIndex);
        changed = result.changed;
        if (result.changed) {
          syncPreselectedMediaSessionRegistry(input.preselectedMediaSessionRegistryRef.current, result.items);
        }
        return result.items;
      });
      if (changed) {
        input.scheduleHistoryCapture("미리 선택 미디어 고정 위치 변경");
      }
    },
    [input.ensureEditPermission, input.preselectedMediaSessionRegistryRef, input.scheduleHistoryCapture, input.setPreselectedMediaItems]
  );

  const handleMovePreselectedMediaItem = useCallback(
    (itemId: string, direction: -1 | 1) => {
      if (!input.ensureEditPermission(false)) return;
      let changed = false;
      input.setPreselectedMediaItems((current) => {
        const result = movePreselectedMediaItem(current, itemId, direction);
        changed = result.changed;
        if (result.changed) {
          syncPreselectedMediaSessionRegistry(input.preselectedMediaSessionRegistryRef.current, result.items);
        }
        return result.items;
      });
      if (changed) {
        input.scheduleHistoryCapture("미리 선택 미디어 순서 변경");
      }
    },
    [input.ensureEditPermission, input.preselectedMediaSessionRegistryRef, input.scheduleHistoryCapture, input.setPreselectedMediaItems]
  );

  const handleReorderPreselectedMediaItem = useCallback(
    (itemId: string, toIndex: number) => {
      if (!input.ensureEditPermission(false)) return;
      let changed = false;
      input.setPreselectedMediaItems((current) => {
        const result = reorderPreselectedMediaItem(current, itemId, toIndex);
        changed = result.changed;
        if (result.changed) {
          syncPreselectedMediaSessionRegistry(input.preselectedMediaSessionRegistryRef.current, result.items);
        }
        return result.items;
      });
      if (changed) {
        input.scheduleHistoryCapture("미리 선택 미디어 드래그 정렬");
      }
    },
    [input.ensureEditPermission, input.preselectedMediaSessionRegistryRef, input.scheduleHistoryCapture, input.setPreselectedMediaItems]
  );

  const handleClearPreselectedMediaItems = useCallback(() => {
    if (!input.ensureEditPermission(false)) return;
    let changed = false;
    input.setPreselectedMediaItems((current) => {
      if (current.length <= 0) return current;
      changed = true;
      syncPreselectedMediaSessionRegistry(input.preselectedMediaSessionRegistryRef.current, []);
      return [];
    });
    if (changed) {
      input.scheduleHistoryCapture("미리 선택 미디어 전체 비우기");
    }
  }, [input.ensureEditPermission, input.preselectedMediaSessionRegistryRef, input.scheduleHistoryCapture, input.setPreselectedMediaItems]);

  const handlePreselectedMediaApplyModeChange = useCallback(
    (value: StudioPreselectedMediaApplyMode) => {
      if (!input.ensureEditPermission(false)) return;
      if (input.preselectedMediaApplyMode === value) return;
      input.scheduleHistoryCapture("미리 선택 미디어 방식 변경");
      input.setPreselectedMediaApplyMode(value);
    },
    [input.ensureEditPermission, input.preselectedMediaApplyMode, input.scheduleHistoryCapture, input.setPreselectedMediaApplyMode]
  );

  return {
    handleAppendPreselectedMediaItems,
    handleRemovePreselectedMediaItem,
    handlePreselectedMediaTargetSlideChange,
    handleMovePreselectedMediaItem,
    handleReorderPreselectedMediaItem,
    handleClearPreselectedMediaItems,
    handlePreselectedMediaApplyModeChange,
  };
}
