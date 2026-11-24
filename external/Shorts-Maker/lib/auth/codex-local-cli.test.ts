import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __internal } from "./codex-local-cli";
import { runLocalCodexCliPrompt } from "./codex-local-cli";

test("getCodexCliAttemptModels defaults to gpt-5.6-sol when no override is configured", () => {
  const previous = process.env.CODEX_LOCAL_CLI_MODEL;
  delete process.env.CODEX_LOCAL_CLI_MODEL;
  try {
    assert.deepEqual(__internal.getCodexCliAttemptModels(), ["gpt-5.6-sol"]);
  } finally {
    if (typeof previous === "string") {
      process.env.CODEX_LOCAL_CLI_MODEL = previous;
    } else {
      delete process.env.CODEX_LOCAL_CLI_MODEL;
    }
  }
});

test("getCodexCliAttemptModels respects explicit model selection", () => {
  assert.deepEqual(__internal.getCodexCliAttemptModels("gpt-5.4"), ["gpt-5.4"]);
});

test("getCodexCliAttemptModels falls back to CODEX_LOCAL_CLI_MODEL when configured", () => {
  const previous = process.env.CODEX_LOCAL_CLI_MODEL;
  process.env.CODEX_LOCAL_CLI_MODEL = "gpt-5.4-mini";
  try {
    assert.deepEqual(__internal.getCodexCliAttemptModels(), ["gpt-5.4-mini"]);
  } finally {
    if (typeof previous === "string") {
      process.env.CODEX_LOCAL_CLI_MODEL = previous;
    } else {
      delete process.env.CODEX_LOCAL_CLI_MODEL;
    }
  }
});

test("resolveEffectiveCodexCliTimeoutMs extends frontier planner timeouts", () => {
  assert.equal(__internal.resolveEffectiveCodexCliTimeoutMs(45_000, "gpt-5.4"), 120_000);
  assert.equal(__internal.resolveEffectiveCodexCliTimeoutMs(45_000, "gpt-5.4-mini"), 120_000);
  assert.equal(__internal.resolveEffectiveCodexCliTimeoutMs(45_000, "gpt-5.6-sol"), 120_000);
  assert.equal(__internal.resolveEffectiveCodexCliTimeoutMs(45_000, "gpt-5.3-codex-spark"), 45_000);
  assert.equal(__internal.resolveEffectiveCodexCliTimeoutMs(240_000, "gpt-5.4"), 240_000);
});

test("isRetryableCodexCliError treats killed planner runs as retryable", () => {
  const error = Object.assign(new Error("Command failed: codex exec ..."), {
    killed: true,
    signal: "SIGTERM",
    stdout: '{"type":"thread.started"}\n{"type":"turn.started"}\n',
  });
  assert.equal(__internal.isRetryableCodexCliError(error), true);
});

test("classifyLocalCodexCliError distinguishes timeout, missing cli, and generic execution failures", () => {
  const timeoutError = Object.assign(new Error("codex exec timed out after 45000ms"), {
    killed: true,
    signal: "SIGTERM",
  });
  const missingCliError = Object.assign(new Error("spawn codex ENOENT"), {
    code: "ENOENT",
  });
  const genericError = new Error("Command failed: codex exec ...");

  assert.equal(__internal.classifyLocalCodexCliError(timeoutError), "timeout");
  assert.equal(__internal.classifyLocalCodexCliError(missingCliError), "not_found");
  assert.equal(__internal.classifyLocalCodexCliError(genericError), "execution_failed");
});

test("normalizeCodexCliExecError surfaces timeout and partial stdout context", () => {
  const error = Object.assign(new Error("Command failed: codex exec ..."), {
    killed: true,
    signal: "SIGTERM",
    stdout: '{"type":"thread.started"}\n{"type":"turn.started"}\n',
    stderr: "",
  });
  const normalized = __internal.normalizeCodexCliExecError(error, {
    model: "gpt-5.4",
    timeoutMs: 45000,
  });
  assert.match(normalized.message, /timed out after 45000ms/);
  assert.match(normalized.message, /model=gpt-5\.4/);
  assert.match(normalized.message, /stdout=/);
});

test("resolveDefaultLocalCodexCliModel reads CODEX_LOCAL_CLI_MODEL", () => {
  const previous = process.env.CODEX_LOCAL_CLI_MODEL;
  process.env.CODEX_LOCAL_CLI_MODEL = "gpt-5.4";
  try {
    assert.equal(__internal.resolveDefaultLocalCodexCliModel(), "gpt-5.4");
  } finally {
    if (typeof previous === "string") {
      process.env.CODEX_LOCAL_CLI_MODEL = previous;
    } else {
      delete process.env.CODEX_LOCAL_CLI_MODEL;
    }
  }
});

