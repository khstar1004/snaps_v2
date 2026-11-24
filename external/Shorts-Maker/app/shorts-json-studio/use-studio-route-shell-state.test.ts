import assert from "node:assert/strict";
import test from "node:test";
import { parseStudioRouteShellMode } from "./use-studio-route-shell-state";

test("studio route parser enables onboarding mode explicitly", () => {
  assert.deepEqual(parseStudioRouteShellMode("?mode=onboarding"), {
    isOnboardingMode: true,
  });
});

test("studio route parser ignores legacy quick mode", () => {
  assert.deepEqual(parseStudioRouteShellMode("?mode=quick"), {
    isOnboardingMode: false,
  });
});

test("studio route parser keeps the default staged workspace for unknown modes", () => {
  assert.deepEqual(parseStudioRouteShellMode("?mode=mobile&step=1"), {
    isOnboardingMode: false,
  });
});
