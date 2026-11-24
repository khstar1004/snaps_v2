/**
 * Bounds a Temporal call and clears the losing timer.
 *
 * The clearing is the point. A timer that loses the race stays pending for its
 * full duration and keeps the Node event loop alive that whole time - measured
 * at 3003ms for a 3000ms timer that lost to an already-resolved promise. The
 * health probe used a bare `Promise.race` against `setTimeout(..., 10000)`, so
 * every probe that Temporal answered normally still left ten seconds of held
 * event loop behind it, and a shutdown arriving just after a probe waited for
 * a timer whose result nobody wanted.
 */
export function withTemporalTimeout<T>(
  promise: Promise<T>,
  message: string,
  timeoutMs: number
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

/**
 * Reads a timeout from the environment, or falls back.
 *
 * The two callers pick different fallbacks on purpose - bootstrap fails fast,
 * the health probe waits longer - so what is shared is the parsing, not the
 * number. That matters more: `Number(raw || fallback)` turns `abc`, `10s`,
 * `0` and `-1` into a timer that fires immediately, and the bootstrap did
 * exactly that until it was pointed here.
 */
export function temporalTimeoutMs(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
