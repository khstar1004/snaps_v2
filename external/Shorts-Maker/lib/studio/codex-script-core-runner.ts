import type { CodexPromptOverrides, DialogueMode } from "@/lib/studio/codex-script-to-json";
import {
  LEGACY_CAPTION_LAYOUT_POLICY,
  type CaptionLayoutPolicy,
} from "@/lib/studio/caption-layout";
import {
  allowFallbackToApiWhenCliFails,
  canUseLocalCodexCliBridge,
  getCodexModel,
  requestCodexChatCompletion,
  runCodexCliPromptTransport,
  type CodexChatMessage,
  type CodexUsage,
} from "@/lib/studio/codex-script-transport";
import {
  autoRepairTopicScriptDraft,
  buildFallbackTopicScript,
  buildTopicScriptRepairUserPrompt,
  buildTopicScriptSystemPrompt,
  buildTopicScriptUserPrompt,
  summarizeIssues,
  validateTopicScriptDraft,
} from "@/lib/studio/codex-topic-script";
import * as codexScriptToJson from "@/lib/studio/codex-script-to-json";
import { CodexPipelineError } from "@/lib/studio/codex-script-core-errors";
import { preferDeterministicScriptToJsonForDeepseek } from "@/lib/studio/ai-provider";
import type { PublishCategory, StudioPrepareRequest } from "@/types/studio-json";

type CodexConvertResult = {
  payload: StudioPrepareRequest;
  usage?: CodexUsage;
  title?: string;
};

type CodexScriptResult = {
  script: string;
  usage?: CodexUsage;
};

const SCRIPT_TO_JSON_MAX_ATTEMPTS = 5;
const TOPIC_TO_SCRIPT_MAX_ATTEMPTS = 5;

function extractPlainText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/```[a-z0-9_-]*\s*/gi, "")
    .replace(/```/g, "")
    .trim();
}

function normalizeScriptWhitespace(script: string): string {
  return script.replace(/\s+/g, " ").trim();
}

function splitBySentenceBoundary(text: string): string[] {
  const matched = text.match(/[^.!?。！？]+[.!?。！？]?/g) || [];
  const normalized = matched.map((item) => item.trim()).filter(Boolean);
  if (normalized.length > 0) return normalized;
  return text.trim() ? [text.trim()] : [];
}

function stripListPrefix(line: string): string {
  return line
    .replace(/^(?:대본|script)\s*:\s*/i, "")
    .replace(/^\s*(?:[-*•]+|\d+[.)]|[A-Za-z][.)]|[가-힣][.)])\s*/, "")
    .trim();
}

export function normalizeGeneratedScript(raw: string): string {
  const plain = extractPlainText(raw);
  if (!plain) return "";
  const normalizedLines = plain
    .split(/\r?\n+/)
    .map((line) => normalizeScriptWhitespace(stripListPrefix(line)))
    .filter(Boolean);
  if (normalizedLines.length >= 2) {
    return normalizedLines.join("\n");
  }
  return splitBySentenceBoundary(normalizeScriptWhitespace(stripListPrefix(plain)))
    .map((line) => normalizeScriptWhitespace(stripListPrefix(line)))
    .filter(Boolean)
    .join("\n");
}

async function runCodexCliPrompt(prompt: string, codexModel?: string): Promise<string> {
  try {
    return await runCodexCliPromptTransport(prompt, codexModel);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CodexPipelineError(`로컬 Codex CLI 호출 실패: ${message}`, {
      code: "CODEX_LOCAL_CLI_FAILED",
      retryable: true,
      status: 502,
    });
  }
}

function shouldUseLocalFallback(error: unknown): boolean {
  if (!(error instanceof CodexPipelineError)) return false;
  if (!error.retryable) return false;
  return (
    error.code === "CODEX_LOCAL_CLI_FAILED" ||
    error.code === "CODEX_OAUTH_FAILED" ||
    error.code === "SCRIPT_TO_JSON_VALIDATION_FAILED" ||
    error.code === "TOPIC_TO_SCRIPT_VALIDATION_FAILED"
  );
}

function buildLocalFallbackTopicResult(
  topic: string,
  publishCategory?: PublishCategory,
  mode: DialogueMode = "normal"
): CodexScriptResult {
  return {
    script: buildFallbackTopicScript(topic, publishCategory, mode),
    usage: {
      model: "local-topic-fallback",
    },
  };
}

