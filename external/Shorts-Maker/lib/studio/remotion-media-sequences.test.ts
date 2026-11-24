import assert from "node:assert/strict";
import test from "node:test";
import type { PreparedSlide } from "@/types/studio-json";
import { buildStudioMediaSequences, resolveStudioMediaSequenceStep } from "./remotion-media-sequences";

function makeSlide(input: Partial<PreparedSlide>): PreparedSlide {
  return {
    title: input.title || "slide",
    text: input.text || "line",
    lines: input.lines || ["line"],
    layout: input.layout || "photo+body",
    ...input,
  };
}

test("buildStudioMediaSequences merges contiguous frames that keep the same group and image variant", () => {
  const slides: PreparedSlide[] = [
    makeSlide({ groupId: 10, stepIndex: 0, imageVariantId: "a", imageUrl: "https://media.giphy.com/media/a/giphy.gif" }),
    makeSlide({ groupId: 10, stepIndex: 1, imageVariantId: "a", imageUrl: "https://media.giphy.com/media/a/giphy.gif", lines: ["one", "two"] }),
    makeSlide({ groupId: 10, stepIndex: 2, imageVariantId: "b", imageUrl: "https://media.giphy.com/media/b/giphy.gif", lines: ["one", "two", "three"] }),
  ];

  const sequences = buildStudioMediaSequences({
    slides,
    frameDurationsSec: [1, 1, 1.5],
    fps: 30,
  });

  assert.deepEqual(
    sequences.map((sequence) => ({
      from: sequence.from,
      duration: sequence.duration,
      frameStartIndex: sequence.frameStartIndex,
      frameEndIndex: sequence.frameEndIndex,
      stepIndexes: sequence.slides.map((slide) => slide.stepIndex),
    })),
    [
      { from: 0, duration: 60, frameStartIndex: 0, frameEndIndex: 2, stepIndexes: [0, 1] },
      { from: 60, duration: 45, frameStartIndex: 2, frameEndIndex: 3, stepIndexes: [2] },
    ],
  );
});

test("buildStudioMediaSequences does not merge across slide groups even if variant ids match", () => {
  const slides: PreparedSlide[] = [
    makeSlide({ groupId: 10, stepIndex: 0, imageVariantId: "shared" }),
    makeSlide({ groupId: 11, stepIndex: 0, imageVariantId: "shared" }),
  ];

  const sequences = buildStudioMediaSequences({
    slides,
    frameDurationsSec: [1, 1],
    fps: 30,
  });

  assert.equal(sequences.length, 2);
  assert.deepEqual(
    sequences.map((sequence) => sequence.slides[0]?.groupId),
    [10, 11],
  );
});

test("resolveStudioMediaSequenceStep returns the active frame and local step frame inside a merged sequence", () => {
  const start = resolveStudioMediaSequenceStep({
    frameDurationsSec: [1, 1, 1.5],
    fps: 30,
    localFrame: 12,
  });
  assert.deepEqual(start, {
    activeIndex: 0,
    stepFrame: 12,
    stepDuration: 30,
  });

  const middle = resolveStudioMediaSequenceStep({
    frameDurationsSec: [1, 1, 1.5],
    fps: 30,
    localFrame: 35,
  });
  assert.deepEqual(middle, {
    activeIndex: 1,
    stepFrame: 5,
    stepDuration: 30,
  });

  const end = resolveStudioMediaSequenceStep({
    frameDurationsSec: [1, 1, 1.5],
    fps: 30,
    localFrame: 88,
  });
  assert.deepEqual(end, {
    activeIndex: 2,
    stepFrame: 28,
    stepDuration: 45,
  });
});
