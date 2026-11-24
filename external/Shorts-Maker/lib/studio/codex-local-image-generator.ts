import { randomUUID } from "node:crypto";
import { appendAiImageOutputConstraints } from "@/lib/studio/ai-image-output-constraints";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { resolveCodexHomeDirForMarkers } from "@/lib/auth/codex-local";
import { classifyLocalCodexCliError, runLocalCodexCliPrompt, runLocalCodexCliPromptDetailed } from "@/lib/auth/codex-local-cli";
import { fetchAnchorImageBytes } from "@/lib/studio/anchor-image-fetcher";

const CODEX_LOCAL_IMAGE_OUTPUT_ROOT = "tmp/codex-imagegen";
const CODEX_LOCAL_IMAGE_FAST_CONFIG_OVERRIDES = ['service_tier="fast"'];
const DEFAULT_CODEX_LOCAL_IMAGE_TIMEOUT_MS = 1000 * 60 * 5;
const DEFAULT_CODEX_LOCAL_IMAGE_BATCH_CONCURRENCY = 12;
const MAX_CODEX_LOCAL_IMAGE_BATCH_CONCURRENCY = 12;
const IMAGE_SIGNATURES = {
  png: { contentType: "image/png", ext: "png" },
  jpg: { contentType: "image/jpeg", ext: "jpg" },
  webp: { contentType: "image/webp", ext: "webp" },
  gif: { contentType: "image/gif", ext: "gif" },
} as const;

export type CodexLocalImageGenerationErrorCode =
  | "anchor_download_failed"
  | "cli_unavailable"
  | "execution_failed"
  | "invalid_image_bytes"
  | "manifest_error"
  | "manifest_invalid"
  | "manifest_missing"
  | "output_file_invalid"
  | "output_file_missing"
  | "timeout";

export class CodexLocalImageGenerationError extends Error {
  code: CodexLocalImageGenerationErrorCode;
  slideIndex: number;
  detail?: string;

  constructor(input: { code: CodexLocalImageGenerationErrorCode; slideIndex: number; message: string; detail?: string }) {
    super(input.message);
    this.name = "CodexLocalImageGenerationError";
    this.code = input.code;
    this.slideIndex = input.slideIndex;
    this.detail = input.detail;
  }
}

export type CodexLocalImageGenerationRequest = {
  slideIndex: number;
  prompt: string;
  codexModel?: string;
  anchorImageUrl?: string;
  requestId?: string;
  workspaceRoot?: string;
};

export type CodexLocalGeneratedImage = {
  slideIndex: number;
  status: "ok";
  requestId: string;
  filePath: string;
  absoluteFilePath: string;
  fileBuffer: Buffer;
  contentType: string;
  fileExtension: string;
  warnings: string[];
};

export type CodexLocalGeneratedImageFailure = {
  slideIndex: number;
  status: "error";
  requestId: string;
  code: CodexLocalImageGenerationErrorCode;
  reason: string;
  detail?: string;
  warnings: string[];
};

export type CodexLocalGeneratedImageResult = CodexLocalGeneratedImage | CodexLocalGeneratedImageFailure;

export type CodexLocalImageGeneratorDependencies = {
  cwd: () => string;
  fetchImpl: typeof fetch;
  mkdir: typeof mkdir;
  randomId: () => string;
  readdir: typeof readdir;
  readFile: typeof readFile;
  resolveCodexHomeDirForMarkers: typeof resolveCodexHomeDirForMarkers;
  runLocalCodexCliPrompt: typeof runLocalCodexCliPrompt;
  runLocalCodexCliPromptDetailed: typeof runLocalCodexCliPromptDetailed;
  stat: typeof stat;
  writeFile: typeof writeFile;
};

type CodexLocalImageManifest =
  | {
      slideIndex: number;
      status: "ok";
      filePath?: string;
    }
  | {
      slideIndex: number;
      status: "error";
      reason: string;
    };

const defaultCodexLocalImageGeneratorDependencies: CodexLocalImageGeneratorDependencies = {
  cwd: () => process.cwd(),
  fetchImpl: fetch,
  mkdir,
  randomId: () => randomUUID(),
  readdir,
  readFile,
  resolveCodexHomeDirForMarkers,
  runLocalCodexCliPrompt,
  runLocalCodexCliPromptDetailed,
  stat,
  writeFile,
};