function buildLocalFallbackScriptToJsonResult(
  script: string,
  publishCategory?: PublishCategory,
  mode: DialogueMode = "normal",
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): CodexConvertResult {
  const parsed = codexScriptToJson.buildDeterministicScriptToJson(script, mode, captionLayoutPolicy);
  return {
    payload: codexScriptToJson.toStudioPayloadFromScriptToJson(parsed, publishCategory, mode),
    usage: {
      model: "local-script-to-json-fallback",
    },
    title: parsed.title,
  };
}

async function convertScriptToStudioJsonByCodexCli(
  script: string,
  publishCategory?: PublishCategory,
  codexModel?: string,
  promptTemplates?: CodexPromptOverrides,
  mode: DialogueMode = "normal",
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): Promise<CodexConvertResult> {
  let prompt = codexScriptToJson.buildScriptToJsonUserPrompt(
    script,
    publishCategory,
    promptTemplates?.scriptToJsonPrompt,
    mode,
    captionLayoutPolicy,
  );
  let lastError = "unknown";

  for (let attempt = 0; attempt < SCRIPT_TO_JSON_MAX_ATTEMPTS; attempt += 1) {
    const raw = await runCodexCliPrompt(prompt, codexModel);
    try {
      const parsed = codexScriptToJson.parseScriptToJsonResult(raw, script, mode, captionLayoutPolicy);
      return {
        payload: codexScriptToJson.toStudioPayloadFromScriptToJson(parsed, publishCategory, mode),
        usage: {
          model: "codex-cli-bridge",
        },
        title: parsed.title,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt >= SCRIPT_TO_JSON_MAX_ATTEMPTS - 1) {
        throw new CodexPipelineError(`Codex script-to-json 검증 실패: ${lastError}`, {
          code: "SCRIPT_TO_JSON_VALIDATION_FAILED",
          retryable: true,
          status: 502,
        });
      }
      prompt = [
        codexScriptToJson.buildScriptToJsonRepairUserPrompt(
          script,
          publishCategory,
          raw,
          lastError,
          promptTemplates?.scriptToJsonPrompt,
          mode,
          captionLayoutPolicy,
        ),
      ].join("\n");
    }
  }

  throw new CodexPipelineError(`Codex script-to-json 검증 실패: ${lastError}`, {
    code: "SCRIPT_TO_JSON_VALIDATION_FAILED",
    retryable: true,
    status: 502,
  });
}

