import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLayoutStudioWorkbenchStyle,
  createPanelResizeContext,
  createStagePanContext,
  getCenteredStageViewportScroll,
  getNextCanvasZoom,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  resolvePanelResizeWidth,
  resolveStagePanScroll,
} from "./layout-studio-workbench";

test("getNextCanvasZoom clamps to the configured min/max bounds", () => {
  assert.equal(getNextCanvasZoom(1, 1), 1.1);
  assert.equal(getNextCanvasZoom(MAX_CANVAS_ZOOM, 1), MAX_CANVAS_ZOOM);
  assert.equal(getNextCanvasZoom(MIN_CANVAS_ZOOM, -1), MIN_CANVAS_ZOOM);
});

test("buildLayoutStudioWorkbenchStyle exposes the expected CSS custom properties", () => {
  const style = buildLayoutStudioWorkbenchStyle({
    leftPanelWidth: 320,
    rightPanelWidth: 360,
    canvasZoom: 1.2,
  }) as Record<string, string | undefined>;

  assert.equal(style["--studio-left-panel-width"], "320px");
  assert.equal(style["--studio-right-panel-width"], "360px");
  assert.equal(style["--studio-canvas-zoom"], "1.2");
});

test("resolvePanelResizeWidth applies left/right drag math with panel bounds", () => {
  const leftContext = createPanelResizeContext({
    side: "left",
    pointerId: 1,
    startX: 100,
    startWidth: 320,
  });
  const rightContext = createPanelResizeContext({
    side: "right",
    pointerId: 2,
    startX: 400,
    startWidth: 360,
  });

  assert.equal(resolvePanelResizeWidth(leftContext, 140), 360);
  assert.equal(resolvePanelResizeWidth(rightContext, 430), 330);
});

test("getCenteredStageViewportScroll returns the midpoint of the scrollable range", () => {
  assert.deepEqual(
    getCenteredStageViewportScroll({
      scrollWidth: 1800,
      clientWidth: 800,
      scrollHeight: 1200,
      clientHeight: 600,
    }),
    { left: 500, top: 300 }
  );
});

test("resolveStagePanScroll translates pointer deltas into scroll offsets", () => {
  const context = createStagePanContext({
    pointerId: 1,
    startX: 300,
    startY: 200,
    startScrollLeft: 640,
    startScrollTop: 480,
  });

  assert.deepEqual(resolveStagePanScroll(context, 340, 150), {
    left: 600,
    top: 530,
  });
});
