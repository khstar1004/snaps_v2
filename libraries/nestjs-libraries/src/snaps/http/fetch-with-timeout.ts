/**
 * fetch() has no default timeout. The AI clients already abort on their own
 * deadline (OLLAMA_CHAT_TIMEOUT_MS, DEEPSEEK_CHAT_TIMEOUT_MS), but the Pixelle
 * and Shorts Maker calls did not: a video service that accepted the connection
 * and then stopped answering held the backend request open indefinitely, and
 * the caller had no way to tell that from a slow render.
 */
/** Whether a caught error is one of ours from an elapsed deadline. */
export function snapsWasTimeout(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'snapsTimedOut' in error;
}

export async function snapsFetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  label: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    // fetch reports an abort as "This operation was aborted", which reads like
    // the caller cancelled. Name the deadline that actually elapsed instead.
    if (controller.signal.aborted) {
      // Marked, not just worded. A caller that retries on failure has to tell a
      // deadline from a refused connection: the Ollama client retries localhost
      // against 127.0.0.1, and retrying after a timeout made an unresponsive
      // server cost two full budgets instead of one.
      throw Object.assign(new Error(`${label} timed out after ${timeoutMs}ms`), {
        snapsTimedOut: true,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Number(undefined) is NaN and setTimeout treats NaN as 1ms, so a misspelt or
 * non-numeric timeout env would abort every request almost immediately rather
 * than fall back to the default. Only a finite, positive number is accepted.
 */
export function snapsTimeoutMs(value: string | undefined, fallbackMs: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}
