import type { LayoutRect } from "./layout-studio-helpers";

export const EDITABLE_RECT_SLOTS = [
  { key: "headerTitleSlot", label: "헤더 제목 슬롯" },
  { key: "headerAccentSlot", label: "헤더 강조 슬롯" },
  { key: "titleSlot", label: "제목 슬롯" },
  { key: "infoSlot", label: "정보줄 슬롯" },
  { key: "bodySlot", label: "본문 슬롯" },
  { key: "imageSlot", label: "이미지 슬롯" },
] as const;

export type EditableRectSlotKey = (typeof EDITABLE_RECT_SLOTS)[number]["key"];
export type DragMode = "move" | "resize";
export type DragContext = {
  slotKey: EditableRectSlotKey;
  mode: DragMode;
  pointerId: number;
  originX: number;
  originY: number;
  bounds: Pick<DOMRect, "width" | "height">;
  startRect: LayoutRect;
  currentRect: LayoutRect;
};

export type LayoutStudioOverlayShortcutIntent =
  | { type: "select-slot"; slotKey: EditableRectSlotKey }
  | { type: "cycle-slot"; direction: 1 | -1 }
  | { type: "nudge-slot"; field: keyof Pick<LayoutRect, "x" | "y">; delta: number }
  | { type: "reset-slot" }
  | { type: "copy-slot" }
  | { type: "paste-slot" };

export function getEditableRectSlotLabel(slotKey: EditableRectSlotKey): string {
  return EDITABLE_RECT_SLOTS.find((slot) => slot.key === slotKey)?.label || "슬롯";
}

export function getNextEditableRectSlot(currentSlotKey: EditableRectSlotKey, direction: 1 | -1): EditableRectSlotKey {
  const currentIndex = EDITABLE_RECT_SLOTS.findIndex((slot) => slot.key === currentSlotKey);
  const baseIndex = currentIndex < 0 ? 0 : currentIndex;
  const nextIndex = (baseIndex + direction + EDITABLE_RECT_SLOTS.length) % EDITABLE_RECT_SLOTS.length;
  return EDITABLE_RECT_SLOTS[nextIndex].key;
}

export function getAlignedLayoutRect(
  rect: LayoutRect,
  axis: "x" | "y",
  mode: "start" | "center" | "end"
): LayoutRect {
  const round = (value: number) => Math.round(value * 10000) / 10000;
  if (axis === "x") {
    if (mode === "start") return { ...rect, x: 0 };
    if (mode === "center") return { ...rect, x: round((1 - rect.w) / 2) };
    return { ...rect, x: round(1 - rect.w) };
  }
  if (mode === "start") return { ...rect, y: 0 };
  if (mode === "center") return { ...rect, y: round((1 - rect.h) / 2) };
  return { ...rect, y: round(1 - rect.h) };
}

export function toRectFromPointer(
  context: DragContext,
  clientX: number,
  clientY: number,
  sanitizeRect: (input: unknown, fallback: LayoutRect) => LayoutRect
): LayoutRect {
  const dx = (clientX - context.originX) / Math.max(1, context.bounds.width);
  const dy = (clientY - context.originY) / Math.max(1, context.bounds.height);
  if (context.mode === "resize") {
    return sanitizeRect(
      {
        ...context.startRect,
        w: context.startRect.w + dx,
        h: context.startRect.h + dy,
      },
      context.startRect
    );
  }
  return sanitizeRect(
    {
      ...context.startRect,
      x: context.startRect.x + dx,
      y: context.startRect.y + dy,
    },
    context.startRect
  );
}

export function resolveLayoutStudioOverlayShortcut(input: {
  activeTemplateSupportsOverlayEditor: boolean;
  isEditableTextTarget: boolean;
  rectNudgeStep: number;
  showCommandPalette: boolean;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): LayoutStudioOverlayShortcutIntent | null {
  if (input.showCommandPalette) return null;
  if (!input.activeTemplateSupportsOverlayEditor) return null;
  if (input.isEditableTextTarget) return null;

  const withMeta = input.ctrlKey || input.metaKey;
  const normalizedKey = input.key.toLowerCase();

  if (!withMeta && !input.altKey && !input.shiftKey) {
    const slotNumber = Number(input.key);
    if (Number.isInteger(slotNumber) && slotNumber >= 1 && slotNumber <= EDITABLE_RECT_SLOTS.length) {
      return {
        type: "select-slot",
        slotKey: EDITABLE_RECT_SLOTS[slotNumber - 1].key,
      };
    }
  }

  if (!withMeta && !input.altKey && (input.key === "[" || input.key === "]")) {
    return {
      type: "cycle-slot",
      direction: input.key === "]" ? 1 : -1,
    };
  }

  if (!withMeta && !input.altKey && (input.key === "ArrowLeft" || input.key === "ArrowRight")) {
    const delta = input.key === "ArrowLeft" ? -input.rectNudgeStep : input.rectNudgeStep;
    return {
      type: "nudge-slot",
      field: "x",
      delta: input.shiftKey ? delta * 5 : delta,
    };
  }

  if (!withMeta && !input.altKey && (input.key === "ArrowUp" || input.key === "ArrowDown")) {
    const delta = input.key === "ArrowUp" ? -input.rectNudgeStep : input.rectNudgeStep;
    return {
      type: "nudge-slot",
      field: "y",
      delta: input.shiftKey ? delta * 5 : delta,
    };
  }

  if (!withMeta && !input.altKey && input.key === "Delete") {
    return { type: "reset-slot" };
  }

  if (withMeta && !input.altKey && normalizedKey === "c") {
    return { type: "copy-slot" };
  }

  if (withMeta && !input.altKey && normalizedKey === "v") {
    return { type: "paste-slot" };
  }

  return null;
}
