import assert from "node:assert/strict";
import test from "node:test";
import { generateScriptFromTopic, convertScriptToStudioJson, isCodexPipelineError } from "./codex-script-core";

test("generateScriptFromTopic rejects empty topics before transport", async () => {
  await assert.rejects(
    () => generateScriptFromTopic("   "),
    (error: unknown) => {
      assert.equal(isCodexPipelineError(error), true);
      assert.equal((error as { code?: string }).code, "TOPIC_TO_SCRIPT_INPUT_INVALID");
      return true;
    }
  );
});

test("convertScriptToStudioJson rejects empty or title-less scripts before transport", async () => {
  await assert.rejects(
    () => convertScriptToStudioJson("   "),
    (error: unknown) => {
      assert.equal(isCodexPipelineError(error), true);
      assert.equal((error as { code?: string }).code, "SCRIPT_TO_JSON_INPUT_INVALID");
      return true;
    }
  );

  await assert.rejects(
    () => convertScriptToStudioJson(""),
    (error: unknown) => {
      assert.equal(isCodexPipelineError(error), true);
      assert.equal((error as { code?: string }).code, "SCRIPT_TO_JSON_INPUT_INVALID");
      return true;
    }
  );
});

test("convertScriptToStudioJson rejects body tokens that cannot fit the 12-character line limit", async () => {
  await assert.rejects(
    () => convertScriptToStudioJson("제목\n공백없는열세글자이상본문토큰"),
    (error: unknown) => {
      assert.equal(isCodexPipelineError(error), true);
      assert.equal((error as { code?: string }).code, "SCRIPT_TO_JSON_INPUT_INVALID");
      assert.match(error instanceof Error ? error.message : String(error), /한 줄 최대 12자/);
      return true;
    }
  );
});

test("convertScriptToStudioJson rejects a body that cannot form the required two lines", async () => {
  await assert.rejects(
    () => convertScriptToStudioJson("제목\n한어절"),
    (error: unknown) => {
      assert.equal(isCodexPipelineError(error), true);
      assert.equal((error as { code?: string }).code, "SCRIPT_TO_JSON_INPUT_INVALID");
      assert.match(error instanceof Error ? error.message : String(error), /어절이 최소 2개/);
      return true;
    }
  );
});
