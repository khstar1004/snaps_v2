import type { CSSProperties } from "react";

export type PanelResizeSide = "left" | "right";

export type PanelResizeContext = {
  side: PanelResizeSide;
  pointerId: number;
  startX: number;
  startWidth: number;
};

export type StagePanContext = {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
};

export const DEFAULT_LEFT_PANEL_WIDTH = 320;
export const DEFAULT_RIGHT_PANEL_WIDTH = 360;
export const MIN_LEFT_PANEL_WIDTH = 280;
export const MAX_LEFT_PANEL_WIDTH = 460;
export const MIN_RIGHT_PANEL_WIDTH = 320;
export const MAX_RIGHT_PANEL_WIDTH = 520;
export const DEFAULT_CANVAS_ZOOM = 1;
export const MIN_CANVAS_ZOOM = 0.7;
export const MAX_CANVAS_ZOOM = 1.9;
export const CANVAS_ZOOM_STEP = 0.1;

export function clampWorkbenchNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function getNextCanvasZoom(currentZoom: number, direction: 1 | -1): number {
  return clampWorkbenchNumber(
    Math.round((currentZoom + direction * CANVAS_ZOOM_STEP) * 100) / 100,
    MIN_CANVAS_ZOOM,
    MAX_CANVAS_ZOOM
  );
}

export function buildLayoutStudioWorkbenchStyle(input: {
  leftPanelWidth: number;
  rightPanelWidth: number;
  canvasZoom: number;
}): CSSProperties {
  return {
    "--studio-left-panel-width": `${input.leftPanelWidth}px`,
    "--studio-right-panel-width": `${input.rightPanelWidth}px`,
    "--studio-canvas-zoom": String(input.canvasZoom),
  } as CSSProperties;
}

export function createPanelResizeContext(input: {
  side: PanelResizeSide;
  pointerId: number;
  startX: number;
  startWidth: number;
}): PanelResizeContext {
  return input;
}

export function resolvePanelResizeWidth(context: PanelResizeContext, pointerClientX: number): number {
  const deltaX = pointerClientX - context.startX;
  if (context.side === "left") {
    return clampWorkbenchNumber(context.startWidth + deltaX, MIN_LEFT_PANEL_WIDTH, MAX_LEFT_PANEL_WIDTH);
  }
  return clampWorkbenchNumber(context.startWidth - deltaX, MIN_RIGHT_PANEL_WIDTH, MAX_RIGHT_PANEL_WIDTH);
}

export function getCenteredStageViewportScroll(input: {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}): { left: number; top: number } {
  const maxLeft = Math.max(0, input.scrollWidth - input.clientWidth);
  const maxTop = Math.max(0, input.scrollHeight - input.clientHeight);
  return {
    left: maxLeft / 2,
    top: maxTop / 2,
  };
}

export function createStagePanContext(input: {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
}): StagePanContext {
  return input;
}

export function resolveStagePanScroll(
  context: StagePanContext,
  pointerClientX: number,
  pointerClientY: number
): { left: number; top: number } {
  const deltaX = pointerClientX - context.startX;
  const deltaY = pointerClientY - context.startY;
  return {
    left: context.startScrollLeft - deltaX,
    top: context.startScrollTop - deltaY,
  };
}