test("resolveDefaultLocalCodexCliConfigOverrides defaults to medium reasoning and fast service tier", () => {
  assert.deepEqual(__internal.resolveDefaultLocalCodexCliConfigOverrides(), [
    'model_reasoning_effort="medium"',
    'service_tier="fast"',
  ]);
});

test("mergeCodexCliConfigOverrides keeps fast tier and dedupes duplicates", () => {
  assert.deepEqual(__internal.mergeCodexCliConfigOverrides(['service_tier="fast"']), [
    'model_reasoning_effort="medium"',
    'service_tier="fast"',
  ]);
});

test("resolveCodexCliRetryAttempts defaults to 2", () => {
  const previous = process.env.CODEX_LOCAL_CLI_RETRY_ATTEMPTS;
  delete process.env.CODEX_LOCAL_CLI_RETRY_ATTEMPTS;
  try {
    assert.equal(__internal.resolveCodexCliRetryAttempts(), 2);
  } finally {
    if (typeof previous === "string") {
      process.env.CODEX_LOCAL_CLI_RETRY_ATTEMPTS = previous;
    } else {
      delete process.env.CODEX_LOCAL_CLI_RETRY_ATTEMPTS;
    }
  }
});

test("buildCodexExecArgs includes config overrides, output schema, and disables color noise", () => {
  const args = __internal.buildCodexExecArgs({
    argsPrefix: ["codex.js"],
    promptFromStdin: true,
    outputFile: "C:\\temp\\result.txt",
    model: "gpt-5.4",
    configOverrides: ['service_tier="fast"'],
    outputSchemaFile: "C:\\temp\\schema.json",
  });

  assert.deepEqual(args, [
    "codex.js",
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--color",
    "never",
    "--sandbox",
    "read-only",
    "--model",
    "gpt-5.4",
    "-c",
    'service_tier="fast"',
    "--output-schema",
    "C:\\temp\\schema.json",
    "--output-last-message",
    "C:\\temp\\result.txt",
    "-",
  ]);
});

test("buildCodexExecArgs includes image attachment inputs before exec prompt payload", () => {
  const args = __internal.buildCodexExecArgs({
    argsPrefix: ["codex.js"],
    promptFromStdin: true,
    outputFile: "C:\\temp\\result.txt",
    inputFiles: ["C:\\temp\\anchor.png", "C:\\temp\\layout.jpg"],
  });

  assert.deepEqual(args, [
    "codex.js",
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--color",
    "never",
    "--sandbox",
    "read-only",
    "-i",
    "C:\\temp\\anchor.png",
    "-i",
    "C:\\temp\\layout.jpg",
    "--output-last-message",
    "C:\\temp\\result.txt",
    "-",
  ]);
});

test("buildCodexExecArgs can opt image generation into workspace-write sandbox", () => {
  const args = __internal.buildCodexExecArgs({
    argsPrefix: ["codex.js"],
    promptFromStdin: true,
    outputFile: "C:\\temp\\result.txt",
    sandbox: "workspace-write",
  });

  assert.deepEqual(args.slice(args.indexOf("--sandbox"), args.indexOf("--sandbox") + 2), [
    "--sandbox",
    "workspace-write",
  ]);
});

test("isRejectedOutputSchemaError detects outdated codex cli option failures", () => {
  const error = Object.assign(new Error("Command failed: codex exec ..."), {
    stderr: "error: unexpected argument '--output-schema' found",
  });
  assert.equal(__internal.isRejectedOutputSchemaError(error), true);
});

test("isRejectedOutputSchemaError detects invalid JSON schema rejections from the API", () => {
  const error = Object.assign(new Error("Command failed: codex exec ..."), {
    stdout: '{"type":"error","message":"{\\"type\\": \\"error\\", \\"error\\": {\\"type\\": \\"invalid_request_error\\", \\"code\\": \\"invalid_json_schema\\"}}',
  });
  assert.equal(__internal.isRejectedOutputSchemaError(error), true);
});