function normalizeWhitespace(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveCodexLocalImageBatchConcurrency(): number {
  const configured = Number(process.env.CODEX_LOCAL_IMAGE_BATCH_CONCURRENCY || "");
  if (Number.isFinite(configured) && configured >= 1) {
    return Math.max(1, Math.min(MAX_CODEX_LOCAL_IMAGE_BATCH_CONCURRENCY, Math.floor(configured)));
  }
  return DEFAULT_CODEX_LOCAL_IMAGE_BATCH_CONCURRENCY;
}

function normalizeToPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function ensureDirectorySeparators(value: string): string {
  return value.replace(/[\\/]+/g, "/");
}

function extractJsonObjectText(raw: string): string {
  const stripped = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) {
    return stripped;
  }
  return stripped.slice(first, last + 1);
}

function isPathWithinWorkspace(workspaceRoot: string, candidatePath: string): boolean {
  const workspaceRelative = relative(workspaceRoot, candidatePath);
  return workspaceRelative === "" || (!workspaceRelative.startsWith("..") && !isAbsolute(workspaceRelative));
}

function resolveWorkspaceRoot(inputRoot: string | undefined, deps: CodexLocalImageGeneratorDependencies): string {
  return resolve(String(inputRoot || "").trim() || deps.cwd());
}

function resolveRelativeOutputPath(requestId: string, slideIndex: number): string {
  const safeSlideNumber = String(slideIndex + 1).padStart(2, "0");
  return `${CODEX_LOCAL_IMAGE_OUTPUT_ROOT}/${requestId}/slide-${safeSlideNumber}.png`;
}

function resolveAbsoluteOutputPath(workspaceRoot: string, relativeOutputPath: string): string {
  return resolve(workspaceRoot, ensureDirectorySeparators(relativeOutputPath));
}

function parseCodexLocalImageManifest(raw: string): CodexLocalImageManifest {
  const normalized = raw.trim();
  if (!normalized) {
    throw new Error("empty manifest");
  }
  const jsonText = extractJsonObjectText(normalized);
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  const slideIndex = Number(parsed.slideIndex);
  const status = normalizeWhitespace(parsed.status).toLowerCase();

  if (!Number.isFinite(slideIndex) || slideIndex < 0) {
    throw new Error("manifest slideIndex is invalid");
  }
  if (status === "ok") {
    const filePath = normalizeWhitespace(parsed.filePath) || undefined;
    return {
      slideIndex: Math.floor(slideIndex),
      status: "ok",
      filePath: filePath ? ensureDirectorySeparators(filePath) : undefined,
    };
  }
  if (status === "error") {
    const reason = normalizeWhitespace(parsed.reason);
    if (!reason) {
      throw new Error("manifest reason is missing");
    }
    return {
      slideIndex: Math.floor(slideIndex),
      status: "error",
      reason,
    };
  }
  throw new Error("manifest status is invalid");
}

function detectImageFileSignature(buffer: Buffer): { contentType: string; ext: string } | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return IMAGE_SIGNATURES.png;
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return IMAGE_SIGNATURES.jpg;
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(Buffer.from("RIFF")) &&
    buffer.subarray(8, 12).equals(Buffer.from("WEBP"))
  ) {
    return IMAGE_SIGNATURES.webp;
  }
  if (buffer.length >= 6) {
    const header = buffer.subarray(0, 6).toString("ascii");
    if (header === "GIF87a" || header === "GIF89a") {
      return IMAGE_SIGNATURES.gif;
    }
  }
  return null;
}

function validateGeneratedImageFilePath(input: {
  workspaceRoot: string;
  manifestFilePath: string;
}): { relativeFilePath: string; absoluteFilePath: string } {
  const requestedPath = normalizeWhitespace(input.manifestFilePath);
  if (!requestedPath) {
    throw new Error("generated image file path is missing");
  }
  const normalizedPath = ensureDirectorySeparators(requestedPath);
  const absoluteFilePath = resolve(input.workspaceRoot, normalizedPath);
  if (!isPathWithinWorkspace(input.workspaceRoot, absoluteFilePath)) {
    throw new Error("generated image path must stay within the workspace");
  }
  return {
    relativeFilePath: normalizeToPosixPath(relative(input.workspaceRoot, absoluteFilePath)),
    absoluteFilePath,
  };
}

