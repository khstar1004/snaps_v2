export const DEFAULT_MAX_FAILURES = 5;
export const DEFAULT_FAILURE_WINDOW_MS = 10 * 60_000;
export const DEFAULT_LOCKOUT_MS = 15 * 60_000;

export type LoginRateLimitOptions = {
  maxFailures: number;
  failureWindowMs: number;
  lockoutMs: number;
};

export type LoginAttemptState = {
  failureCount: number;
  firstFailureAtMs: number;
  lastFailureAtMs: number;
  lockUntilMs: number | null;
};

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getLoginRateLimitOptions(env: Record<string, string | undefined> = process.env): LoginRateLimitOptions {
  return {
    maxFailures: Math.max(1, toPositiveInt(env.AUTH_LOGIN_MAX_FAILURES, DEFAULT_MAX_FAILURES)),
    failureWindowMs: Math.max(1_000, toPositiveInt(env.AUTH_LOGIN_FAILURE_WINDOW_SEC, DEFAULT_FAILURE_WINDOW_MS / 1000) * 1000),
    lockoutMs: Math.max(1_000, toPositiveInt(env.AUTH_LOGIN_LOCKOUT_SEC, DEFAULT_LOCKOUT_MS / 1000) * 1000),
  };
}

export function normalizeLoginAttemptState(value: unknown): LoginAttemptState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const failureCount = Number(row.failureCount);
  const firstFailureAtMs = Number(row.firstFailureAtMs);
  const lastFailureAtMs = Number(row.lastFailureAtMs);
  const rawLockUntilMs = row.lockUntilMs;
  const lockUntilMs =
    typeof rawLockUntilMs === "number" && Number.isFinite(rawLockUntilMs) && rawLockUntilMs > 0 ? rawLockUntilMs : null;
  if (!Number.isFinite(failureCount) || failureCount < 0) return null;
  if (!Number.isFinite(firstFailureAtMs) || firstFailureAtMs <= 0) return null;
  if (!Number.isFinite(lastFailureAtMs) || lastFailureAtMs <= 0) return null;
  return {
    failureCount: Math.max(0, Math.floor(failureCount)),
    firstFailureAtMs: Math.floor(firstFailureAtMs),
    lastFailureAtMs: Math.floor(lastFailureAtMs),
    lockUntilMs: lockUntilMs ? Math.floor(lockUntilMs) : null,
  };
}

export function pruneLoginAttemptState(
  state: LoginAttemptState | null,
  nowMs: number,
  options: LoginRateLimitOptions
): LoginAttemptState | null {
  if (!state) return null;
  if (state.lockUntilMs && state.lockUntilMs > nowMs) {
    return state;
  }
  if (state.lastFailureAtMs + options.failureWindowMs <= nowMs) {
    return null;
  }
  return {
    ...state,
    lockUntilMs: null,
  };
}

export function getRemainingLoginLockMs(state: LoginAttemptState | null, nowMs: number): number {
  if (!state?.lockUntilMs) return 0;
  return Math.max(0, state.lockUntilMs - nowMs);
}

export function getNextFailedLoginState(
  previous: LoginAttemptState | null,
  nowMs: number,
  options: LoginRateLimitOptions
): { state: LoginAttemptState; locked: boolean } {
  const active = pruneLoginAttemptState(previous, nowMs, options);
  const failureCount = Math.max(0, active?.failureCount || 0) + 1;
  const state: LoginAttemptState = {
    failureCount,
    firstFailureAtMs: active?.firstFailureAtMs || nowMs,
    lastFailureAtMs: nowMs,
    lockUntilMs: failureCount >= options.maxFailures ? nowMs + options.lockoutMs : null,
  };
  return {
    state,
    locked: Boolean(state.lockUntilMs),
  };
}
