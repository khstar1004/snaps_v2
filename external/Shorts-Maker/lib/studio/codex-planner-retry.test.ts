import assert from "node:assert/strict";
import test from "node:test";
import { isRetryableCodexPlannerError, runCodexPlannerWithRetry } from "./codex-planner-retry";

test("isRetryableCodexPlannerError treats malformed JSON planner output as retryable", () => {
  assert.equal(
    isRetryableCodexPlannerError(new Error("Expected ',' or ']' after array element in JSON at position 2821")),
    true
  );
  assert.equal(
    isRetryableCodexPlannerError(new Error("Unexpected token ']' in JSON at position 731")),
    true
  );
  assert.equal(isRetryableCodexPlannerError(new Error("planner schema validation failed")), true);
});

test("runCodexPlannerWithRetry retries malformed JSON planner output and returns the later success", async () => {
  let attempts = 0;
  const result = await runCodexPlannerWithRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("Expected ',' or ']' after array element in JSON at position 2821");
      }
      return { ok: true };
    },
    {
      maxAttempts: 2,
      initialDelayMs: 0,
    }
  );

  assert.equal(attempts, 2);
  assert.deepEqual(result, { ok: true });
});