async function readAndValidateGeneratedImageFile(
  input: {
    workspaceRoot: string;
    manifestFilePath: string;
    slideIndex: number;
  },
  deps: CodexLocalImageGeneratorDependencies
): Promise<{
  filePath: string;
  absoluteFilePath: string;
  fileBuffer: Buffer;
  contentType: string;
  fileExtension: string;
}> {
  const paths = validateGeneratedImageFilePath({
    workspaceRoot: input.workspaceRoot,
    manifestFilePath: input.manifestFilePath,
  });
  let fileBuffer: Buffer;
  try {
    fileBuffer = await deps.readFile(paths.absoluteFilePath);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    if (code === "ENOENT") {
      throw new CodexLocalImageGenerationError({
        code: "output_file_missing",
        slideIndex: input.slideIndex,
        message: `Codex가 저장한 이미지 파일을 찾을 수 없습니다: ${paths.relativeFilePath}`,
      });
    }
    throw error;
  }
  const signature = detectImageFileSignature(fileBuffer);
  if (!signature) {
    throw new CodexLocalImageGenerationError({
      code: "invalid_image_bytes",
      slideIndex: input.slideIndex,
      message: `Codex 이미지 출력이 올바른 PNG/JPEG/WEBP/GIF 파일이 아닙니다: ${paths.relativeFilePath}`,
    });
  }
  const manifestExt = extname(paths.relativeFilePath).replace(/^\./, "").trim().toLowerCase();
  if (manifestExt && manifestExt !== signature.ext) {
    throw new CodexLocalImageGenerationError({
      code: "output_file_invalid",
      slideIndex: input.slideIndex,
      message: `Codex 이미지 출력 확장자와 실제 파일 형식이 다릅니다: ${paths.relativeFilePath}`,
      detail: `expected=${manifestExt} actual=${signature.ext}`,
    });
  }
  return {
    filePath: paths.relativeFilePath,
    absoluteFilePath: paths.absoluteFilePath,
    fileBuffer,
    contentType: signature.contentType,
    fileExtension: signature.ext,
  };
}

function buildCodexLocalImagePrompt(input: {
  slideIndex: number;
  prompt: string;
  relativeOutputPath: string;
  absoluteOutputPath: string;
  hasAnchorImage: boolean;
}): string {
  return [
    "$imagegen",
    "Generate exactly one square 1:1 raster image for the slide brief below.",
    input.hasAnchorImage
      ? "A reference image is attached. Use it only to preserve the mascot identity and overall style."
      : "No reference image is attached for this run.",
    "Do not run shell commands, do not inspect the filesystem, and do not try to copy or save files yourself.",
    "The host process will collect the generated image artifact automatically after this run.",
    `artifact_target_relative_path=${normalizeToPosixPath(input.relativeOutputPath)}`,
    `artifact_target_absolute_path=${normalizeToPosixPath(input.absoluteOutputPath)}`,
    "After image generation finishes, your final assistant message must be ONLY a single JSON object with no markdown and no extra text.",
    `Success JSON: {"slideIndex":${input.slideIndex},"status":"ok"}`,
    `Failure JSON: {"slideIndex":${input.slideIndex},"status":"error","reason":"brief reason"}`,
    "",
    "[Slide image brief]",
    appendAiImageOutputConstraints(input.prompt),
  ].join("\n");
}

function extractThreadIdFromJsonStream(streamText: string): string {
  const lines = streamText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed.type === "thread.started" && typeof parsed.thread_id === "string" && parsed.thread_id.trim()) {
        return parsed.thread_id.trim();
      }
    } catch {
      continue;
    }
  }
  return "";
}

async function listFilesRecursive(
  directoryPath: string,
  deps: Pick<CodexLocalImageGeneratorDependencies, "readdir">
): Promise<string[]> {
  const entries = await deps.readdir(directoryPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath, deps)));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function findGeneratedImageArtifactFile(
  input: {
    threadId: string;
    slideIndex: number;
  },
  deps: Pick<CodexLocalImageGeneratorDependencies, "readdir" | "resolveCodexHomeDirForMarkers" | "stat">
): Promise<string> {
  const codexHome = await deps.resolveCodexHomeDirForMarkers(["generated_images", "auth.json"]);
  const threadDirectory = join(codexHome, "generated_images", input.threadId);
  let files: string[];
  try {
    files = await listFilesRecursive(threadDirectory, deps);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    if (code === "ENOENT") {
      throw new CodexLocalImageGenerationError({
        code: "output_file_missing",
        slideIndex: input.slideIndex,
        message: `Codex generated_images 산출물을 찾을 수 없습니다: ${threadDirectory}`,
      });
    }
    throw error;
  }

  const candidates = await Promise.all(
    files
      .filter((filePath) => /\.(png|jpe?g|webp|gif)$/i.test(filePath))
      .map(async (filePath) => ({
        filePath,
        stats: await deps.stat(filePath),
      }))
  );
  const newest = candidates
    .filter((candidate) => candidate.stats.isFile())
    .sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs)[0];
  if (!newest) {
    throw new CodexLocalImageGenerationError({
      code: "output_file_missing",
      slideIndex: input.slideIndex,
      message: `Codex generated_images에서 이미지 파일을 찾을 수 없습니다: ${threadDirectory}`,
    });
  }
  return newest.filePath;
}

