import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { existsSync } from "node:fs";
import { resolveCodexHomeDirForMarkers } from "@/lib/auth/codex-local";

type RunLocalCodexCliOptions = {
  outputPrefix: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
  model?: string;
  sandbox?: LocalCodexCliSandbox;
  cwd?: string;
  outputSchema?: Record<string, unknown>;
  configOverrides?: string[];
  inputFiles?: string[];
};

type LocalCodexCliSandbox = "read-only" | "workspace-write";

const DEFAULT_LOCAL_CODEX_CLI_MODEL = "gpt-5.6-sol";
const DEFAULT_LOCAL_CODEX_CLI_CONFIG_OVERRIDES = ['model_reasoning_effort="medium"', 'service_tier="fast"'];
const MIN_FRONTIER_CODEX_TIMEOUT_MS = 1000 * 60 * 2;

function splitPathEntries(value: string): string[] {
  return value
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

type ResolvedCodexCliCommand = {
  command: string;
  argsPrefix: string[];
  envPath?: string;
};

function buildNodeCodexCommand(scriptPath: string, envPath?: string): ResolvedCodexCliCommand {
  return {
    command: process.execPath,
    argsPrefix: [scriptPath],
    envPath,
  };
}

function resolveCodexCliCommand(): ResolvedCodexCliCommand {
  const configured = String(process.env.CODEX_CLI_PATH || "").trim();
  if (configured && existsSync(configured)) {
    const lowered = configured.toLowerCase();
    if (lowered.endsWith(".js")) {
      return buildNodeCodexCommand(configured);
    }
    if (lowered.endsWith(".cmd") || lowered.endsWith(".bat") || lowered.endsWith(".ps1")) {
      const baseDir = configured.includes("\\") ? configured.slice(0, configured.lastIndexOf("\\")) : "";
      const jsCandidate = baseDir ? join(baseDir, "node_modules", "@openai", "codex", "bin", "codex.js") : "";
      if (jsCandidate && existsSync(jsCandidate)) {
        return buildNodeCodexCommand(jsCandidate, baseDir);
      }
    }
    return { command: configured, argsPrefix: [] };
  }

  const pathKeys = ["PATH", "Path"];
  const pathEntries = pathKeys.flatMap((key) => splitPathEntries(String(process.env[key] || "")));
  const npmDirCandidates = Array.from(
    new Set([
      ...pathEntries,
      join(String(process.env.APPDATA || ""), "npm"),
      join(String(process.env.USERPROFILE || ""), "AppData", "Roaming", "npm"),
    ].filter(Boolean))
  );
  const jsCandidates = npmDirCandidates.map((dir) => join(dir, "node_modules", "@openai", "codex", "bin", "codex.js"));
  const jsMatched = jsCandidates.find((candidate) => existsSync(candidate));
  if (jsMatched) {
    const envPath = Array.from(new Set([join(String(process.env.APPDATA || ""), "npm"), ...pathEntries])).join(delimiter);
    return buildNodeCodexCommand(jsMatched, envPath);
  }

  const windowsCandidates = [
    ...pathEntries.flatMap((entry) => [join(entry, "codex.cmd"), join(entry, "codex.exe"), join(entry, "codex")]),
    join(String(process.env.APPDATA || ""), "npm", "codex.cmd"),
    join(String(process.env.APPDATA || ""), "npm", "codex.exe"),
    join(String(process.env.APPDATA || ""), "npm", "codex"),
    join(String(process.env.USERPROFILE || ""), "AppData", "Roaming", "npm", "codex.cmd"),
    join(String(process.env.USERPROFILE || ""), "AppData", "Roaming", "npm", "codex.exe"),
    join(String(process.env.USERPROFILE || ""), "AppData", "Roaming", "npm", "codex"),
  ];
  const matched = windowsCandidates.find((candidate) => candidate && existsSync(candidate));
  if (matched) {
    const envPath = Array.from(new Set([join(String(process.env.APPDATA || ""), "npm"), ...pathEntries])).join(delimiter);
    return { command: matched, argsPrefix: [], envPath };
  }

  return { command: "codex", argsPrefix: [] };
}

function toTrimmedText(value: string | Buffer | null | undefined): string {
  if (typeof value === "string") return value.trim();
  if (value instanceof Buffer) return value.toString("utf8").trim();
  return "";
}

function extractAssistantMessageFromJsonStream(streamText: string): string {
  const lines = streamText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  const messages: string[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const item = parsed.item;
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const itemType = typeof row.type === "string" ? row.type : "";
      const text = typeof row.text === "string" ? row.text.trim() : "";
      if ((itemType === "agent_message" || itemType === "assistant_message") && text) {
        messages.push(text);
      }
    } catch {
      continue;
    }
  }
  return messages[messages.length - 1] || "";
}

