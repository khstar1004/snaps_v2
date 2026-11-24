import assert from "node:assert/strict";
import test from "node:test";
import { explodeSlidesForPop } from "./frames";
import type { SlideInput } from "@/types/studio-json";

function createSlide(overrides?: Partial<SlideInput>): SlideInput {
  return {
    title: "슬라이드",
    text: "첫 줄\n둘째 줄",
    lines: ["첫 줄", "둘째 줄"],
    layout: "photo+body",
    ...overrides,
  };
}

test("explodeSlidesForPop preserves sfxPlan enabled and source metadata on frames", () => {
  const frames = explodeSlidesForPop([
    createSlide({
      sfxPlan: [
        { lineIndex: 0, tag: "일반 효과음", enabled: false, source: "manual", gainDb: -2, offsetMs: 80 },
        { lineIndex: 1, tag: "강조 효과음", source: "auto", gainDb: 3, offsetMs: -40 },
      ],
    }),
  ]);

  assert.deepEqual(frames.map((frame) => frame.sfxCue), [
    { enabled: false, tag: "일반 효과음", gainDb: -2, offsetMs: 80, source: "manual" },
    { enabled: true, tag: "강조 효과음", gainDb: 3, offsetMs: -40, source: "auto" },
  ]);
});

test("explodeSlidesForPop preserves a disabled manual frame0 sfxCue", () => {
  const frames = explodeSlidesForPop([
    createSlide({
      sfxCue: { enabled: false, tag: "전환 효과음", source: "manual", gainDb: -6, offsetMs: 120 },
    }),
  ]);

  assert.deepEqual(frames[0]?.sfxCue, {
    enabled: false,
    tag: "전환 효과음",
    gainDb: -6,
    offsetMs: 120,
    source: "manual",
  });
  assert.equal(frames[1]?.sfxCue, undefined);
});

test("explodeSlidesForPop keeps a disabled frame0 cue ahead of an enabled plan item", () => {
  const frames = explodeSlidesForPop([
    createSlide({
      sfxCue: { enabled: false, tag: "전환 효과음", source: "manual", gainDb: -6, offsetMs: 120 },
      sfxPlan: [{ lineIndex: 0, enabled: true, tag: "강조 효과음", source: "manual" }],
    }),
  ]);

  assert.deepEqual(frames[0]?.sfxCue, {
    enabled: false,
    tag: "전환 효과음",
    gainDb: -6,
    offsetMs: 120,
    source: "manual",
  });
});

test("explodeSlidesForPop applies image beat provenance only from its start line", () => {
  const frames = explodeSlidesForPop([
    createSlide({
      imageUrl: "https://example.com/automatic.png",
      resolvedImageUrl: "https://example.com/automatic.png",
      resolvedBy: "crawl",
      imageSelection: { intent: "news", queryCandidates: ["automatic query"] },
      imageBeats: [
        {
          beatId: "manual-right",
          startLineIndex: 1,
          imageUrl: "https://example.com/manual.png",
          resolvedImageUrl: "https://example.com/manual.png",
          resolvedBy: "direct",
          imageSelection: {
            intent: "library",
            queryCandidates: [],
            selectedCandidateId: "library:manual",
            selectionReason: "manual library selection",
          },
        },
      ],
    }),
  ]);

  assert.equal(frames[0]?.imageUrl, "https://example.com/automatic.png");
  assert.equal(frames[0]?.resolvedBy, "crawl");
  assert.equal(frames[1]?.imageUrl, "https://example.com/manual.png");
  assert.equal(frames[1]?.resolvedBy, "direct");
  assert.equal(frames[1]?.imageSelection?.selectedCandidateId, "library:manual");
});
