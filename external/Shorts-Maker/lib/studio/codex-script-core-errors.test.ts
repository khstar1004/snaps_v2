import assert from "node:assert/strict";
import test from "node:test";
import { CodexPipelineError, isCodexPipelineError } from "./codex-script-core-errors";

test("CodexPipelineError carries code, retryable, and status metadata", () => {
  const error = new CodexPipelineError("boom", {
    code: "CODEX_AUTH_REQUIRED",
    retryable: false,
    status: 400,
  });

  assert.equal(error.name, "CodexPipelineError");
  assert.equal(error.code, "CODEX_AUTH_REQUIRED");
  assert.equal(error.retryable, false);
  assert.equal(error.status, 400);
  assert.equal(isCodexPipelineError(error), true);
  assert.equal(isCodexPipelineError(new Error("nope")), false);
});
