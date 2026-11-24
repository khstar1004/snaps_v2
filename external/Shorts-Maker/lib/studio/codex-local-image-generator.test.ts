import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { CodexLocalImageGenerationError, __internal, generateCodexLocalImage, generateCodexLocalImages } from "./codex-local-image-generator";

test("buildCodexLocalImagePrompt always appends fixed square and no-text constraints", () => {
  const prompt = __internal.buildCodexLocalImagePrompt({
    slideIndex: 0,
    prompt: "A person reading a document",
    relativeOutputPath: "out/image.png",
    absoluteOutputPath: "C:/tmp/out/image.png",
    hasAnchorImage: false,
  });

  assert.match(prompt, /square 1:1 composition/);
  assert.match(prompt, /no text/);
});

const PNG_SIGNATURE_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);

test("parseCodexLocalImageManifest extracts clean JSON payloads", () => {
  const manifest = __internal.parseCodexLocalImageManifest(
    '```json\n{"slideIndex":0,"status":"ok","filePath":"tmp/codex-imagegen/request-1/slide-01.png"}\n```'
  );

  assert.deepEqual(manifest, {
    slideIndex: 0,
    status: "ok",
    filePath: "tmp/codex-imagegen/request-1/slide-01.png",
  });
});

test("parseCodexLocalImageManifest accepts success payloads without workspace file paths", () => {
  const manifest = __internal.parseCodexLocalImageManifest('{"slideIndex":0,"status":"ok"}');

  assert.deepEqual(manifest, {
    slideIndex: 0,
    status: "ok",
    filePath: undefined,
  });
});

test("extractThreadIdFromJsonStream reads the Codex thread id from JSONL output", () => {
  const threadId = __internal.extractThreadIdFromJsonStream(
    ['{"type":"thread.started","thread_id":"thread-123"}', '{"type":"turn.started"}'].join("\n")
  );

  assert.equal(threadId, "thread-123");
});

test("resolveCodexLocalImageBatchConcurrency defaults to 12 and clamps configured values", () => {
  const previous = process.env.CODEX_LOCAL_IMAGE_BATCH_CONCURRENCY;
  try {
    delete process.env.CODEX_LOCAL_IMAGE_BATCH_CONCURRENCY;
    assert.equal(__internal.resolveCodexLocalImageBatchConcurrency(), 12);

    process.env.CODEX_LOCAL_IMAGE_BATCH_CONCURRENCY = "2";
    assert.equal(__internal.resolveCodexLocalImageBatchConcurrency(), 2);

    process.env.CODEX_LOCAL_IMAGE_BATCH_CONCURRENCY = "99";
    assert.equal(__internal.resolveCodexLocalImageBatchConcurrency(), 12);
  } finally {
    if (typeof previous === "string") {
      process.env.CODEX_LOCAL_IMAGE_BATCH_CONCURRENCY = previous;
    } else {
      delete process.env.CODEX_LOCAL_IMAGE_BATCH_CONCURRENCY;
    }
  }
});

test("generateCodexLocalImage rejects manifests that point at a missing output file", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-local-imagegen-missing-"));

  await assert.rejects(
    () =>
      generateCodexLocalImage(
        {
          slideIndex: 0,
          prompt: "missing file test",
          requestId: "request-1",
          workspaceRoot,
        },
        {
          runLocalCodexCliPromptDetailed: async () => ({
            lastMessage: '{"slideIndex":0,"status":"ok","filePath":"tmp/codex-imagegen/request-1/slide-01.png"}',
            stdoutJsonl: '{"type":"thread.started","thread_id":"thread-missing-file"}',
            stderrText: "",
          }),
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof CodexLocalImageGenerationError);
      assert.equal(error.code, "output_file_missing");
      return true;
    }
  );
});

test("generateCodexLocalImage rejects invalid non-image bytes", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-local-imagegen-invalid-"));
  const relativeFilePath = "tmp/codex-imagegen/request-2/slide-01.png";
  const absoluteFilePath = join(workspaceRoot, relativeFilePath);

  await assert.rejects(
    () =>
      generateCodexLocalImage(
        {
          slideIndex: 0,
          prompt: "invalid bytes test",
          requestId: "request-2",
          workspaceRoot,
        },
        {
          runLocalCodexCliPromptDetailed: async () => {
            await mkdir(dirname(absoluteFilePath), { recursive: true });
            await writeFile(absoluteFilePath, "not-an-image", "utf8");
            return {
              lastMessage: `{"slideIndex":0,"status":"ok","filePath":"${relativeFilePath.replace(/\\/g, "/")}"}`,
              stdoutJsonl: '{"type":"thread.started","thread_id":"thread-invalid-bytes"}',
              stderrText: "",
            };
          },
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof CodexLocalImageGenerationError);
      assert.equal(error.code, "invalid_image_bytes");
      return true;
    }
  );
});

