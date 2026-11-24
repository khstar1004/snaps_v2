import assert from "node:assert/strict";
import test from "node:test";
import { resolveStudioChangeImpactSummary } from "./studio-change-impact";
import type { StudioChangeImpactSummaryInput } from "./studio-change-impact";

const currentApprovedInput: StudioChangeImpactSummaryInput = {
  imageApprovalRecorded: true,
  imageApproved: true,
  hasDraftVideo: true,
  draftIsCurrent: true,
  hasFinalVideo: true,
  finalIsCurrent: true,
};

function resolveKeys(input: StudioChangeImpactSummaryInput) {
  return resolveStudioChangeImpactSummary(input).items.map((item) => item.key);
}

test("pristine new project has no change impact", () => {
  const summary = resolveStudioChangeImpactSummary({
    imageApprovalRecorded: false,
    imageApproved: false,
    hasDraftVideo: false,
    draftIsCurrent: false,
    hasFinalVideo: false,
    finalIsCurrent: false,
  });

  assert.deepEqual(summary.items, []);
  assert.equal(summary.count, 0);
  assert.equal(summary.hasImpacts, false);
  assert.equal(summary.description, "현재 다시 확인할 제작 단계가 없습니다.");
});

test("image-only invalidation cascades to preview and render", () => {
  assert.deepEqual(
    resolveKeys({
      ...currentApprovedInput,
      imageApproved: false,
    }),
    ["image", "preview", "render"]
  );
});

test("final-only stale render impacts preview and render without approval items", () => {
  assert.deepEqual(
    resolveKeys({
      ...currentApprovedInput,
      finalIsCurrent: false,
    }),
    ["preview", "render"]
  );
});

test("stale draft impacts preview and render", () => {
  assert.deepEqual(
    resolveKeys({
      ...currentApprovedInput,
      draftIsCurrent: false,
    }),
    ["preview", "render"]
  );
});

test("legacy rendered asset without approval fingerprints invalidates image", () => {
  const summary = resolveStudioChangeImpactSummary({
    imageApprovalRecorded: false,
    imageApproved: false,
    hasDraftVideo: true,
    draftIsCurrent: true,
    hasFinalVideo: false,
    finalIsCurrent: false,
  });

  assert.deepEqual(
    summary.items.map((item) => [item.key, item.label, item.targetStep]),
    [
      ["image", "이미지", 2],
      ["preview", "자막·오디오", 3],
      ["render", "렌더", 4],
    ]
  );
  assert.equal(summary.count, 3);
  assert.equal(summary.hasImpacts, true);
  assert.equal(summary.description, "이미지, 자막·오디오, 렌더 단계에 변경 영향이 있습니다.");
});

test("fully current state has no change impact", () => {
  const summary = resolveStudioChangeImpactSummary(currentApprovedInput);

  assert.deepEqual(summary.items, []);
  assert.equal(summary.count, 0);
  assert.equal(summary.hasImpacts, false);
});
