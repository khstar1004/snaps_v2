"use client";

export type LayoutStudioCommandAction = {
  id: string;
  label: string;
  hint: string;
  disabled: boolean;
  run: () => void;
};

export type LayoutStudioShortcutItem = {
  id: string;
  keys: string;
  description: string;
};

export const LAYOUT_STUDIO_SHORTCUT_ITEMS: LayoutStudioShortcutItem[] = [
  { id: "undo", keys: "Ctrl/Cmd + Z", description: "이전 편집으로 되돌리기" },
  { id: "redo", keys: "Ctrl/Cmd + Y", description: "되돌린 편집 다시 적용" },
  { id: "zoom", keys: "Ctrl/Cmd + +/-", description: "캔버스 확대/축소" },
  { id: "zoom-fit", keys: "Ctrl/Cmd + 0", description: "캔버스 배율 100%로 맞춤" },
  { id: "command", keys: "Ctrl/Cmd + K", description: "커맨드 팔레트 열기" },
  { id: "search", keys: "Ctrl/Cmd + F 또는 /", description: "인스펙터 검색 바로 열기" },
  { id: "focus-mode", keys: "Shift + \\", description: "패널 숨김/복원(집중 모드)" },
  { id: "pan", keys: "Space (홀드)", description: "핸드툴로 캔버스 팬" },
  { id: "slot-select", keys: "1~6 / [ ]", description: "편집할 슬롯 빠르게 선택" },
  { id: "slot-move", keys: "방향키 / Shift+방향키", description: "선택 슬롯 미세 이동 / 빠른 이동" },
  { id: "slot-copy-paste", keys: "Ctrl/Cmd + C / V", description: "선택 슬롯 좌표 복사/붙여넣기" },
  { id: "slot-reset", keys: "Delete", description: "선택 슬롯 기본 좌표 복원" },
  { id: "shortcuts", keys: "?", description: "단축키 도움말 열기/닫기" },
];

type BuildLayoutStudioCommandActionsInput = {
  activeTemplateSupportsOverlayEditor: boolean;
  canEditSelectedCategory: boolean;
  canvasZoom: number;
  currentInspectorSectionCount: number;
  hasPendingPresetChanges: boolean;
  isFocusMode: boolean;
  isInspectorSearchActive: boolean;
  loading: boolean;
  maxCanvasZoom: number;
  minCanvasZoom: number;
  selectedSlotLabel: string;
  showShortcutGuide: boolean;
  slotRectClipboard: boolean;
  undoCount: number;
  redoCount: number;
  onAlignSelectedSlotRectXCenter: () => void;
  onAlignSelectedSlotRectYCenter: () => void;
  onCopySelectedSlotRect: () => void;
  onFocusInspectorSearch: () => void;
  onFitCanvasZoom: () => void;
  onOpenInspectorAdvanced: () => void;
  onOpenInspectorElement: () => void;
  onOpenInspectorStyle: () => void;
  onOpenSidebarBranding: () => void;
  onOpenSidebarNotes: () => void;
  onPasteSelectedSlotRect: () => void;
  onRedo: () => void;
  onResetSelectedSlotRect: () => void;
  onResetWorkbenchLayout: () => void;
  onSaveTemplate: () => void;
  onSetCurrentInspectorSectionsCollapsed: (collapsed: boolean) => void;
  onToggleFocusMode: () => void;
  onToggleShortcutGuide: () => void;
  onUndo: () => void;
  onZoomInCanvas: () => void;
  onZoomOutCanvas: () => void;
};

