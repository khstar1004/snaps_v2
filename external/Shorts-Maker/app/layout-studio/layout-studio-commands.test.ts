import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLayoutStudioCommandActions,
  filterLayoutStudioCommandActions,
  LAYOUT_STUDIO_SHORTCUT_ITEMS,
} from "./layout-studio-commands";

function createCommandActionBuilderInput(overrides?: Partial<Parameters<typeof buildLayoutStudioCommandActions>[0]>) {
  const callLog: string[] = [];
  const input: Parameters<typeof buildLayoutStudioCommandActions>[0] = {
    activeTemplateSupportsOverlayEditor: true,
    canEditSelectedCategory: true,
    canvasZoom: 1,
    currentInspectorSectionCount: 3,
    hasPendingPresetChanges: true,
    isFocusMode: false,
    isInspectorSearchActive: false,
    loading: false,
    maxCanvasZoom: 1.5,
    minCanvasZoom: 0.5,
    selectedSlotLabel: "제목 슬롯",
    showShortcutGuide: false,
    slotRectClipboard: true,
    undoCount: 2,
    redoCount: 1,
    onAlignSelectedSlotRectXCenter: () => callLog.push("align-x"),
    onAlignSelectedSlotRectYCenter: () => callLog.push("align-y"),
    onCopySelectedSlotRect: () => callLog.push("copy"),
    onFocusInspectorSearch: () => callLog.push("focus-search"),
    onFitCanvasZoom: () => callLog.push("fit-zoom"),
    onOpenInspectorAdvanced: () => callLog.push("inspector-advanced"),
    onOpenInspectorElement: () => callLog.push("inspector-element"),
    onOpenInspectorStyle: () => callLog.push("inspector-style"),
    onOpenSidebarBranding: () => callLog.push("sidebar-branding"),
    onOpenSidebarNotes: () => callLog.push("sidebar-notes"),
    onPasteSelectedSlotRect: () => callLog.push("paste"),
    onRedo: () => callLog.push("redo"),
    onResetSelectedSlotRect: () => callLog.push("reset-slot"),
    onResetWorkbenchLayout: () => callLog.push("reset-layout"),
    onSaveTemplate: () => callLog.push("save"),
    onSetCurrentInspectorSectionsCollapsed: (collapsed) => callLog.push(collapsed ? "collapse-sections" : "expand-sections"),
    onToggleFocusMode: () => callLog.push("toggle-focus"),
    onToggleShortcutGuide: () => callLog.push("toggle-shortcuts"),
    onUndo: () => callLog.push("undo"),
    onZoomInCanvas: () => callLog.push("zoom-in"),
    onZoomOutCanvas: () => callLog.push("zoom-out"),
    ...overrides,
  };

  return { callLog, input };
}

test("LAYOUT_STUDIO_SHORTCUT_ITEMS keeps the expected command guide entries", () => {
  assert.equal(LAYOUT_STUDIO_SHORTCUT_ITEMS.length, 13);
  assert.deepEqual(LAYOUT_STUDIO_SHORTCUT_ITEMS[0], {
    id: "undo",
    keys: "Ctrl/Cmd + Z",
    description: "이전 편집으로 되돌리기",
  });
  assert.equal(LAYOUT_STUDIO_SHORTCUT_ITEMS.at(-1)?.id, "shortcuts");
});

test("filterLayoutStudioCommandActions matches label and hint case-insensitively", () => {
  const actions = [
    { id: "save", label: "저장", hint: "Ctrl+S", disabled: false, run: () => undefined },
    { id: "zoom", label: "캔버스 확대", hint: "Ctrl/Cmd + +", disabled: false, run: () => undefined },
  ];

  assert.deepEqual(
    filterLayoutStudioCommandActions(actions, "  ctrl/cmd + + ")
      .map((action) => action.id),
    ["zoom"]
  );
  assert.deepEqual(
    filterLayoutStudioCommandActions(actions, "저장")
      .map((action) => action.id),
    ["save"]
  );
});

test("buildLayoutStudioCommandActions reflects current editor state in labels and disabled flags", () => {
  const { input } = createCommandActionBuilderInput({
    activeTemplateSupportsOverlayEditor: false,
    canEditSelectedCategory: false,
    canvasZoom: 1.5,
    currentInspectorSectionCount: 0,
    hasPendingPresetChanges: false,
    isFocusMode: true,
    showShortcutGuide: true,
    slotRectClipboard: false,
    undoCount: 0,
    redoCount: 0,
  });
  const actions = buildLayoutStudioCommandActions(input);

  assert.equal(actions.find((action) => action.id === "toggle-focus")?.label, "패널 복원");
  assert.equal(actions.find((action) => action.id === "toggle-shortcuts")?.label, "단축키 패널 닫기");
  assert.equal(actions.find((action) => action.id === "save-template")?.disabled, true);
  assert.equal(actions.find((action) => action.id === "zoom-in")?.disabled, true);
  assert.equal(actions.find((action) => action.id === "copy-slot-rect")?.disabled, true);
  assert.equal(actions.find((action) => action.id === "inspector-expand-sections")?.disabled, true);
  assert.equal(actions.find((action) => action.id === "undo")?.disabled, true);
});

test("buildLayoutStudioCommandActions delegates run handlers to the provided callbacks", () => {
  const { callLog, input } = createCommandActionBuilderInput();
  const actions = buildLayoutStudioCommandActions(input);

  actions.find((action) => action.id === "save-template")?.run();
  actions.find((action) => action.id === "slot-align-x-center")?.run();
  actions.find((action) => action.id === "inspector-collapse-sections")?.run();

  assert.deepEqual(callLog, ["save", "align-x", "collapse-sections"]);
});
