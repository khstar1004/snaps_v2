import type { NextRequest } from "next/server";
import { deleteAppCacheEntry, getAppCacheEntry, setAppCacheEntry } from "@/lib/supabase/app-cache";
import { normalizeLoginId } from "@/lib/auth/store";
import {
  getLoginRateLimitOptions,
  getNextFailedLoginState,
  getRemainingLoginLockMs,
  normalizeLoginAttemptState,
  pruneLoginAttemptState,
  type LoginAttemptState,
  type LoginRateLimitOptions,
} from "@/lib/auth/login-rate-limit-shared";

const LOGIN_RATE_LIMIT_SCOPE = "auth_login_rate_limit";

function getClientIpAddress(request: Pick<NextRequest, "headers">): string {
  const forwardedFor = String(request.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    ?.trim();
  const realIp = String(request.headers.get("x-real-ip") || "").trim();
  return forwardedFor || realIp || "unknown";
}

function buildLoginRateLimitKey(loginId: string, ipAddress: string): string {
  const safeLoginId = normalizeLoginId(loginId) || "_unknown";
  const safeIpAddress = ipAddress.trim() || "unknown";
  return `${safeLoginId}::${safeIpAddress}`;
}

function getLoginRateLimitTtlSec(options: LoginRateLimitOptions): number {
  return Math.ceil(Math.max(options.failureWindowMs, options.lockoutMs) / 1000) + 60;
}

async function readLoginAttemptState(
  request: Pick<NextRequest, "headers">,
  loginId: string,
  options: LoginRateLimitOptions
): Promise<{ key: string; state: LoginAttemptState | null }> {
  const key = buildLoginRateLimitKey(loginId, getClientIpAddress(request));
  const entry = await getAppCacheEntry(LOGIN_RATE_LIMIT_SCOPE, undefined, key);
  const state = pruneLoginAttemptState(normalizeLoginAttemptState(entry?.valueJson ?? null), Date.now(), options);
  return { key, state };
}

export async function ensureLoginAttemptAllowed(
  request: Pick<NextRequest, "headers">,
  loginId: string
): Promise<{ allowed: true } | { allowed: false; retryAfterSec: number }> {
  const options = getLoginRateLimitOptions();
  const { key, state } = await readLoginAttemptState(request, loginId, options);
  if (!state) {
    await deleteAppCacheEntry(LOGIN_RATE_LIMIT_SCOPE, undefined, key).catch(() => undefined);
    return { allowed: true };
  }
  const remainingMs = getRemainingLoginLockMs(state, Date.now());
  if (remainingMs <= 0) {
    return { allowed: true };
  }
  return {
    allowed: false,
    retryAfterSec: Math.max(1, Math.ceil(remainingMs / 1000)),
  };
}

export async function recordFailedLoginAttempt(
  request: Pick<NextRequest, "headers">,
  loginId: string
): Promise<{ locked: boolean; retryAfterSec: number | null }> {
  const options = getLoginRateLimitOptions();
  const { key, state } = await readLoginAttemptState(request, loginId, options);
  const next = getNextFailedLoginState(state, Date.now(), options);
  await setAppCacheEntry({
    scope: LOGIN_RATE_LIMIT_SCOPE,
    key,
    value: next.state,
    ttlSec: getLoginRateLimitTtlSec(options),
  });
  return {
    locked: next.locked,
    retryAfterSec: next.state.lockUntilMs ? Math.max(1, Math.ceil((next.state.lockUntilMs - Date.now()) / 1000)) : null,
  };
}

export async function clearFailedLoginAttempts(request: Pick<NextRequest, "headers">, loginId: string): Promise<void> {
  const key = buildLoginRateLimitKey(loginId, getClientIpAddress(request));
  await deleteAppCacheEntry(LOGIN_RATE_LIMIT_SCOPE, undefined, key).catch(() => undefined);
}