function summarizeDebugOutput(label: string, value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return `${label}=<empty>`;
  return `${label}=${text.slice(0, 240)}`;
}

type ErrorWithCode = {
  code?: unknown;
  message?: unknown;
  stdout?: unknown;
  stderr?: unknown;
  signal?: unknown;
  killed?: unknown;
};

export type LocalCodexCliErrorKind = "not_found" | "timeout" | "execution_failed";

export type RunLocalCodexCliPromptResult = {
  lastMessage: string;
  stdoutJsonl: string;
  stderrText: string;
};

const RETRYABLE_CODEX_CLI_PATTERNS = [
  /responses_websocket/i,
  /failed to connect to websocket/i,
  /\b500\b/i,
  /\b502\b/i,
  /\b503\b/i,
  /\b504\b/i,
  /internal server error/i,
  /internal_error/i,
  /timeout/i,
  /timed out/i,
  /econnreset/i,
  /socket hang up/i,
  /temporar/i,
  /schema validation failed/i,
  /does not match (the )?output schema/i,
];

const UNSUPPORTED_OUTPUT_SCHEMA_PATTERNS = [
  /unknown option .*output-schema/i,
  /unexpected argument .*output-schema/i,
  /unrecognized option .*output-schema/i,
  /unexpected option .*output-schema/i,
];

const REJECTED_OUTPUT_SCHEMA_PATTERNS = [
  ...UNSUPPORTED_OUTPUT_SCHEMA_PATTERNS,
  /invalid_json_schema/i,
  /invalid schema/i,
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isCodexCliNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as ErrorWithCode;
  const code = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
  if (code === "ENOENT") return true;
  const message = typeof row.message === "string" ? row.message.toLowerCase() : "";
  return message.includes("spawn codex enoent");
}

export function classifyLocalCodexCliError(error: unknown): LocalCodexCliErrorKind {
  if (!error || typeof error !== "object") return "execution_failed";
  if (isCodexCliNotFoundError(error)) return "not_found";
  const row = error as ErrorWithCode;
  if (row.killed === true) return "timeout";
  const signal = typeof row.signal === "string" ? row.signal.trim().toUpperCase() : "";
  if (signal === "SIGTERM" || signal === "SIGKILL") return "timeout";
  const message = typeof row.message === "string" ? row.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("timed out") || message.includes("timeout")) return "timeout";
  return "execution_failed";
}

function isRetryableCodexCliError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (isCodexCliNotFoundError(error)) return false;
  const row = error as ErrorWithCode;
  if (row.killed === true) return true;
  const signal = typeof row.signal === "string" ? row.signal.trim().toUpperCase() : "";
  if (signal === "SIGTERM" || signal === "SIGKILL") return true;
  const message = typeof row.message === "string" ? row.message : String(error);
  const stdoutText = toTrimmedText(row.stdout as string | Buffer | null | undefined);
  const stderrText = toTrimmedText(row.stderr as string | Buffer | null | undefined);
  const combined = [message, stdoutText, stderrText].filter(Boolean).join("\n");
  return RETRYABLE_CODEX_CLI_PATTERNS.some((pattern) => pattern.test(combined));
}

function normalizeCodexCliExecError(
  error: unknown,
  options: { model?: string; timeoutMs: number }
): Error {
  if (!error || typeof error !== "object") {
    return new Error(String(error));
  }
  const row = error as ErrorWithCode;
  const rawMessage = typeof row.message === "string" ? row.message.trim() : String(error);
  const stdoutText = toTrimmedText(row.stdout as string | Buffer | null | undefined);
  const stderrText = toTrimmedText(row.stderr as string | Buffer | null | undefined);
  const signal = typeof row.signal === "string" ? row.signal.trim() : "";
  const parts: string[] = [];

  if (row.killed === true) {
    parts.push(`codex exec timed out after ${options.timeoutMs}ms`);
  } else if (rawMessage) {
    parts.push(rawMessage);
  } else {
    parts.push("codex exec failed");
  }

  if (options.model) {
    parts.push(`model=${options.model}`);
  }
  if (signal) {
    parts.push(`signal=${signal}`);
  }
  if (stdoutText) {
    parts.push(summarizeDebugOutput("stdout", stdoutText));
  }
  if (stderrText) {
    parts.push(summarizeDebugOutput("stderr", stderrText));
  }

  const normalized = new Error(parts.join(" | "));
  Object.assign(normalized, row);
  return normalized;
}

function isRejectedOutputSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as ErrorWithCode;
  const message = typeof row.message === "string" ? row.message : String(error);
  const stdoutText = toTrimmedText(row.stdout as string | Buffer | null | undefined);
  const stderrText = toTrimmedText(row.stderr as string | Buffer | null | undefined);
  const combined = [message, stdoutText, stderrText].filter(Boolean).join("\n");
  return REJECTED_OUTPUT_SCHEMA_PATTERNS.some((pattern) => pattern.test(combined));
}

export function resolveDefaultLocalCodexCliModel(): string {
  return String(process.env.CODEX_LOCAL_CLI_MODEL || "").trim() || DEFAULT_LOCAL_CODEX_CLI_MODEL;
}

function resolveDefaultLocalCodexCliConfigOverrides(): string[] {
  return [...DEFAULT_LOCAL_CODEX_CLI_CONFIG_OVERRIDES];
}

function mergeCodexCliConfigOverrides(overrides?: string[]): string[] {
  return Array.from(
    new Set(
      [...resolveDefaultLocalCodexCliConfigOverrides(), ...(overrides || [])]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function getCodexCliAttemptModels(model?: string): Array<string | undefined> {
  const explicitModel = String(model || "").trim();
  if (explicitModel) return [explicitModel];
  const defaultModel = resolveDefaultLocalCodexCliModel();
  return defaultModel ? [defaultModel] : [undefined];
}

function resolveEffectiveCodexCliTimeoutMs(timeoutMs: number, model?: string): number {
  const normalizedModel = String(model || "")
    .trim()
    .toLowerCase();
  if (normalizedModel.startsWith("gpt-5.4") || normalizedModel.startsWith("gpt-5.6")) {
    return Math.max(timeoutMs, MIN_FRONTIER_CODEX_TIMEOUT_MS);
  }
  return timeoutMs;
}

function resolveCodexCliRetryAttempts(): number {
  const raw = Number(process.env.CODEX_LOCAL_CLI_RETRY_ATTEMPTS || "");
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.max(1, Math.floor(raw));
  }
  return 2;
}

type ExecFileBufferedResult = {
  stdout: string | Buffer;
  stderr: string | Buffer;
};

type BuildCodexExecArgsOptions = {
  argsPrefix: string[];
  prompt?: string;
  promptFromStdin?: boolean;
  outputFile: string;
  model?: string;
  sandbox?: LocalCodexCliSandbox;
  outputSchemaFile?: string;
  configOverrides?: string[];
  inputFiles?: string[];
};

function buildCodexExecArgs(options: BuildCodexExecArgsOptions): string[] {
  const sandbox = options.sandbox || "read-only";
  return [
    ...options.argsPrefix,
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--color",
    "never",
    "--sandbox",
    sandbox,
    ...(options.model ? ["--model", options.model] : []),
    ...(options.configOverrides || []).flatMap((override) => ["-c", override]),
    ...(options.inputFiles || []).flatMap((inputFile) => ["-i", inputFile]),
    ...(options.outputSchemaFile ? ["--output-schema", options.outputSchemaFile] : []),
    "--output-last-message",
    options.outputFile,
    ...(options.promptFromStdin ? ["-"] : options.prompt ? [options.prompt] : []),
  ];
}

function execFileWithClosedStdin(
  command: string,
  args: string[],
  options: {
    timeout: number;
    maxBuffer: number;
    env: NodeJS.ProcessEnv;
    cwd?: string;
    stdinText?: string;
  }
): Promise<ExecFileBufferedResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        timeout: options.timeout,
        maxBuffer: options.maxBuffer,
        env: options.env,
        cwd: options.cwd,
      },
      (error, stdout, stderr) => {
        if (error) {
          Object.assign(error, { stdout, stderr });
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      }
    );

    if (typeof options.stdinText === "string") {
      child.stdin?.end(options.stdinText);
      return;
    }

    // Codex CLI checks stdin even when a prompt arg is provided.
    // Close it immediately so exec runs don't block waiting for EOF.
    child.stdin?.end();
  });
}

async function resolveCodexCliExecEnv(envPath?: string): Promise<NodeJS.ProcessEnv> {
  const resolvedCodexHome = await resolveCodexHomeDirForMarkers(["auth.json"]);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CODEX_HOME: resolvedCodexHome,
  };
  if (envPath) {
    env.PATH = envPath;
    env.Path = envPath;
  }
  return env;
}

