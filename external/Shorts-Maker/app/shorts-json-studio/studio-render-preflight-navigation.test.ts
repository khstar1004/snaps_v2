import assert from "node:assert/strict";
import test from "node:test";
import {
  getRenderPreflightIssueFixTarget,
  getRenderPreflightIssueLocationLabel,
  mapRenderPreflightTargetStepToGuidedFlowStep,
} from "./studio-render-preflight-navigation";
import type { StudioRenderPreflightTargetStep } from "./studio-render-preflight";

test("mapRenderPreflightTargetStepToGuidedFlowStep maps issues to the exact guided stage", () => {
  const cases: Array<[StudioRenderPreflightTargetStep, number]> = [
    ["script", 1],
    ["audio", 1],
    ["image", 2],
    ["caption_audio", 3],
    ["review_render", 4],
  ];

  for (const [targetStep, expected] of cases) {
    assert.equal(mapRenderPreflightTargetStepToGuidedFlowStep(targetStep), expected);
  }
});

test("getRenderPreflightIssueLocationLabel includes slide and segment coordinates when present", () => {
  assert.equal(
    getRenderPreflightIssueLocationLabel({
      code: "voice-missing",
      severity: "blocker",
      message: "음성 없음",
      targetStep: "audio",
      slideIndex: 1,
      segmentIndex: 2,
    }),
    "음성 · 슬라이드 2 · 문장 3"
  );
});

test("getRenderPreflightIssueFixTarget returns user-facing fix copy", () => {
  assert.deepEqual(
    getRenderPreflightIssueFixTarget({
      code: "sfx-cue-tag-missing",
      severity: "blocker",
      message: "효과음 cue 없음",
      targetStep: "caption_audio",
      slideIndex: 0,
      segmentIndex: 1,
    }),
    {
      step: 3,
      label: "3단계 자막·오디오에서 수정",
      locationLabel: "자막·오디오 · 슬라이드 1 · 문장 2",
    }
  );
});
