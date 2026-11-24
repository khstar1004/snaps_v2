import type { PreparedSlide } from "@/types/studio-json";
import { getLinkedSlideIndexes } from "./studio-page-helpers";

export type StudioPreviewSlideGroup = {
  key: string;
  indexes: number[];
  representativeIndex: number;
};

export type StudioPreviewGroupNavigationState = {
  activeGroupIndex: number;
  canMovePrevGroup: boolean;
  canMoveNextGroup: boolean;
  shouldAdvanceToRender: boolean;
};

export type StudioPreviewEditorTab = "script" | "image" | "sfx";

const DEFAULT_STUDIO_PREVIEW_EDITOR_TABS = ["image", "script", "sfx"] as const;

export function resolveStudioPreviewEditorState(input: {
  savedTab?: StudioPreviewEditorTab;
  initialTab?: StudioPreviewEditorTab;
  visibleTabs?: readonly StudioPreviewEditorTab[];
  imageOnlyEditMode?: boolean;
}): {
  activeTab: StudioPreviewEditorTab;
  availableTabs: readonly StudioPreviewEditorTab[];
  showImageEditor: boolean;
} {
  const availableTabs =
    input.visibleTabs && input.visibleTabs.length > 0
      ? input.visibleTabs
      : DEFAULT_STUDIO_PREVIEW_EDITOR_TABS;
  const initialTab = input.initialTab && availableTabs.includes(input.initialTab)
    ? input.initialTab
    : availableTabs[0] || "image";
  const activeTab = input.imageOnlyEditMode
    ? "image"
    : input.savedTab && availableTabs.includes(input.savedTab)
      ? input.savedTab
      : initialTab;
  return {
    activeTab,
    availableTabs,
    showImageEditor: Boolean(input.imageOnlyEditMode) || availableTabs.includes("image"),
  };
}

export function shouldShowStudioPreviewEditorTabs(input: {
  imageOnlyEditMode: boolean;
  isFunCaptionTemplate: boolean;
  hasExplicitVisibleTabs: boolean;
}): boolean {
  if (input.imageOnlyEditMode) return false;
  return !input.isFunCaptionTemplate || input.hasExplicitVisibleTabs;
}

export function clampStudioPreviewSelectedSlideIndex(value: number, itemCount: number): number {
  if (!Number.isFinite(itemCount) || itemCount <= 0) return 0;
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(0, Math.floor(value)), itemCount - 1);
}

export function getStudioPreviewGroupNavigationState(selectedGroupIndex: number, groupCount: number): StudioPreviewGroupNavigationState {
  const activeGroupIndex = clampStudioPreviewSelectedSlideIndex(selectedGroupIndex, groupCount);
  const canMovePrevGroup = groupCount > 0 && activeGroupIndex > 0;
  const canMoveNextGroup = groupCount > 0 && activeGroupIndex < groupCount - 1;
  return {
    activeGroupIndex,
    canMovePrevGroup,
    canMoveNextGroup,
    shouldAdvanceToRender: groupCount > 0 && !canMoveNextGroup,
  };
}

export function buildStudioPreviewSlideGroups(slides: PreparedSlide[]): StudioPreviewSlideGroup[] {
  const visited = new Set<number>();
  const groups: StudioPreviewSlideGroup[] = [];

  for (let index = 0; index < slides.length; index += 1) {
    if (visited.has(index)) continue;
    const indexes = Array.from(getLinkedSlideIndexes(slides, index)).sort((left, right) => left - right);
    indexes.forEach((item) => visited.add(item));
    const representativeIndex = indexes[indexes.length - 1] ?? index;
    groups.push({
      key: indexes.join(","),
      indexes,
      representativeIndex,
    });
  }

  return groups;
}