export async function runLocalCodexCliPrompt(prompt: string, options: RunLocalCodexCliOptions): Promise<string> {
  const result = await runLocalCodexCliPromptDetailed(prompt, options);
  return result.lastMessage;
}

export async function runLocalCodexCliPromptDetailed(
  prompt: string,
  options: RunLocalCodexCliOptions
): Promise<RunLocalCodexCliPromptResult> {
  const model = String(options.model || "").trim();
  const attemptModels = getCodexCliAttemptModels(model);
  const execRetryAttempts = resolveCodexCliRetryAttempts();
  const { command, argsPrefix, envPath } = resolveCodexCliCommand();
  const timeout = resolveEffectiveCodexCliTimeoutMs(options.timeoutMs ?? 1000 * 60 * 3, model);
  const maxBuffer = options.maxBufferBytes ?? 1024 * 1024 * 8;
  const execEnv = await resolveCodexCliExecEnv(envPath);
  const configOverrides = mergeCodexCliConfigOverrides(options.configOverrides);
  const schemaModes = options.outputSchema ? [true, false] : [false];
  let lastError: Error | null = null;

  for (const attemptModel of attemptModels) {
    for (const useOutputSchema of schemaModes) {
      let fallbackToSchemaLessMode = false;

      for (let execAttempt = 1; execAttempt <= execRetryAttempts; execAttempt += 1) {
        const randomId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const outputFile = join(tmpdir(), `${options.outputPrefix}-${randomId}.txt`);
        const outputSchemaFile =
          useOutputSchema && options.outputSchema
            ? join(tmpdir(), `${options.outputPrefix}-${randomId}.schema.json`)
            : undefined;
        try {
          if (outputSchemaFile && options.outputSchema) {
            await writeFile(outputSchemaFile, `${JSON.stringify(options.outputSchema, null, 2)}\n`, "utf8");
          }

          const result = await execFileWithClosedStdin(
            command,
            buildCodexExecArgs({
              argsPrefix,
              promptFromStdin: true,
              outputFile,
              model: attemptModel,
              outputSchemaFile,
              configOverrides,
              inputFiles: options.inputFiles,
              sandbox: options.sandbox,
            }),
            {
              timeout,
              maxBuffer,
              env: execEnv,
              cwd: options.cwd,
              stdinText: prompt,
            }
          );

          const fileText = await readFile(outputFile, "utf8")
            .then((text) => text.trim())
            .catch((error) => {
              const code = error && typeof error === "object" && "code" in error ? String(error.code || "") : "";
              if (code === "ENOENT") return "";
              throw error;
            });
          const stdoutText = toTrimmedText(result.stdout);
          const stderrText = toTrimmedText(result.stderr);
          const jsonText = extractAssistantMessageFromJsonStream(stdoutText);
          const finalText = fileText || jsonText || stdoutText || stderrText;
          if (!finalText) {
            throw new Error(
              [
                "codex exec returned empty message",
                summarizeDebugOutput("stdout", stdoutText),
                summarizeDebugOutput("stderr", stderrText),
              ].join(" | ")
            );
          }
          return {
            lastMessage: finalText,
            stdoutJsonl: stdoutText,
            stderrText,
          };
        } catch (error) {
          const normalizedError = normalizeCodexCliExecError(error, {
            model: attemptModel,
            timeoutMs: timeout,
          });
          lastError = normalizedError;

          if (useOutputSchema && isRejectedOutputSchemaError(normalizedError)) {
            fallbackToSchemaLessMode = true;
            break;
          }

          if (execAttempt >= execRetryAttempts || !isRetryableCodexCliError(normalizedError)) {
            break;
          }
          await sleep(900 * execAttempt);
        } finally {
          await rm(outputFile, { force: true }).catch(() => null);
          if (outputSchemaFile) {
            await rm(outputSchemaFile, { force: true }).catch(() => null);
          }
        }
      }

      if (!fallbackToSchemaLessMode && lastError) {
        break;
      }
    }
  }

  throw lastError || new Error("codex exec retry loop exhausted");
}

export const __internal = {
  buildCodexExecArgs,
  classifyLocalCodexCliError,
  execFileWithClosedStdin,
  getCodexCliAttemptModels,
  isRejectedOutputSchemaError,
  isRetryableCodexCliError,
  mergeCodexCliConfigOverrides,
  normalizeCodexCliExecError,
  resolveCodexCliRetryAttempts,
  resolveDefaultLocalCodexCliConfigOverrides,
  resolveDefaultLocalCodexCliModel,
  resolveEffectiveCodexCliTimeoutMs,
};
