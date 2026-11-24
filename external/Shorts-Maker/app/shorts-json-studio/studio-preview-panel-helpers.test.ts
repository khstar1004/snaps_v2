import assert from "node:assert/strict";
import test from "node:test";
import type { PreparedSlide } from "@/types/studio-json";
import {
  buildStudioPreviewSlideGroups,
  clampStudioPreviewSelectedSlideIndex,
  getStudioPreviewGroupNavigationState,
  resolveStudioPreviewEditorState,
  shouldShowStudioPreviewEditorTabs,
} from "./studio-preview-panel-helpers";

test("resolveStudioPreviewEditorState keeps image and audio stages isolated", () => {
  assert.deepEqual(
    resolveStudioPreviewEditorState({ imageOnlyEditMode: true, savedTab: "sfx" }),
    {
      activeTab: "image",
      availableTabs: ["image", "script", "sfx"],
      showImageEditor: true,
    }
  );
  assert.deepEqual(
    resolveStudioPreviewEditorState({
      savedTab: "image",
      initialTab: "sfx",
      visibleTabs: ["script", "sfx"],
    }),
    {
      activeTab: "sfx",
      availableTabs: ["script", "sfx"],
      showImageEditor: false,
    }
  );
});

test("shouldShowStudioPreviewEditorTabs exposes scoped audio tabs for fun-caption", () => {
  assert.equal(
    shouldShowStudioPreviewEditorTabs({
      imageOnlyEditMode: false,
      isFunCaptionTemplate: true,
      hasExplicitVisibleTabs: true,
    }),
    true
  );
  assert.equal(
    shouldShowStudioPreviewEditorTabs({
      imageOnlyEditMode: false,
      isFunCaptionTemplate: true,
      hasExplicitVisibleTabs: false,
    }),
    false
  );
  assert.equal(
    shouldShowStudioPreviewEditorTabs({
      imageOnlyEditMode: true,
      isFunCaptionTemplate: false,
      hasExplicitVisibleTabs: true,
    }),
    false
  );
});

test("clampStudioPreviewSelectedSlideIndex keeps selection inside the available slide range", () => {
  assert.equal(clampStudioPreviewSelectedSlideIndex(-1, 4), 0);
  assert.equal(clampStudioPreviewSelectedSlideIndex(0, 4), 0);
  assert.equal(clampStudioPreviewSelectedSlideIndex(2.8, 4), 2);
  assert.equal(clampStudioPreviewSelectedSlideIndex(99, 4), 3);
});

test("clampStudioPreviewSelectedSlideIndex falls back to zero when slides are empty", () => {
  assert.equal(clampStudioPreviewSelectedSlideIndex(3, 0), 0);
  assert.equal(clampStudioPreviewSelectedSlideIndex(3, -2), 0);
});

test("getStudioPreviewGroupNavigationState switches the next action to render on the last group", () => {
  assert.deepEqual(getStudioPreviewGroupNavigationState(0, 3), {
    activeGroupIndex: 0,
    canMovePrevGroup: false,
    canMoveNextGroup: true,
    shouldAdvanceToRender: false,
  });
  assert.deepEqual(getStudioPreviewGroupNavigationState(2, 3), {
    activeGroupIndex: 2,
    canMovePrevGroup: true,
    canMoveNextGroup: false,
    shouldAdvanceToRender: true,
  });
  assert.deepEqual(getStudioPreviewGroupNavigationState(99, 3), {
    activeGroupIndex: 2,
    canMovePrevGroup: true,
    canMoveNextGroup: false,
    shouldAdvanceToRender: true,
  });
});

test("buildStudioPreviewSlideGroups groups slides that share the same linked image selection", () => {
  const slides: PreparedSlide[] = [
    {
      title: "1",
      text: "a",
      lines: ["a"],
      layout: "photo+body",
      groupId: 10,
      stepIndex: 0,
      imageVariantId: "variant-a",
      imageRequest: { query: "shock" },
    },
    {
      title: "1",
      text: "b",
      lines: ["a", "b"],
      layout: "photo+body",
      groupId: 10,
      stepIndex: 1,
      imageVariantId: "variant-a",
      imageRequest: { query: "shock" },
    },
    {
      title: "2",
      text: "c",
      lines: ["c"],
      layout: "photo+body",
      groupId: 20,
      stepIndex: 0,
      imageVariantId: "variant-b",
      imageRequest: { query: "laugh" },
    },
  ];

  const groups = buildStudioPreviewSlideGroups(slides);
  assert.deepEqual(
    groups.map((group) => ({ indexes: group.indexes, representativeIndex: group.representativeIndex })),
    [
      { indexes: [0, 1], representativeIndex: 1 },
      { indexes: [2], representativeIndex: 2 },
    ]
  );
});
