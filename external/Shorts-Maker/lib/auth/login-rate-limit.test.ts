import test from "node:test";
import assert from "node:assert/strict";
import {
  getLoginRateLimitOptions,
  getNextFailedLoginState,
  getRemainingLoginLockMs,
  normalizeLoginAttemptState,
  pruneLoginAttemptState,
} from "./login-rate-limit-shared";

test("normalizeLoginAttemptState rejects malformed values", () => {
  assert.equal(normalizeLoginAttemptState(null), null);
  assert.equal(normalizeLoginAttemptState({ failureCount: "nope" }), null);
});

test("pruneLoginAttemptState clears stale failures after the window expires", () => {
  const options = getLoginRateLimitOptions({
    AUTH_LOGIN_MAX_FAILURES: "3",
    AUTH_LOGIN_FAILURE_WINDOW_SEC: "60",
    AUTH_LOGIN_LOCKOUT_SEC: "120",
  });
  const nowMs = 10_000;
  const pruned = pruneLoginAttemptState(
    {
      failureCount: 2,
      firstFailureAtMs: 1_000,
      lastFailureAtMs: nowMs - options.failureWindowMs - 1,
      lockUntilMs: null,
    },
    nowMs,
    options
  );

  assert.equal(pruned, null);
});

test("getNextFailedLoginState locks after the configured threshold", () => {
  const options = getLoginRateLimitOptions({
    AUTH_LOGIN_MAX_FAILURES: "3",
    AUTH_LOGIN_FAILURE_WINDOW_SEC: "600",
    AUTH_LOGIN_LOCKOUT_SEC: "900",
  });
  const first = getNextFailedLoginState(null, 1_000, options);
  const second = getNextFailedLoginState(first.state, 2_000, options);
  const third = getNextFailedLoginState(second.state, 3_000, options);

  assert.equal(first.locked, false);
  assert.equal(second.locked, false);
  assert.equal(third.locked, true);
  assert.equal(third.state.failureCount, 3);
  assert.equal(third.state.lockUntilMs, 3_000 + options.lockoutMs);
});

test("getRemainingLoginLockMs reports the remaining lock duration", () => {
  const remaining = getRemainingLoginLockMs(
    {
      failureCount: 5,
      firstFailureAtMs: 1_000,
      lastFailureAtMs: 2_000,
      lockUntilMs: 8_000,
    },
    5_500
  );

  assert.equal(remaining, 2_500);
});
