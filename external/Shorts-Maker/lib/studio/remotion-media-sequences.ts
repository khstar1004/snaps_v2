import type { PreparedSlide } from "@/types/studio-json";

export type StudioMediaSequence = {
  key: string;
  from: number;
  duration: number;
  slides: PreparedSlide[];
  frameDurationsSec: number[];
  frameStartIndex: number;
  frameEndIndex: number;
};

type StudioFrameWindow = {
  from: number;
  duration: number;
};

function clampFrameDurationSec(value: number): number {
  return Math.max(0.001, Number(value) || 0.001);
}

function toDurationInFrames(frameDurationsSec: number[], fps: number): number {
  const totalSec = frameDurationsSec.reduce((acc, value) => acc + clampFrameDurationSec(value), 0);
  return Math.max(1, Math.round(totalSec * fps));
}

export function buildStudioFrameWindows(frameDurationsSec: number[], fps: number, totalFrames?: number): StudioFrameWindow[] {
  const resolvedTotalFrames = Number.isFinite(totalFrames) && (totalFrames as number) > 0
    ? Math.floor(totalFrames as number)
    : toDurationInFrames(frameDurationsSec, fps);
  const windows: StudioFrameWindow[] = [];
  let cursorSec = 0;
  for (let index = 0; index < frameDurationsSec.length; index += 1) {
    const from = Math.round(cursorSec * fps);
    cursorSec += clampFrameDurationSec(frameDurationsSec[index]);
    const isLast = index === frameDurationsSec.length - 1;
    const next = isLast ? resolvedTotalFrames : Math.round(cursorSec * fps);
    windows.push({
      from,
      duration: Math.max(1, next - from),
    });
  }
  return windows;
}

function resolveSlideGroupKey(slide: PreparedSlide, index: number): string {
  if (Number.isFinite(slide.groupId)) return `group:${Number(slide.groupId)}`;
  return `slide:${index}`;
}

function resolveSlideMediaKey(slide: PreparedSlide): string {
  const variantId = String(slide.imageVariantId || "").trim();
  if (variantId) return `variant:${variantId}`;
  const mediaKind = String(slide.mediaKind || "").trim() || "none";
  const mediaUrl = String(slide.mediaUrl || slide.imageUrl || "").trim() || "empty";
  return `media:${mediaKind}:${mediaUrl}`;
}

function resolveSequenceMergeKey(slide: PreparedSlide, index: number): string {
  return `${resolveSlideGroupKey(slide, index)}|${resolveSlideMediaKey(slide)}`;
}

export function buildStudioMediaSequences(input: {
  slides: PreparedSlide[];
  frameDurationsSec: number[];
  fps: number;
  totalFrames?: number;
}): StudioMediaSequence[] {
  const { slides, frameDurationsSec, fps, totalFrames } = input;
  if (slides.length <= 0 || frameDurationsSec.length <= 0) return [];
  const windows = buildStudioFrameWindows(frameDurationsSec, fps, totalFrames);
  const sequenceCount = Math.min(slides.length, windows.length);
  const sequences: StudioMediaSequence[] = [];

  for (let index = 0; index < sequenceCount; index += 1) {
    const slide = slides[index];
    const window = windows[index];
    if (!slide || !window) continue;

    const mergeKey = resolveSequenceMergeKey(slide, index);
    const current = sequences[sequences.length - 1];
    if (current && current.key.startsWith(`${mergeKey}|`)) {
      current.slides.push(slide);
      current.frameDurationsSec.push(frameDurationsSec[index]);
      current.frameEndIndex = index + 1;
      current.duration = Math.max(1, window.from + window.duration - current.from);
      continue;
    }

    sequences.push({
      key: `${mergeKey}|start:${index}`,
      from: window.from,
      duration: window.duration,
      slides: [slide],
      frameDurationsSec: [frameDurationsSec[index]],
      frameStartIndex: index,
      frameEndIndex: index + 1,
    });
  }

  return sequences;
}

export function resolveStudioMediaSequenceStep(input: {
  frameDurationsSec: number[];
  fps: number;
  localFrame: number;
}): {
  activeIndex: number;
  stepFrame: number;
  stepDuration: number;
} {
  const windows = buildStudioFrameWindows(input.frameDurationsSec, input.fps);
  if (windows.length <= 0) {
    return {
      activeIndex: 0,
      stepFrame: Math.max(0, Math.floor(input.localFrame)),
      stepDuration: 1,
    };
  }

  const safeFrame = Math.max(0, Math.floor(input.localFrame));
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index];
    if (safeFrame < window.from + window.duration) {
      return {
        activeIndex: index,
        stepFrame: Math.max(0, safeFrame - window.from),
        stepDuration: window.duration,
      };
    }
  }

  const lastIndex = windows.length - 1;
  const lastWindow = windows[lastIndex];
  return {
    activeIndex: lastIndex,
    stepFrame: Math.max(0, Math.min(lastWindow.duration - 1, safeFrame - lastWindow.from)),
    stepDuration: lastWindow.duration,
  };
}
