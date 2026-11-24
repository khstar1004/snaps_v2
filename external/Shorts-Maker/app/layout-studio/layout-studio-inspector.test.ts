import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLayoutStudioInspectorVisibility,
  DEFAULT_COLLAPSED_INSPECTOR_SECTIONS,
  getCurrentLayoutStudioInspectorSectionKeys,
  isLayoutStudioInspectorSectionVisible,
  setLayoutStudioInspectorSectionsCollapsed,
  toggleLayoutStudioInspectorSection,
} from "./layout-studio-inspector";

test("getCurrentLayoutStudioInspectorSectionKeys blocks overlay-only tabs when the template does not support the overlay editor", () => {
  assert.deepEqual(getCurrentLayoutStudioInspectorSectionKeys("element", false), []);
  assert.deepEqual(getCurrentLayoutStudioInspectorSectionKeys("geometry", false), []);
  assert.deepEqual(getCurrentLayoutStudioInspectorSectionKeys("style", false), [
    "styleImage",
    "styleApply",
    "styleFontSize",
    "styleWeight",
    "styleColor",
    "styleAlign",
    "styleTemplateOptions",
  ]);
});

test("toggleLayoutStudioInspectorSection flips only the targeted section", () => {
  const next = toggleLayoutStudioInspectorSection(DEFAULT_COLLAPSED_INSPECTOR_SECTIONS, "styleWeight");

  assert.equal(next.styleWeight, false);
  assert.equal(next.styleColor, true);
});

test("setLayoutStudioInspectorSectionsCollapsed updates only the requested keys", () => {
  const next = setLayoutStudioInspectorSectionsCollapsed(
    DEFAULT_COLLAPSED_INSPECTOR_SECTIONS,
    ["styleWeight", "styleColor"],
    false
  );

  assert.equal(next.styleWeight, false);
  assert.equal(next.styleColor, false);
  assert.equal(next.styleAlign, true);
});

test("isLayoutStudioInspectorSectionVisible ignores collapsed state while searching", () => {
  assert.equal(
    isLayoutStudioInspectorSectionVisible(DEFAULT_COLLAPSED_INSPECTOR_SECTIONS, "styleWeight", false),
    false
  );
  assert.equal(
    isLayoutStudioInspectorSectionVisible(DEFAULT_COLLAPSED_INSPECTOR_SECTIONS, "styleWeight", true),
    true
  );
});

test("buildLayoutStudioInspectorVisibility computes tab-scoped search results", () => {
  const visibility = buildLayoutStudioInspectorVisibility({
    inspectorSearchQuery: "색상",
    activeInspectorTab: "style",
    activeTemplateSupportsOverlayEditor: true,
    selectedSlotHasTypographyControls: true,
  });

  assert.equal(visibility.isInspectorSearchActive, true);
  assert.deepEqual(visibility.currentInspectorSectionKeys, [
    "styleImage",
    "styleApply",
    "styleFontSize",
    "styleWeight",
    "styleColor",
    "styleAlign",
    "styleTemplateOptions",
  ]);
  assert.equal(visibility.showStyleColorSection, true);
  assert.equal(visibility.showStyleFontSection, false);
  assert.equal(visibility.hasStyleInspectorResult, true);
  assert.equal(visibility.hasElementInspectorResult, true);
});

test("buildLayoutStudioInspectorVisibility hides typography results when the selected slot has no text controls", () => {
  const visibility = buildLayoutStudioInspectorVisibility({
    inspectorSearchQuery: "텍스트",
    activeInspectorTab: "element",
    activeTemplateSupportsOverlayEditor: true,
    selectedSlotHasTypographyControls: false,
  });

  assert.equal(visibility.showElementTypographySection, false);
  assert.equal(visibility.hasElementInspectorResult, false);
});
