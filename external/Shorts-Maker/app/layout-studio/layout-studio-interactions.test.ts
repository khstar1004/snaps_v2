import assert from "node:assert/strict";
import test from "node:test";
import {
  getAlignedLayoutRect,
  getEditableRectSlotLabel,
  getNextEditableRectSlot,
  resolveLayoutStudioOverlayShortcut,
  toRectFromPointer,
  type DragContext,
} from "./layout-studio-interactions";
import type { LayoutRect } from "./layout-studio-helpers";

test("getEditableRectSlotLabel returns the configured slot label", () => {
  assert.equal(getEditableRectSlotLabel("titleSlot"), "제목 슬롯");
  assert.equal(getEditableRectSlotLabel("imageSlot"), "이미지 슬롯");
});

test("getNextEditableRectSlot cycles through the slot list in both directions", () => {
  assert.equal(getNextEditableRectSlot("titleSlot", 1), "infoSlot");
  assert.equal(getNextEditableRectSlot("headerTitleSlot", -1), "imageSlot");
});

test("getAlignedLayoutRect snaps a rect to the requested axis alignment", () => {
  const rect: LayoutRect = { x: 0.1234, y: 0.2345, w: 0.4, h: 0.3 };

  assert.deepEqual(getAlignedLayoutRect(rect, "x", "center"), { ...rect, x: 0.3 });
  assert.deepEqual(getAlignedLayoutRect(rect, "y", "end"), { ...rect, y: 0.7 });
});

test("toRectFromPointer applies move and resize deltas through sanitizeRect", () => {
  const dragContext: DragContext = {
    slotKey: "titleSlot",
    mode: "move",
    pointerId: 1,
    originX: 100,
    originY: 200,
    bounds: { width: 400, height: 800 },
    startRect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    currentRect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
  };
  const sanitizeRect = (input: unknown) => input as LayoutRect;

  assert.deepEqual(toRectFromPointer(dragContext, 300, 600, sanitizeRect), {
    x: 0.6,
    y: 0.7,
    w: 0.3,
    h: 0.4,
  });

  assert.deepEqual(
    toRectFromPointer(
      {
        ...dragContext,
        mode: "resize",
      },
      300,
      600,
      sanitizeRect
    ),
    {
      x: 0.1,
      y: 0.2,
      w: 0.8,
      h: 0.9,
    }
  );
});

test("resolveLayoutStudioOverlayShortcut translates keyboard input into overlay intents", () => {
  assert.deepEqual(
    resolveLayoutStudioOverlayShortcut({
      activeTemplateSupportsOverlayEditor: true,
      isEditableTextTarget: false,
      rectNudgeStep: 0.01,
      showCommandPalette: false,
      key: "3",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    }),
    { type: "select-slot", slotKey: "titleSlot" }
  );

  assert.deepEqual(
    resolveLayoutStudioOverlayShortcut({
      activeTemplateSupportsOverlayEditor: true,
      isEditableTextTarget: false,
      rectNudgeStep: 0.01,
      showCommandPalette: false,
      key: "]",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    }),
    { type: "cycle-slot", direction: 1 }
  );

  assert.deepEqual(
    resolveLayoutStudioOverlayShortcut({
      activeTemplateSupportsOverlayEditor: true,
      isEditableTextTarget: false,
      rectNudgeStep: 0.01,
      showCommandPalette: false,
      key: "ArrowUp",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: true,
    }),
    { type: "nudge-slot", field: "y", delta: -0.05 }
  );

  assert.deepEqual(
    resolveLayoutStudioOverlayShortcut({
      activeTemplateSupportsOverlayEditor: true,
      isEditableTextTarget: false,
      rectNudgeStep: 0.01,
      showCommandPalette: false,
      key: "v",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    }),
    { type: "paste-slot" }
  );
});

test("resolveLayoutStudioOverlayShortcut ignores blocked contexts", () => {
  assert.equal(
    resolveLayoutStudioOverlayShortcut({
      activeTemplateSupportsOverlayEditor: false,
      isEditableTextTarget: false,
      rectNudgeStep: 0.01,
      showCommandPalette: false,
      key: "1",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    }),
    null
  );

  assert.equal(
    resolveLayoutStudioOverlayShortcut({
      activeTemplateSupportsOverlayEditor: true,
      isEditableTextTarget: true,
      rectNudgeStep: 0.01,
      showCommandPalette: false,
      key: "Delete",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    }),
    null
  );
});