test("generateCodexLocalImage runs Codex in the request directory with workspace-write sandbox", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-local-imagegen-sandbox-"));
  const requestId = "request-sandbox";
  const relativeFilePath = "tmp/codex-imagegen/request-sandbox/slide-01.png";
  const absoluteFilePath = join(workspaceRoot, relativeFilePath);

  const result = await generateCodexLocalImage(
    {
      slideIndex: 0,
      prompt: "sandbox options test",
      requestId,
      workspaceRoot,
    },
    {
      runLocalCodexCliPromptDetailed: async (_prompt, options) => {
        assert.equal(options.sandbox, "workspace-write");
        assert.equal(options.cwd, resolve(workspaceRoot, "tmp", "codex-imagegen", requestId));
        await mkdir(dirname(absoluteFilePath), { recursive: true });
        await writeFile(absoluteFilePath, PNG_SIGNATURE_BYTES);
        return {
          lastMessage: `{"slideIndex":0,"status":"ok","filePath":"${relativeFilePath}"}`,
          stdoutJsonl: '{"type":"thread.started","thread_id":"thread-sandbox"}',
          stderrText: "",
        };
      },
    }
  );

  assert.equal(result.status, "ok");
  assert.equal(result.filePath, relativeFilePath);
});

test("generateCodexLocalImages returns partial success results without aborting the batch", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-local-imagegen-batch-"));

  const result = await generateCodexLocalImages(
    {
      requestId: "request-3",
      workspaceRoot,
      items: [
        {
          slideIndex: 0,
          prompt: "first slide",
        },
        {
          slideIndex: 1,
          prompt: "second slide",
        },
      ],
    },
    {
      runLocalCodexCliPromptDetailed: async (_prompt, options) => {
        const match = String(options.outputPrefix || "").match(/(\d{2})$/);
        const slideIndex = Math.max(0, (match ? Number(match[1]) : 1) - 1);
        const relativePath = `tmp/codex-imagegen/request-3/slide-${String(slideIndex + 1).padStart(2, "0")}.png`;
        const absolutePath = join(workspaceRoot, relativePath);
        if (slideIndex === 0) {
          await mkdir(dirname(absolutePath), { recursive: true });
          await writeFile(absolutePath, PNG_SIGNATURE_BYTES);
          return {
            lastMessage: `{"slideIndex":0,"status":"ok","filePath":"${relativePath}"}`,
            stdoutJsonl: '{"type":"thread.started","thread_id":"thread-batch-ok"}',
            stderrText: "",
          };
        }
        return {
          lastMessage: '{"slideIndex":1,"status":"error","reason":"generation failed"}',
          stdoutJsonl: '{"type":"thread.started","thread_id":"thread-batch-error"}',
          stderrText: "",
        };
      },
    }
  );

  assert.equal(result.requestId, "request-3");
  assert.equal(result.results.length, 2);
  assert.deepEqual(
    result.results.map((item) => ({ slideIndex: item.slideIndex, status: item.status, code: "code" in item ? item.code : undefined })),
    [
      { slideIndex: 0, status: "ok", code: undefined },
      { slideIndex: 1, status: "error", code: "manifest_error" },
    ]
  );
});