async function convertScriptToStudioJsonByCodexApi(
  script: string,
  publishCategory: PublishCategory | undefined,
  accessToken: string,
  promptTemplates?: CodexPromptOverrides,
  mode: DialogueMode = "normal",
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): Promise<CodexConvertResult> {
  const model = getCodexModel();
  const messages: CodexChatMessage[] = [
    { role: "system", content: codexScriptToJson.buildScriptToJsonSystemPrompt(mode, captionLayoutPolicy) },
    {
      role: "user",
      content: codexScriptToJson.buildScriptToJsonUserPrompt(
        script,
        publishCategory,
        promptTemplates?.scriptToJsonPrompt,
        mode,
        captionLayoutPolicy,
      ),
    },
  ];
  let lastError = "unknown";

  for (let attempt = 0; attempt < SCRIPT_TO_JSON_MAX_ATTEMPTS; attempt += 1) {
    let completion;
    try {
      completion = await requestCodexChatCompletion({
        accessToken,
        messages,
        temperature: 0,
        model,
      });
    } catch (error) {
      throw new CodexPipelineError(`Codex OAuth script-to-json 실패: ${error instanceof Error ? error.message : String(error)}`, {
        code: "CODEX_OAUTH_FAILED",
        retryable: true,
        status: 502,
      });
    }
    const text = completion.text;

    try {
      const parsed = codexScriptToJson.parseScriptToJsonResult(text, script, mode, captionLayoutPolicy);
      return {
        payload: codexScriptToJson.toStudioPayloadFromScriptToJson(parsed, publishCategory, mode),
        usage: completion.usage,
        title: parsed.title,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (process.env.CODEX_DEBUG_VALIDATION === "1") {
        console.error(`[codex-debug] script-to-json attempt ${attempt + 1} failed: ${lastError}`);
        console.error(`[codex-debug] raw:\n${text}`);
      }
      if (attempt >= SCRIPT_TO_JSON_MAX_ATTEMPTS - 1) {
        throw new CodexPipelineError(`Codex script-to-json 검증 실패: ${lastError}`, {
          code: "SCRIPT_TO_JSON_VALIDATION_FAILED",
          retryable: true,
          status: 502,
        });
      }
      messages.push({ role: "assistant", content: text });
      messages.push({
        role: "user",
        content: codexScriptToJson.buildScriptToJsonRepairUserPrompt(
          script,
          publishCategory,
          text,
          lastError,
          promptTemplates?.scriptToJsonPrompt,
          mode,
          captionLayoutPolicy,
        ),
      });
    }
  }

  throw new CodexPipelineError(`Codex script-to-json 검증 실패: ${lastError}`, {
    code: "SCRIPT_TO_JSON_VALIDATION_FAILED",
    retryable: true,
    status: 502,
  });
}

async function generateScriptFromTopicByCodexCli(
  topic: string,
  publishCategory?: PublishCategory,
  codexModel?: string,
  promptTemplates?: CodexPromptOverrides,
  mode: DialogueMode = "normal"
): Promise<CodexScriptResult> {
  let prompt = buildTopicScriptUserPrompt(topic, publishCategory, promptTemplates?.topicToScriptPrompt, mode);
  let lastError = "unknown";

  for (let attempt = 0; attempt < TOPIC_TO_SCRIPT_MAX_ATTEMPTS; attempt += 1) {
    const raw = await runCodexCliPrompt(prompt, codexModel);
    const script = normalizeGeneratedScript(raw);
    let candidate = script;
    let issues = validateTopicScriptDraft(candidate, mode);
    if (issues.length > 0) {
      const repaired = autoRepairTopicScriptDraft(candidate);
      if (repaired && repaired !== candidate) {
        const repairedIssues = validateTopicScriptDraft(repaired, mode);
        if (repairedIssues.length < issues.length) {
          candidate = repaired;
          issues = repairedIssues;
        }
      }
    }
    if (issues.length === 0) {
      return {
        script: candidate,
        usage: {
          model: "codex-cli-bridge",
        },
      };
    }
    lastError = summarizeIssues(issues);
    if (attempt >= TOPIC_TO_SCRIPT_MAX_ATTEMPTS - 1) {
      throw new CodexPipelineError(`Codex topic-to-script 검증 실패: ${lastError}`, {
        code: "TOPIC_TO_SCRIPT_VALIDATION_FAILED",
        retryable: true,
        status: 502,
      });
    }
    prompt = buildTopicScriptRepairUserPrompt(
      topic,
      publishCategory,
      candidate || raw,
      issues,
      promptTemplates?.topicToScriptPrompt,
      mode
    );
  }

  throw new CodexPipelineError(`Codex topic-to-script 검증 실패: ${lastError}`, {
    code: "TOPIC_TO_SCRIPT_VALIDATION_FAILED",
    retryable: true,
    status: 502,
  });
}

async function generateScriptFromTopicByCodex(
  topic: string,
  accessToken: string,
  publishCategory?: PublishCategory,
  promptTemplates?: CodexPromptOverrides,
  mode: DialogueMode = "normal"
): Promise<CodexScriptResult> {
  const model = getCodexModel();
  const messages: CodexChatMessage[] = [
    { role: "system", content: buildTopicScriptSystemPrompt(publishCategory, topic, mode) },
    { role: "user", content: buildTopicScriptUserPrompt(topic, publishCategory, promptTemplates?.topicToScriptPrompt, mode) },
  ];
  let lastError = "unknown";

  for (let attempt = 0; attempt < TOPIC_TO_SCRIPT_MAX_ATTEMPTS; attempt += 1) {
    let completion;
    try {
      completion = await requestCodexChatCompletion({
        accessToken,
        messages,
        temperature: 0.3,
        model,
      });
    } catch (error) {
      throw new CodexPipelineError(`Codex OAuth 대본 생성 실패: ${error instanceof Error ? error.message : String(error)}`, {
        code: "CODEX_OAUTH_FAILED",
        retryable: true,
        status: 502,
      });
    }
    const rawText = completion.text;
    const script = normalizeGeneratedScript(rawText);
    let candidate = script;
    let issues = validateTopicScriptDraft(candidate, mode);
    if (issues.length > 0) {
      const repaired = autoRepairTopicScriptDraft(candidate);
      if (repaired && repaired !== candidate) {
        const repairedIssues = validateTopicScriptDraft(repaired, mode);
        if (repairedIssues.length < issues.length) {
          candidate = repaired;
          issues = repairedIssues;
        }
      }
    }
    if (issues.length === 0) {
      return {
        script: candidate,
        usage: completion.usage,
      };
    }

    lastError = summarizeIssues(issues);
    if (process.env.CODEX_DEBUG_VALIDATION === "1") {
      console.error(`[codex-debug] topic-to-script attempt ${attempt + 1} failed: ${lastError}`);
      console.error(`[codex-debug] candidate:\n${candidate || rawText}`);
    }
    if (attempt >= TOPIC_TO_SCRIPT_MAX_ATTEMPTS - 1) {
      throw new CodexPipelineError(`Codex topic-to-script 검증 실패: ${lastError}`, {
        code: "TOPIC_TO_SCRIPT_VALIDATION_FAILED",
        retryable: true,
        status: 502,
      });
    }
    messages.push({ role: "assistant", content: candidate || rawText || "(empty)" });
    messages.push({
      role: "user",
      content: buildTopicScriptRepairUserPrompt(
        topic,
        publishCategory,
        candidate || rawText,
        issues,
        promptTemplates?.topicToScriptPrompt,
        mode
      ),
    });
  }

  throw new CodexPipelineError(`Codex topic-to-script 검증 실패: ${lastError}`, {
    code: "TOPIC_TO_SCRIPT_VALIDATION_FAILED",
    retryable: true,
    status: 502,
  });
}

export async function generateScriptFromTopicWithTransport(
  topic: string,
  codexAccessToken?: string,
  codexModel?: string,
  publishCategory?: PublishCategory,
  promptTemplates?: CodexPromptOverrides,
  mode: DialogueMode = "normal"
): Promise<CodexScriptResult> {
  const token = (codexAccessToken || "").trim();
  if (canUseLocalCodexCliBridge(token)) {
    try {
      return await generateScriptFromTopicByCodexCli(topic, publishCategory, codexModel, promptTemplates, mode);
    } catch (error) {
      if (!allowFallbackToApiWhenCliFails() || !token) {
        if (shouldUseLocalFallback(error)) {
          return buildLocalFallbackTopicResult(topic, publishCategory, mode);
        }
        throw error;
      }
    }
  }

  if (token) {
    try {
      return await generateScriptFromTopicByCodex(topic, token, publishCategory, promptTemplates, mode);
    } catch (error) {
      if (shouldUseLocalFallback(error)) {
        return buildLocalFallbackTopicResult(topic, publishCategory, mode);
      }
      throw error;
    }
  }

  throw new CodexPipelineError("Codex 연결이 없어 topic-to-script를 실행할 수 없습니다. 로컬 Codex CLI 또는 OAuth 연결을 확인해 주세요.", {
    code: "CODEX_AUTH_REQUIRED",
    retryable: false,
    status: 400,
  });
}

export async function convertScriptToStudioJsonWithTransport(
  script: string,
  publishCategory?: PublishCategory,
  codexAccessToken?: string,
  codexModel?: string,
  promptTemplates?: CodexPromptOverrides,
  mode: DialogueMode = "normal",
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): Promise<CodexConvertResult> {
  const token = (codexAccessToken || "").trim();
  if (preferDeterministicScriptToJsonForDeepseek()) {
    return buildLocalFallbackScriptToJsonResult(script, publishCategory, mode, captionLayoutPolicy);
  }
  if (canUseLocalCodexCliBridge(token)) {
    try {
      return await convertScriptToStudioJsonByCodexCli(
        script,
        publishCategory,
        codexModel,
        promptTemplates,
        mode,
        captionLayoutPolicy,
      );
    } catch (error) {
      if (!allowFallbackToApiWhenCliFails() || !token) {
        if (shouldUseLocalFallback(error)) {
          return buildLocalFallbackScriptToJsonResult(script, publishCategory, mode, captionLayoutPolicy);
        }
        throw error;
      }
    }
  }

  if (token) {
    try {
      return await convertScriptToStudioJsonByCodexApi(
        script,
        publishCategory,
        token,
        promptTemplates,
        mode,
        captionLayoutPolicy,
      );
    } catch (error) {
      if (shouldUseLocalFallback(error)) {
        return buildLocalFallbackScriptToJsonResult(script, publishCategory, mode, captionLayoutPolicy);
      }
      throw error;
    }
  }

  throw new CodexPipelineError("Codex 연결이 없어 script-to-json 변환을 실행할 수 없습니다. 로컬 Codex CLI 또는 OAuth 연결을 확인해 주세요.", {
    code: "CODEX_AUTH_REQUIRED",
    retryable: false,
    status: 400,
  });
}