test("execFileWithClosedStdin lets stdin-waiting child processes finish", async () => {
  const program = [
    "process.stdin.resume();",
    "process.stdin.on('end', () => { process.stdout.write('stdin-closed'); });",
  ].join("");
  const result = await __internal.execFileWithClosedStdin(
    process.execPath,
    ["-e", program],
    {
      timeout: 2_000,
      maxBuffer: 1024 * 128,
      env: process.env,
    }
  );
  assert.match(String(result.stdout), /stdin-closed/);
});

test("execFileWithClosedStdin can send prompt content through stdin", async () => {
  const program = [
    "let data='';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => { data += chunk; });",
    "process.stdin.on('end', () => { process.stdout.write(data); });",
  ].join("");
  const result = await __internal.execFileWithClosedStdin(
    process.execPath,
    ["-e", program],
    {
      timeout: 2_000,
      maxBuffer: 1024 * 128,
      env: process.env,
      stdinText: "hello via stdin",
    }
  );
  assert.equal(String(result.stdout), "hello via stdin");
});

test("execFileWithClosedStdin can run inside a requested cwd", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "codex-local-cli-cwd-test-"));
  const result = await __internal.execFileWithClosedStdin(
    process.execPath,
    ["-e", "process.stdout.write(process.cwd())"],
    {
      timeout: 2_000,
      maxBuffer: 1024 * 128,
      env: process.env,
      cwd: tempDir,
    }
  );
  assert.equal(String(result.stdout), tempDir);
});

test("runLocalCodexCliPrompt executes schema-less helper CLIs", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "codex-local-cli-test-"));
  const helperPath = join(tempDir, "fake-codex.js");
  await writeFile(
    helperPath,
    [
      "import { writeFileSync } from 'node:fs';",
      "const args = process.argv.slice(2);",
      "const outputIndex = args.indexOf('--output-last-message');",
      "if (outputIndex === -1 || !args[outputIndex + 1]) process.exit(2);",
      "writeFileSync(args[outputIndex + 1], 'helper-ok\\n', 'utf8');",
    ].join("\n"),
    "utf8"
  );

  const previousCliPath = process.env.CODEX_CLI_PATH;
  process.env.CODEX_CLI_PATH = helperPath;
  try {
    const text = await runLocalCodexCliPrompt("hello", {
      outputPrefix: "schema-less-cli",
      timeoutMs: 5_000,
      maxBufferBytes: 1024 * 128,
      model: "gpt-5.4",
      configOverrides: ['service_tier="fast"'],
    });
    assert.equal(text, "helper-ok");
  } finally {
    if (typeof previousCliPath === "string") {
      process.env.CODEX_CLI_PATH = previousCliPath;
    } else {
      delete process.env.CODEX_CLI_PATH;
    }
  }
});

test("runLocalCodexCliPrompt falls back to schema-less mode when the API rejects the output schema", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "codex-local-cli-schema-reject-test-"));
  const helperPath = join(tempDir, "fake-codex.js");
  await writeFile(
    helperPath,
    [
      "import { writeFileSync } from 'node:fs';",
      "const args = process.argv.slice(2);",
      "const outputIndex = args.indexOf('--output-last-message');",
      "const schemaIndex = args.indexOf('--output-schema');",
      "if (schemaIndex !== -1) {",
      "  process.stdout.write('{\"type\":\"error\",\"message\":\"{\\\\\"type\\\\\": \\\\\"error\\\\\", \\\\\"error\\\\\": {\\\\\"type\\\\\": \\\\\"invalid_request_error\\\\\", \\\\\"code\\\\\": \\\\\"invalid_json_schema\\\\\"}}\"}\\n');",
      "  process.exit(1);",
      "}",
      "if (outputIndex === -1 || !args[outputIndex + 1]) process.exit(2);",
      "writeFileSync(args[outputIndex + 1], 'schema-fallback-ok\\n', 'utf8');",
    ].join("\n"),
    "utf8"
  );

  const previousCliPath = process.env.CODEX_CLI_PATH;
  process.env.CODEX_CLI_PATH = helperPath;
  try {
    const text = await runLocalCodexCliPrompt("hello", {
      outputPrefix: "schema-reject-cli",
      timeoutMs: 5_000,
      maxBufferBytes: 1024 * 128,
      model: "gpt-5.4",
      configOverrides: ['service_tier="fast"'],
      outputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["value"],
        properties: {
          value: { type: "string" },
        },
      },
    });
    assert.equal(text, "schema-fallback-ok");
  } finally {
    if (typeof previousCliPath === "string") {
      process.env.CODEX_CLI_PATH = previousCliPath;
    } else {
      delete process.env.CODEX_CLI_PATH;
    }
  }
});