test("generateCodexLocalImages processes up to 12 groups in parallel while preserving result order", async () => {
  const previous = process.env.CODEX_LOCAL_IMAGE_BATCH_CONCURRENCY;
  process.env.CODEX_LOCAL_IMAGE_BATCH_CONCURRENCY = "12";
  try {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-local-imagegen-parallel-"));
    let inflight = 0;
    let maxInflight = 0;

    const result = await generateCodexLocalImages(
      {
        requestId: "request-parallel",
        workspaceRoot,
        items: Array.from({ length: 14 }, (_, slideIndex) => ({
          slideIndex,
          prompt: `slide ${slideIndex}`,
        })),
      },
      {
        runLocalCodexCliPromptDetailed: async (_prompt, options) => {
          inflight += 1;
          maxInflight = Math.max(maxInflight, inflight);
          const outputFile = String(options.outputPrefix || "");
          const match = outputFile.match(/(\d{2})$/);
          const slideNumber = match ? Number(match[1]) : inflight;
          const slideIndex = Math.max(0, slideNumber - 1);
          const relativePath = `tmp/codex-imagegen/request-parallel/slide-${String(slideIndex + 1).padStart(2, "0")}.png`;
          const absolutePath = join(workspaceRoot, relativePath);
          await new Promise((resolve) => setTimeout(resolve, 40));
          await mkdir(dirname(absolutePath), { recursive: true });
          await writeFile(absolutePath, PNG_SIGNATURE_BYTES);
          inflight -= 1;
          return {
            lastMessage: `{"slideIndex":${slideIndex},"status":"ok","filePath":"${relativePath}"}`,
            stdoutJsonl: `{"type":"thread.started","thread_id":"thread-parallel-${slideIndex}"}`,
            stderrText: "",
          };
        },
      }
    );

    assert.equal(maxInflight, 12);
    assert.deepEqual(
      result.results.map((item) => item.slideIndex),
      Array.from({ length: 14 }, (_, slideIndex) => slideIndex)
    );
    assert.deepEqual(
      result.results.map((item) => item.status),
      Array.from({ length: 14 }, () => "ok")
    );
  } finally {
    if (typeof previous === "string") {
      process.env.CODEX_LOCAL_IMAGE_BATCH_CONCURRENCY = previous;
    } else {
      delete process.env.CODEX_LOCAL_IMAGE_BATCH_CONCURRENCY;
    }
  }
});

test("generateCodexLocalImage materializes the generated_images artifact when the manifest omits filePath", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-local-imagegen-artifact-"));
  const codexHome = await mkdtemp(join(tmpdir(), "codex-home-"));
  const threadId = "thread-artifact-ok";
  const generatedDir = join(codexHome, "generated_images", threadId);
  const generatedPath = join(generatedDir, "ig_test.png");
  await mkdir(generatedDir, { recursive: true });
  await writeFile(generatedPath, PNG_SIGNATURE_BYTES);

  const result = await generateCodexLocalImage(
    {
      slideIndex: 0,
      prompt: "artifact recovery test",
      requestId: "request-artifact",
      workspaceRoot,
    },
    {
      runLocalCodexCliPromptDetailed: async () => ({
        lastMessage: '{"slideIndex":0,"status":"ok"}',
        stdoutJsonl: `{"type":"thread.started","thread_id":"${threadId}"}`,
        stderrText: "",
      }),
      resolveCodexHomeDirForMarkers: async () => codexHome,
    }
  );

  assert.equal(result.status, "ok");
  assert.equal(result.filePath, "tmp/codex-imagegen/request-artifact/slide-01.png");
  assert.deepEqual(result.fileBuffer, PNG_SIGNATURE_BYTES);
});

test("generateCodexLocalImage falls back to generated_images when the workspace copy path is missing", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "codex-local-imagegen-fallback-"));
  const codexHome = await mkdtemp(join(tmpdir(), "codex-home-"));
  const threadId = "thread-fallback-ok";
  const generatedDir = join(codexHome, "generated_images", threadId);
  const generatedPath = join(generatedDir, "ig_test.png");
  await mkdir(generatedDir, { recursive: true });
  await writeFile(generatedPath, PNG_SIGNATURE_BYTES);

  const result = await generateCodexLocalImage(
    {
      slideIndex: 0,
      prompt: "artifact fallback test",
      requestId: "request-fallback",
      workspaceRoot,
    },
    {
      runLocalCodexCliPromptDetailed: async () => ({
        lastMessage: '{"slideIndex":0,"status":"ok","filePath":"tmp/codex-imagegen/request-fallback/slide-01.png"}',
        stdoutJsonl: `{"type":"thread.started","thread_id":"${threadId}"}`,
        stderrText: "",
      }),
      resolveCodexHomeDirForMarkers: async () => codexHome,
    }
  );

  assert.equal(result.status, "ok");
  assert.equal(result.filePath, "tmp/codex-imagegen/request-fallback/slide-01.png");
  assert.deepEqual(result.fileBuffer, PNG_SIGNATURE_BYTES);
});
