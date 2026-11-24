import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCodexCliPromptTransport } from "./codex-script-transport";

test("runCodexCliPromptTransport uses the project-wide gpt-5.6-sol medium fast local CLI policy", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "codex-transport-test-"));
  const helperPath = join(tempDir, "fake-codex.js");
  await writeFile(
    helperPath,
    [
      "import { writeFileSync } from 'node:fs';",
      "const args = process.argv.slice(2);",
      "const outputIndex = args.indexOf('--output-last-message');",
      "const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : '';",
      "const modelIndex = args.indexOf('--model');",
      "const model = modelIndex >= 0 ? args[modelIndex + 1] : '';",
      "const configs = [];",
      "for (let i = 0; i < args.length; i += 1) {",
      "  if (args[i] === '-c' && args[i + 1]) configs.push(args[i + 1]);",
      "}",
      "writeFileSync(outputFile, JSON.stringify({ model, configs }), 'utf8');",
    ].join("\n"),
    "utf8"
  );

  const previousCliPath = process.env.CODEX_CLI_PATH;
  process.env.CODEX_CLI_PATH = helperPath;
  try {
    const text = await runCodexCliPromptTransport("hello", "gpt-5.4-mini");
    const parsed = JSON.parse(text) as { model?: string; configs?: string[] };
    assert.equal(parsed.model, "gpt-5.6-sol");
    assert.deepEqual(parsed.configs, ['model_reasoning_effort="medium"', 'service_tier="fast"']);
  } finally {
    if (typeof previousCliPath === "string") {
      process.env.CODEX_CLI_PATH = previousCliPath;
    } else {
      delete process.env.CODEX_CLI_PATH;
    }
  }
});