async function materializeGeneratedImageArtifactToWorkspace(
  input: {
    workspaceRoot: string;
    relativeOutputPath: string;
    slideIndex: number;
    threadId: string;
  },
  deps: Pick<CodexLocalImageGeneratorDependencies, "mkdir" | "readFile" | "readdir" | "resolveCodexHomeDirForMarkers" | "stat" | "writeFile">
): Promise<{
  filePath: string;
  absoluteFilePath: string;
  fileBuffer: Buffer;
  contentType: string;
  fileExtension: string;
}> {
  const sourceFilePath = await findGeneratedImageArtifactFile(
    {
      threadId: input.threadId,
      slideIndex: input.slideIndex,
    },
    deps
  );
  const fileBuffer = await deps.readFile(sourceFilePath);
  const signature = detectImageFileSignature(fileBuffer);
  if (!signature) {
    throw new CodexLocalImageGenerationError({
      code: "invalid_image_bytes",
      slideIndex: input.slideIndex,
      message: `Codex generated_images 출력이 올바른 PNG/JPEG/WEBP/GIF 파일이 아닙니다: ${sourceFilePath}`,
    });
  }
  const absoluteFilePath = resolveAbsoluteOutputPath(input.workspaceRoot, input.relativeOutputPath);
  await deps.mkdir(dirname(absoluteFilePath), { recursive: true });
  await deps.writeFile(absoluteFilePath, fileBuffer);
  return {
    filePath: normalizeToPosixPath(relative(input.workspaceRoot, absoluteFilePath)),
    absoluteFilePath,
    fileBuffer,
    contentType: signature.contentType,
    fileExtension: signature.ext,
  };
}

function resolveAnchorFileExtension(input: { url: string; contentType: string; buffer: Buffer }): string {
  const signature = detectImageFileSignature(input.buffer);
  if (signature?.ext) return signature.ext;
  const normalizedType = normalizeWhitespace(input.contentType).toLowerCase();
  if (normalizedType === "image/png") return "png";
  if (normalizedType === "image/jpeg" || normalizedType === "image/jpg") return "jpg";
  if (normalizedType === "image/webp") return "webp";
  if (normalizedType === "image/gif") return "gif";
  const urlExt = extname(input.url).replace(/^\./, "").trim().toLowerCase();
  return urlExt || "png";
}

async function prepareOptionalAnchorImageAttachment(
  input: {
    anchorImageUrl?: string;
    requestDir: string;
    slideIndex: number;
  },
  deps: CodexLocalImageGeneratorDependencies
): Promise<{ inputFiles: string[]; warnings: string[] }> {
  const anchorImageUrl = normalizeWhitespace(input.anchorImageUrl);
  if (!anchorImageUrl) {
    return { inputFiles: [], warnings: [] };
  }
  try {
    const attachment = await fetchAnchorImageBytes(anchorImageUrl, {
      fetchImpl: deps.fetchImpl,
      readFile: deps.readFile,
      stat: deps.stat,
    });
    const buffer = attachment.buffer;
    const signature = detectImageFileSignature(buffer);
    if (!signature) {
      throw new Error("anchor image bytes are invalid");
    }
    const ext = resolveAnchorFileExtension({
      url: attachment.sourceUrl,
      contentType: attachment.contentType,
      buffer,
    });
    const targetPath = join(input.requestDir, `anchor-slide-${String(input.slideIndex + 1).padStart(2, "0")}.${ext}`);
    await deps.writeFile(targetPath, buffer);
    return {
      inputFiles: [targetPath],
      warnings: [],
    };
  } catch (error) {
    return {
      inputFiles: [],
      warnings: [
        `슬라이드 ${input.slideIndex + 1}: 마스코트 기준 이미지를 첨부하지 못해 텍스트 프롬프트만으로 생성합니다.`,
      ],
    };
  }
}

