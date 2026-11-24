const RETRYABLE_CODEX_ERROR_PATTERNS = [
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
  /unexpected token .* in json/i,
  /unexpected non-whitespace character after json/i,
  /unterminated string in json/i,
  /expected ',' or ']' after array element in json/i,
  /expected ',' or '}' after property value in json/i,
  /expected property name or '}' in json/i,
  /schema validation failed/i,
  /does not match (the )?output schema/i,
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableCodexPlannerError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: unknown; message?: unknown };
  const code = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
  if (code === "ENOENT") return false;
  const message = typeof row.message === "string" ? row.message : String(error);
  return RETRYABLE_CODEX_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export async function runCodexPlannerWithRetry<T>(
  action: () => Promise<T>,
  options?: { maxAttempts?: number; initialDelayMs?: number }
): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(options?.maxAttempts ?? 3));
  const initialDelayMs = Math.max(0, Math.floor(options?.initialDelayMs ?? 1200));

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableCodexPlannerError(error)) {
        throw error;
      }
      const delayMs = initialDelayMs * Math.max(1, attempt);
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
