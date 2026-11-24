import { isCodexLocalBridgeEnabled, resolveCodexConnectionMode, shouldUseLocalCodexCliBridge } from "@/lib/auth/codex-bridge";
import { resolveDefaultLocalCodexCliModel, runLocalCodexCliPrompt } from "@/lib/auth/codex-local-cli";
import { runCodexPlannerWithRetry } from "@/lib/studio/codex-planner-retry";
import { DEEPSEEK_API_BASE_URL, getDeepseekModel, isDeepseekConfigured } from "@/lib/studio/ai-provider";

export type CodexUsage = {
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
};

export type CodexChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CodexChatCompletionResult = {
  text: string;
  usage: CodexUsage;
};

export function getCodexModel(): string {
  const override = (process.env.CODEX_MODEL || "").trim();
  if (override) return override;
  return isDeepseekConfigured() ? getDeepseekModel() : "gpt-4.1-mini";
}

export function allowFallbackToApiWhenCliFails(): boolean {
  return ((process.env.CODEX_LOCAL_BRIDGE_CLI_FALLBACK_API || "").trim() || "0") === "1";
}

export function canUseLocalCodexCliBridge(codexAccessToken?: string): boolean {
  if (shouldUseLocalCodexCliBridge(codexAccessToken)) return true;
  return isCodexLocalBridgeEnabled() && resolveCodexConnectionMode() === "local_codex_bridge";
}

function extractAssistantText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const row = item as Record<string, unknown>;
        return typeof row.text === "string" ? row.text : "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

export async function runCodexCliPromptTransport(prompt: string, codexModel?: string): Promise<string> {
  void codexModel;
  const text = await runLocalCodexCliPrompt(prompt, {
    outputPrefix: "codex-last-message",
    timeoutMs: 1000 * 60 * 4,
    maxBufferBytes: 1024 * 1024 * 8,
    model: resolveDefaultLocalCodexCliModel(),
  });
  if (!text) {
    throw new Error("codex exec returned empty message");
  }
  return text;
}

export async function requestCodexChatCompletion(params: {
  accessToken: string;
  messages: CodexChatMessage[];
  temperature: number;
  model?: string;
}): Promise<CodexChatCompletionResult> {
  const model = (params.model || "").trim() || getCodexModel();
  const useDeepseek = isDeepseekConfigured();
  const endpoint = useDeepseek
    ? `${DEEPSEEK_API_BASE_URL}/v1/chat/completions`
    : "https://api.openai.com/v1/chat/completions";
  const providerLabel = useDeepseek ? "DeepSeek" : "OpenAI";
  const response = await runCodexPlannerWithRetry(() =>
    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify({
        model,
        temperature: params.temperature,
        messages: params.messages,
      }),
    }).then(async (result) => {
      if (!result.ok) {
        const text = await result.text();
        throw new Error(`${providerLabel} chat completion failed (${result.status}): ${text.slice(0, 300)}`);
      }
      return result;
    })
  );

  const payload = (await response.json()) as Record<string, unknown>;
  const firstChoice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  if (!firstChoice || typeof firstChoice !== "object") {
    throw new Error("OpenAI chat completion returned an empty choices array.");
  }

  const message = (firstChoice as Record<string, unknown>).message;
  const content = message && typeof message === "object" ? (message as Record<string, unknown>).content : "";
  const text = extractAssistantText(content);
  if (!text) {
    throw new Error("OpenAI chat completion returned an empty assistant message.");
  }

  const usageRow = payload.usage && typeof payload.usage === "object" ? (payload.usage as Record<string, unknown>) : {};
  return {
    text,
    usage: {
      inputTokens: typeof usageRow.prompt_tokens === "number" ? usageRow.prompt_tokens : undefined,
      outputTokens: typeof usageRow.completion_tokens === "number" ? usageRow.completion_tokens : undefined,
      model,
    },
  };
}
