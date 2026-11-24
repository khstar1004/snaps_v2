export type AiProvider = "openai" | "deepseek";

export const DEEPSEEK_API_BASE_URL = "https://api.deepseek.com";

export function getAiProvider(): AiProvider {
  return (process.env.AI_PROVIDER || "").trim().toLowerCase() === "deepseek" ? "deepseek" : "openai";
}

export function getDeepseekApiKey(): string {
  return (process.env.DEEPSEEK_API_KEY || "").trim();
}

export function isDeepseekConfigured(): boolean {
  return getAiProvider() === "deepseek" && Boolean(getDeepseekApiKey());
}

export function getDeepseekModel(): string {
  return (process.env.DEEPSEEK_MODEL || "").trim() || "deepseek-chat";
}

/**
 * The script-to-json stage asks the model to return exact character-budgeted
 * lineTokenRanges (a mechanical per-token width sum, not a language task).
 * Testing against deepseek-chat showed it does not reliably converge on this
 * within the retry budget (it keeps grouping too many tokens per line), so by
 * default DeepSeek skips straight to the deterministic local converter for
 * this stage instead of burning retries that consistently fail. Set
 * DEEPSEEK_SCRIPT_TO_JSON_USE_API=1 to force the API path anyway (e.g. to
 * re-check behavior against a newer DeepSeek model).
 */
export function preferDeterministicScriptToJsonForDeepseek(): boolean {
  if (!isDeepseekConfigured()) return false;
  return (process.env.DEEPSEEK_SCRIPT_TO_JSON_USE_API || "").trim() !== "1";
}
