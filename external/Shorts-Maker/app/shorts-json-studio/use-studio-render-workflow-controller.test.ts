import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveStudioRenderWorkflowStage,
  runStudioRenderStageWithPreflight,
  shouldBlockStudioFinalRender,
} from "./use-studio-render-workflow-controller";

test("resolveStudioRenderWorkflowStage regenerates a stale draft as draft", () => {
  assert.equal(
    resolveStudioRenderWorkflowStage({
      renderNeedsRefresh: true,
      videoUrl: "blob:stale-draft",
    }),
    "draft"
  );
});

test("resolveStudioRenderWorkflowStage promotes a current draft to final", () => {
  assert.equal(
    resolveStudioRenderWorkflowStage({
      renderNeedsRefresh: false,
      videoUrl: "blob:current-draft",
    }),
    "final"
  );
});

test("resolveStudioRenderWorkflowStage preserves explicit stage override", () => {
  assert.equal(
    resolveStudioRenderWorkflowStage({
      preferredStage: "draft",
      renderNeedsRefresh: false,
      videoUrl: "blob:current-draft",
    }),
    "draft"
  );
});

test("final render is blocked until render preflight passes", () => {
  assert.equal(
    shouldBlockStudioFinalRender({
      stage: "final",
      canStartFinalRender: false,
    }),
    true
  );
  assert.equal(
    shouldBlockStudioFinalRender({
      stage: "final",
      canStartFinalRender: true,
    }),
    false
  );
  assert.equal(
    shouldBlockStudioFinalRender({
      stage: "draft",
      canStartFinalRender: false,
    }),
    false
  );
});

test("final render gate reports the block without calling the renderer", async () => {
  let blocked = 0;
  let rendered = 0;
  const result = await runStudioRenderStageWithPreflight({
    stage: "final",
    canStartFinalRender: false,
    onBlocked: () => {
      blocked += 1;
    },
    runAction: async () => {
      rendered += 1;
      return { ok: true };
    },
  });

  assert.equal(result, null);
  assert.equal(blocked, 1);
  assert.equal(rendered, 0);
});