function normalizeCodexLocalImageGenerationFailure(
  error: unknown,
  input: { slideIndex: number }
): CodexLocalImageGenerationError {
  if (error instanceof CodexLocalImageGenerationError) {
    return error;
  }
  const message = normalizeWhitespace(error instanceof Error ? error.message : String(error)) || "Codex 이미지 생성 실패";
  const kind = classifyLocalCodexCliError(error);
  if (kind === "not_found") {
    return new CodexLocalImageGenerationError({
      code: "cli_unavailable",
      slideIndex: input.slideIndex,
      message: "로컬 Codex CLI를 찾을 수 없습니다.",
      detail: message,
    });
  }
  if (kind === "timeout") {
    return new CodexLocalImageGenerationError({
      code: "timeout",
      slideIndex: input.slideIndex,
      message: "Codex 이미지 생성이 시간 초과되었습니다.",
      detail: message,
    });
  }
  return new CodexLocalImageGenerationError({
    code: "execution_failed",
    slideIndex: input.slideIndex,
    message: "Codex 이미지 생성 실행에 실패했습니다.",
    detail: message,
  });
}

export async function generateCodexLocalImage(
  input: CodexLocalImageGenerationRequest,
  overrides?: Partial<CodexLocalImageGeneratorDependencies>
): Promise<CodexLocalGeneratedImage> {
  const deps = {
    ...defaultCodexLocalImageGeneratorDependencies,
    ...overrides,
  };
  const workspaceRoot = resolveWorkspaceRoot(input.workspaceRoot, deps);
  const requestId = normalizeWhitespace(input.requestId) || deps.randomId();
  const relativeOutputPath = resolveRelativeOutputPath(requestId, input.slideIndex);
  const absoluteOutputPath = resolveAbsoluteOutputPath(workspaceRoot, relativeOutputPath);
  const requestDir = resolve(workspaceRoot, CODEX_LOCAL_IMAGE_OUTPUT_ROOT, requestId);
  await deps.mkdir(requestDir, { recursive: true });

  const anchorAttachment = await prepareOptionalAnchorImageAttachment(
    {
      anchorImageUrl: input.anchorImageUrl,
      requestDir,
      slideIndex: input.slideIndex,
    },
    deps
  );
  const prompt = buildCodexLocalImagePrompt({
    slideIndex: input.slideIndex,
    prompt: input.prompt,
    relativeOutputPath,
    absoluteOutputPath,
    hasAnchorImage: anchorAttachment.inputFiles.length > 0,
  });

  let manifestText = "";
  let stdoutJsonl = "";
  try {
    const result = await deps.runLocalCodexCliPromptDetailed(prompt, {
      outputPrefix: `codex-imagegen-slide-${String(input.slideIndex + 1).padStart(2, "0")}`,
      timeoutMs: DEFAULT_CODEX_LOCAL_IMAGE_TIMEOUT_MS,
      maxBufferBytes: 1024 * 1024 * 8,
      model: input.codexModel,
      sandbox: "workspace-write",
      cwd: requestDir,
      configOverrides: CODEX_LOCAL_IMAGE_FAST_CONFIG_OVERRIDES,
      inputFiles: anchorAttachment.inputFiles,
    });
    manifestText = result.lastMessage;
    stdoutJsonl = result.stdoutJsonl;
  } catch (error) {
    throw normalizeCodexLocalImageGenerationFailure(error, { slideIndex: input.slideIndex });
  }

  if (!normalizeWhitespace(manifestText)) {
    throw new CodexLocalImageGenerationError({
      code: "manifest_missing",
      slideIndex: input.slideIndex,
      message: "Codex가 이미지 생성 manifest를 반환하지 않았습니다.",
    });
  }

  let manifest: CodexLocalImageManifest;
  try {
    manifest = parseCodexLocalImageManifest(manifestText);
  } catch (error) {
    throw new CodexLocalImageGenerationError({
      code: "manifest_invalid",
      slideIndex: input.slideIndex,
      message: "Codex 이미지 생성 manifest를 해석하지 못했습니다.",
      detail: normalizeWhitespace(error instanceof Error ? error.message : String(error)),
    });
  }

  if (manifest.status === "error") {
    throw new CodexLocalImageGenerationError({
      code: "manifest_error",
      slideIndex: input.slideIndex,
      message: `Codex 이미지 생성 실패: ${manifest.reason}`,
    });
  }

  if (manifest.slideIndex !== input.slideIndex) {
    throw new CodexLocalImageGenerationError({
      code: "manifest_invalid",
      slideIndex: input.slideIndex,
      message: `Codex 이미지 생성 manifest의 slideIndex가 요청과 다릅니다: ${manifest.slideIndex}`,
    });
  }

  const threadId = extractThreadIdFromJsonStream(stdoutJsonl);
  let validatedFile:
    | {
        filePath: string;
        absoluteFilePath: string;
        fileBuffer: Buffer;
        contentType: string;
        fileExtension: string;
      }
    | undefined;
  if (manifest.filePath) {
    try {
      validatedFile = await readAndValidateGeneratedImageFile(
        {
          workspaceRoot,
          manifestFilePath: manifest.filePath,
          slideIndex: input.slideIndex,
        },
        deps
      );
    } catch (error) {
      if (!threadId) throw error;
      try {
        validatedFile = await materializeGeneratedImageArtifactToWorkspace(
          {
            workspaceRoot,
            relativeOutputPath,
            slideIndex: input.slideIndex,
            threadId,
          },
          deps
        );
      } catch {
        throw error;
      }
    }
  } else {
    if (!threadId) {
      throw new CodexLocalImageGenerationError({
        code: "manifest_missing",
        slideIndex: input.slideIndex,
        message: "Codex가 생성 이미지 thread_id를 반환하지 않았습니다.",
      });
    }
    validatedFile = await materializeGeneratedImageArtifactToWorkspace(
      {
        workspaceRoot,
        relativeOutputPath,
        slideIndex: input.slideIndex,
        threadId,
      },
      deps
    );
  }

  return {
    slideIndex: input.slideIndex,
    status: "ok",
    requestId,
    filePath: validatedFile.filePath,
    absoluteFilePath: validatedFile.absoluteFilePath,
    fileBuffer: validatedFile.fileBuffer,
    contentType: validatedFile.contentType,
    fileExtension: validatedFile.fileExtension,
    warnings: anchorAttachment.warnings,
  };
}

