import assert from "node:assert/strict";
import test from "node:test";
import { buildRenderPlanV2 } from "./render-plan";
import type { PreparedSlide } from "@/types/studio-json";

function createFrame(overrides?: Partial<PreparedSlide>): PreparedSlide {
  return {
    title: "슬라이드",
    text: "기본 텍스트",
    lines: ["기본 텍스트"],
    layout: "photo+body",
    groupId: 0,
    stepIndex: 0,
    ...overrides,
  };
}

test("buildRenderPlanV2 keeps at most two resolved auto SFX cues per group", () => {
  const plan = buildRenderPlanV2(
    [
      createFrame({
        text: "첫 줄",
        lines: ["첫 줄"],
        groupId: 0,
        stepIndex: 0,
        sfxPlan: [{ lineIndex: 0, tag: "일반 효과음" }],
      }),
      createFrame({
        text: "둘째 줄",
        lines: ["첫 줄", "둘째 줄"],
        groupId: 0,
        stepIndex: 1,
        sfxPlan: [{ lineIndex: 1, tag: "강조 효과음" }],
      }),
      createFrame({
        text: "셋째 줄",
        lines: ["첫 줄", "둘째 줄", "셋째 줄"],
        groupId: 0,
        stepIndex: 2,
        sfxPlan: [{ lineIndex: 2, tag: "전환 효과음" }],
      }),
    ],
    [1, 1, 1]
  );

  assert.deepEqual(
    plan.sfxCuesResolved.map((cue) => ({ frameIndex: cue.frameIndex, tag: cue.tag })),
    [
      { frameIndex: 0, tag: "일반 효과음" },
      { frameIndex: 1, tag: "강조 효과음" },
    ]
  );
});

test("buildRenderPlanV2 skips consecutive duplicate auto SFX tags on the final timeline", () => {
  const plan = buildRenderPlanV2(
    [
      createFrame({
        text: "첫 반응",
        groupId: 0,
        stepIndex: 0,
        sfxCue: { enabled: true, tag: "일반 효과음", source: "auto" },
      }),
      createFrame({
        text: "두 번째 반응",
        groupId: 1,
        stepIndex: 0,
        sfxCue: { enabled: true, tag: "일반 효과음", source: "auto" },
      }),
      createFrame({
        text: "대체 반응",
        groupId: 1,
        stepIndex: 1,
        sfxCue: { enabled: true, tag: "강조 효과음", source: "auto" },
      }),
    ],
    [1, 1, 1]
  );

  assert.deepEqual(
    plan.sfxCuesResolved.map((cue) => ({ frameIndex: cue.frameIndex, tag: cue.tag })),
    [
      { frameIndex: 0, tag: "일반 효과음" },
      { frameIndex: 2, tag: "강조 효과음" },
    ]
  );
});

test("buildRenderPlanV2 keeps one duplicate auto SFX when it is the only cue in the group", () => {
  const plan = buildRenderPlanV2(
    [
      createFrame({
        text: "첫 반응",
        groupId: 0,
        stepIndex: 0,
        sfxCue: { enabled: true, tag: "일반 효과음", source: "auto" },
      }),
      createFrame({
        text: "두 번째 반응",
        groupId: 1,
        stepIndex: 0,
        sfxCue: { enabled: true, tag: "일반 효과음", source: "auto" },
      }),
    ],
    [1, 1]
  );

  assert.deepEqual(
    plan.sfxCuesResolved.map((cue) => ({ frameIndex: cue.frameIndex, tag: cue.tag })),
    [
      { frameIndex: 0, tag: "일반 효과음" },
      { frameIndex: 1, tag: "일반 효과음" },
    ]
  );
});