export function buildLayoutStudioCommandActions(
  input: BuildLayoutStudioCommandActionsInput
): LayoutStudioCommandAction[] {
  return [
    {
      id: "save-template",
      label: "저장",
      hint: "DB 기본값 + 로컬 연동 상태 갱신",
      disabled: input.loading || !input.canEditSelectedCategory || !input.hasPendingPresetChanges,
      run: input.onSaveTemplate,
    },
    {
      id: "toggle-focus",
      label: input.isFocusMode ? "패널 복원" : "집중 모드",
      hint: "Shift+\\",
      disabled: false,
      run: input.onToggleFocusMode,
    },
    {
      id: "zoom-in",
      label: "캔버스 확대",
      hint: "Ctrl/Cmd + +",
      disabled: input.canvasZoom >= input.maxCanvasZoom,
      run: input.onZoomInCanvas,
    },
    {
      id: "zoom-out",
      label: "캔버스 축소",
      hint: "Ctrl/Cmd + -",
      disabled: input.canvasZoom <= input.minCanvasZoom,
      run: input.onZoomOutCanvas,
    },
    {
      id: "zoom-fit",
      label: "캔버스 배율 100%",
      hint: "Ctrl/Cmd + 0",
      disabled: false,
      run: input.onFitCanvasZoom,
    },
    {
      id: "reset-layout",
      label: "패널 레이아웃 초기화",
      hint: "폭/배율/집중모드 초기화",
      disabled: false,
      run: input.onResetWorkbenchLayout,
    },
    {
      id: "toggle-shortcuts",
      label: input.showShortcutGuide ? "단축키 패널 닫기" : "단축키 패널 열기",
      hint: "?",
      disabled: false,
      run: input.onToggleShortcutGuide,
    },
    {
      id: "sidebar-branding",
      label: "좌측 탭: 브랜딩",
      hint: "빠른 입력 패널",
      disabled: false,
      run: input.onOpenSidebarBranding,
    },
    {
      id: "sidebar-notes",
      label: "좌측 탭: 메모",
      hint: "운영 메모 패널",
      disabled: false,
      run: input.onOpenSidebarNotes,
    },
    {
      id: "inspector-element",
      label: "우측 탭: 요소",
      hint: "선택 요소 편집",
      disabled: !input.activeTemplateSupportsOverlayEditor,
      run: input.onOpenInspectorElement,
    },
    {
      id: "inspector-style",
      label: "우측 탭: 레이아웃 옵션",
      hint: "폰트/색상/적용 범위",
      disabled: false,
      run: input.onOpenInspectorStyle,
    },
    {
      id: "inspector-advanced",
      label: "우측 탭: 고급 JSON",
      hint: "템플릿 레이아웃 JSON",
      disabled: false,
      run: input.onOpenInspectorAdvanced,
    },
    {
      id: "copy-slot-rect",
      label: `${input.selectedSlotLabel} 좌표 복사`,
      hint: "Ctrl/Cmd + C",
      disabled: !input.activeTemplateSupportsOverlayEditor,
      run: input.onCopySelectedSlotRect,
    },
    {
      id: "paste-slot-rect",
      label: `${input.selectedSlotLabel} 좌표 붙여넣기`,
      hint: "Ctrl/Cmd + V",
      disabled: !input.activeTemplateSupportsOverlayEditor || !input.canEditSelectedCategory || !input.slotRectClipboard,
      run: input.onPasteSelectedSlotRect,
    },
    {
      id: "reset-slot-rect",
      label: `${input.selectedSlotLabel} 기본 좌표 복원`,
      hint: "Delete",
      disabled: !input.activeTemplateSupportsOverlayEditor || !input.canEditSelectedCategory,
      run: input.onResetSelectedSlotRect,
    },
    {
      id: "slot-align-x-center",
      label: `${input.selectedSlotLabel} 가로 중앙 정렬`,
      hint: "좌우 균형 맞춤",
      disabled: !input.activeTemplateSupportsOverlayEditor || !input.canEditSelectedCategory,
      run: input.onAlignSelectedSlotRectXCenter,
    },
    {
      id: "slot-align-y-center",
      label: `${input.selectedSlotLabel} 세로 중앙 정렬`,
      hint: "상하 균형 맞춤",
      disabled: !input.activeTemplateSupportsOverlayEditor || !input.canEditSelectedCategory,
      run: input.onAlignSelectedSlotRectYCenter,
    },
    {
      id: "inspector-search-focus",
      label: "인스펙터 검색 포커스",
      hint: "Ctrl/Cmd + F 또는 /",
      disabled: false,
      run: input.onFocusInspectorSearch,
    },
    {
      id: "inspector-expand-sections",
      label: "현재 탭 섹션 펼치기",
      hint: "가시성 높은 편집",
      disabled: input.currentInspectorSectionCount === 0,
      run: () => input.onSetCurrentInspectorSectionsCollapsed(false),
    },
    {
      id: "inspector-collapse-sections",
      label: "현재 탭 섹션 접기",
      hint: "집중해서 편집",
      disabled: input.currentInspectorSectionCount === 0 || input.isInspectorSearchActive,
      run: () => input.onSetCurrentInspectorSectionsCollapsed(true),
    },
    {
      id: "undo",
      label: "되돌리기",
      hint: "Ctrl/Cmd + Z",
      disabled: !input.canEditSelectedCategory || input.undoCount === 0,
      run: input.onUndo,
    },
    {
      id: "redo",
      label: "다시하기",
      hint: "Ctrl/Cmd + Y",
      disabled: !input.canEditSelectedCategory || input.redoCount === 0,
      run: input.onRedo,
    },
  ];
}

export function filterLayoutStudioCommandActions(
  actions: LayoutStudioCommandAction[],
  query: string
): LayoutStudioCommandAction[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return actions;
  return actions.filter((action) => `${action.label} ${action.hint}`.toLowerCase().includes(normalizedQuery));
}