export async function generateCodexLocalImages(
  input: {
    items: CodexLocalImageGenerationRequest[];
    requestId?: string;
    workspaceRoot?: string;
  },
  overrides?: Partial<CodexLocalImageGeneratorDependencies>
): Promise<{
  requestId: string;
  outputDir: string;
  results: CodexLocalGeneratedImageResult[];
}> {
  const deps = {
    ...defaultCodexLocalImageGeneratorDependencies,
    ...overrides,
  };
  const requestId = normalizeWhitespace(input.requestId) || deps.randomId();
  const workspaceRoot = resolveWorkspaceRoot(input.workspaceRoot, deps);
  const results: CodexLocalGeneratedImageResult[] = new Array(input.items.length);
  const workerCount = Math.min(Math.max(1, resolveCodexLocalImageBatchConcurrency()), Math.max(1, input.items.length));
  let nextIndex = 0;

  const runWorker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= input.items.length) return;
      const item = input.items[currentIndex];
      if (!item) return;
      try {
        results[currentIndex] = await generateCodexLocalImage(
          {
            ...item,
            requestId,
            workspaceRoot,
          },
          deps
        );
      } catch (error) {
        const normalized = normalizeCodexLocalImageGenerationFailure(error, { slideIndex: item.slideIndex });
        results[currentIndex] = {
          slideIndex: item.slideIndex,
          status: "error",
          requestId,
          code: normalized.code,
          reason: normalized.message,
          detail: normalized.detail,
          warnings: [],
        };
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return {
    requestId,
    outputDir: `${CODEX_LOCAL_IMAGE_OUTPUT_ROOT}/${requestId}`,
    results: results.filter((item): item is CodexLocalGeneratedImageResult => Boolean(item)),
  };
}

export const __internal = {
  buildCodexLocalImagePrompt,
  detectImageFileSignature,
  extractThreadIdFromJsonStream,
  findGeneratedImageArtifactFile,
  materializeGeneratedImageArtifactToWorkspace,
  parseCodexLocalImageManifest,
  readAndValidateGeneratedImageFile,
  resolveCodexLocalImageBatchConcurrency,
  validateGeneratedImageFilePath,
};