test("buildRenderPlanV2 preserves manual cues while constraining later auto cues", () => {
  const plan = buildRenderPlanV2(
    [
      createFrame({
        text: "수동 포인트",
        groupId: 0,
        stepIndex: 0,
        sfxCue: { enabled: true, tag: "일반 효과음", source: "manual" },
      }),
      createFrame({
        text: "같은 태그 자동",
        groupId: 0,
        stepIndex: 1,
        sfxCue: { enabled: true, tag: "일반 효과음", source: "auto" },
      }),
      createFrame({
        text: "다른 태그 자동",
        groupId: 0,
        stepIndex: 2,
        sfxCue: { enabled: true, tag: "강조 효과음", source: "auto" },
      }),
      createFrame({
        text: "세 번째 자동",
        groupId: 0,
        stepIndex: 3,
        sfxCue: { enabled: true, tag: "전환 효과음", source: "auto" },
      }),
    ],
    [1, 1, 1, 1]
  );

  assert.deepEqual(
    plan.sfxCuesResolved.map((cue) => ({ frameIndex: cue.frameIndex, tag: cue.tag, source: cue.source })),
    [
      { frameIndex: 0, tag: "일반 효과음", source: "manual" },
      { frameIndex: 2, tag: "강조 효과음", source: "auto" },
    ]
  );
});

test("buildRenderPlanV2 respects enabled and source metadata from sfxPlan", () => {
  const plan = buildRenderPlanV2(
    [
      createFrame({
        text: "꺼진 수동 효과음",
        groupId: 0,
        stepIndex: 0,
        sfxPlan: [{ lineIndex: 0, enabled: false, tag: "일반 효과음", source: "manual" }],
      }),
      createFrame({
        text: "수동 효과음",
        groupId: 0,
        stepIndex: 1,
        sfxPlan: [{ lineIndex: 1, tag: "강조 효과음", source: "manual" }],
      }),
      createFrame({
        text: "자동 효과음",
        groupId: 0,
        stepIndex: 2,
        sfxPlan: [{ lineIndex: 2, tag: "전환 효과음", source: "auto" }],
      }),
    ],
    [1, 1, 1]
  );

  assert.deepEqual(
    plan.sfxCuesResolved.map((cue) => ({ frameIndex: cue.frameIndex, tag: cue.tag, source: cue.source })),
    [
      { frameIndex: 1, tag: "강조 효과음", source: "manual" },
      { frameIndex: 2, tag: "전환 효과음", source: "auto" },
    ]
  );
});

test("buildRenderPlanV2 emits startMs on the unscaled frame-duration timeline plus offsetMs", () => {
  const plan = buildRenderPlanV2(
    [
      createFrame({
        text: "첫 줄",
        groupId: 0,
        stepIndex: 0,
        sfxCue: { enabled: true, tag: "일반 효과음", source: "manual", offsetMs: 50 },
      }),
      createFrame({
        text: "둘째 줄",
        groupId: 1,
        stepIndex: 0,
        sfxCue: { enabled: true, tag: "강조 효과음", source: "manual", offsetMs: -20 },
      }),
      createFrame({
        text: "셋째 줄",
        groupId: 2,
        stepIndex: 0,
        sfxCue: { enabled: true, tag: "전환 효과음", source: "manual" },
      }),
    ],
    [2.5, 1.2, 3]
  );

  // Unscaled frame durations in ms: [2500, 1200, 3000] -> cumulative starts: [0, 2500, 3700]
  assert.deepEqual(
    plan.sfxCuesResolved.map((cue) => ({ frameIndex: cue.frameIndex, startMs: cue.startMs })),
    [
      { frameIndex: 0, startMs: 0 + 50 },
      { frameIndex: 1, startMs: 2500 - 20 },
      { frameIndex: 2, startMs: 3700 },
    ]
  );
});

test("buildRenderPlanV2 does not revive a planned cue behind an explicit disabled tombstone", () => {
  const plan = buildRenderPlanV2(
    [
      createFrame({
        stepIndex: 1,
        sfxCue: { enabled: false, tag: "강조 효과음", source: "manual" },
        sfxPlan: [{ lineIndex: 1, enabled: true, tag: "강조 효과음", source: "manual" }],
      }),
    ],
    [1]
  );

  assert.deepEqual(plan.sfxCuesResolved, []);
});
